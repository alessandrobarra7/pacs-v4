# Guia de Deploy — PACS Portal na VM1

**VM1:** `172.16.3.100` | **Acesso externo:** `https://lauds.com.br` (HTTPS ativo com Let's Encrypt)

---

## Pré-requisitos

Execute os comandos abaixo como `root` na VM1 antes de qualquer coisa:

```bash
apt update && apt install -y git curl nginx
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 22 && fnm use 22
npm install -g pnpm pm2
```

---

## Deploy Inicial (primeira vez)

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

```bash
cd /opt/pacs-portal
git pull github main
pnpm build
pm2 restart pacs-portal
```

---

## Configuração do Nginx

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

Localização: `/opt/pacs-portal/.env`

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
```

> **Atenção:** Após editar o `.env`, sempre execute `pm2 restart pacs-portal` para recarregar as variáveis.

---

## Comandos PM2 Úteis

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

## Verificação de Conectividade com o Banco (VM2)

```bash
mysql -h 172.16.3.101 -u pacs_user -pPacsPortal2025 pacs_portal -e "SELECT id, name FROM units;"
```

---

## Verificação de Conectividade com o Orthanc

```bash
curl -s http://172.16.3.241:8042/system | python3 -m json.tool
```

Resposta esperada: JSON com `Version`, `Name`, `ApiVersion`.

---

## Migrações de Banco

Após atualizar o código com novas migrações:

```bash
cd /opt/pacs-portal
cat drizzle/0006_parallel_betty_brant.sql
mysql -h 172.16.3.101 -u pacs_user -pPacsPortal2025 pacs_portal < drizzle/0006_parallel_betty_brant.sql
```

---

## Backup do Banco (VM2)

Execute na VM2 (`172.16.3.101`):

```bash
mysqldump -u pacs_user -pPacsPortal2025 pacs_portal > /backup/pacs_portal_$(date +%Y%m%d).sql
```

---

## Solução de Problemas

| Sintoma | Causa Provável | Solução |
|---------|---------------|---------|
| Tela branca com `TypeError: Invalid URL` | `VITE_OAUTH_PORTAL_URL` vazia no build | Deixar a variável vazia (não `undefined`) no `.env` |
| `fetch failed` ao buscar exames | VM1 não consegue acessar Orthanc | Verificar firewall e `orthanc_base_url` no banco |
| `Unit not found` | `unit_id` do usuário não existe no banco | Corrigir via SQL: `UPDATE users SET unit_id=<id_correto> WHERE username='admin'` |
| PM2 não carrega `.env` | Script de start não usa dotenv | Usar `pm2 start pnpm --name "pacs-portal" -- start` |
| Nginx 502 Bad Gateway | PM2 não está rodando | `pm2 restart pacs-portal` |
