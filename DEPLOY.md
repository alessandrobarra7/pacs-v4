# Guia de Deploy — PACS Portal

> **Convenção:** todos os comandos indicam explicitamente em qual máquina devem ser executados:
> - **VM1** — servidor da aplicação Node.js (`172.16.3.100` / `lauds.com.br`)
> - **VM2** — servidor do banco de dados MySQL (`172.16.3.101`)

---

## Arquitetura do Ambiente

| Máquina | IP Interno | Função |
|---|---|---|
| VM1 | `172.16.3.100` | Aplicação Node.js (PM2 + Nginx + SSL) |
| VM2 | `172.16.3.101` | Banco de dados MySQL 8.0 |

---

# Guia de Deploy — PACS Portal na VM1

**VM1:** `172.16.3.100` | **Acesso externo:** `https://lauds.com.br` (HTTPS ativo com Let's Encrypt)

---

## Pré-requisitos

**Execute na VM1** como `root`:

```bash
apt update && apt install -y git curl nginx
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 22 && fnm use 22
npm install -g pnpm pm2
```

---

## Deploy Inicial (primeira vez)

**Execute na VM1:**

```bash
cd /opt
git clone https://github.com/alessandrobarra7/pacs-v4.git pacs-portal
cd pacs-portal
chmod +x scripts/setup-vm1.sh
bash scripts/setup-vm1.sh
```

O script cria o `.env`, instala dependências, compila o frontend, popula o banco e inicia o PM2.

**Credenciais iniciais:**
- Username: `admin`
- Senha: `Admin@2025`
- **Altere a senha imediatamente após o primeiro login.**

---

## Atualização (após novo commit no GitHub)

**Execute na VM1:**

```bash
cd /opt/pacs-portal
git pull github main
pnpm build
pm2 restart pacs-portal
```

---

## Configuração do Nginx

**Execute na VM1.**

Crie o arquivo `/etc/nginx/sites-available/pacs-portal` (configuração inicial HTTP, antes do SSL):

```nginx
server {
    listen 80;
    server_name lauds.com.br 45.189.160.17;
    client_max_body_size 100M;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/pacs-portal /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx && systemctl start nginx
```

---

## Instalação do SSL (Let's Encrypt)

**Execute na VM1.**

> **Pré-requisito:** A porta 443 deve estar redirecionada no Mikrotik para `172.16.3.100:443`.
> Adicione no Mikrotik: `/ip firewall nat add chain=dstnat action=dst-nat to-addresses=172.16.3.100 to-ports=443 protocol=tcp dst-address=45.189.160.17 dst-port=443 comment="RED PORTA 443 HTTPS IP: 172.16.3.100"`

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d lauds.com.br --non-interactive --agree-tos -m admin@lauds.com.br --redirect
```

O Certbot configura automaticamente o redirecionamento HTTP → HTTPS e renova o certificado via systemd timer (duas vezes ao dia).

**Verificação:**
```bash
systemctl status certbot.timer
certbot renew --dry-run
```

**Status atual (05/03/2026):**
- Certificado emitido: 05/03/2026
- Expira em: 03/06/2026
- Renovação automática: ativa
- Portal acessível em: `https://lauds.com.br`

---

## Arquivo `.env` de Produção

**Localização na VM1:** `/opt/pacs-portal/.env`

```env
DATABASE_URL=mysql://pacs_user:PacsPortal2025@172.16.3.101:3306/pacs_portal
JWT_SECRET=<gerar com: openssl rand -hex 32>
VITE_APP_ID=local
OAUTH_SERVER_URL=http://localhost
VITE_OAUTH_PORTAL_URL=
OWNER_OPEN_ID=local_admin
OWNER_NAME=Administrador
BUILT_IN_FORGE_API_URL=http://localhost
BUILT_IN_FORGE_API_KEY=local
VITE_FRONTEND_FORGE_API_KEY=local
VITE_FRONTEND_FORGE_API_URL=http://localhost
NODE_ENV=production
PORT=3000

# MinIO — obrigatório em produção (F2-3: sem fallback hardcoded)
MINIO_ENDPOINT=http://172.16.3.101:9000
MINIO_BUCKET=lauds
MINIO_ACCESS_KEY=<usuário MinIO>
MINIO_SECRET_KEY=<senha MinIO — gerar com: openssl rand -hex 24>
```

> **Atenção:** Após editar o `.env`, sempre execute `pm2 restart pacs-portal` para recarregar as variáveis.

> **MinIO obrigatório:** A partir da versão com F2-3, o servidor falha imediatamente ao iniciar em `NODE_ENV=production` se `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY` ou `MINIO_SECRET_KEY` não estiverem definidas. Configure antes de reiniciar o PM2.

---

## Comandos PM2 Úteis

**Execute na VM1:**

```bash
pm2 list
pm2 logs pacs-portal --lines 50
pm2 restart pacs-portal
pm2 stop pacs-portal
pm2 delete pacs-portal
pm2 startup systemd -u root --hp /root
pm2 save
```

---

## Verificação de Conectividade com o Banco

**Execute na VM1** (testa a conexão da VM1 até o banco na VM2):

```bash
mysql -h 172.16.3.101 -u pacs_user -pPacsPortal2025 pacs_portal -e "SELECT id, name FROM units;"
```

---

## Verificação de Conectividade com o Orthanc

**Execute na VM1:**

```bash
curl -s http://172.16.3.241:8042/system | python3 -m json.tool
```

Resposta esperada: JSON com `Version`, `Name`, `ApiVersion`.

---

## Migrações de Banco

**Execute na VM2** (acesso direto ao MySQL):

```bash
mysql -u root pacs_portal < /caminho/para/migracao.sql
```

Ou conectando da VM1:

```bash
mysql -h 172.16.3.101 -u pacs_user -pPacsPortal2025 pacs_portal < drizzle/migracao.sql
```

---

## Schema Completo do Banco de Dados

> Estado atual após todas as migrações aplicadas até **01/04/2026**.
> Em uma nova instalação, aplique este schema diretamente na **VM2** — não é necessário rodar as migrações individualmente.

**Execute na VM2:**

```sql
-- Tabela de unidades PACS
CREATE TABLE IF NOT EXISTS units (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(255) NOT NULL,
  slug                VARCHAR(100) NOT NULL UNIQUE,
  isActive            TINYINT(1) NOT NULL DEFAULT 1,
  orthanc_base_url    VARCHAR(500) NULL,
  orthanc_basic_user  VARCHAR(100) NULL,
  orthanc_basic_pass  VARCHAR(255) NULL,
  logoUrl             VARCHAR(500) NULL,
  createdAt           TIMESTAMP NOT NULL DEFAULT now(),
  updatedAt           TIMESTAMP NOT NULL DEFAULT now() ON UPDATE CURRENT_TIMESTAMP,
  pacs_ip             VARCHAR(45) NULL,
  pacs_port           INT NULL,
  pacs_ae_title       VARCHAR(16) NULL,
  pacs_local_ae_title VARCHAR(16) NULL DEFAULT 'PACSMANUS',
  orthanc_public_url  VARCHAR(500) NULL,
  address             VARCHAR(255) NULL,
  equipment_info      TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  openId          VARCHAR(64) NOT NULL UNIQUE,
  name            TEXT NULL,
  email           VARCHAR(320) NULL,
  loginMethod     VARCHAR(64) NULL,
  role            ENUM('admin_master','unit_admin','medico','viewer','operador') NOT NULL DEFAULT 'viewer',
  createdAt       TIMESTAMP NOT NULL DEFAULT now(),
  updatedAt       TIMESTAMP NOT NULL DEFAULT now() ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn    TIMESTAMP NOT NULL DEFAULT now(),
  unit_id         INT NULL,
  isActive        TINYINT(1) NOT NULL DEFAULT 1,
  username        VARCHAR(64) NULL,
  password_hash   VARCHAR(255) NULL,
  expiration_date BIGINT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabela de permissões granulares por unidade
CREATE TABLE IF NOT EXISTS user_unit_permissions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  unit_id          INT NOT NULL,
  view_studies     TINYINT(1) NOT NULL DEFAULT 1,
  edit_reports     TINYINT(1) NOT NULL DEFAULT 1,
  view_anamnesis   TINYINT(1) NOT NULL DEFAULT 1,
  print_reports    TINYINT(1) NOT NULL DEFAULT 1,
  manage_templates TINYINT(1) NOT NULL DEFAULT 0,
  created_at       BIGINT NOT NULL,
  UNIQUE KEY uq_user_unit (user_id, unit_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## Histórico de Migrações

Registro de todas as alterações aplicadas no banco. Para novas instalações, use o schema completo acima.

### Migração 001 — Campos PACS por unidade

**VM2** — data: anterior a 01/2026

```sql
ALTER TABLE units
  ADD COLUMN pacs_ip VARCHAR(45) NULL,
  ADD COLUMN pacs_port INT NULL,
  ADD COLUMN pacs_ae_title VARCHAR(16) NULL,
  ADD COLUMN pacs_local_ae_title VARCHAR(16) NULL DEFAULT 'PACSMANUS';
```

### Migração 002 — URL pública do Orthanc

**VM2** — data: anterior a 01/2026

```sql
ALTER TABLE units
  ADD COLUMN orthanc_public_url VARCHAR(500) NULL;
```

### Migração 003 — Usuários locais

**VM2** — data: anterior a 01/2026

```sql
ALTER TABLE users
  ADD COLUMN username VARCHAR(64) NULL,
  ADD COLUMN password_hash VARCHAR(255) NULL;
```

### Migração 004 — Controle de ativação de usuário

**VM2** — data: anterior a 01/2026

```sql
ALTER TABLE users
  ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 1;
```

### Migração 005 — Endereço e equipamentos da unidade

**VM2** — data: 01/04/2026

```sql
ALTER TABLE units
  ADD COLUMN address VARCHAR(255) NULL,
  ADD COLUMN equipment_info TEXT NULL;
```

### Migração 006 — Data de expiração e perfil operador

**VM2** — data: 01/04/2026

```sql
ALTER TABLE users
  ADD COLUMN expiration_date BIGINT NULL,
  MODIFY COLUMN role ENUM('admin_master','unit_admin','medico','viewer','operador') NOT NULL DEFAULT 'viewer';
```

### Migração 007 — Permissões granulares por unidade

**VM2** — data: 01/04/2026

```sql
CREATE TABLE IF NOT EXISTS user_unit_permissions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  unit_id          INT NOT NULL,
  view_studies     TINYINT(1) NOT NULL DEFAULT 1,
  edit_reports     TINYINT(1) NOT NULL DEFAULT 1,
  view_anamnesis   TINYINT(1) NOT NULL DEFAULT 1,
  print_reports    TINYINT(1) NOT NULL DEFAULT 1,
  manage_templates TINYINT(1) NOT NULL DEFAULT 0,
  created_at       BIGINT NOT NULL,
  UNIQUE KEY uq_user_unit (user_id, unit_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);
```

### Migração 008 — Carimbo do médico e histórico de retificações

**VM2** — data: 02/04/2026

> **Contexto:** Adicionado campo `stamp_url` para armazenar a imagem do carimbo do médico e tabela `report_versions` para histórico de retificações de laudos assinados.

```sql
-- Adicionar coluna stamp_url na tabela users
ALTER TABLE users ADD COLUMN stamp_url TEXT NULL;

-- Criar tabela de histórico de versões de laudos
CREATE TABLE IF NOT EXISTS report_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  body LONGTEXT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by INT NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (revised_by) REFERENCES users(id)
);
```

---

## ⚠️ Procedimento de Deploy Seguro (OBRIGATÓRIO)

> **Regra de ouro:** Sempre aplique as migrações de banco na **VM2** ANTES de fazer `git pull` na **VM1**. Nunca atualize o código sem antes sincronizar o banco.

### Checklist antes de cada `git pull` na VM1

1. **Verificar migrações pendentes** — consulte o histórico de commits no GitHub e identifique se há novas migrações no `DEPLOY.md`
2. **Aplicar migrações na VM2** — execute os SQLs pendentes na VM2 antes de atualizar o código
3. **Fazer o deploy na VM1** — somente após confirmar que o banco está atualizado

### Sequência correta de deploy

**Na VM2** (aplicar migrações primeiro):
```bash
mysql -u root -p137946 pacs_portal -e "<SQL DA MIGRAÇÃO PENDENTE>"
```

**Na VM1** (atualizar código depois):
```bash
cd /var/www/pacs-portal && git pull origin main && pnpm install && pnpm build && pm2 restart pacs-portal
```

### Como identificar migrações pendentes

Compare as colunas do banco em produção com o schema esperado:
```bash
# Na VM2 — ver colunas atuais da tabela users
mysql -u root -p137946 pacs_portal -e "DESCRIBE users;" 2>/dev/null

