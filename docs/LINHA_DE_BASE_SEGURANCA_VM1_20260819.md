# Linha de Base de Segurança — VM1

**Data da coleta:** 19/08/2026  
**Escopo:** diagnóstico defensivo somente-leitura do Portal PACS, Nginx, UFW, SSH e serviços Linux da VM1.  
**Princípio:** nenhuma alteração de serviço, credencial ou regra de acesso foi feita durante a coleta. A única ação corretiva já aplicada foi a remoção da exposição pública da porta 3000, validada com o Portal online localmente.

## Conclusão executiva

A VM1 recebe varreduras automatizadas comuns da internet, incluindo pedidos malformados, caminhos conhecidos de exploração e sondas de serviços. Os registros apresentados retornaram HTTP 400; **não há evidência nesse recorte de comprometimento bem-sucedido**. Ainda assim, a linha de base revelou controles prioritários a reforçar.

O principal risco de aplicação — a exposição pública direta da porta 3000 do Node — foi removido. O Portal continua acessível internamente por `127.0.0.1:3000`, com resposta HTTP 200, enquanto o acesso externo passa pelo Nginx nas portas 80 e 443.

## Inventário e riscos confirmados

| Prioridade | Achado | Estado | Risco | Decisão recomendada |
|---|---|---|---|---|
| **P0 concluído** | Porta 3000 exposta no UFW IPv4 e IPv6 | Corrigido | Acesso externo direto ao Node, fora dos controles Nginx | Regra removida; manter somente Nginx como borda pública. |
| **P0 pendente** | SSH permite `root` e autenticação por senha | Confirmado | Aumenta a superfície para força bruta e uso indevido de credenciais | Migrar para chave confirmada e só então desabilitar senha/root de forma reversível. |
| **P1 pendente** | `fail2ban` inativo | Confirmado | Tentativas repetidas de SSH e Nginx não sofrem bloqueio automático | Instalar/configurar após preservar acesso administrativo por chave. |
| **P1 pendente** | `server_tokens` está comentado; não há limites de requisição ou conexão visíveis | Confirmado | Exposição de versão e menor resistência a varredura, força bruta e abuso de rotas | Adicionar cabeçalhos, bloqueios de caminhos e limites graduais, validados por `nginx -t`. |
| **P1 pendente** | Configuração global menciona TLS 1.0/1.1 | Confirmado | A configuração TLS deve ser uniformizada | O bloco Certbot efetivo já usa TLS 1.2/1.3; revisar o contexto global antes de mudar. |
| **P2 pendente** | Atualização de segurança de kernel disponível | Confirmado | Correções de vulnerabilidades ficam pendentes | Aplicar somente em janela de manutenção, com reinicialização planejada. |
| **P2 observação** | ZeroTier escuta portas próprias | Confirmado | Serviço de sobreposição de rede precisa permanecer intencional e atualizado | Não remover sem confirmar uso administrativo. |

## Acesso administrativo observado

Há chaves autorizadas para `root` e para o usuário operacional, e há sessões administrativas ativas por rede privada. Isso é positivo para preparar a migração a chave, porém **não demonstra isoladamente que todos os administradores conseguem entrar por chave sem senha**. A mudança de SSH deve ser feita em duas sessões simultâneas: manter a sessão atual aberta, testar uma nova conexão por chave e, somente após sucesso, desabilitar senha e login remoto de root.

## Próxima mudança controlada

A primeira alteração proposta para Nginx será independente de SSH: desligar exposição de versão, adicionar cabeçalhos defensivos e bloquear caminhos típicos de varredura, mantendo as rotas clínicas, DICOM, mídia privada e viewers externos. Antes da aplicação, será preservado backup do arquivo ativo, executado `nginx -t` e feita recarga sem derrubar o processo.

## Hardening Nginx aplicado

O hardening inicial do Nginx foi aplicado após cópia de segurança integral de `/etc/nginx`, teste de sintaxe bem-sucedido e recarga sem interrupção. O Portal continuou respondendo HTTPS com HTTP 200.

