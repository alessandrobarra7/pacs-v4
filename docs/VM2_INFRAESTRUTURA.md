# LAUDS — Documentação de Infraestrutura da VM2
**Gerado em:** 02/04/2026  
**Atualizado em:** 07/04/2026 (verificado com estado real da VM2)  
**Projeto:** Sistema de Laudos Radiologicos — LAUDS  
**Responsável técnico:** StudioBarra7

> **Referência principal:** Para a estrutura canônica do banco de dados, criação da VM2 do zero e lista oficial de migrations, consulte **[GUIA_VM2_BANCO_MESTRE.md](./GUIA_VM2_BANCO_MESTRE.md)**. Em caso de divergência entre este arquivo e o guia mestre, **prevalece o guia mestre**.

> **Finalidade deste arquivo:** documenta a infraestrutura operacional da VM2 (MySQL, MinIO, firewall, backup, histórico de instalações e credenciais de acesso direto).

---

## 1. IDENTIFICAÇÃO DOS SERVIDORES

### VM1 — Servidor do Portal Web

| Parâmetro | Valor |
|---|---|
| Função | Portal Web (Node.js + Express) |
| IP Público | 45.189.160.17 |
| Sistema Operacional | Ubuntu 22.04 LTS |
| Diretório do projeto | `/home/pacs/pacs-portal` |

### VM2 — Banco de Dados e Armazenamento

| Parâmetro | Valor |
|---|---|
| Função | MySQL + MinIO (armazenamento de arquivos) |
| Hostname | pacs |
| IP Interno (rede PACS) | 172.16.3.101 |
| IP Interno (rede local) | 192.168.193.101 |
| Sistema Operacional | Ubuntu 22.04.5 LTS (Jammy Jellyfish) |
| Disco Total | 98 GB |
| Disco Livre | ~84 GB |
| RAM Total | 7,6 GB |
| Swap | 4,0 GB |
| Usuário padrão | root |

---

## 2. SERVIÇO 1 — MySQL Community Server

| Parâmetro | Valor |
|---|---|
| Porta | 3306 |
| Usuário root | root |
| **Senha root** | `137946` |
| Banco do portal | `pacs_portal` |
| Serviço systemd | `mysql.service` |
| Status | Ativo desde 21/03/2026 |

```bash
# Acessar o banco
mysql -u root -p137946

# Listar bancos
mysql -u root -p137946 -e "SHOW DATABASES;"

# Listar tabelas do portal
mysql -u root -p137946 -e "USE pacs_portal; SHOW TABLES;"

# Reiniciar MySQL
systemctl restart mysql
```

---

## 3. SERVIÇO 2 — MinIO (Armazenamento de Arquivos)

### Credenciais

| Parâmetro | Valor |
|---|---|
| **Usuário admin** | `lauds_admin` |
| **Senha admin** | `Lauds@2026!Secure` |
| Bucket principal | `lauds` |
| Versão | RELEASE.2025-09-07T16-13-09Z |
| Instalado em | 02/04/2026 |

### Endereços de Acesso

| Tipo | URL |
|---|---|
| Console Web (rede PACS) | `http://172.16.3.101:9001` |
| Console Web (rede local) | `http://192.168.193.101:9001` |
| API S3 (rede PACS) | `http://172.16.3.101:9000` |
| API S3 (rede local) | `http://192.168.193.101:9000` |

### Estrutura de Pastas no Bucket `lauds`

```
lauds/
├── unidades/{id}/logo/     → Logos das unidades médicas
└── usuarios/{id}/carimbo/  → Carimbos dos médicos
```

### Comandos de Manutenção

```bash
# Verificar status
systemctl status minio

# Reiniciar
systemctl restart minio

# Ver logs
journalctl -u minio -n 50

# Listar buckets
mc ls vm2minio

# Listar arquivos no bucket lauds
mc ls vm2minio/lauds --recursive

# Ver uso de disco
du -sh /data/minio
```

---

## 4. PASSO A PASSO — INSTALAÇÃO DO MINIO (reinstalação futura)

### PASSO 1 — Verificar ambiente

```bash
cat /etc/os-release | grep -E "NAME|VERSION"
df -h
free -h
ss -tlnp | grep -E "9000|9001"
which minio 2>/dev/null && minio --version || echo "MinIO NÃO instalado"
```

### PASSO 2 — Baixar MinIO

```bash
mkdir -p /data/minio && \
wget https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio && \
chmod +x /usr/local/bin/minio && \
minio --version
```

### PASSO 3 — Criar usuário e configuração

```bash
useradd -r -s /sbin/nologin minio 2>/dev/null || echo "Usuário minio já existe"
chown -R minio:minio /data/minio

cat > /etc/default/minio <<'EOF'
MINIO_ROOT_USER=lauds_admin
MINIO_ROOT_PASSWORD=Lauds@2026!Secure
MINIO_VOLUMES="/data/minio"
MINIO_OPTS="--console-address :9001"
EOF
```

