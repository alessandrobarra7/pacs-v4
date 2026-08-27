# Runbook de Migração para Infraestrutura Maior

**Sistema:** PACS Portal / LAUDS  
**Repositório de origem:** `https://github.com/alessandrobarra7/pacs-v4.git`  
**Objetivo:** transferir o ambiente de produção para servidores com maior capacidade, preservando aplicação, banco de dados, arquivos clínicos, configurações e operação.  
**Atualizado em:** 26/08/2026

> Este documento é um roteiro de continuidade operacional. Ele não deve ser executado integralmente sem preencher os valores marcados com `<...>` e sem validar cada etapa no ambiente de destino. **Nunca** registrar senhas, chaves JWT ou chaves MinIO neste arquivo, no Git ou em conversas.

## 1. Resultado que a migração deve preservar

Ao final, os usuários devem acessar o mesmo portal, com os mesmos logins, unidades, permissões, estudos, laudos, arquivos, trilha financeira e integrações PACS. A mudança de infraestrutura não pode recalcular valores financeiros, recriar laudos, trocar identificadores ou substituir a data clínica do exame pela data de assinatura.

| Componente | Deve continuar igual após a virada | Fonte de verdade |
|---|---|---|
| Código | Projeto, dependências travadas e commit liberado | GitHub, branch `main` |
| Aplicação | Node.js, React, Express, tRPC, PM2 e Nginx | VM de aplicação e `package.json` |
| Dados clínicos e administrativos | Usuários, unidades, permissões, laudos, versões, auditoria e financeiro | MySQL `pacs_portal` |
| Arquivos | Anexos, áudios e exports em objetos; logos, assinaturas, carimbos e perfis locais | MinIO e diretório `uploads/` da aplicação |
| PACS/DICOM | AEs, endereços, portas, Orthanc/DICOMweb e rotinas Python | Variáveis da aplicação e cadastro de unidades |
| Segurança | JWT, senhas, políticas de rede, TLS e acesso restrito ao banco/object storage | Arquivos de ambiente e configurações do sistema |

## 2. Arquitetura atual a ser migrada

O ambiente atual separa responsabilidades em três máquinas internas. Essa divisão deve ser mantida, ainda que cada camada ganhe mais CPU, memória, disco ou redundância. A aplicação é consumidora do banco e do storage; a VM2 não deve servir interface web e a VM3 não deve executar lógica de negócio.[1]

| Papel atual | Endereço interno atual | Responsabilidade | Estado desejável no ambiente maior |
|---|---:|---|---|
| **VM1 — Aplicação** | `172.16.3.100` | Nginx, PM2, Node.js, tRPC, React, autenticação local JWT, integração PACS/DICOM e geração de documentos | Uma VM maior ou duas/múltiplas instâncias atrás de balanceador, somente depois de validar sessão, uploads e jobs sem estado local |
| **VM2 — Banco** | `172.16.3.101:3306` | MySQL `pacs_portal`, registros clínicos, auditoria, financeiro, permissões e referências de arquivo | Servidor MySQL maior, armazenamento SSD e backup testado; opcionalmente réplica para leitura/recuperação |
| **VM3 — Objetos** | `172.16.3.102:9000` | MinIO e arquivos binários persistentes, com RAID1 local | MinIO com capacidade planejada e cópia externa verificável; não expor a API ao público |
| **PACS/Orthanc** | Por unidade | Origem das imagens DICOM e DICOMweb | Mantidos como integrações externas; liberar somente a nova aplicação nas redes necessárias |
| **Borda** | IP público, NAT e DNS | Domínio, TLS, proxy HTTPS e encaminhamento para VM1 | Novo IP público/NAT ou balanceador; DNS apontado somente após os testes |

### 2.1 Estado atual que exige atenção

