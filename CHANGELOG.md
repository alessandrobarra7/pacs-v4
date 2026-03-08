# CHANGELOG — PACS Portal (lauds.com.br)

Registro completo de todas as alterações realizadas no projeto, organizadas por sessão de desenvolvimento.
Toda modificação de lógica, banco de dados, infraestrutura ou interface está documentada aqui.

---

## [sessão-2026-03-08] — 2026-03-08 — Diagnóstico e Correção do Banco de Dados na VM2

### Problema Identificado
- Após o deploy do commit `fedd0ea` na VM1, a tela de login exibia o erro:
  `Failed query: select id, openId, unit_id, name, email, username, password_hash...`
- Causa raiz: as tabelas no banco `pacs_portal` da VM2 foram criadas por uma versão anterior do código (Drizzle ORM) e estavam com schema desatualizado. Faltavam as colunas `username` e `password_hash` na tabela `users`, e `orthanc_public_url`, `pacs_ip`, `pacs_port`, `pacs_ae_title`, `pacs_local_ae_title` na tabela `units`.
- Problema adicional: o usuário `pacs_user` não tinha permissão para conectar remotamente da VM1 (`172.16.3.100`) ao MySQL da VM2 (`172.16.3.101`). Erro: `Access denied for user 'pacs_user'@'172.16.3.100'`.

### Diagnóstico
- Verificado via `mysql -u root -p137946 pacs_portal` na VM2
- `SHOW TABLES` confirmou 9 tabelas existentes (incluindo `__drizzle_migrations` e `user` — tabela legada do template Manus)
- `DESCRIBE users` revelou ausência das colunas de autenticação local

### Correção Aplicada — ALTER TABLE na VM2
```sql
ALTER TABLE users ADD COLUMN username VARCHAR(64) UNIQUE;
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE users MODIFY COLUMN role ENUM('admin_master','unit_admin','medico','viewer') DEFAULT 'viewer' NOT NULL;
ALTER TABLE units ADD COLUMN orthanc_public_url VARCHAR(500);
ALTER TABLE units ADD COLUMN pacs_ip VARCHAR(45);
ALTER TABLE units ADD COLUMN pacs_port INT;
ALTER TABLE units ADD COLUMN pacs_ae_title VARCHAR(16);
ALTER TABLE units ADD COLUMN pacs_local_ae_title VARCHAR(16) DEFAULT 'PACSMANUS';
```

### Dados Iniciais Inseridos
- 5 unidades Orthanc com IPs internos (172.16.3.241–245) e URLs públicas via Mikrotik NAT
- Usuário administrador: `admin` / `Admin@2025` / perfil `admin_master` / hash bcrypt custo 12

### Permissão de Acesso Remoto ao MySQL
```sql
GRANT ALL PRIVILEGES ON pacs_portal.* TO 'pacs_user'@'172.16.3.100' IDENTIFIED BY 'PacsPortal2025';
FLUSH PRIVILEGES;
```

### Arquivo Adicionado ao Repositório
- `scripts/lauds_setup_vm2.sql`: SQL completo de criação de tabelas, colunas e dados iniciais para uso em novos deployments ou recuperação de desastres.

---

## [a3bead9] — 2026-03-05 — Login Pixel-Perfect LAUDS + Rodapé StudioBarra7

### Frontend — `client/src/pages/Login.tsx`
- **Reescrita completa** da tela de login para replicar fielmente o design do projeto de referência `pixel-perfect-clone-1221.lovable.app`
- Layout dividido em dois painéis 50/50:
  - **Painel esquerdo:** imagem radiológica em preto e branco (CT scan), overlay escuro semitransparente, nome "LAUDS" em branco bold no canto inferior esquerdo, subtítulo "Sistema de Laudos Radiológicos"
  - **Painel direito:** fundo branco, título "Entrar", subtítulo "Informe suas credenciais", campos "Usuário" e "Senha" sem ícones, bordas finas, botão azul sólido largura total
- Rodapé alterado de "Desenvolvido por Manus" para **"Desenvolvimento StudioBarra7"**
- Removido: logo circular azul com listras, nome "SETE ME CLOUD", ícones nos campos de formulário

---