# Na VM2 — ver todas as tabelas existentes
mysql -u root -p137946 pacs_portal -e "SHOW TABLES;" 2>/dev/null
```

---

## Backup do Banco

**Execute na VM2:**

```bash
mysqldump -u pacs_user -pPacsPortal2025 pacs_portal > /backup/pacs_portal_$(date +%Y%m%d).sql
```

---

## ⚠️ Volume Persistente para Uploads (CRÍTICO)

### Problema

Todos os uploads de imagens (logos de unidades, assinaturas e carimbos de médicos) são salvos em `./uploads/` relativo ao diretório do projeto (`/var/www/pacs-portal/uploads/`). Este diretório **não é versionado no git** e pode ser perdido em:

- Redeploys com `rm -rf` no diretório do projeto
- Ambientes containerizados (Docker/Kubernetes) sem volume montado
- Ambientes com múltiplas instâncias (load balancer)

### Regra de ouro

> **Nunca execute `rm -rf /var/www/pacs-portal/uploads`**. O fluxo de deploy recomendado (`git pull` + `pnpm build` + `pm2 restart`) preserva o diretório automaticamente.

### Backup de uploads

Incluir o diretório `uploads/` no backup da VM1. **Execute na VM1:**

```bash
tar -czf /backup/pacs-uploads-$(date +%Y%m%d).tar.gz /var/www/pacs-portal/uploads/
```

Cron job recomendado para backup diário automático (adicionar em `crontab -e` na VM1):

```cron
0 2 * * * tar -czf /backup/pacs-uploads-$(date +\%Y\%m\%d).tar.gz /var/www/pacs-portal/uploads/ 2>/dev/null
```

### Para ambientes Docker

Montar o diretório como volume persistente no `docker-compose.yml`:

```yaml
services:
  pacs-portal:
    volumes:
      - /data/pacs-uploads:/app/uploads