1. A aplicação de produção está em `/var/www/pacs-portal` na VM1. O carregamento de variáveis é cumulativo: `/opt/pacs-portal/.env` é lido antes de `/var/www/pacs-portal/.env`. Esse comportamento deve ser preservado ou unificado de forma controlada.[2]
2. A aplicação executa `pnpm start`, que inicia `node dist/index.js`; `pnpm build` gera o frontend e o backend empacotado.[3]
3. A porta `3000` é interna. O Nginx recebe HTTP/HTTPS e encaminha para a aplicação local; a porta do Node não deve ser publicada diretamente.
4. O banco canônico é `pacs_portal`. A estrutura é definida por `drizzle/schema.ts`, pelo journal `drizzle/meta/_journal.json` e pelas migrations listadas nele — não por scripts de seed ou documentação antiga.[4]
5. Objetos de anexos, áudios e exports usam MinIO quando configurado. Os caminhos `logos/`, `signatures/`, `stamps/`, `avatars/` e `profiles/` continuam locais na VM1 e precisam de cópia própria.[5]

## 3. Topologia recomendada para o crescimento

O primeiro destino maior pode manter três máquinas, mas com recursos superiores e backups externos. Somente introduza balanceamento de múltiplas aplicações quando o armazenamento local de uploads, a estratégia de sessão e as tarefas DICOM tiverem sido verificados para funcionamento multi-instância.

| Camada | Recomendação mínima de continuidade | Evolução de escala |
|---|---|---|
| Aplicação | 4 vCPU, 8–16 GB RAM, SSD, Node.js 22, Nginx e PM2 | Duas instâncias idênticas atrás de um balanceador; diretório local de uploads compartilhado ou migrado antes de escalar horizontalmente |
| Banco | 4 vCPU, 16 GB RAM, SSD com monitoramento e backup externo | Réplica de leitura, backup ponto-no-tempo e plano de restauração documentado |
| Objetos | MinIO em discos redundantes e capacidade com margem | Replicação para segundo destino/bucket e verificação periódica de integridade |
| Rede | Sub-rede privada entre app, banco e MinIO | Segmentação por VLAN/security group, bastion/VPN administrativo e monitoramento centralizado |

## 4. Pré-requisitos e regra de segurança

Antes de qualquer cópia, nomeie as máquinas novas no quadro abaixo. Esse quadro é a ficha de execução da migração e deve ficar fora do Git se contiver endereços sensíveis.

| Item | Valor a preencher antes da execução |
|---|---|
| Nova aplicação | `<NOVO_IP_VM_APP>` |
| Novo banco | `<NOVO_IP_VM_DB>` |
| Novo MinIO | `<NOVO_IP_VM_STORAGE>` |
| Domínio público | `<DOMINIO>` |
| Repositório/commit aprovado | `<COMMIT_LIBERADO>` |
| Janela de manutenção | `<DATA_HORA_INICIO>` até `<DATA_HORA_FIM>` |
| Responsável pela virada | `<NOME_RESPONSAVEL>` |
| Backup do banco validado | `<CAMINHO_E_HASH>` |
| Backup/espelho de objetos validado | `<LOCAL_E_CONTAGEM>` |

> Durante a virada deve haver **uma única origem de escrita**. Não permitir que ambiente antigo e novo recebam assinaturas de laudos, pagamentos ou uploads em paralelo. Se houver necessidade de retorno, a aplicação antiga só deve voltar a atender depois que a nova for parada.

## 5. Fase A — Inventário do ambiente atual

Execute os comandos abaixo antes de agendar a virada. Eles são somente de leitura e não exibem valores secretos.

### 5.1 VM1 — aplicação

```bash
cd /var/www/pacs-portal
printf 'BRANCH='; git branch --show-current
printf 'COMMIT='; git rev-parse HEAD
git status --short
node --version
pnpm --version
pm2 status pacs-portal
curl --connect-timeout 3 --max-time 10 -sS -o /dev/null -w 'HTTP_LOCAL=%{http_code}\n' http://127.0.0.1:3000/
for ENV_FILE in /opt/pacs-portal/.env /var/www/pacs-portal/.env; do
  if [ -f "$ENV_FILE" ]; then
    printf 'ENV_KEYS=%s\n' "$ENV_FILE"
    sed -nE 's/^([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p' "$ENV_FILE" | sort
  fi
done
du -sh /var/www/pacs-portal/uploads 2>/dev/null || true
```

