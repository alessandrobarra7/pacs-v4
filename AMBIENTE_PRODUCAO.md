# Documentação do Ambiente de Produção — PACS Portal

## Arquitetura

```
Internet → Nginx (VM1) → Node.js/PM2 (VM1) → MySQL (VM2)
                                            → PACS DICOM (172.16.3.250:3004)
```

## VM1 — Servidor de Aplicação

- **Domínio:** https://lauds.com.br
- **Usuário:** root
- **Diretório da aplicação:** `/var/www/pacs-portal`
- **Processo:** PM2 → `pacs-portal` (fork mode, porta 3000)
- **Proxy:** Nginx → `http://localhost:3000`

### Comandos de manutenção na VM1

```bash
# Ver versão do código em produção
cd /var/www/pacs-portal && git log -1 --format="%H | %ad | %s" --date=format:"%d/%m/%Y %H:%M"

# Atualizar código + recompilar + reiniciar (comando completo)
cd /var/www/pacs-portal \
  && git remote set-url github https://[TOKEN]@github.com/alessandrobarra7/pacs-v4.git 2>/dev/null || true \
  && git pull github main \
  && pnpm build \
  && pm2 restart all

# Ver logs em tempo real
pm2 logs pacs-portal --lines 50

# Ver status do PM2
pm2 status

# Reiniciar apenas o servidor (sem recompilar)
pm2 restart all
```

## VM2 — Banco de Dados MySQL

- **Host interno:** `172.16.3.101:3306`
- **Banco:** `pacs_portal`
- **Usuário:** `pacs_user`
- **Senha:** `PacsPortal2025`

### Comandos de manutenção do banco (executar na VM1)

```bash
# Acessar o MySQL
mysql -u pacs_user -pPacsPortal2025 -h 172.16.3.101 pacs_portal

# Verificar estrutura de uma tabela
mysql -u pacs_user -pPacsPortal2025 -h 172.16.3.101 pacs_portal -e "DESCRIBE nome_tabela;"

# Ver todas as tabelas
mysql -u pacs_user -pPacsPortal2025 -h 172.16.3.101 pacs_portal -e "SHOW TABLES;"
```

## GitHub

- **Repositório:** https://github.com/alessandrobarra7/pacs-v4
- **Token PAT:** `[REDACTED — ver PRODUCTION_CREDENTIALS.md local]`
- **Branch principal:** `main`

### Push manual para o GitHub (executar no sandbox Manus)

```bash
cd /home/ubuntu/pacs-portal \
  && git add -A \
  && git commit -m "mensagem do commit" \
  && git push github main
```

## Variáveis de Ambiente (.env na VM1)

Arquivo: `/var/www/pacs-portal/.env`

```
DATABASE_URL=mysql://pacs_user:PacsPortal2025@172.16.3.101:3306/pacs_portal
```

## PACS DICOM

- **Host:** `172.16.3.250:3004`
- **AE Title:** `DPACS`
- **AE Title local:** `PACSPORTAL`
- **Protocolo:** C-FIND + C-GET (Study Root)

## Fluxo de Deploy

1. Desenvolver no sandbox Manus
2. Fazer push para GitHub: `git push github main`
3. Na VM1: `cd /var/www/pacs-portal && git pull github main && pnpm build && pm2 restart all`

## Migrações Aplicadas em Produção

| Data | Tabela | SQL Aplicado |
|------|--------|--------------|
| 04/04/2026 | `report_versions` | `ADD COLUMN version INT NOT NULL DEFAULT 1 AFTER report_id` |
| 04/04/2026 | `report_versions` | `ADD COLUMN status ENUM('draft','signed','revised') NOT NULL DEFAULT 'revised' AFTER body` |
| 04/04/2026 | `report_versions` | `ADD COLUMN saved_by_user_id INT NOT NULL DEFAULT 0 AFTER reason` |
| 04/04/2026 | `report_versions` | `ADD COLUMN saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER saved_by_user_id` |
| 04/04/2026 | `report_versions` | `CHANGE COLUMN revised_by revised_by INT NULL` |