## [5700175] — 2026-03-05 — Identidade Visual LAUDS Completa

### Frontend — `client/src/pages/PacsQueryPage.tsx`
- Header completamente reescrito com identidade LAUDS:
  - "LAUDS" bold à esquerda (sem logo/ícone)
  - Navegação central: botões "Estudos" (ativo em azul) e "Administração"
  - Nome do usuário + botão logout (ícone seta) à direita
- Tabela de estudos com colunas: **Data | Paciente | Unidade | Visualizar | Impressão | Laudar | Status Envio**
- Fundo da página: `#F9FAFB` (cinza muito claro)
- Removido: DashboardLayout, sidebar, header duplicado

### Frontend — `client/src/pages/AdminPage.tsx` (novo arquivo)
- Página de Administração unificada com sub-navegação horizontal por abas:
  - **Unidades** — tabela com IP interno, IP público (Mikrotik), status; botão "Nova Unidade"
  - **Usuários** — tabela com nome, e-mail, perfil, unidade, badge "Ativo"; botão "Novo Usuário"
  - **Auditoria** — tabela com Data/Hora, Usuário, Ação, Tipo, Alvo; subtítulo "Log de atividades do portal"
- Aba ativa com fundo azul (`#2563EB`)
- Botões de ação azuis no canto superior direito

### Backend — `server/routers.ts`
- Adicionado procedure `admin.listUsers` (protectedProcedure, role admin): retorna lista de usuários com id, nome, email, role, unit_id, created_at
- Adicionado procedure `admin.listAuditLog` (protectedProcedure, role admin): retorna últimos 500 registros de auditoria ordenados por created_at DESC
- Adicionado procedure `admin.deleteUser` (protectedProcedure, role admin): remove usuário por ID com validação de não auto-deleção

### Roteamento — `client/src/App.tsx`
- Adicionada rota `/admin` → `AdminPage`
- Removidas rotas antigas de `/units`, `/users` (consolidadas em `/admin`)

---

## [7795b1c] — 2026-03-05 — SSL/HTTPS em lauds.com.br

### Infraestrutura — Mikrotik
- Adicionada regra NAT para porta 443:
  ```
  chain=dstnat action=dst-nat to-addresses=172.16.3.100 to-ports=443
  protocol=tcp dst-address=45.189.160.17 dst-port=443
  comment="RED PORTA 443 HTTPS IP: 172.16.3.100"
  ```

### Infraestrutura — VM1 (172.16.3.100)
- Instalado certificado SSL Let's Encrypt via Certbot:
  - Emissor: Let's Encrypt
  - Domínio: `lauds.com.br`
  - Validade: até **03/06/2026** (renovação automática via systemd timer a cada 90 dias)
  - Certificado: `/etc/letsencrypt/live/lauds.com.br/fullchain.pem`
  - Chave privada: `/etc/letsencrypt/live/lauds.com.br/privkey.pem`
- Nginx reconfigurado automaticamente pelo Certbot com bloco HTTPS e redirecionamento HTTP → HTTPS
- Resultado: `https://lauds.com.br` funciona com cadeado verde

### Documentação — `INFRASTRUCTURE.md`, `DEPLOY.md`
- Adicionada seção SSL/HTTPS com detalhes do certificado, configuração Nginx e procedimento de renovação

---

## [c6ce2ba] — 2026-03-05 — Correção dotenv (env(0) na VM1)

### Backend — `server/_core/index.ts`
- **Causa do bug:** `dotenv` versão 17 não sobrescreve variáveis já definidas no ambiente do processo. O PM2 acumulava variáveis vazias de sessões anteriores, e o dotenv as ignorava — resultado: `injecting env (0)`.
- **Correção:** adicionado `override: true` no `dotenv.config()` para forçar sobrescrita
- Adicionada busca em 4 caminhos possíveis para o `.env`:
  1. `<diretório do bundle>/../.env`
  2. `process.cwd()/.env`
  3. `/opt/pacs-portal/.env`
  4. `<home>/.env`
- Log explícito do caminho carregado: `[dotenv] Loaded N vars from <caminho>`

---

## [943ca09] — 2026-03-05 — Documentação Técnica Completa