Guarde o commit exibido, a lista de nomes de variáveis, o estado do PM2 e o tamanho de `uploads/`. **Não** copie o conteúdo de `.env` para tickets, Git ou e-mail sem mecanismo seguro.

### 5.2 VM2 — banco

```bash
DB='pacs_portal'
sudo mysql "$DB" -e "SELECT VERSION() AS mysql_version, DATABASE() AS database_name;"
sudo mysql "$DB" -e "SHOW TABLE STATUS;"
sudo mysql "$DB" -Nse "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name;"
sudo mysql "$DB" -Nse "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE();"
sudo systemctl status mysql --no-pager
df -h
```

Registre especialmente as contagens das tabelas `users`, `units`, `reports`, `report_versions`, `studies_cache`, `billing_visit_events`, `billing_catalog_study_events`, `audit_log`, `study_attachments` e `study_audio_reports`. Elas serão comparadas após a restauração.

### 5.3 VM3 — storage

```bash
sudo systemctl status minio --no-pager
df -h /data/storage
cat /proc/mdstat
sudo mdadm --detail /dev/md0
```

Registre o nome do bucket usado, a contagem de objetos, o volume ocupado, o estado do RAID e a política atribuída à conta de aplicação. A API S3/MinIO deve continuar acessível apenas à rede privada da aplicação.[1]

## 6. Fase B — Backups recuperáveis

RAID não é backup. Um backup só é considerado válido depois de restaurado em ambiente isolado ou conferido por hash e por contagem de registros/objetos.[1]

### 6.1 Backup consistente do banco

Na VM2, crie um dump transacional sem escrever senha na linha de comando:

```bash
set -Eeuo pipefail
DB='pacs_portal'
BACKUP_DIR="$HOME/pacs-backups/migracao-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
sudo mysqldump --single-transaction --routines --events --triggers --no-tablespaces "$DB" | gzip > "$BACKUP_DIR/${DB}.sql.gz"
test -s "$BACKUP_DIR/${DB}.sql.gz"
sha256sum "$BACKUP_DIR/${DB}.sql.gz" > "$BACKUP_DIR/${DB}.sql.gz.sha256"
printf 'BACKUP_DB=%s\n' "$BACKUP_DIR/${DB}.sql.gz"
cat "$BACKUP_DIR/${DB}.sql.gz.sha256"
```

Faça uma cópia desse dump para armazenamento externo controlado. Antes da virada, restaure uma cópia em um banco de teste e compare as contagens de tabelas críticas.

### 6.2 Backup do storage de objetos e dos ativos locais

1. No MinIO, configure um espelho de bucket para o destino novo ou para um repositório externo. Preserve chaves, metadados e nomes dos objetos; não renomeie arquivos durante a cópia.
2. Faça uma primeira sincronização enquanto o sistema está online e uma segunda sincronização curta durante a janela de parada.
3. Na VM1, arquive também os ativos locais que não são enviados ao MinIO:

Em uma estação administrativa protegida que possua o cliente `mc` configurado, o espelhamento deve seguir a estrutura abaixo. Informe credenciais somente no prompt seguro do cliente, nunca no histórico do shell ou neste documento.

```bash
mc alias set origem http://<IP_MINIO_ATUAL>:9000
mc alias set destino http://<NOVO_IP_VM_STORAGE>:9000
mc mirror --overwrite --preserve origem/<BUCKET_ATUAL> destino/<BUCKET_DESTINO>
mc du origem/<BUCKET_ATUAL>
mc du destino/<BUCKET_DESTINO>
mc ls --recursive --json origem/<BUCKET_ATUAL> | wc -l
mc ls --recursive --json destino/<BUCKET_DESTINO> | wc -l
```

