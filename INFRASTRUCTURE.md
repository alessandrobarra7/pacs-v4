# Infraestrutura — PACS Portal

Documentação técnica completa da infraestrutura de rede, servidores e serviços do sistema PACS Portal.

---

## Topologia de Rede

```
                    ┌─────────────────────────────────────────────────────┐
  INTERNET          │              Rede Interna 172.16.3.0/24              │
  45.189.160.17     │                                                      │
       │            │  ┌─────────────────────────────────────────────┐    │
       │            │  │  VM1 — Portal PACS                          │    │
  ┌────▼────┐       │  │  IP: 172.16.3.100                           │    │
  │Mikrotik │       │  │  OS: Ubuntu 22.04                           │    │
  │  RB     │──────▶│  │  Serviços:                                  │    │
  │  NAT    │       │  │    - Node.js 22 (PM2, porta 3000)           │    │
  └─────────┘       │  │    - Nginx (proxy :80/:443 → :3000)         │    │
  │    - Certbot / Let's Encrypt (SSL ativo)    │    │
                    │  └─────────────────────────────────────────────┘    │
                    │                                                      │
                    │  ┌─────────────────────────────────────────────┐    │
                    │  │  VM2 — Banco de Dados                       │    │
                    │  │  IP: 172.16.3.101                           │    │
                    │  │  OS: Ubuntu 22.04                           │    │
                    │  │  Serviços:                                  │    │
                    │  │    - MySQL 8.0 (porta 3306)                 │    │
                    │  │    - Banco: pacs_portal                     │    │
                    │  └─────────────────────────────────────────────┘    │
                    │                                                      │
                    │  ┌─────────────────────────────────────────────┐    │
                    │  │  Instâncias Orthanc (PACS)                  │    │
                    │  │                                             │    │
                    │  │  Orthanc 1 — Studio Barra7                  │    │
                    │  │    IP interno:  172.16.3.241:8042           │    │
                    │  │    IP público:  45.189.160.17:8042          │    │
                    │  │    AE Title:    ORTHANC                     │    │
                    │  │                                             │    │
                    │  │  Orthanc 2 — Unidade 2                      │    │
                    │  │    IP interno:  172.16.3.243:4007           │    │
                    │  │    IP público:  45.189.160.17:4007          │    │
                    │  │    AE Title:    ORTHANC2                    │    │
                    │  │                                             │    │
                    │  │  Orthanc 3 — Unidade 3                      │    │
                    │  │    IP interno:  172.16.3.242:4006           │    │
                    │  │    IP público:  45.189.160.17:4006          │    │
                    │  │    AE Title:    ORTHANC3                    │    │
                    │  │                                             │    │
                    │  │  Orthanc 4 — Unidade 4                      │    │
                    │  │    IP interno:  172.16.3.244:4008           │    │
                    │  │    IP público:  45.189.160.17:4008          │    │
                    │  │    AE Title:    ORTHANC4                    │    │
                    │  │                                             │    │
                    │  │  Orthanc 5 — Unidade 5                      │    │
                    │  │    IP interno:  172.16.3.245:4009           │    │
                    │  │    IP público:  45.189.160.17:4009          │    │
                    │  │    AE Title:    ORTHANC5                    │    │
                    │  └─────────────────────────────────────────────┘    │
                    └─────────────────────────────────────────────────────┘
```

---

## Regras NAT do Mikrotik

Configuração atual em `/ip firewall nat`:

