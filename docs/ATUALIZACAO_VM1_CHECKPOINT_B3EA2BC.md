# Atualização controlada da VM1 — checkpoint `b3ea2bc`

## Objetivo

Este procedimento atualiza a **VM1 (Portal)** para o checkpoint que reúne as correções P0, as otimizações do visualizador DICOM e a reconciliação de schema do storage VM3. A VM2 continua exclusivamente como banco de dados e a VM3 continua como a única instância MinIO ativa.

> A atualização não altera `.env`, não reativa o MinIO residual da VM2 e não executa comando destrutivo no RAID, no bucket ou no banco.

## Pré-requisitos

Execute na **VM1** como `root`. Mantenha uma sessão SSH aberta durante todo o procedimento. O comando cria um snapshot local de rastreabilidade, interrompe caso existam alterações versionadas locais e só reinicia o PM2 após concluir o build e confirmar `dist/public/index.html`.

```bash
sudo bash <<'UPDATE_VM1_B3EA2BC'
set -euo pipefail
APP='/var/www/pacs-portal'
AUDIT_DIR='/root/pacs-deploy-audit'
STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$AUDIT_DIR"
cd "$APP"
git status --short
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo 'ABORTADO: há alterações versionadas locais; preserve-as antes de atualizar.' >&2
  exit 1
fi
{
  echo "timestamp=$(date -Is)"
  echo "commit_before=$(git rev-parse HEAD)"
  echo "branch_before=$(git branch --show-current)"
  echo "env_mode=$(stat -c '%a %U:%G' .env 2>/dev/null || true)"
} > "$AUDIT_DIR/predeploy_${STAMP}.txt"
git fetch origin main
git merge --ff-only origin/main
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=2048 pnpm build
test -s dist/public/index.html
test -s dist/index.js
pm2 restart pacs-portal --update-env
pm2 save
{
  echo "timestamp=$(date -Is)"
  echo "commit_after=$(git rev-parse HEAD)"
  stat -c 'frontend=%n|%s bytes|%y' dist/public/index.html
  stat -c 'backend=%n|%s bytes|%y' dist/index.js
  pm2 status pacs-portal
} | tee "$AUDIT_DIR/postdeploy_${STAMP}.txt"
UPDATE_VM1_B3EA2BC
```

## Verificação imediata

Após o comando anterior, aguarde dois minutos sem reiniciar o serviço e execute, ainda na **VM1**:

```bash
sudo bash <<'VERIFY_VM1_B3EA2BC'
set -uo pipefail
cd /var/www/pacs-portal
echo '=== COMMIT ==='
git log -1 --oneline
echo '=== BUILD ==='
stat -c '%n | %s bytes | %y' dist/public/index.html dist/index.js
echo '=== PM2 ==='
pm2 status pacs-portal
echo '=== ERROS-ALVO APÓS O DEPLOY ==='
pm2 logs pacs-portal --err --lines 120 --nostream 2>/dev/null | grep -E 'Cannot read properties of undefined \(reading .url.|dist/public/index.html|ENOENT|Falha ao exportar laudo' || echo 'NENHUM_ERRO_ALVO_ENCONTRADO'
VERIFY_VM1_B3EA2BC
```

## Banco e storage

A migration `drizzle/0047_storage_vm3_reconciliation.sql` foi aplicada e validada no sandbox. Na VM2 de produção, os objetos equivalentes já haviam sido criados e verificados; portanto, a execução da migration é idempotente e serve para registrar a formalização do schema. Ela deve ser executada somente após backup e em janela controlada, separadamente do deploy da VM1.

Não inclua segredos nos comandos ou nos logs enviados para auditoria. Para a investigação pendente do PostgreSQL da VM2 e para o acompanhamento do RAID1 da VM3, use somente procedimentos de leitura até haver decisão operacional explícita.