As contagens e o volume devem ser registrados. A segunda execução de `mc mirror` durante a janela de manutenção deve terminar sem objetos pendentes antes de liberar a nova aplicação.

```bash
set -Eeuo pipefail
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="/root/pacs-local-assets-$STAMP.tar.gz"
tar -C /var/www/pacs-portal -czf "$OUT" uploads/logos uploads/signatures uploads/stamps uploads/avatars uploads/profiles 2>/dev/null || true
sha256sum "$OUT"
```

Se algum diretório estiver ausente, registre isso no log da migração; não trate como erro automático. Referências `/uploads/...` legadas continuam suportadas e só devem ser transformadas por um projeto específico de migração de storage.[5]

### 6.3 Backup de configuração e aplicação

O código pode ser recuperado pelo Git, mas configurações do Nginx, PM2, variáveis de ambiente e certificados devem ser arquivados com permissão restrita.

```bash
set -Eeuo pipefail
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="/root/pacs-config-$STAMP.tar.gz"
tar -czf "$OUT" /etc/nginx /etc/letsencrypt /root/.pm2 /opt/pacs-portal/.env /var/www/pacs-portal/.env 2>/dev/null
chmod 600 "$OUT"
sha256sum "$OUT"
```

Transfira esse arquivo por canal seguro. No destino, extraia as configurações somente depois de revisar IPs, domínio e permissões; não substitua arquivos cegamente.

## 7. Fase C — Preparar o novo ambiente

### 7.1 Criar a nova VM de banco

1. Instale MySQL compatível com a versão da VM2 atual e configure `utf8mb4`/`utf8mb4_unicode_ci`.
2. Crie o banco `pacs_portal` e o usuário de aplicação equivalente a `pacs_user`, restringindo o host ao IP da nova aplicação.[4]
3. Configure `bind-address` para o IP privado da nova VM2 e libere a porta 3306 exclusivamente para `<NOVO_IP_VM_APP>`.
4. Restaure primeiro o dump de teste. Só depois do resultado validado prepare o banco final.

```bash
gunzip -c <CAMINHO_DO_DUMP>/pacs_portal.sql.gz | sudo mysql pacs_portal
sudo mysql pacs_portal -e "SHOW TABLES;"
```

Não use `scripts/seed-production.mjs` para reconstruir produção e não aplique migrations pelo nome. Verifique `drizzle/meta/_journal.json`, compare com o schema do commit liberado e aplique apenas migrations oficiais que estejam ausentes.[4]

### 7.2 Criar o novo MinIO

1. Instale e habilite MinIO em armazenamento persistente separado do disco do sistema.
2. Crie o bucket com o mesmo nome do ambiente atual ou planeje a mudança de nome em todas as variáveis e referências antes da virada.
3. Crie uma conta de aplicação com acesso mínimo ao bucket; não reutilize credenciais administrativas no Portal.
4. Importe/replice os objetos antes de apontar a nova aplicação para esse serviço.
5. Permita a porta S3 somente a partir da nova VM de aplicação e mantenha a console administrativa em rede privada/VPN.[1]

### 7.3 Criar a nova VM de aplicação

Instale Node.js 22, pnpm na versão definida em `package.json`, Git, Nginx, PM2, Python 3.11+, `pydicom` e `pynetdicom`. Em seguida, faça o clone e compile o commit aprovado.

```bash
set -Eeuo pipefail
APP_ROOT='/var/www/pacs-portal'
REPOSITORY='https://github.com/alessandrobarra7/pacs-v4.git'
COMMIT='<COMMIT_LIBERADO>'
sudo install -d -m 755 /var/www
sudo git clone "$REPOSITORY" "$APP_ROOT"
sudo chown -R "$USER":"$USER" "$APP_ROOT"
cd "$APP_ROOT"
git fetch origin main
git checkout --detach "$COMMIT"
pnpm install --frozen-lockfile
pnpm check
pnpm vitest run
pnpm build
```