| Controle aplicado | Resultado validado |
|---|---|
| Ocultação de versão | `server_tokens off` ativo no servidor do Portal. |
| Cabeçalhos de navegador | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy` presentes na resposta HTTPS. |
| Limite de conexões | Até 50 conexões simultâneas por IP, sem limite de requisições por segundo nesta rodada para não afetar o carregamento de fatias DICOM. |
| Caminhos sensíveis | Arquivos de repositório, ambiente, CGI, WordPress, Tomcat e Actuator recebem retorno 404 no Nginx antes de alcançar o Portal. |

A primeira verificação imediatamente após a recarga retornou HTTP 200 para `/.git/HEAD`; a inspeção posterior da configuração efetivamente carregada confirmou HTTP 404 para o mesmo caminho, com os cabeçalhos defensivos presentes. Nenhuma alteração adicional de regra foi necessária. A mudança permanece reversível pela cópia de segurança criada antes do hardening.

## Segmentação do acesso administrativo

O SSH foi removido da internet pública. As portas 80 e 443 seguem públicas exclusivamente para o Portal, enquanto a porta 22 aceita acesso somente pelas redes privadas administrativas aprovadas:

| Origem permitida | Finalidade |
|---|---|
| `192.168.193.0/24` | Administração por ZeroTier/rede privada do operador. |
| `172.16.0.0/22` | Administração e comunicação na rede interna das VMs, mantida por decisão aprovada. |

O firewall mantém política padrão de negar conexões de entrada. A porta 3000 do Node continua inacessível externamente; o Nginx é a única borda pública do Portal.

## Fail2Ban defensivo

O serviço Fail2Ban foi habilitado para iniciar automaticamente. Além do *jail* padrão de SSH, foi criada a regra `pacs-nginx-probe`, que monitora o acesso Nginx e bloqueia no UFW, por uma hora, endereços externos que realizarem ao menos dez tentativas em dez minutos contra caminhos inequivocamente abusivos.

Os padrões cobertos incluem arquivos de repositório e ambiente, CGI, WordPress, Tomcat e Actuator. As redes privadas administrativas e o *loopback* foram explicitamente excluídos. A validação leu o log existente, reconheceu sete tentativas históricas de varredura e não produziu bloqueios indevidos. Nenhum caminho clínico, DICOM, tRPC, mídia privada ou viewer externo foi incluído na regra.

## Pendências deliberadamente separadas

A confiança Windows do instalador RadiAnt continua uma pendência comercial de assinatura de código e não é substituída por hardening de servidor. Por decisão atual, a migração de SSH para chave obrigatória e a desativação de login remoto de root serão avaliadas posteriormente, pois o acesso SSH já não está exposto à internet pública.

## Validação final do hardening externo

A verificação final confirmou os controles abaixo sem impacto no Portal:

| Verificação | Resultado |
|---|---|
| Regras públicas UFW | Somente HTTP 80 e HTTPS 443 permanecem públicos. |
| Regras SSH UFW | Permitidas exclusivamente para `192.168.193.0/24` e `172.16.0.0/22`. |
| Portal HTTPS | HTTP 200 pelo Nginx. |
| Caminho sensível `/.git/HEAD` | HTTP 404 pelo Nginx, antes de alcançar a aplicação. |
| Fail2Ban | Habilitado, ativo e com *jails* `sshd` e `pacs-nginx-probe`. |
| Portal PACS | Processo PM2 online após todas as mudanças. |

Não havia IP banido no instante da verificação. Isso é esperado: o controle foi criado para atuar sobre tentativas futuras e repetidas, não para banir retroativamente linhas históricas de log.

## Evidências preservadas

Esta documentação não inclui endereços IP de origem, identificadores de sessão, chaves públicas, nomes de pacientes, estudos, laudos ou segredos. O diagnóstico detalhado permanece apenas no terminal administrativo da VM1.