### PASSO 4 — Criar serviço systemd

```bash
cat > /etc/systemd/system/minio.service <<'EOF'
[Unit]
Description=MinIO Object Storage
Documentation=https://min.io/docs
Wants=network-online.target
After=network-online.target

[Service]
WorkingDirectory=/usr/local
User=minio
Group=minio
EnvironmentFile=/etc/default/minio
ExecStartPre=/bin/bash -c "if [ -z \"${MINIO_VOLUMES}\" ]; then echo \"MINIO_VOLUMES not set\"; exit 1; fi"
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=always
LimitNOFILE=65536
TasksMax=infinity
TimeoutStopSec=infinity
SendSIGKILL=no

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload && \
systemctl enable minio && \
systemctl start minio && \
sleep 4 && \
systemctl status minio --no-pager
```

### PASSO 5 — Instalar cliente mc e criar bucket

```bash
wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc && \
chmod +x /usr/local/bin/mc && \
mc alias set vm2minio http://127.0.0.1:9000 lauds_admin 'Lauds@2026!Secure' && \
mc mb vm2minio/lauds --ignore-existing && \
mc anonymous set none vm2minio/lauds && \
mc ls vm2minio
```

### PASSO 6 — Liberar firewall

```bash
ufw allow 9000/tcp && ufw allow 9001/tcp && echo "Firewall liberado"
```

### PASSO 7 — Verificar tudo

```bash
systemctl is-active minio && echo "MinIO: OK" || echo "MinIO: ERRO"
systemctl is-active mysql && echo "MySQL: OK" || echo "MySQL: ERRO"
mc ls vm2minio
ss -tlnp | grep -E "3306|9000|9001"
```

---

## 5. BACKUP AUTOMÁTICO DO BANCO DE DADOS

**Configurado em:** 02/04/2026  
**Horário:** Todo dia às 2h da manhã  
**Script:** `/usr/local/bin/backup-lauds.sh`  
**Log:** `/var/log/backup-lauds.log`  
**Destino:** `/data/backups/`  
**Retenção:** 30 backups (aproximadamente 1 mês)

```bash
# Executar backup manualmente
/usr/local/bin/backup-lauds.sh

# Listar backups existentes
ls -lh /data/backups/

# Ver log dos backups automáticos
tail -20 /var/log/backup-lauds.log

# Restaurar backup (CUIDADO: apaga dados atuais)
# mysql -u root -p137946 pacs_portal < /data/backups/pacs_portal_YYYYMMDD_HHMMSS.sql
```

**Para reconfigurar o backup do zero:**

```bash
cat > /usr/local/bin/backup-lauds.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/data/backups"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u root -p137946 pacs_portal > $BACKUP_DIR/pacs_portal_$DATE.sql
ls -t $BACKUP_DIR/pacs_portal_*.sql | tail -n +31 | xargs -r rm
echo "Backup concluído: $DATE"
EOF
chmod +x /usr/local/bin/backup-lauds.sh
echo "0 2 * * * root /usr/local/bin/backup-lauds.sh >> /var/log/backup-lauds.log 2>&1" > /etc/cron.d/backup-lauds
```

---

## 6. FIREWALL — PORTAS ABERTAS NA VM2

| Porta | Serviço | Aberta em |
|---|---|---|
| 3306 | MySQL | Instalação original |
| 9000 | MinIO API S3 | 02/04/2026 |
| 9001 | MinIO Console Web | 02/04/2026 |

---

## 7. BANCO DE DADOS — TABELAS PRINCIPAIS

| Tabela | Finalidade |
|---|---|
| `users` | Usuários do sistema |
| `units` | Unidades médicas |
| `reports` | Laudos radiológicos |
| `report_versions` | Histórico de retificações de laudos |
| `studies_cache` | Cache de estudos DICOM |
| `templates` | Modelos de laudo |
| `audit_log` | Log de auditoria |
| `anamnesis_simple` | Indicações clínicas |
| `dicom_annotations` | Anotações do visualizador DICOM |
| `study_metadata` | Metadados editáveis dos estudos |
| `phrases` | Frases pré-definidas |
| `phrase_groups` | Grupos de frases |
| `user_unit_permissions` | Permissões por usuário/unidade |

---

## 8. MIGRATIONS DO BANCO DE DADOS

Esta seção registra todas as alterações de schema aplicadas ou pendentes no banco `pacs_portal` da VM2. Execute os SQLs abaixo **em ordem** para manter o banco sincronizado com o código do portal.

### Como aplicar uma migration na VM2

```bash
mysql -u root -p137946 pacs_portal
```

Dentro do MySQL, cole o SQL da migration e pressione Enter.

---

### Migrations já aplicadas

