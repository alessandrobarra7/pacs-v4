# Desativação Permanente do MinIO Residual da VM2

**Data da execução:** 18 de agosto de 2026  
**Escopo:** encerrar permanentemente a instância MinIO residual da VM2 (`172.16.3.101`), preservando seus dados legados e consolidando a VM3 (`172.16.3.102`) como única instância MinIO ativa do Portal.

## Decisão operacional

O MinIO da VM2 foi identificado como uma instalação residual anterior à arquitetura de três VMs. O Portal foi testado com o serviço temporariamente parado e permaneceu funcional. A VM1 também confirmou conectividade com a VM3 e ausência de chamadas recentes à API MinIO da VM2.

Com base nessas evidências, o serviço `minio` da VM2 foi **desativado permanentemente**, sem remover diretórios, buckets, arquivos ou configurações legadas.

| Componente | Estado final | Evidência |
|---|---|---|
| VM1 — Portal | Online | Processo `pacs-portal` permaneceu online após a parada da VM2. |
| VM2 — MinIO residual | `inactive` e `disabled` | Serviço parado e removido da inicialização automática. |
| VM2 — portas 9000/9001 | Sem escuta e sem regras UFW | As regras amplas de entrada foram removidas. |
| VM2 — dados legados | Preservados | `/data/minio` mantido, com aproximadamente 1,5 MiB no momento da execução. |
| VM3 — MinIO principal | Ativo | Health check interno da VM1 retornou HTTP 200 para `172.16.3.102:9000`. |

> A desativação removeu a superfície de rede do MinIO residual da VM2, mas não equivale a uma exclusão de dados. A pasta `/data/minio` permanece intocada como contingência até inventário e arquivamento formal posteriores.

## Evidências reunidas antes da desativação

A VM2 continha uma instância MinIO habilitada para iniciar com o sistema, utilizando `/data/minio`. Foram encontrados os diretórios de bucket `db-lauds` e `lauds`, além de metadados internos do MinIO. Como a autenticação administrativa dessa instância residual não foi confirmada durante a auditoria, não foi feita exclusão, migração ou alteração de objetos.

O teste de parada temporária foi executado antes da decisão definitiva. Durante a janela de teste, os fluxos validados do Portal permaneceram operacionais. A VM1 não registrou referências recentes à VM2 na porta 9000. Após a desativação permanente, a VM1 confirmou o Portal online, health check HTTP 200 para o MinIO da VM3 e indisponibilidade da porta 9000 na VM2.

## Arquitetura consolidada

| VM | Papel operacional consolidado | Serviços relevantes |
|---|---|---|
| **VM1 — 172.16.3.100** | Portal PACS e proxy autenticado de mídia | Node.js/PM2, Nginx e cache DICOM temporário. |
| **VM2 — 172.16.3.101** | Banco de dados relacional do Portal | MySQL para `pacs_portal`; MinIO residual desativado. PostgreSQL não foi alterado por esta intervenção e deve ser analisado separadamente. |
| **VM3 — 172.16.3.102** | Armazenamento de objetos do Portal | MinIO ativo sobre RAID1 (`/dev/md0` montado em `/data/storage`). |

Os novos laudos fechados, anexos e áudios do Portal devem usar exclusivamente a VM3. A VM2 armazena somente metadados, referências e índices necessários ao banco relacional.

## Alterações executadas na VM2

Foram executadas as seguintes ações administrativas:

1. `systemctl disable --now minio`, para interromper o processo e impedir o início automático após reinicialização.
2. Remoção das regras UFW nominais de entrada para `9000/tcp` e `9001/tcp`, inclusive IPv6 quando aplicável.
3. Registro do estado final em `/root/minio-vm2-audit/20260818_012958/minio-permanent-disable.txt`, com permissões restritas.

Nenhuma das ações acima removeu `/data/minio`, alterou o MySQL, modificou objetos, apagou buckets ou fez mudanças na VM3.

## Rollback de contingência

O rollback deve ser usado apenas se uma dependência legada for identificada. Na VM2, como `root`, o comando mínimo é:

```bash
sudo systemctl enable --now minio
```

Em seguida, valide localmente:

```bash
curl --connect-timeout 3 --max-time 5 -I http://127.0.0.1:9000/minio/health/live
```

Se um cliente interno comprovadamente precisar alcançar essa instância legada, a regra de firewall deve ser adicionada de forma restrita ao IP necessário; não reabrir as portas 9000 ou 9001 para qualquer origem. A console administrativa 9001 deve permanecer fechada, salvo necessidade operacional formal e temporária.

## Pendências posteriores

O conteúdo dos buckets residuais `db-lauds` e `lauds` não foi inventariado porque as credenciais administrativas disponíveis não corresponderam à instância da VM2. Como os dados foram preservados, o inventário poderá ser retomado posteriormente com a credencial correta, sem reativar o serviço para acesso externo.

Também permanece recomendada uma análise separada do PostgreSQL ativo na VM2 para confirmar se ele atende a outro sistema ou pode ser desativado de forma independente. Essa análise não faz parte da desativação do MinIO e não deve ser combinada com ela.
