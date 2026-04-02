# LAUDS — Documentação de Infraestrutura da VM2
**Gerado em:** 02/04/2026  
**Responsável técnico:** Desenvolvimento StudioBarra7  
**Projeto:** Sistema de Laudos Radiológicos — LAUDS

---

## 1. IDENTIFICAÇÃO DA VM2

| Parâmetro | Valor |
|---|---|
| Hostname | pacs |
| IP Interno (rede PACS) | 172.16.3.101 |
| IP Interno (rede local) | 192.168.193.101 |
| Sistema Operacional | Ubuntu 22.04.5 LTS (Jammy Jellyfish) |
| Disco Total | 98 GB |
| Disco Usado | 9,8 GB (11%) |
| Disco Livre | 84 GB |
| RAM Total | 7,6 GB |
| RAM Disponível | 6,6 GB |
| Swap | 4,0 GB |
| Usuário padrão | root |

---

## 2. SERVIÇOS INSTALADOS NA VM2

### 2.1 MySQL Community Server

| Parâmetro | Valor |
|---|---|
| Versão | MySQL Community Server (Ubuntu 22.04) |
| Status | Ativo e rodando (desde 21/03/2026) |
| Porta | 3306 (padrão) |
| Banco de dados do portal | `pacs_portal` |
| Senha do banco | `137946` |
| Serviço systemd | `mysql.service` |

**Comandos úteis:**
```bash
# Verificar status
systemctl status mysql

# Reiniciar
systemctl restart mysql

# Acessar o banco
mysql -u root -p
# Senha: 137946

# Ver bancos existentes
mysql -u root -p137946 -e "SHOW DATABASES;"

# Ver tabelas do portal
mysql -u root -p137946 -e "USE pacs_portal; SHOW TABLES;"
```

---

### 2.2 MinIO — Armazenamento de Objetos (S3-compatible)

**Instalado em:** 02/04/2026  
**Versão:** RELEASE.2025-09-07T16-13-09Z  
**Finalidade:** Armazenar todos os arquivos do sistema (logos de unidades, carimbos de médicos, documentos futuros)

| Parâmetro | Valor |
|---|---|
| Versão | RELEASE.2025-09-07T16-13-09Z |
| Binário | `/usr/local/bin/minio` |
| MinIO Client (mc) | `/usr/local/bin/mc` |
| Diretório de dados | `/data/minio` |
| Arquivo de configuração | `/etc/default/minio` |
| Serviço systemd | `minio.service` |
| Status | Ativo e rodando |

**Endpoints de acesso:**

| Tipo | URL |
|---|---|
| API S3 (rede PACS) | `http://172.16.3.101:9000` |
| API S3 (rede local) | `http://192.168.193.101:9000` |
| Console Web (rede PACS) | `http://172.16.3.101:9001` |
| Console Web (rede local) | `http://192.168.193.101:9001` |

**Credenciais de acesso:**

| Parâmetro | Valor |
|---|---|
| Usuário (Root User) | `lauds_admin` |
| Senha (Root Password) | `Lauds@2026!Secure` |

> ⚠️ **IMPORTANTE:** Guarde essas credenciais em local seguro. São necessárias para acessar o Console Web e para configurar o portal.

**Bucket criado:**

| Bucket | Finalidade | Permissão |
|---|---|---|
| `lauds` | Armazenamento central de todos os arquivos | Privado |

**Estrutura de pastas no bucket `lauds`:**
```
lauds/
├── unidades/{id}/logo/        → Logos das unidades médicas
└── usuarios/{id}/carimbo/     → Carimbos dos médicos
```

**Comandos úteis:**
```bash
# Verificar status do MinIO
systemctl status minio

# Reiniciar MinIO
systemctl restart minio

# Parar MinIO
systemctl stop minio

# Ver logs do MinIO
journalctl -u minio -n 50

# Listar buckets (como root na VM2)
mc ls vm2minio

# Listar arquivos dentro do bucket lauds
mc ls vm2minio/lauds --recursive

# Ver uso de disco do MinIO
du -sh /data/minio

# Verificar alias configurado
mc alias list vm2minio
```

**Arquivo de configuração `/etc/default/minio`:**
```bash
MINIO_ROOT_USER=lauds_admin
MINIO_ROOT_PASSWORD=Lauds@2026!Secure
MINIO_VOLUMES="/data/minio"
MINIO_OPTS="--console-address :9001"
```

**Arquivo de serviço `/etc/systemd/system/minio.service`:**
```ini
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
```

---

