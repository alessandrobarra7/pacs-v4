# PACS Portal — Sistema de Gestão de Laudos Radiológicos

**Versão:** 2.0 | **Atualizado em:** 02 de Abril de 2026  
**Repositório:** https://github.com/alessandrobarra7/pacs-v4  
**Desenvolvido por:** StudioBarra7 com Manus AI Platform

Sistema web completo para gestão de laudos radiológicos com integração DICOM/PACS via Orthanc, viewer DICOM embutido (Cornerstone.js), editor de laudos com assinatura digital e controle de acesso por perfil (RBAC).

---

## Índice

1. [Arquitetura da Infraestrutura](#1-arquitetura-da-infraestrutura)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Pré-requisitos de Instalação](#3-pré-requisitos-de-instalação)
4. [Instalação na VM1 (Passo a Passo)](#4-instalação-na-vm1-passo-a-passo)
5. [Variáveis de Ambiente](#5-variáveis-de-ambiente)
6. [Configuração do Nginx](#6-configuração-do-nginx)
7. [Mapeamento de Rede (Mikrotik NAT)](#7-mapeamento-de-rede-mikrotik-nat)
8. [Modelo de Dados](#8-modelo-de-dados)
9. [Páginas do Sistema](#9-páginas-do-sistema)
10. [Endpoints da API REST](#10-endpoints-da-api-rest)
11. [Procedures tRPC](#11-procedures-trpc)
12. [RBAC — Controle de Acesso por Perfil](#12-rbac--controle-de-acesso-por-perfil)
13. [Integração Orthanc](#13-integração-orthanc)
14. [Fluxo de Visualização DICOM](#14-fluxo-de-visualização-dicom)
15. [Estrutura de Arquivos](#15-estrutura-de-arquivos)
16. [Histórico de Migrações](#16-histórico-de-migrações)
17. [Atualização do Sistema](#17-atualização-do-sistema)
18. [Solução de Problemas Comuns](#18-solução-de-problemas-comuns)

---

## 1. Arquitetura da Infraestrutura

```
Internet (IP Público: 45.189.160.17)
        │
   [Mikrotik RB — NAT/Firewall]
        │
   ┌────┴──────────────────────────────────────────────────┐
   │         Rede Interna 172.16.3.0/22 (GW: 172.16.0.1)  │
   │                                                       │
   │  VM1 — Portal (172.16.3.100)                          │
   │    Node.js 22 + Express + React 19                    │
   │    PM2 (processo) + Nginx (proxy :80 → :3000)         │
   │    Porta 3000 (app) | Porta 80 (Nginx)                │
   │                                                       │
   │  VM2 — Banco de Dados (172.16.3.101)                  │
   │    MySQL 8.0 | Porta 3306                             │
   │    Banco: pacs_portal                                 │
   │                                                       │
   │  Orthanc 1 — Studio Barra7 (172.16.3.241:8042)        │
   │  Orthanc 2 — Unidade 2     (172.16.3.243:4007)        │
   │  Orthanc 3 — Unidade 3     (172.16.3.242:4006)        │
   │  Orthanc 4 — Unidade 4     (172.16.3.244:4008)        │
   │  Orthanc 5 — Unidade 5     (172.16.3.245:4009)        │
   └───────────────────────────────────────────────────────┘
```

O backend (VM1) acessa o Orthanc sempre pelo **IP interno** (`orthanc_base_url`). O frontend usa a **URL pública via NAT** (`orthanc_public_url`) para abrir o viewer Osimis no browser do usuário.

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | React + TypeScript | 19 |
| Estilização | Tailwind CSS 4 + shadcn/ui | 4 |
| Backend | Node.js + Express | 22 / 4 |
| API | tRPC | 11 |
| ORM | Drizzle ORM | latest |
| Banco de Dados | MySQL 8.0 | 8.0 |
| Viewer DICOM | Cornerstone.js | 3.x |
| DICOM Network | dcmjs-dimse (C-GET) | latest |
| Thumbnails DICOM | Python 3.11 + pydicom + Pillow | 3.11 |
| Autenticação | JWT local (bcrypt) | — |
| Processo | PM2 | latest |
| Proxy reverso | Nginx | latest |

---

## 3. Pré-requisitos de Instalação

Todos os itens abaixo devem estar instalados na **VM1** antes de iniciar o deploy.

### 3.1 Node.js 22 e pnpm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
nvm alias default 22
npm install -g pnpm
```

### 3.2 PM2

```bash
npm install -g pm2
```

### 3.3 Git e Nginx

```bash
apt-get install -y git nginx
```

### 3.4 Python 3.11 com bibliotecas DICOM — OBRIGATÓRIO para thumbnails

O sistema gera miniaturas DICOM reais usando Python. Sem essas bibliotecas, o painel de séries no viewer exibirá apenas badges de texto em vez das imagens reais.

```bash
# Verificar se Python 3.11 está disponível
python3.11 --version

# Se não estiver instalado:
apt-get install -y python3.11 python3.11-pip

# Instalar as bibliotecas necessárias
pip3 install pydicom pillow numpy

# Verificar instalação (deve retornar "OK")
python3.11 -c "import pydicom, PIL, numpy; print('OK')"
```

> **Atenção:** O `pip3` deve instalar no Python 3.11. Se o sistema tiver múltiplas versões de Python, use `pip3.11 install pydicom pillow numpy` para garantir que as bibliotecas sejam instaladas na versão correta.

### 3.5 Dependências de compilação

```bash
apt-get install -y build-essential
```

### 3.6 MySQL Client (para verificação da conexão com VM2)

```bash
apt-get install -y mysql-client
# Testar conexão:
mysql -h 172.16.3.101 -u pacs_user -p pacs_portal
```

---

## 4. Instalação na VM1 (Passo a Passo)

```bash
cd /var/www
git clone https://github.com/alessandrobarra7/pacs-v4.git pacs-portal
cd pacs-portal
pnpm install --frozen-lockfile
# Criar o arquivo .env (ver seção 5)
nano .env
pnpm build
pm2 start dist/index.js --name pacs-portal
pm2 save
pm2 startup
```

### Verificar se está rodando

```bash
pm2 status
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/
```

---

## 5. Variáveis de Ambiente

Criar o arquivo `.env` na raiz do projeto (`/var/www/pacs-portal/.env`):

```
DATABASE_URL=mysql://pacs_user:SUA_SENHA@172.16.3.101:3306/pacs_portal
JWT_SECRET=GERAR_STRING_ALEATORIA_64_CHARS
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

Gerar o JWT_SECRET com: `openssl rand -hex 32`

---

## 6. Configuração do Nginx

Criar `/etc/nginx/sites-available/pacs-portal`:

```nginx
server {
    listen 80;
    server_name lauds.com.br www.lauds.com.br 45.189.160.17;

    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/pacs-portal /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## 7. Mapeamento de Rede (Mikrotik NAT)

| Porta Pública | IP Interno | Porta Interna | Serviço |
|--------------|-----------|--------------|---------|
| 80 | 172.16.3.100 | 80 | Portal PACS (Nginx) |
| 8042 | 172.16.3.241 | 8042 | Orthanc 1 — Studio Barra7 |
| 4007 | 172.16.3.243 | 4007 | Orthanc 2 — Unidade 2 |
| 4006 | 172.16.3.242 | 4006 | Orthanc 3 — Unidade 3 |
| 4008 | 172.16.3.244 | 4008 | Orthanc 4 — Unidade 4 |
| 4009 | 172.16.3.245 | 4009 | Orthanc 5 — Unidade 5 |

---

## 8. Modelo de Dados

O banco `pacs_portal` na VM2 contém as seguintes tabelas:

### `units` — Unidades médicas

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT PK | Identificador auto-incremental |
| name | VARCHAR(255) | Nome da unidade |
| slug | VARCHAR(100) UNIQUE | Identificador URL-friendly |
| isActive | BOOLEAN | Unidade ativa/inativa |
| orthanc_base_url | VARCHAR(500) | URL interna do Orthanc (VM1 → Orthanc) |
| orthanc_public_url | VARCHAR(500) | URL pública via Mikrotik NAT (browser → Orthanc) |
| orthanc_basic_user | VARCHAR(100) | Usuário HTTP Basic (opcional) |
| orthanc_basic_pass | VARCHAR(255) | Senha HTTP Basic (opcional) |
| pacs_ip | VARCHAR(45) | IP do PACS DICOM (para C-GET) |
| pacs_port | INT | Porta DICOM (padrão: 4242) |
| pacs_ae_title | VARCHAR(16) | AE Title do PACS remoto |
| pacs_local_ae_title | VARCHAR(16) | AE Title local (padrão: PACSMANUS) |
| logoUrl | VARCHAR(500) | URL do logo institucional |
| expiration_date | DATE | Data de expiração da unidade (opcional) |

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
| expiration_date | DATE | Data de expiração da conta (opcional) |
| crm | VARCHAR(50) | CRM do médico (opcional) |
| specialty | VARCHAR(100) | Especialidade médica (opcional) |

### `studies_cache` — Cache de estudos DICOM

Armazena estudos recuperados do Orthanc para exibição na lista de exames. Os metadados são indexados para busca rápida por paciente, data e modalidade.

### `templates` — Templates de laudos

Modelos de texto com variáveis dinâmicas por modalidade e unidade. Suportam frases pré-definidas e estrutura de laudos padrão.

### `reports` — Laudos

Laudos médicos vinculados a estudos, com status (`draft`, `signed`, `revised`) e assinatura digital do médico.

### `audit_log` — Auditoria

Registro de todas as ações do sistema: login, busca PACS, abertura de viewer, criação e assinatura de laudos, alterações de cadastro.

### `anamnesis` — Anamnese clínica

Dados clínicos do paciente: sintomas, comorbidades, medicamentos, indicação clínica e CID sugerido (6 camadas de classificação).

### `dicom_annotations` — Anotações DICOM

Anotações realizadas no viewer (medições, setas, textos) vinculadas ao estudo e ao usuário.

### `study_metadata` — Metadados de estudos

Cache de metadados DICOM (PatientName, StudyDate, Modality, etc.) para exibição rápida sem consultar o Orthanc.

---

## 9. Páginas do Sistema

### `/login` — Tela de Login

Autenticação local com username e senha. Após login bem-sucedido, redireciona para a página principal de busca de exames.

**Acesso:** Público (sem autenticação)

---

### `/` e `/pacs-query` — Busca de Exames (Página Principal)

Página central do sistema. Exibe a lista de estudos DICOM recuperados do Orthanc da unidade selecionada.

**Funcionalidades:**
- Filtro por data (Hoje, Ontem, intervalo personalizado)
- Filtro por paciente (busca por nome)
- Filtro "Não Laudados" (exames sem laudo assinado)
- Seletor de unidade (dropdown com todas as unidades ativas)
- Botão **Auto-Download**: baixa automaticamente todos os estudos do dia via C-GET
- Por estudo: **Visualizar DICOM** (viewer Cornerstone), **Laudar** (editor), **Imprimir Laudo**, **RadiAnt** (URL scheme)
- Indicador de status do laudo (Não laudado / Rascunho / Assinado)

**Acesso:** Todos os perfis autenticados

---

### `/dicom-viewer/:studyUid` — Viewer DICOM (Cornerstone)

Viewer DICOM completo baseado em Cornerstone.js com renderização de imagens via DICOMweb (WADO-RS).

**Funcionalidades:**
- Renderização de imagens DICOM no canvas HTML5
- Painel de séries no rodapé com **miniaturas reais** (thumbnails PNG 64×64 gerados via pydicom)
- Ferramentas: Zoom, Pan, Janelamento (Window/Level), Inversão, Rotação, Flip
- Navegação entre slices (scroll do mouse ou barra deslizante)
- Navegação entre séries (clique nas miniaturas do painel inferior)
- Exibição de metadados: nome do paciente, data do estudo, modalidade, WW/WC
- Botão **Exportar ZIP** (download dos arquivos .dcm)
- Botão **RadiAnt** (abre no RadiAnt Viewer via URL scheme)
- Botão **Anamnese** (abre modal de anamnese clínica)
- Indicador de progresso de carregamento das imagens

**Como funciona:** As imagens são baixadas do Orthanc via C-GET (protocolo DICOM) e armazenadas temporariamente em `/tmp/dicom-cache/`. O viewer lê os arquivos via `/api/dicom-files/` e os renderiza com Cornerstone. As miniaturas são geradas sob demanda pelo endpoint `/api/dicom-thumbnail/` usando Python 3.11 + pydicom.

**Acesso:** Todos os perfis autenticados

---

### `/reports/create/:studyInstanceUid` — Editor de Laudos

Editor de texto rico para criação e assinatura de laudos radiológicos.

**Funcionalidades:**
- Seleção de template por modalidade
- Variáveis dinâmicas preenchidas automaticamente: `{{PACIENTE}}`, `{{DATA}}`, `{{MEDICO}}`, `{{CRM}}`, `{{UNIDADE}}`, `{{MODALIDADE}}`, `{{DESCRICAO}}`, `{{DATA_ATUAL}}`
- Frases pré-definidas (sidebar lateral) — clique para inserir no cursor
- Salvar rascunho (status `draft`)
- Assinar laudo (status `signed`) — requer confirmação
- Imprimir laudo (janela de impressão formatada)

**Acesso:** `admin_master`, `admin`, `medico`

---

### `/units` — Gerenciamento de Unidades

Cadastro e edição das unidades médicas e suas conexões com o Orthanc.

**Campos de conexão DICOM:**
- `orthanc_base_url`: URL interna usada pelo backend (ex: `http://172.16.3.241:8042`)
- `orthanc_public_url`: URL pública usada pelo browser para Osimis Viewer (ex: `http://45.189.160.17:8042`)
- `pacs_ip` + `pacs_port` + `pacs_ae_title`: parâmetros para C-GET (download de imagens)

**Acesso:** `admin_master`

---

### `/dashboard` — Dashboard

Painel com estatísticas gerais: total de estudos, laudos assinados, usuários ativos, atividade recente.

**Acesso:** `admin_master`, `admin`

---

### `/templates` — Templates de Laudos

Gerenciamento dos modelos de texto para laudos por modalidade e unidade.

**Acesso:** `admin_master`, `admin`

---

### `/admin` — Administração do Sistema

Painel administrativo completo.

**Funcionalidades:**
- **Usuários:** listar, criar, editar, ativar/desativar, definir perfil, vincular à unidade, definir data de expiração
- **Permissões:** configurar permissões granulares por usuário e unidade
- **Auditoria:** log de todas as ações com filtros por usuário, data e tipo
- **Cache DICOM:** visualizar e limpar o cache em `/tmp/dicom-cache/`

**Acesso:** `admin_master`

---

## 10. Endpoints da API REST

Endpoints servidos diretamente pelo Express para operações de streaming e processamento de arquivos DICOM.

| Método | Endpoint | Descrição |
|--------|---------|-----------|
| GET | `/api/dicom-cache-status/:studyUid` | Verifica se o estudo está no cache e quantos arquivos foram baixados |
| GET | `/api/dicom-files/:studyUid/:filename` | Serve um arquivo .dcm individual do cache (para o Cornerstone) |
| GET | `/api/dicom-files/:studyUid` | Lista todos os arquivos .dcm de um estudo no cache |
| DELETE | `/api/dicom-files/:studyUid` | Remove um estudo do cache |
| GET | `/api/dicom-series/:studyUid` | Retorna as séries de um estudo com metadados (modalidade, contagem, nome do primeiro arquivo) |
| GET | `/api/dicom-thumbnail/:studyUid/:filename` | Gera e retorna miniatura PNG 64×64 via pydicom (cache de 1h em `/tmp/`) |
| GET | `/api/dicom-stream/:studyUid` | Inicia download via C-GET com progresso em tempo real (SSE) |
| GET | `/api/dicom-export/:studyUid` | Gera e retorna ZIP com todos os .dcm do estudo |
| GET | `/api/dicom-cache-info` | Informações do cache: tamanho total, número de estudos |
| DELETE | `/api/dicom-cache-clear` | Limpa todo o cache DICOM |
| GET | `/api/dicomweb/*` | Proxy DICOMweb: repassa requisições WADO-RS para o Orthanc interno |

---

## 11. Procedures tRPC

### `auth.*`

| Procedure | Tipo | Descrição |
|-----------|------|-----------|
| `auth.me` | query | Retorna o usuário autenticado atual |
| `auth.logout` | mutation | Encerra a sessão |
| `auth.login` | mutation | Autenticação local (username + senha) |
| `auth.changePassword` | mutation | Altera a senha do usuário autenticado |

### `units.*`

| Procedure | Tipo | Descrição |
|-----------|------|-----------|
| `units.list` | query | Lista unidades (filtrado por permissão) |
| `units.myPermissions` | query | Unidades às quais o usuário tem acesso |
| `units.getById` | query | Detalhes de uma unidade |
| `units.update` | mutation | Atualiza dados de uma unidade |

### `pacs.*`

| Procedure | Tipo | Descrição |
|-----------|------|-----------|
| `pacs.list` | query | Lista estudos do cache com filtros |
| `pacs.query` | mutation | Busca estudos no Orthanc via REST (`/tools/find`) |
| `pacs.statusByStudyUids` | query | Status de laudo para lista de UIDs |
| `pacs.startViewer` | mutation | Inicia download C-GET e retorna URL do viewer |
| `pacs.download` | mutation | Dispara download do estudo via C-GET |

### `reports.*`

| Procedure | Tipo | Descrição |
|-----------|------|-----------|
| `reports.getByStudyId` | query | Laudo vinculado a um estudo |
| `reports.create` | mutation | Cria novo laudo (status `draft`) |
| `reports.update` | mutation | Atualiza conteúdo do laudo |
| `reports.sign` | mutation | Assina o laudo (status `signed`) |

### `templates.*`

| Procedure | Tipo | Descrição |
|-----------|------|-----------|
| `templates.list` | query | Lista templates por unidade e modalidade |
| `templates.create` | mutation | Cria novo template |
| `templates.update` | mutation | Atualiza template |
| `templates.delete` | mutation | Exclui template |

### `admin.*`

| Procedure | Tipo | Descrição |
|-----------|------|-----------|
| `admin.listUsers` | query | Lista todos os usuários |
| `admin.listAuditLog` | query | Log de auditoria com filtros |
| `admin.updateUser` | mutation | Atualiza dados do usuário |
| `admin.toggleUserActive` | mutation | Ativa/desativa usuário |
| `admin.setUserPermissions` | mutation | Define permissões de um usuário |

### `anamnesis.*`

| Procedure | Tipo | Descrição |
|-----------|------|-----------|
| `anamnesis.getByStudy` | query | Retorna anamnese de um estudo |
| `anamnesis.save` | mutation | Salva/atualiza anamnese |

---

## 12. RBAC — Controle de Acesso por Perfil

| Ação | admin_master | admin | medico | tecnico | viewer |
|------|:-----------:|:-----:|:------:|:-------:|:------:|
| Gerenciar unidades | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gerenciar usuários | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver auditoria | ✅ | ✅ | ❌ | ❌ | ❌ |
| Gerenciar templates | ✅ | ✅ | ❌ | ❌ | ❌ |
| Buscar exames PACS | ✅ | ✅ | ✅ | ✅ | ✅ |
| Abrir viewer DICOM | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar/editar laudos | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assinar laudos | ✅ | ✅ | ✅ | ❌ | ❌ |
| Preencher anamnese | ✅ | ✅ | ✅ | ✅ | ❌ |
| Limpar cache DICOM | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 13. Integração Orthanc

### Configuração Recomendada do Orthanc (`orthanc.json`)

```json
{
  "RemoteAccessAllowed": true,
  "AuthenticationEnabled": false,
  "UnknownSopClassAccepted": true,
  "DicomWeb": {
    "Enable": true,
    "Root": "/dicom-web/"
  },
  "DicomAet": "ORTHANC",
  "DicomPort": 4242
}
```

### Dois modos de acesso

**Backend (VM1 → Orthanc):** Usa `orthanc_base_url` (IP interno) para busca de estudos via `POST /tools/find`, proxy DICOMweb e verificação de saúde.

**Frontend (browser → Orthanc):** Usa `orthanc_public_url` (IP público via NAT) para abrir o Osimis Web Viewer nativo (`/osimis-viewer/app/index.html?study=<ID>`).

---

## 14. Fluxo de Visualização DICOM

```
1. Usuário clica em "Visualizar DICOM"
        ↓
2. Frontend navega para /dicom-viewer/:studyUid
        ↓
3. Backend verifica cache em /tmp/dicom-cache/
        ↓
4a. Cache HIT → serve arquivos diretamente
4b. Cache MISS → inicia C-GET via dcmjs-dimse
        ↓ (C-GET — protocolo DICOM)
5. Orthanc envia arquivos .dcm para VM1 (porta 11112)
        ↓
6. Arquivos salvos em /tmp/dicom-cache/:studyUid/
        ↓
7. Cornerstone.js renderiza imagens via /api/dicom-files/
        ↓
8. Painel de séries carrega thumbnails via /api/dicom-thumbnail/
   (Python 3.11 + pydicom gera PNG 64×64 por arquivo)
```

> **Nota sobre armazenamento:** O cache usa `/tmp/dicom-cache/` na VM1. Como a VM1 tem disco limitado, monitore e limpe o cache periodicamente via painel Admin. Os arquivos originais permanecem no Orthanc (4 TB por instância).

---

## 15. Estrutura de Arquivos

```
pacs-portal/
├── client/
│   └── src/
│       ├── pages/
│       │   ├── Login.tsx               ← Tela de login
│       │   ├── PacsQueryPage.tsx       ← Lista de exames + busca (página principal)
│       │   ├── DicomViewerPage.tsx     ← Viewer Cornerstone com thumbnails
│       │   ├── ReportEditorPage.tsx    ← Editor de laudos com templates
│       │   ├── Units.tsx               ← Gerenciamento de unidades
│       │   ├── Templates.tsx           ← Templates de laudos
│       │   ├── Dashboard.tsx           ← Dashboard com estatísticas
│       │   └── AdminPage.tsx           ← Administração (usuários, auditoria, cache)
│       ├── components/
│       │   ├── DashboardLayout.tsx     ← Layout com sidebar e navegação
│       │   └── ui/                     ← Componentes shadcn/ui
│       └── App.tsx                     ← Definição de rotas
├── server/
│   ├── routers.ts                      ← Todas as procedures tRPC
│   ├── db.ts                           ← Query helpers Drizzle
│   ├── dicom_thumbnail.py              ← Script Python para thumbnails DICOM
│   └── _core/
│       ├── index.ts                    ← Express + endpoints REST + proxy DICOMweb
│       └── env.ts                      ← Variáveis de ambiente tipadas
├── drizzle/
│   ├── schema.ts                       ← Definição das tabelas MySQL
│   └── *.sql                           ← Histórico de migrações
├── scripts/
│   ├── setup-vm1.sh                    ← Script de deploy completo
│   └── seed-production.mjs             ← Seed inicial (admin + unidades)
├── shared/
│   └── permissions.ts                  ← Matriz RBAC por perfil
└── package.json                        ← Dependências e scripts
```

---

## 16. Histórico de Migrações

| Arquivo | Conteúdo |
|---------|---------|
| `0000_dapper_pixie.sql` | Tabelas base: units, users, studies_cache |
| `0001_public_molecule_man.sql` | Tabelas: templates, reports, audit_log |
| `0002_married_nehzno.sql` | Campo `role` em users |
| `0003_black_luckman.sql` | Campos PACS em units (pacs_ip, pacs_port, pacs_ae_title) |
| `0004_sleepy_cyclops.sql` | Tabela anamnesis |
| `0005_organic_santa_claus.sql` | Campos username, password_hash, isActive em users |
| `0006_parallel_betty_brant.sql` | Campo orthanc_public_url em units |

---

## 17. Atualização do Sistema

Para atualizar o portal após novos commits no repositório:

```bash
cd /var/www/pacs-portal && git pull origin main && pnpm build && pm2 restart pacs-portal
```

---

## 18. Solução de Problemas Comuns

### Thumbnails não aparecem (badges de texto em vez de imagens)

**Causa:** Python 3.11 ou bibliotecas pydicom/Pillow/numpy não instaladas.

```bash
python3.11 -c "import pydicom, PIL, numpy; print('OK')"
pip3 install pydicom pillow numpy
pm2 restart pacs-portal
```

### Viewer DICOM não carrega imagens (tela preta)

```bash
# Verificar logs
pm2 logs pacs-portal --lines 50 --nostream | grep -i "error\|dicom\|cget"
# Verificar cache
ls /tmp/dicom-cache/
```

Verificar em Administração > Unidades: `pacs_ip`, `pacs_port` e `pacs_ae_title` devem corresponder ao Orthanc.

### Erro "URL do Orthanc não configurada"

Acessar Administração > Unidades > editar a unidade e preencher `orthanc_base_url` (ex: `http://172.16.3.241:8042`).

### Portal não inicia após `pnpm build`

```bash
pnpm build 2>&1 | tail -20
pm2 logs pacs-portal --lines 30 --nostream
```

### Banco de dados inacessível

```bash
mysql -h 172.16.3.101 -u pacs_user -p pacs_portal -e "SHOW TABLES;"
```

---

**Repositório:** https://github.com/alessandrobarra7/pacs-v4  
**Desenvolvido por:** StudioBarra7 com Manus AI Platform