### Documentação — `README.md`
- Reescrito completamente com: arquitetura da infraestrutura, stack tecnológica, mapeamento NAT do Mikrotik, modelo de dados das 7 tabelas, status de todos os módulos, instruções de instalação, variáveis de ambiente, estrutura de arquivos, matriz RBAC e integração Orthanc

### Documentação — `DEPLOY.md` (novo arquivo)
- Guia passo a passo de deploy na VM1: pré-requisitos, instalação inicial, procedimento de atualização, configuração do Nginx, arquivo `.env` completo, comandos PM2, verificação de conectividade com VM2 e Orthanc, aplicação de migrações, backup e tabela de troubleshooting

### Documentação — `INFRASTRUCTURE.md` (novo arquivo)
- Documentação técnica da infraestrutura com diagrama ASCII completo da topologia, regras NAT do Mikrotik transcritas, especificações de VM1 e VM2, configuração recomendada do `orthanc.json` para cada instância, e fluxo de dados detalhado

---

## [fe42ad8] — 2026-03-05 — Integração Mikrotik NAT (5 Orthancs)

### Banco de Dados — `drizzle/schema.ts`
- Adicionado campo `orthanc_public_url` (TEXT, nullable) na tabela `units`
- Migração `0006_parallel_*.sql` gerada e aplicada

### Banco de Dados — Dados iniciais
- 5 unidades Orthanc criadas com IPs internos e públicos reais:

| Unidade | IP Interno | Porta Interna | IP Público | Porta Pública |
|---------|-----------|---------------|------------|---------------|
| Studio Barra7 | 172.16.3.241 | 8042 | 45.189.160.17 | 8042 |
| Unidade 2 | 172.16.3.242 | 4006 | 45.189.160.17 | 4006 |
| Unidade 3 | 172.16.3.243 | 4007 | 45.189.160.17 | 4007 |
| Unidade 4 | 172.16.3.244 | 4008 | 45.189.160.17 | 4008 |
| Unidade 5 | 172.16.3.245 | 4009 | 45.189.160.17 | 4009 |

### Backend — `server/routers.ts`
- `getViewerUrl`: retorna `orthanc_public_url` para o frontend (acesso externo via Mikrotik) e `orthanc_base_url` para chamadas internas do backend
- Procedures `units.create` e `units.update` atualizados para incluir `orthanc_public_url`

### Frontend — `client/src/pages/PacsQueryPage.tsx`
- `handleOpenOrthancViewer`: usa `orthanc_public_url` da unidade em vez de IP hardcoded
- Botão "Orthanc" abre `http://45.189.160.17:<porta>/osimis-viewer/app/index.html?study=<ID>`

### Frontend — `client/src/pages/UnitsPage.tsx`
- Formulários de criação e edição incluem campo "URL Pública (Mikrotik NAT)"
- Tabela exibe IP interno e IP público de cada instância Orthanc

---

## [5ef2b11] — 2026-03-05 — Correção de Erros no Sandbox

### Banco de Dados
- Corrigido `unit_id` do usuário admin: apontava para `30001` (inexistente), corrigido para `60004` (Studio Barra7)
- Causa: IDs gerados automaticamente ficaram dessincronizados entre sessões do sandbox

### Backend — `server/const.ts`
- `getLoginUrl()` retorna `null` quando `VITE_OAUTH_PORTAL_URL` está vazio/indefinido
- Evita `TypeError: Invalid URL` ao tentar construir `new URL("undefined/app-auth")`

### Frontend — `client/src/main.tsx`, `client/src/components/DashboardLayout.tsx`
- Todos os pontos que chamavam `getLoginUrl()` atualizados para usar `getLoginUrl() ?? "/login"` como fallback seguro

---

## [c837ba5] — 2026-03-04 — Correção TypeError: Invalid URL

### Frontend — `client/src/const.ts`
- **Causa:** `new URL(undefined + "/app-auth")` lançava `TypeError: Invalid URL` antes da aplicação renderizar
- **Correção:** `getLoginUrl()` agora verifica se `VITE_OAUTH_PORTAL_URL` está definida antes de construir a URL
- Retorna `null` quando OAuth não está configurado (modo local)

---

