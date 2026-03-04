# PACS Portal — Sistema de Gestão de Laudos Radiológicos

**Versão:** fe42ad8e | **Atualizado em:** 04 de Março de 2026

Sistema web completo para gestão de laudos radiológicos com integração DICOM/PACS via Orthanc, desenvolvido com stack moderna e arquitetura multi-unidade.

---

## Índice

1. [Arquitetura da Infraestrutura](#arquitetura-da-infraestrutura)
2. [Stack Tecnológica](#stack-tecnológica)
3. [Mapeamento de Rede (Mikrotik NAT)](#mapeamento-de-rede-mikrotik-nat)
4. [Modelo de Dados](#modelo-de-dados)
5. [Módulos Implementados](#módulos-implementados)
6. [Instalação na VM1](#instalação-na-vm1)
7. [Variáveis de Ambiente](#variáveis-de-ambiente)
8. [Estrutura de Arquivos](#estrutura-de-arquivos)
9. [RBAC — Controle de Acesso por Perfil](#rbac--controle-de-acesso-por-perfil)
10. [Integração Orthanc](#integração-orthanc)
11. [Histórico de Migrações](#histórico-de-migrações)
12. [Próximos Passos](#próximos-passos)

---

## Arquitetura da Infraestrutura

```
Internet (45.189.160.17)
        │
   [Mikrotik RB]
   NAT / Firewall
        │
   ┌────┴────────────────────────────────────────┐
   │             Rede Interna 172.16.3.0/24       │
   │                                              │
   │  VM1 — Portal (172.16.3.100:3000)            │
   │    Node.js + Express + React                 │
   │    PM2 + Nginx (proxy :80 → :3000)           │
   │                                              │
   │  VM2 — Banco de Dados (172.16.3.101:3306)    │
   │    MySQL 8.0                                 │
   │    Banco: pacs_portal                        │
   │                                              │
   │  Orthanc 1 — Studio Barra7 (172.16.3.241:8042)  │
   │  Orthanc 2 — Unidade 2     (172.16.3.243:4007)  │
   │  Orthanc 3 — Unidade 3     (172.16.3.242:4006)  │
   │  Orthanc 4 — Unidade 4     (172.16.3.244:4008)  │
   │  Orthanc 5 — Unidade 5     (172.16.3.245:4009)  │
   └──────────────────────────────────────────────┘
```

---

## Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | React + TypeScript | 19 |
| Estilização | Tailwind CSS + shadcn/ui | 4 |
| Backend | Node.js + Express | 22 / 4 |
| API | tRPC | 11 |
| ORM | Drizzle ORM | latest |
| Banco | MySQL 8.0 | — |
| DICOM | Orthanc REST API | — |
| Autenticação | JWT local (bcrypt) | — |
| Processo | PM2 | latest |

---

## Mapeamento de Rede (Mikrotik NAT)

As regras de DNAT do Mikrotik mapeiam o IP público `45.189.160.17` para os servidores internos:

| Porta Pública | IP Interno | Porta Interna | Serviço |
|--------------|-----------|--------------|---------|
| 80 | 172.16.3.100 | 80 | Portal PACS (Nginx) |
| 8042 | 172.16.3.241 | 8042 | Orthanc 1 — Studio Barra7 |
| 4007 | 172.16.3.243 | 4007 | Orthanc 2 — Unidade 2 |
| 4006 | 172.16.3.242 | 4006 | Orthanc 3 — Unidade 3 |
| 4008 | 172.16.3.244 | 4008 | Orthanc 4 — Unidade 4 |
| 4009 | 172.16.3.245 | 4009 | Orthanc 5 — Unidade 5 |
| 3000 | 172.16.3.246 | 3000 | Reservado |

> **Importante:** O backend (VM1) acessa o Orthanc sempre pelo IP interno (`orthanc_base_url`). O frontend usa a URL pública via NAT (`orthanc_public_url`) para abrir o viewer no browser do usuário.

---

## Modelo de Dados

O banco `pacs_portal` na VM2 contém 7 tabelas:

### `units` — Unidades médicas
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT PK | Identificador auto-incremental |
| name | VARCHAR(255) | Nome da unidade |
| slug | VARCHAR(100) UNIQUE | Identificador URL-friendly |
| isActive | BOOLEAN | Unidade ativa/inativa |
| orthanc_base_url | VARCHAR(500) | URL interna do Orthanc (backend) |
| orthanc_public_url | VARCHAR(500) | URL pública via Mikrotik NAT (frontend) |
| orthanc_basic_user | VARCHAR(100) | Usuário HTTP Basic (opcional) |
| orthanc_basic_pass | VARCHAR(255) | Senha HTTP Basic (opcional) |
| pacs_ip | VARCHAR(45) | IP do PACS DICOM |
| pacs_port | INT | Porta do PACS DICOM |
| pacs_ae_title | VARCHAR(16) | AE Title do PACS |
| pacs_local_ae_title | VARCHAR(16) | AE Title local (padrão: PACSMANUS) |
| logoUrl | VARCHAR(500) | URL do logo institucional |

### `users` — Usuários do sistema
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT PK | — |
| openId | VARCHAR(255) UNIQUE | ID OAuth ou identificador local |
| username | VARCHAR(64) UNIQUE | Login local |
| email | VARCHAR(255) | E-mail |
| name | VARCHAR(255) | Nome completo |
| password_hash | VARCHAR(255) | Hash bcrypt (login local) |
| role | ENUM | `admin_master`, `admin`, `medico`, `tecnico`, `viewer` |
| unit_id | INT FK | Unidade vinculada |
| isActive | BOOLEAN | Conta ativa |
| loginMethod | VARCHAR(50) | `local` ou `oauth` |

### `studies_cache` — Cache de estudos DICOM
Armazena estudos recuperados do Orthanc para exibição na lista de exames.

### `templates` — Templates de laudos
Modelos de texto com variáveis dinâmicas (`{{PACIENTE}}`, `{{DATA}}`, etc.) por modalidade e unidade.

### `reports` — Laudos
Laudos médicos vinculados a estudos, com status (`draft`, `signed`, `revised`) e assinatura digital.

### `audit_log` — Auditoria
Registro de todas as ações do sistema (login, busca PACS, abertura de viewer, criação/assinatura de laudos).

### `anamnesis` — Anamnese clínica
Dados clínicos do paciente coletados antes do laudo (sintomas, comorbidades, medicamentos, CID sugerido).

---

## Módulos Implementados

| Módulo | Status | Descrição |
|--------|--------|-----------|
| Autenticação local | ✅ 100% | Login com username/senha, JWT, bcrypt |
| Administração de Unidades | ✅ 100% | CRUD com URL interna e pública (Mikrotik) |
| Busca PACS / Orthanc | ✅ 100% | `/tools/find` REST API, filtros de período |
| Proxy DICOMweb | ✅ 100% | `/api/dicomweb/*` → Orthanc interno |
| Viewer DICOM (Cornerstone) | ✅ 100% | WADO-RS via proxy, renderização no browser |
| Viewer Orthanc (Osimis) | ✅ 100% | Abre via URL pública do Mikrotik |
| Templates de Laudos | ✅ 100% | 11 variáveis dinâmicas, por modalidade |
| Editor de Laudos | ✅ 100% | Rascunho, assinatura, frases pré-definidas |
| Anamnese (CID-Indicações) | ✅ 90% | 6 camadas, sugestão automática de CID |
| RBAC por perfil | ✅ 100% | 5 perfis com permissões granulares |
| Auditoria | ✅ 100% | Todas as ações registradas |
| RadiAnt URL Scheme | ✅ 100% | `radiant://?n=1&v=0020000D&v=<UID>` |

---

## Instalação na VM1

### Pré-requisitos

```
Node.js 22+ (via nvm)
pnpm 9+
PM2 (npm install -g pm2)
Nginx
Git
```

### Procedimento de Deploy

```bash
cd /opt
git clone https://github.com/alessandrobarra7/pacs-v4.git pacs-portal
cd pacs-portal
chmod +x scripts/setup-vm1.sh
sudo bash scripts/setup-vm1.sh
```

O script `setup-vm1.sh` executa automaticamente:
1. Criação do arquivo `.env` com as variáveis de produção
2. `pnpm install --frozen-lockfile`
3. `pnpm build` (compila o frontend React)
4. `node scripts/seed-production.mjs` (cria admin e unidades no banco)
5. `pm2 start` e `pm2 save` (processo persistente)

### Atualização (após novo commit)

```bash
cd /opt/pacs-portal
git pull github main
pnpm build
pm2 restart pacs-portal
```

### Configuração do Nginx

```nginx
server {
    listen 80;
    server_name lauds.com.br 45.189.160.17;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Variáveis de Ambiente

O arquivo `.env` deve estar na raiz do projeto (`/opt/pacs-portal/.env`):

```env
# Banco de dados MySQL na VM2
DATABASE_URL=mysql://pacs_user:PacsPortal2025@172.16.3.101:3306/pacs_portal

# Segredo JWT para sessões (gerar com: openssl rand -hex 32)
JWT_SECRET=<string_aleatoria_64_chars>

# OAuth Manus (não usado em produção local)
VITE_APP_ID=local
OAUTH_SERVER_URL=http://localhost
VITE_OAUTH_PORTAL_URL=
OWNER_OPEN_ID=local_admin
OWNER_NAME=Administrador

# Forge API (não usado em produção local)
BUILT_IN_FORGE_API_URL=http://localhost
BUILT_IN_FORGE_API_KEY=local
VITE_FRONTEND_FORGE_API_KEY=local
VITE_FRONTEND_FORGE_API_URL=http://localhost

# Aplicação
NODE_ENV=production
PORT=3000
```

> **Atenção:** O PM2 deve ser iniciado com `pm2 start pnpm --name "pacs-portal" -- start` para que as variáveis do `.env` sejam carregadas corretamente via dotenv.

---

## Estrutura de Arquivos

```
pacs-portal/
├── client/                    ← Frontend React
│   ├── src/
│   │   ├── pages/             ← Páginas da aplicação
│   │   │   ├── PacsQueryPage.tsx   ← Lista de exames + busca Orthanc
│   │   │   ├── DicomViewerPage.tsx ← Viewer Cornerstone (DICOMweb)
│   │   │   ├── ReportEditor.tsx    ← Editor de laudos
│   │   │   ├── UnitsPage.tsx       ← Gerenciamento de unidades
│   │   │   ├── UsersPage.tsx       ← Gerenciamento de usuários
│   │   │   └── Templates.tsx       ← Templates de laudos
│   │   ├── components/
│   │   │   ├── AnamnesisModal.tsx  ← Modal CID-Indicações (6 camadas)
│   │   │   └── DashboardLayout.tsx ← Layout com sidebar
│   │   └── App.tsx            ← Rotas
├── server/
│   ├── routers.ts             ← Procedures tRPC (auth, units, pacs, reports...)
│   ├── db.ts                  ← Query helpers Drizzle
│   ├── orthanc.ts             ← REST API helper do Orthanc
│   └── _core/
│       └── index.ts           ← Express + proxy DICOMweb (/api/dicomweb/*)
├── drizzle/
│   ├── schema.ts              ← Definição das tabelas
│   └── 0000–0006_*.sql        ← Histórico de migrações
├── scripts/
│   ├── setup-vm1.sh           ← Script de deploy completo
│   ├── seed-production.mjs    ← Seed inicial do banco (admin + unidades)
│   └── seed.mjs               ← Seed de desenvolvimento
└── shared/
    └── permissions.ts         ← Matriz RBAC por perfil
```

---

## RBAC — Controle de Acesso por Perfil

| Ação | admin_master | admin | medico | tecnico | viewer |
|------|:-----------:|:-----:|:------:|:-------:|:------:|
| Gerenciar unidades | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gerenciar usuários | ✅ | ✅ | ❌ | ❌ | ❌ |
| Buscar exames PACS | ✅ | ✅ | ✅ | ✅ | ✅ |
| Abrir viewer DICOM | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar/editar laudos | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assinar laudos | ✅ | ✅ | ✅ | ❌ | ❌ |
| Preencher anamnese | ✅ | ✅ | ✅ | ✅ | ❌ |
| Ver auditoria | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Integração Orthanc

O sistema se comunica com o Orthanc de duas formas:

**Backend (VM1 → Orthanc):** Usa `orthanc_base_url` (IP interno `172.16.3.241:8042`) para:
- Busca de estudos via `POST /tools/find`
- Proxy DICOMweb em `/api/dicomweb/*` → `/dicom-web/*`
- Verificação de saúde via `GET /system`

**Frontend (browser do usuário → Orthanc):** Usa `orthanc_public_url` (IP público `45.189.160.17:8042`) para:
- Abrir o Osimis Web Viewer nativo (`/osimis-viewer/app/index.html?study=<ID>`)
- Abrir o Orthanc Explorer (`/app/explorer.html#study?uuid=<ID>`)

### Configuração Recomendada do Orthanc (`orthanc.json`)

```json
{
  "RemoteAccessAllowed": true,
  "AuthenticationEnabled": false,
  "UnknownSopClassAccepted": true,
  "DicomWeb": {
    "Enable": true,
    "Root": "/dicom-web/"
  }
}
```

---

## Histórico de Migrações

| Arquivo | Conteúdo |
|---------|---------|
| `0000_dapper_pixie.sql` | Criação das tabelas base (units, users, studies_cache) |
| `0001_public_molecule_man.sql` | Tabelas templates, reports, audit_log |
| `0002_married_nehzno.sql` | Campo role em users |
| `0003_black_luckman.sql` | Campos PACS em units |
| `0004_sleepy_cyclops.sql` | Tabela anamnesis |
| `0005_organic_santa_claus.sql` | Campos username, password_hash, isActive em users |
| `0006_parallel_betty_brant.sql` | Campo orthanc_public_url em units |

---

## Próximos Passos

1. **Renomear Unidades 2–5** com os nomes reais das clínicas (via Administração > Unidades).
2. **Criar usuários por unidade** com o `unit_id` correto para cada médico/técnico.
3. **Implementar presets personalizados** por médico (tabela `report_presets`, drag-and-drop na sidebar do editor).
4. **Upload de logo e assinatura** para inclusão automática nos laudos impressos.
5. **Testar fluxo completo de anamnese** (botão CID-Indicações → 6 camadas → persistência no banco).

---

**Repositório:** https://github.com/alessandrobarra7/pacs-v4  
**Desenvolvido com Manus AI Platform**
