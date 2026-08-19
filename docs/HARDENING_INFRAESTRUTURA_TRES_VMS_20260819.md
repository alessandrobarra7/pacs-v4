# Hardening Defensivo da Infraestrutura PACS — Três VMs

**Data:** 19/08/2026  
**Escopo:** redução de exposição externa, controle de borda, firewall e bloqueio de tentativas repetidas nas VMs do Portal, banco e armazenamento.  
**Limite:** este documento não contém senhas, chaves privadas, credenciais MinIO, identificadores clínicos ou dados de pacientes.

## Resultado executivo

As três VMs receberam uma linha de base defensiva e controles de exposição proporcionais à sua função. A borda pública foi concentrada na VM1, que expõe somente HTTP/HTTPS pelo Nginx. SSH deixou de estar disponível para a internet pública nas três VMs e permanece acessível apenas por redes privadas administrativas aprovadas. Fail2Ban foi habilitado em todas as VMs para reduzir tentativas repetidas de autenticação; a VM1 possui ainda uma regra específica para varreduras de caminhos sensíveis no Nginx.

> O hardening reduz superfície de ataque e melhora detecção/bloqueio de abusos. Ele não substitui atualização regular, revisão de permissões, backup recuperável, monitoramento e resposta a incidentes.

## Matriz de exposição validada

| VM | Papel | Serviços públicos | Serviços internos autorizados | Controles ativos |
|---|---|---|---|---|
| **VM1** | Portal e Nginx | 80/443 | Portal Node em 3000 somente local; SSH pelas redes privadas | UFW, Nginx endurecido, Fail2Ban para SSH e varreduras Nginx |
| **VM2** | MySQL e PostgreSQL em observação | Nenhum serviço de banco público | MySQL 3306 somente para VM1; PostgreSQL mantido sob regra interna legada; SSH pelas redes privadas | UFW e Fail2Ban para SSH; MinIO residual desabilitado |
| **VM3** | MinIO e RAID1 | Nenhum | MinIO 9000 somente para VM1; SSH pela rede interna | UFW e Fail2Ban para SSH; console MinIO 9001 sem regra de entrada |

## VM1 — Portal

A regra pública de porta 3000 foi removida do UFW. O Node continua respondendo localmente para o Nginx, mas não pode mais ser acessado diretamente por terceiros. Nginx passou a ocultar versão, emitir cabeçalhos defensivos, limitar conexões por IP e rejeitar caminhos comuns de varredura antes de atingir o Portal. O teste final retornou HTTP 200 para o Portal e HTTP 404 para `/.git/HEAD`.

O SSH aceita somente `192.168.193.0/24` e `172.16.0.0/22`. Fail2Ban monitora SSH e a regra `pacs-nginx-probe`, que bloqueia endereços externos com padrão repetido de acesso a arquivos de ambiente/repositório, CGI, WordPress, Tomcat ou Actuator. Rotas DICOM, mídia, tRPC e viewers externos não são incluídas nessa regra.

## VM2 — Banco

O MinIO residual permanece desabilitado e inativo. MySQL continua acessível por firewall somente a partir da VM1. PostgreSQL permanece ativo em observação e não foi desligado nem reconfigurado, pois seu consumidor ainda não foi identificado; sua regra de entrada foi preservada.

SSH público foi removido. As únicas origens permitidas são `192.168.193.0/24` e `172.16.0.0/22`. Fail2Ban está habilitado com o *jail* de SSH. MySQL e PostgreSQL foram confirmados ativos após a mudança.

## VM3 — Armazenamento

MinIO permanece ativo. A API na porta 9000 é permitida apenas para a VM1 e respondeu ao teste local de saúde. Não há regra de entrada para o console 9001. SSH público foi removido, ficando acessível somente por `172.16.0.0/22`. Fail2Ban está ativo para SSH.

O RAID1 `/dev/md0` foi validado em estado limpo, com dois discos ativos e nenhum disco em falha. Nenhuma operação de formatação, recriação de RAID ou alteração de dados foi executada.

## Redes administrativas aprovadas

| Faixa | Uso aprovado |
|---|---|
| `192.168.193.0/24` | Administração privada via ZeroTier da VM1 e VM2 |
| `172.16.0.0/22` | Administração e comunicação da rede interna das VMs |

## Pendências de manutenção preventiva

| Prioridade | Pendência | Política atual |
|---|---|---|
| P1 | SSH por chave obrigatória e remoção de login remoto de root | Adiado: SSH já não é público; deve ser realizado com sessão de contingência e chave validada. |
| P1 | PostgreSQL da VM2 sem consumidor identificado | Manter em observação; não desligar nem restringir adicionalmente sem diagnóstico de dependência. |
| P1 | Limites de requisição Nginx por rota | Medir rotas DICOM antes de aplicar limites que possam afetar carregamento de fatias. |
| P2 | Atualizações de sistema pendentes | Aplicar em janela de manutenção, com plano de reinicialização e validação de serviços. |
| P2 | Assinatura de código do RadiAnt | Pendência comercial separada; não é substituída pelo hardening de rede. |

## Reversão de emergência

Em caso de bloqueio administrativo inesperado, a reversão deve ser realizada pelo console da respectiva VM, nunca expondo novamente todos os serviços de dados. Para restabelecer temporariamente SSH, use apenas:

```bash
sudo ufw allow 22/tcp
```

Após recuperar o acesso, revisar a origem privada autorizada e remover novamente a regra pública antes de encerrar a manutenção.