## [e9cea0d] — 2026-03-03 — Login Local (bcrypt) + Scripts de Deploy

### Backend — `server/routers.ts`
- Adicionado procedure `auth.localLogin`: autenticação por usuário/senha com bcrypt
- Adicionado procedure `auth.localRegister`: cadastro com hash bcrypt (apenas admin pode criar usuários)
- Sessão JWT gerada e armazenada em cookie httpOnly após login bem-sucedido

### Scripts — `scripts/setup-vm1.sh`
- Script de instalação completa da VM1: Node.js 20, pnpm, PM2, clone do repositório, build, configuração do PM2

### Configuração — `ecosystem.config.cjs`
- Arquivo de configuração do PM2 com variáveis de ambiente, restart automático e logs

---

## [Sessões anteriores] — Funcionalidades Core

### Banco de Dados — `drizzle/schema.ts`
Tabelas criadas:

| Tabela | Descrição |
|--------|-----------|
| `units` | Unidades/clínicas com configuração Orthanc |
| `users` | Usuários com roles (admin, medico, viewer, unit_admin) |
| `studies_cache` | Cache de estudos DICOM consultados |
| `templates` | Templates de laudo por modalidade |
| `reports` | Laudos médicos com status de workflow |
| `audit_log` | Log de auditoria de todas as ações |
| `anamnesis` | Dados clínicos do paciente por estudo |

### Backend — Procedures tRPC
- `pacs.query`: busca estudos no Orthanc via DICOMweb (QIDO-RS), com filtros por data, paciente e unidade
- `pacs.getStudyDetails`: detalhes completos de um estudo
- `pacs.getViewerUrl`: URL do viewer Osimis/Cornerstone para um estudo
- `reports.create`, `reports.update`, `reports.getByStudy`: CRUD de laudos
- `templates.list`, `templates.create`, `templates.update`: CRUD de templates
- `units.list`, `units.create`, `units.update`, `units.delete`: CRUD de unidades
- `system.notifyOwner`: notificação ao proprietário via Manus API

### Frontend — Páginas
- `/login` — Tela de autenticação local
- `/pacs-query` — Busca e listagem de estudos DICOM
- `/admin` — Administração (Unidades, Usuários, Auditoria)
- `/report/:studyId` — Editor de laudos com templates
- `/viewer/:studyId` — Viewer DICOM (Cornerstone.js)

### RBAC — Perfis de Acesso

| Perfil | Estudos | Laudar | Imprimir | Administração |
|--------|---------|--------|----------|---------------|
| admin | ✅ Todas | ✅ | ✅ | ✅ |
| medico | ✅ Unidade | ✅ | ✅ | ❌ |
| viewer | ✅ Unidade | ❌ | ✅ | ❌ |
| unit_admin | ✅ Unidade | ❌ | ✅ | ✅ Parcial |

---

## Infraestrutura Atual

```
Internet
    │
    ▼
45.189.160.17 (IP Público PPPoE — Ultranet)
    │
    ▼
Mikrotik (172.16.3.254)
    │
    ├── :80  → 172.16.3.100:80   (VM1 — Nginx → Node.js :3000)
    ├── :443 → 172.16.3.100:443  (VM1 — Nginx SSL → Node.js :3000)
    ├── :8042 → 172.16.3.241:8042 (Orthanc Studio Barra7)
    ├── :4006 → 172.16.3.242:4006 (Orthanc Unidade 2)
    ├── :4007 → 172.16.3.243:4007 (Orthanc Unidade 3)
    ├── :4008 → 172.16.3.244:4008 (Orthanc Unidade 4)
    └── :4009 → 172.16.3.245:4009 (Orthanc Unidade 5)

VM1 (172.16.3.100) — Ubuntu 22.04
  ├── Nginx (porta 80/443) → proxy reverso para Node.js :3000
  ├── Node.js 20 + PM2 (pacs-portal)
  └── Certificado SSL: /etc/letsencrypt/live/lauds.com.br/

VM2 (172.16.3.101) — MySQL 8.0
  └── Banco: pacs_portal
      Usuário: pacs_user
      Acesso: 172.16.3.100 apenas
```

---

*Última atualização: 2026-03-05 | Desenvolvido por StudioBarra7*