## 3. CONFIGURAÇÃO DO FIREWALL (UFW)

| Porta | Protocolo | Serviço | Status |
|---|---|---|---|
| 3306 | TCP | MySQL | Aberta (padrão) |
| 9000 | TCP | MinIO API S3 | Aberta (02/04/2026) |
| 9001 | TCP | MinIO Console Web | Aberta (02/04/2026) |

**Verificar regras ativas:**
```bash
ufw status verbose
```

---

## 4. VARIÁVEIS DE AMBIENTE DO PORTAL (VM1)

Para que o portal (VM1) use o MinIO da VM2, as seguintes variáveis devem estar configuradas no arquivo `.env` do portal ou nas Secrets do projeto Manus:

```env
MINIO_ENDPOINT=http://172.16.3.101:9000
MINIO_ACCESS_KEY=lauds_admin
MINIO_SECRET_KEY=Lauds@2026!Secure
MINIO_BUCKET=lauds
```

---

## 5. BANCO DE DADOS — TABELAS PRINCIPAIS

| Tabela | Finalidade |
|---|---|
| `users` | Usuários do sistema (médicos, admins, operadores) |
| `units` | Unidades médicas cadastradas |
| `reports` | Laudos radiológicos |
| `report_versions` | Histórico de versões de laudos retificados |
| `studies_cache` | Cache de estudos DICOM do Orthanc |
| `templates` | Modelos de laudo por modalidade |
| `audit_log` | Log de auditoria de todas as ações |
| `anamnesis_simple` | Indicações clínicas dos exames |
| `dicom_annotations` | Anotações e medições do visualizador DICOM |
| `study_metadata` | Metadados editáveis dos estudos |
| `phrases` | Frases pré-definidas para laudos |
| `phrase_groups` | Grupos de frases |
| `user_unit_permissions` | Permissões granulares por usuário/unidade |

---

## 6. PROCEDIMENTOS DE MANUTENÇÃO

### 6.1 Verificar saúde geral da VM2
```bash
# Status de todos os serviços críticos
systemctl status mysql minio

# Uso de disco
df -h

# Uso de memória
free -h

# Processos consumindo mais recursos
top -b -n 1 | head -20
```

### 6.2 Backup manual do banco de dados
```bash
# Criar backup completo do banco pacs_portal
mysqldump -u root -p137946 pacs_portal > /data/backup_$(date +%Y%m%d_%H%M%S).sql

# Verificar tamanho do backup
ls -lh /data/backup_*.sql
```

### 6.3 Backup automático diário (recomendado)
```bash
# Criar script de backup
cat > /usr/local/bin/backup-lauds.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/data/backups"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u root -p137946 pacs_portal > $BACKUP_DIR/pacs_portal_$DATE.sql
# Manter apenas os últimos 30 backups
ls -t $BACKUP_DIR/pacs_portal_*.sql | tail -n +31 | xargs -r rm
echo "Backup concluído: $BACKUP_DIR/pacs_portal_$DATE.sql"
EOF
chmod +x /usr/local/bin/backup-lauds.sh

# Agendar execução diária às 2h da manhã
echo "0 2 * * * root /usr/local/bin/backup-lauds.sh >> /var/log/backup-lauds.log 2>&1" > /etc/cron.d/backup-lauds
```

### 6.4 Reiniciar MinIO após reboot
O MinIO está configurado com `systemctl enable minio`, portanto **inicia automaticamente** após reboot da VM2.

---

## 7. HISTÓRICO DE INSTALAÇÕES

| Data | Ação | Responsável |
|---|---|---|
| 21/03/2026 | MySQL Community Server instalado e banco criado | StudioBarra7 |
| 02/04/2026 | MinIO RELEASE.2025-09-07 instalado e configurado | StudioBarra7 |
| 02/04/2026 | Bucket `lauds` criado com permissão privada | StudioBarra7 |
| 02/04/2026 | Firewall liberado nas portas 9000 e 9001 | StudioBarra7 |
| 02/04/2026 | storage.ts do portal adaptado para MinIO | StudioBarra7 |
| 02/04/2026 | Tabela `report_versions` criada para histórico de retificações | StudioBarra7 |

---

## 8. CONTATOS E SUPORTE

| Papel | Contato |
|---|---|
| Desenvolvimento | StudioBarra7 |
| Plataforma de laudos | LAUDS — www.lauds.com.br |
| Suporte LAUDS | 0800 896 555 489 625 |
| Instagram | @lauds_radiologia |
| CNPJ | 12.345.678/0001-90 |