```
chain=dstnat action=dst-nat to-addresses=172.16.3.100 to-ports=80
  protocol=tcp dst-address=45.189.160.17 dst-port=80
  ;;; REDIRECIONAMENTO PORTA 80 (Portal PACS via Nginx)

chain=dstnat action=dst-nat to-addresses=172.16.3.241 to-ports=8042
  protocol=tcp dst-address=45.189.160.17 dst-port=8042
  ;;; RED PORTA 8042 IP: 172.16.3.241 (Orthanc 1 — Studio Barra7)

chain=dstnat action=dst-nat to-addresses=172.16.3.243 to-ports=4007
  protocol=tcp dst-address=45.189.160.17 dst-port=4007
  ;;; RED PORTA 4007 IP: 172.16.3.243 (Orthanc 2 — Unidade 2)

chain=dstnat action=dst-nat to-addresses=172.16.3.242 to-ports=4006
  protocol=tcp dst-address=45.189.160.17 dst-port=4006
  ;;; RED PORTA 4006 IP: 172.16.3.242 (Orthanc 3 — Unidade 3)

chain=dstnat action=dst-nat to-addresses=172.16.3.244 to-ports=4008
  protocol=tcp dst-address=45.189.160.17 dst-port=4008
  ;;; RED PORTA 4008 IP: 172.16.3.244 (Orthanc 4 — Unidade 4)

chain=dstnat action=dst-nat to-addresses=172.16.3.245 to-ports=4009
  protocol=tcp dst-address=45.189.160.17 dst-port=4009
  ;;; RED PORTA 4009 IP: 172.16.3.245 (Orthanc 5 — Unidade 5)

chain=dstnat action=dst-nat to-addresses=172.16.3.246 to-ports=3000
  protocol=tcp dst-address=45.189.160.17 dst-port=3000
  ;;; RED PORTA 3000 IP: 172.16.3.246 (Reservado)

chain=dstnat action=dst-nat to-addresses=172.16.3.100 to-ports=443
  protocol=tcp dst-address=45.189.160.17 dst-port=443
  ;;; RED PORTA 443 HTTPS IP: 172.16.3.100 (Portal PACS — SSL)
```

---

## VM1 — Portal PACS

