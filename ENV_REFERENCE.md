# Variáveis de Ambiente — PACS Portal

Este arquivo documenta todas as variáveis de ambiente utilizadas pelo projeto.
Copie para `.env` na VM1 e preencha os valores correspondentes.

## Banco de Dados

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `DATABASE_URL` | Sim | String de conexão MySQL/TiDB | `mysql://user:pass@172.16.3.101:3306/pacs_portal` |

## Autenticação

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `JWT_SECRET` | Sim | Segredo para assinar cookies de sessão JWT | `uma-string-longa-e-aleatoria` |
| `SESSION_DURATION_HOURS` | Não | Duração da sessão em horas (padrão: 24) | `8` |

> **Bug fix N6:** `SESSION_DURATION_HOURS` foi adicionado para evitar o valor hardcoded de 24h.
> Defina `SESSION_DURATION_HOURS=8` no `.env` para sessões de 8 horas.

## Manus OAuth

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `VITE_APP_ID` | Sim | ID do aplicativo Manus OAuth |
| `OAUTH_SERVER_URL` | Sim | URL base do servidor OAuth Manus |
| `VITE_OAUTH_PORTAL_URL` | Sim | URL do portal de login Manus |
| `OWNER_OPEN_ID` | Sim | OpenID do proprietário do projeto |
| `OWNER_NAME` | Não | Nome do proprietário |

## Manus Forge API

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `BUILT_IN_FORGE_API_URL` | Sim | URL da API Forge (server-side) |
| `BUILT_IN_FORGE_API_KEY` | Sim | Bearer token para API Forge (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | Sim | Bearer token para API Forge (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | Sim | URL da API Forge (frontend) |

## Analytics

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `VITE_ANALYTICS_ENDPOINT` | Não | Endpoint de analytics |
| `VITE_ANALYTICS_WEBSITE_ID` | Não | ID do website no analytics |

## Aplicação

| Variável | Obrigatória | Descrição | Padrão |
|----------|-------------|-----------|--------|
| `VITE_APP_TITLE` | Não | Título da aplicação | `PACS Portal` |
| `VITE_APP_LOGO` | Não | URL do logo da aplicação | — |
| `VITE_API_BASE_URL` | Não | URL base da API (frontend) | `http://localhost:3000` |
| `NODE_ENV` | Não | Ambiente de execução | `development` |

## Exemplo de `.env` para VM1

```bash
# Banco de dados
DATABASE_URL=mysql://pacs_user:137946@172.16.3.101:3306/pacs_portal

# Autenticação
JWT_SECRET=sua-chave-secreta-longa-aqui
SESSION_DURATION_HOURS=24

# Ambiente
NODE_ENV=production
```
