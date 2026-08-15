# Diagnóstico Completo e Plano de Integração com o Repositório GitHub Real (`alessandrobarra7/pacs-v4`)

**Data da Análise:** 27 de Julho de 2026  
**Autor:** Manus AI  
**Escopo:** Conexão, revisão arquitetural e plano de alinhamento entre o sandbox e o repositório GitHub real do ambiente de produção (`https://github.com/alessandrobarra7/pacs-v4`).

---

## 1. Confirmação da Conexão com o GitHub

O repositório oficial do ambiente real (`https://github.com/alessandrobarra7/pacs-v4.git`) foi conectado com sucesso ao ambiente local de desenvolvimento através do remote `github`. 

Branches disponíveis no repositório remoto:
* `github/main` (branch principal de produção)
* `github/limpeza/unificacao-financeiro` (branch de refatoração)

---

## 2. Arquitetura Oficial do Sistema (VM1 + VM2)

O projeto consolida uma arquitetura corporativa distribuída para ambientes PACS/DICOM:

```text
              [ Unidades / Modais de Exame ]
                           │
                           ▼ (DICOM / C-FIND / C-MOVE)
                    [ Servidor Orthanc ]
                           │
                           ▼
    ┌──────────────────────────────────────────────┐
    │  VM1 (Portal Web & Backend)                  │
    │  - Endereço / Domínio do cliente             │
    │  - Nginx + PM2                               │
    │  - Node.js (Express 4 + tRPC 11 + React 19)  │
    └──────────────────────┬───────────────────────┘
                           │ (DATABASE_URL TCP/IP)
                           ▼
    ┌──────────────────────────────────────────────┐
    │  VM2 (Banco de Dados Central)                │
    │  - MySQL / MariaDB / TiDB                    │
    │  - Banco: pacs_portal                        │
    │  - Senha root: 137946                        │
    └──────────────────────────────────────────────┘
```

---

## 3. Diretrizes de Desenvolvimento e Preservação da Lógica

Para adotar as melhorias visuais e operacionais (como design mobile, requisições por fotos e laudo falado) sem comprometer a estabilidade do ambiente de produção:

1. **Autoridade do Banco de Dados (VM2)**:
   - Nenhum armazenamento em SQLite ou banco embutido no portal. O banco oficial é exclusivamente o MySQL na VM2 (`pacs_portal`).
   - Novas colunas ou tabelas (como as migrations `0047` e `0048` para fotos de requisição e áudios) devem ser aplicadas diretamente via Drizzle/SQL na VM2.
2. **Isolamento de Credenciais e Configurações**:
   - O arquivo `.env` de produção na VM1 continuará gerenciando a string de conexão (`DATABASE_URL`), segredos JWT e chaves de S3/MinIO.
   - O modo demo local (`LOCAL_DEMO_PACS=false`) permanece estritamente desativado em produção para forçar o uso dos Orthancs reais por unidade.
3. **Respeito aos papéis e permissões (RBAC)**:
   - Manter os perfis (`admin_master`, `unit_admin`, `medico`, `responsavel_financeiro`, `operador`, `viewer`) e os guards de visualização financeira (`view_financial`).

---

## 4. Próximos Passos Recomendados para o Deploy na VM1

Para atualizar o ambiente real utilizando o código integrado do GitHub:

1. **Atualizar o código na VM1**:
   ```bash
   cd /var/www/pacs-portal
   git pull origin main
   ```
2. **Instalar dependências e compilar**:
   ```bash
   pnpm install
   pnpm build
   ```
3. **Aplicar Migrations Pendentes na VM2**:
   ```bash
   # Executar no banco MySQL da VM2 (senha: 137946)
   # Incluindo as novas migrations de fotos e áudios se aprovadas
   ```
4. **Reiniciar o serviço PM2**:
   ```bash
   pm2 restart pacs-portal
   ```

---
*Documento gerado e salvo automaticamente no repositório do projeto.*