> Estado verificado em 07/04/2026 com `SHOW TABLES`, `DESCRIBE` e `SHOW INDEX` diretamente no banco `pacs_portal` da VM2.

| Migration | Data aplicada | Descrição |
|---|---|---|
| `0000` a `0009` | 21/03/2026 | Schema inicial: `units`, `users`, `studies_cache`, `templates`, `reports`, `audit_log`, `anamnesis`, `dicom_annotations`, `anamnesis_simple` |
| `0010` | 21/03/2026 | Tabela `study_metadata` criada |
| `0011` | 21/03/2026 | Enum `audit_log.action` expandido; colunas `address`, `equipment_info` em `units`; `expiration_date` em `users` |
| `0012` | 21/03/2026 | Tabela `user_unit_permissions` criada |
| `0013` | 21/03/2026 | Tabelas `phrase_groups` e `phrases` criadas; `logo_url` em `units`; `crm`, `signature_url` em `users` |
| `0014` | 02/04/2026 | Tabela `report_versions` criada; `stamp_url` em `users` |
| `0015` | Antes de 07/04/2026 | `DELETE_REPORT` adicionado ao enum `audit_log.action` |
| `0016` | Antes de 07/04/2026 | Colunas `owner_user_id` e `exam_title` adicionadas em `templates` |
| `0017` (parcial) | Antes de 07/04/2026 | Constraint `reports_uid_unit_idx` criada em `reports` |

---

### Migrations PENDENTES — aplicar na VM2

> **Verificado em 07/04/2026.** Apenas 2 operações estão pendentes. Execute na VM2 com `mysql -u root -p137946 pacs_portal`.

#### Migration 0017 (complemento) — Remover tabelas antigas

> As tabelas `exam_catalog`, `report_sections` e `study_labels` ainda existem no banco mas não são mais usadas pelo portal. Removê-las é seguro pois não há referências ativas.

```sql
-- Executar no MySQL da VM2: mysql -u root -p137946 pacs_portal
DROP TABLE IF EXISTS `exam_catalog`;
DROP TABLE IF EXISTS `report_sections`;
DROP TABLE IF EXISTS `study_labels`;
```

#### Migration 0018 — Adicionar exam_count em study_metadata

> Esta coluna registra quantos exames foram selecionados para um laudo (ex: 2 para "RX TÓRAX + SEIOS DA FACE"). **Obrigatória** para o funcionamento do editor multi-página. Não altera a lógica de cobrança — o laudo continua sendo 1 registro por estudo.

```sql
-- Executar no MySQL da VM2: mysql -u root -p137946 pacs_portal
ALTER TABLE `study_metadata` ADD `exam_count` int DEFAULT 1;
```

---

### Verificar se as migrations pendentes foram aplicadas

```bash
# Executar na VM2 (terminal root@pacs)

# Verificar se exam_count foi adicionada em study_metadata
mysql -u root -p137946 pacs_portal -e "SHOW COLUMNS FROM study_metadata LIKE 'exam_count';"
# Resultado esperado: 1 linha com Field=exam_count, Type=int, Default=1

# Verificar se as tabelas antigas foram removidas
mysql -u root -p137946 pacs_portal -e "SHOW TABLES LIKE 'exam_catalog';"
mysql -u root -p137946 pacs_portal -e "SHOW TABLES LIKE 'report_sections';"
mysql -u root -p137946 pacs_portal -e "SHOW TABLES LIKE 'study_labels';"
# Resultado esperado: 0 linhas (tabelas não existem mais)
```

---

## 9. HISTÓRICO DE INSTALAÇÕES

| Data | Ação |
|---|---|
| 21/03/2026 | MySQL instalado, banco `pacs_portal` criado |
| 02/04/2026 | MinIO instalado e configurado |
| 02/04/2026 | Bucket `lauds` criado (privado) |
| 02/04/2026 | Firewall liberado nas portas 9000 e 9001 |
| 02/04/2026 | `server/storage.ts` adaptado para MinIO |
| 02/04/2026 | Tabela `report_versions` criada |
| 02/04/2026 | Backup automático diário configurado |
| 07/04/2026 | Estado real do banco verificado com DESCRIBE/SHOW TABLES |
| 07/04/2026 | Migrations 0015, 0016, 0017 (parcial) confirmadas como já aplicadas |
| 07/04/2026 | Migrations 0017 (DROP tabelas) e 0018 (exam_count) identificadas como pendentes |
| 07/04/2026 | Ícone anatômico SVG implementado na lista de estudos |
| 07/04/2026 | Editor de laudos multi-página (N folhas A4 independentes) implementado |

---

## 9. CONTATOS E SUPORTE

| | |
|---|---|
| Desenvolvimento | StudioBarra7 |
| Plataforma | LAUDS — www.lauds.com.br |
| Suporte | 0800 896 555 489 625 |
| Instagram | @lauds_radiologia |
| CNPJ | 12.345.678/0001-90 |