Caso a suíte completa tenha testes que dependam de MinIO/PACS não disponíveis no destino de preparação, registre a falha específica. Não ignore falhas de TypeScript, build, autenticação, assinatura, financeiro ou schema.

### 7.4 Recriar as variáveis de ambiente

Crie os arquivos de ambiente com permissão `600` e proprietário do usuário que executa o PM2. Preserve os nomes de variáveis do ambiente atual, sem revelar valores. O checklist mínimo é:

| Grupo | Exemplos de chaves que devem ser conferidas |
|---|---|
| Banco e sessão | `DATABASE_URL`, `JWT_SECRET` |
| Object storage | `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` |
| PACS/DICOM | Configurações PACS por unidade e dependências Python | 
| Aplicação | `NODE_ENV`, endereço/porta interna e origem pública autorizada |

Mantenha a ordem de leitura compatível com o bootstrap atual: arquivo operacional em `/opt/pacs-portal/.env` antes do `.env` localizado na raiz efetiva da aplicação. Se optar por consolidar ambos em um único cofre/arquivo, faça isso em uma alteração separada, testada antes da migração.[2]

### 7.5 PM2, Nginx e TLS

1. Faça o PM2 iniciar a aplicação por `pnpm start` no diretório do projeto; a porta é determinada pelo ambiente e não deve ser codificada no código.
2. Configure Nginx para receber 80/443 e encaminhar somente para `127.0.0.1:3000` (ou porta definida no ambiente).
3. Não abra a porta Node para a Internet.
4. Baixe o TTL DNS para 300 segundos pelo menos 24 horas antes da virada.
5. Emita/renove o certificado TLS no novo destino somente quando o DNS/validação estiver preparado. A renovação deve ser testada antes do corte.

## 8. Fase D — Teste de homologação no destino

Use endereço temporário, VPN, arquivo hosts ou hostname de homologação. Não direcione o domínio público durante esta fase.

| Teste | Critério de aceite |
|---|---|
| Serviço | `pm2 status pacs-portal` online e `curl http://127.0.0.1:3000/` responde `200` |
| Banco | Login, leitura de unidades e contagens críticas iguais às do dump |
| Autenticação | Login local JWT com usuário existente, sem recriar usuários |
| PACS | Consulta C-FIND em unidade autorizada e abertura do viewer de estudo permitido |
| Laudo | Rascunho, assinatura, revisão e PDF preservam `signedAt` e a data clínica do estudo |
| Storage | Leitura de anexo/áudio/export e upload de arquivo teste no bucket novo |
| Financeiro | Ciclo atual, histórico, valores de eventos e CSV por médico coerentes com o banco |
| Segurança | Banco e MinIO sem acesso público; HTTPS válido; `.env` não acessível pela web |

## 9. Fase E — Virada de produção

### 9.1 Preparação imediata

1. Confirme backups e hashes, teste de restauração, commit aprovado, estado saudável das três máquinas antigas e novas e contato de retorno.
2. Confirme que o novo ambiente ainda aponta para uma cópia válida e que ninguém usará as duas aplicações para produzir dados ao mesmo tempo.
3. Comunique a janela de manutenção aos usuários.

### 9.2 Congelar escrita e realizar cópia final

1. Coloque a entrada antiga em manutenção pela borda (Nginx/Mikrotik) ou pare `pacs-portal` de modo controlado.
2. Faça o **dump final** da VM2 e a **sincronização final** do bucket e dos ativos locais.
3. Restaure o dump final no novo banco e complete a sincronização dos objetos.
4. Compare as contagens de tabelas e objetos com o inventário da Fase A.
5. Atualize somente os valores de infraestrutura nas variáveis da nova aplicação: host do banco, endpoint MinIO, IPs de PACS permitidos e origem pública.

### 9.3 Ativar novo ambiente e trocar DNS/NAT

