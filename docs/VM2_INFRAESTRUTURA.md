# LAUDS — Documentação de Infraestrutura da VM2
**Gerado em:** 02/04/2026  
**Atualizado em:** 02/04/2026  
**Projeto:** Sistema de Laudos Radiológicos — LAUDS  
**Responsável técnico:** StudioBarra7

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

## 8. HISTÓRICO DE INSTALAÇÕES

| Data | Ação |
|---|---|
| 21/03/2026 | MySQL instalado, banco `pacs_portal` criado |
| 02/04/2026 | MinIO instalado e configurado |
| 02/04/2026 | Bucket `lauds` criado (privado) |
| 02/04/2026 | Firewall liberado nas portas 9000 e 9001 |
| 02/04/2026 | `server/storage.ts` adaptado para MinIO |
| 02/04/2026 | Tabela `report_versions` criada |
| 02/04/2026 | Backup automático diário configurado |

---

## 9. CONTATOS E SUPORTE

| | |
|---|---|
| Desenvolvimento | StudioBarra7 |
| Plataforma | LAUDS — www.lauds.com.br |
| Suporte | 0800 896 555 489 625 |
| Instagram | @lauds_radiologia |
| CNPJ | 12.345.678/0001-90 |
