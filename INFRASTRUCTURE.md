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
  └─────────┘       │  │    - Nginx (proxy :80 → :3000)              │    │
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
| Porta pública | 80 (via Nginx) |
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
| Internet | VM1 (Nginx) | 80 | HTTP | Portal PACS |
| Internet | Orthanc 1 | 8042 | HTTP | Viewer Osimis / REST API |
| Internet | Orthanc 2 | 4007 | HTTP | Viewer Osimis / REST API |
| Internet | Orthanc 3 | 4006 | HTTP | Viewer Osimis / REST API |
| Internet | Orthanc 4 | 4008 | HTTP | Viewer Osimis / REST API |
| Internet | Orthanc 5 | 4009 | HTTP | Viewer Osimis / REST API |
| VM1 | VM2 | 3306 | TCP | MySQL (Drizzle ORM) |
| VM1 | Orthanc 1 | 8042 | HTTP | Busca PACS / Proxy DICOMweb |
| Equipamentos DICOM | Orthanc 1–5 | 4242 | DICOM | C-STORE (envio de exames) |