1. Inicie a aplicação nova, valide PM2, Nginx, HTTPS e a saúde local.
2. Direcione o NAT/balanceador ou o registro DNS do domínio para `<NOVO_IP_VM_APP>`.
3. Verifique o certificado, login, uma consulta PACS, um laudo em modo seguro, leitura de objeto e o financeiro.
4. Mantenha a VM antiga desligada para escrita, mas preservada e acessível para retorno durante o período de observação definido.

## 10. Reversão segura

Acione a reversão se houver falha que comprometa login, leitura de dados, assinatura de laudo, arquivos, PACS, financeiro ou segurança de rede.

1. Pare a aplicação nova ou coloque-a em manutenção para impedir escrita adicional.
2. Reaponte DNS/NAT para a VM1 antiga.
3. Confirme que a VM1 antiga ainda usa a cópia de banco/object storage consistente com o momento do corte.
4. Reinicie o processo antigo somente depois de garantir que não há escrita concorrente no novo ambiente.
5. Registre todos os dados criados na nova infraestrutura antes do retorno. Se houve qualquer escrita, não descarte o ambiente novo; reconcilie os registros antes de decidir o banco que voltará a ser canônico.

> Nunca trate rollback da aplicação como rollback automático do banco ou dos objetos. Código pode voltar rapidamente por Git/PM2; dados e arquivos exigem um plano explícito de consistência.

## 11. Operação após a migração

Durante os primeiros sete dias, acompanhe disponibilidade, CPU, memória, disco, latência do banco, espaço do bucket, erros de PACS e falhas de assinatura/upload. Teste diariamente o backup e, no mínimo uma vez por trimestre, realize uma restauração completa em ambiente isolado.

| Monitoramento | Alerta recomendado |
|---|---|
| Aplicação | PM2 offline, HTTP diferente de 200, erro 5xx e reinícios repetidos |
| Banco | Disco acima de 80%, falha de backup, conexões saturadas e lentidão anormal |
| Storage | RAID degradado, bucket sem espaço, falha de espelhamento e URLs pré-assinadas com erro |
| Segurança | Tentativa externa nas portas 3306/9000/9001, falha TLS e alteração inesperada em `.env` |
| PACS | Timeout C-FIND/DICOMweb, perda de conectividade com unidade e erros de transferência |

## 12. Regra de atualização depois da mudança

Para atualizações futuras, preserve o método já estabilizado: árvore Git limpa, `git fetch origin main`, verificação do commit esperado, `git merge --ff-only <commit>`, `pnpm check`, testes direcionados, `pnpm build`, restart do PM2 e `HTTP_LOCAL=200`. Alterações de schema continuam sendo aplicadas primeiro e de forma aditiva na VM do banco, com precheck em `information_schema` e backup da tabela afetada.

## 13. Procedimentos legados que não devem guiar a migração

Alguns documentos e scripts antigos descrevem OAuth Manus, `pacs_app`, caminhos `/home/ubuntu/pacs-portal`, criação manual parcial de tabelas ou uso de seed para produção. Eles são evidência histórica, mas não devem orientar a mudança de infraestrutura. O Portal atual utiliza autenticação local JWT e usuário de banco `pacs_user`; o caminho de produção confirmado é `/var/www/pacs-portal` e o schema precisa ser reconstruído a partir do dump consistente e das fontes canônicas do código.[2] [4]

## 14. Documentos relacionados e precedência

Este runbook consolida a estratégia de movimentação de infraestrutura. Para decisões específicas, use as fontes abaixo; se houver conflito sobre schema ou comportamento, o código do commit aprovado prevalece.[4]

[1] [Arquitetura operacional de três VMs](ARQUITETURA_3_VMS_PACS.md)  
[2] [Bootstrap cumulativo de variáveis de ambiente](../server/_core/envBootstrap.ts)  
[3] [Scripts de execução e build](../package.json)  
[4] [Guia canônico da VM2 e migrations](GUIA_VM2_BANCO_MESTRE.md)  
[5] [Camada atual de storage](../server/storage.ts)