```

### Migração futura para MinIO (recomendado)

O projeto já possui `server/minio.ts` com cliente MinIO configurado para `172.16.3.101:9000`. Para migrar os uploads para MinIO:

1. Ativar as variáveis de ambiente no `.env` da VM1:
   ```
   MINIO_ENDPOINT=http://172.16.3.101:9000
   MINIO_ACCESS_KEY=lauds_admin
   MINIO_SECRET_KEY=<senha>
   MINIO_BUCKET=lauds
   ```
2. Substituir as chamadas `storagePut()` em `server/routers.ts` por `minioUpload()` de `server/minio.ts`.
3. Migrar os arquivos existentes do diretório `uploads/` para o bucket MinIO.

---

## Solução de Problemas

| Sintoma | Causa Provável | Solução |
|---------|---------------|---------|
| Tela branca com `TypeError: Invalid URL` | `VITE_OAUTH_PORTAL_URL` vazia no build | Deixar a variável vazia (não `undefined`) no `.env` |
| `fetch failed` ao buscar exames | VM1 não consegue acessar Orthanc | Verificar firewall e `orthanc_base_url` no banco |
| `Unit not found` | `unit_id` do usuário não existe no banco | Corrigir via SQL: `UPDATE users SET unit_id=<id_correto> WHERE username='admin'` |
| PM2 não carrega `.env` | Script de start não usa dotenv | Usar `pm2 start pnpm --name "pacs-portal" -- start` |
| Nginx 502 Bad Gateway | PM2 não está rodando | `pm2 restart pacs-portal` |