| Parâmetro | Valor |
|-----------|-------|
| IP | 172.16.3.100 |
| OS | Ubuntu 22.04 LTS |
| Runtime | Node.js 22 |
| Gerenciador de processos | PM2 |
| Proxy reverso | Nginx |
| Porta da aplicação | 3000 |
| Porta pública HTTP | 80 (via Nginx → redireciona para HTTPS) |
| Porta pública HTTPS | 443 (via Nginx + Let's Encrypt) |
| Diretório | /opt/pacs-portal |
| Repositório | https://github.com/alessandrobarra7/pacs-v4 |

---

## VM2 — Banco de Dados

| Parâmetro | Valor |
|-----------|-------|
| IP | 172.16.3.101 |
| OS | Ubuntu 22.04 LTS |
| SGBD | MySQL 8.0 |
| Porta | 3306 |
| Banco | pacs_portal |
| Usuário | pacs_user |
| Senha | PacsPortal2025 |

### Configuração de Acesso Remoto

Para que a VM1 possa se conectar à VM2, o MySQL deve aceitar conexões externas:

```bash
# Em /etc/mysql/mysql.conf.d/mysqld.cnf
bind-address = 0.0.0.0

# Recarregar MySQL
systemctl restart mysql

# Conceder permissão ao usuário pacs_user a partir da VM1
mysql -u root -p
GRANT ALL PRIVILEGES ON pacs_portal.* TO 'pacs_user'@'172.16.3.100' IDENTIFIED BY 'PacsPortal2025';
FLUSH PRIVILEGES;
```

---

## Instâncias Orthanc

Cada instância Orthanc deve ter o arquivo `orthanc.json` configurado conforme abaixo:

```json
{
  "Name": "ORTHANC",
  "HttpPort": 8042,
  "DicomPort": 4242,
  "RemoteAccessAllowed": true,
  "AuthenticationEnabled": false,
  "UnknownSopClassAccepted": true,
  "StorageDirectory": "/var/lib/orthanc/db",
  "Plugins": [
    "/usr/share/orthanc/plugins/libOrthancDicomWeb.so",
    "/usr/share/orthanc/plugins/libOsimisWebViewer.so"
  ],
  "DicomWeb": {
    "Enable": true,
    "Root": "/dicom-web/",
    "EnableWado": true,
    "WadoRoot": "/wado"
  }
}
```

> Ajuste `HttpPort` para a porta correta de cada instância (8042, 4006, 4007, 4008, 4009).

### Verificação de Saúde

```bash
curl -s http://172.16.3.241:8042/system
curl -s http://172.16.3.241:8042/statistics
curl -s http://172.16.3.241:8042/studies?limit=5
```

---

## SSL / HTTPS — Let's Encrypt

O certificado SSL foi emitido via Certbot em 05/03/2026 e é válido até **03/06/2026**, com renovação automática configurada via systemd timer (executa duas vezes ao dia).

| Parâmetro | Valor |
|-----------|-------|
| Emissor | Let's Encrypt (ISRG Root X1) |
| Domínio | lauds.com.br |
| Validade | 05/03/2026 → 03/06/2026 |
| Certificado | /etc/letsencrypt/live/lauds.com.br/fullchain.pem |
| Chave privada | /etc/letsencrypt/live/lauds.com.br/privkey.pem |
| Renovação automática | systemctl status certbot.timer |
| Renovação manual | certbot renew |

### Configuração Nginx com SSL (gerada pelo Certbot)

Após a instalação, o arquivo `/etc/nginx/sites-enabled/pacs-portal` contém:

```nginx
server {
    listen 80;
    server_name lauds.com.br 45.189.160.17;
    return 301 https://$host$request_uri;  # Redireciona HTTP → HTTPS
}

server {
    listen 443 ssl;
    server_name lauds.com.br;
    ssl_certificate /etc/letsencrypt/live/lauds.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lauds.com.br/privkey.pem;
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Conectividade PPPoE

O IP público `45.189.160.17` é fornecido via PPPoE (`pppoe-LINK ULTRANET`, usuário `paco_semed`). Em caso de reconexão do link, o IP pode mudar. Nesse caso:

1. Verificar o novo IP: `/ip address print` no Mikrotik
2. Atualizar todas as regras NAT com o novo IP
3. Atualizar o DNS do domínio `lauds.com.br` para o novo IP
4. Renovar o certificado SSL: `certbot renew --force-renewal`

---

## Fluxo de Dados

### Busca de Exames

```
Browser → Portal (VM1:3000) → tRPC pacs.query
  → Orthanc interno (172.16.3.241:8042)
  → POST /tools/find
  → Retorna lista de estudos
  → Frontend exibe tabela
```

### Abertura do Viewer DICOM (Cornerstone)

```
Browser → Portal (VM1:3000) → /dicom-viewer/<studyUID>
  → Cornerstone carrega imagens via proxy DICOMweb
  → GET /api/dicomweb/studies/<UID>/series/<UID>/instances
  → VM1 faz proxy para Orthanc interno
  → Orthanc retorna WADO-RS (multipart/related)
  → Cornerstone renderiza no canvas
```

### Abertura do Viewer Orthanc (Osimis)

```
Browser → clica "Orthanc"
  → Abre nova aba: http://45.189.160.17:8042/osimis-viewer/app/index.html?study=<ID>
  → Browser conecta diretamente ao Orthanc via IP público (Mikrotik NAT)
  → Osimis Web Viewer carrega e exibe as imagens
```

---

## Portas e Protocolos Resumidos

| Origem | Destino | Porta | Protocolo | Propósito |
|--------|---------|-------|-----------|-----------|
| Internet | VM1 (Nginx) | 80 | HTTP | Redireciona para HTTPS |
| Internet | VM1 (Nginx) | 443 | HTTPS | Portal PACS (SSL ativo) |
| Internet | Orthanc 1 | 8042 | HTTP | Viewer Osimis / REST API |
| Internet | Orthanc 2 | 4007 | HTTP | Viewer Osimis / REST API |
| Internet | Orthanc 3 | 4006 | HTTP | Viewer Osimis / REST API |
| Internet | Orthanc 4 | 4008 | HTTP | Viewer Osimis / REST API |
| Internet | Orthanc 5 | 4009 | HTTP | Viewer Osimis / REST API |
| VM1 | VM2 | 3306 | TCP | MySQL (Drizzle ORM) |
| VM1 | Orthanc 1 | 8042 | HTTP | Busca PACS / Proxy DICOMweb |
| Equipamentos DICOM | Orthanc 1–5 | 4242 | DICOM | C-STORE (envio de exames) |
