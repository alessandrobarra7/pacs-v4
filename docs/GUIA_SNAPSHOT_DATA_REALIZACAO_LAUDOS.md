# Guia — Snapshot da Data de Realização em Laudos

## Finalidade

O laudo assinado passa a preservar a **data clínica de realização do exame** em `reports.study_date_snapshot`. Essa data é distinta de `signed_at`: a primeira informa quando o estudo foi realizado; a segunda informa quando o profissional assinou o documento.

O sistema aceita `StudyDate` DICOM no formato `YYYYMMDD` e datas ISO no formato `YYYY-MM-DD`, normalizando ambos sem conversão de fuso horário. Na assinatura, a precedência é: data recebida pelo editor, `studies_cache.study_date` e, se as duas fontes estiverem ausentes, valor nulo. A data da assinatura não é usada como substituta da data clínica.

Na geração do PDF financeiro, a consulta prioriza `reports.study_date_snapshot` e usa `studies_cache.study_date` apenas como fallback para laudos históricos. Um PDF histórico sem ambas as fontes continua exibindo `—`, evitando registrar uma informação clínica inventada.

## Migração VM2

Execute primeiro na VM2. O script verifica a coluna, cria um backup apenas da tabela `reports`, aplica a alteração aditiva e confirma o resultado.

```bash
bash <<'MIGRAR_VM2_STUDY_DATE_SNAPSHOT'
set -Eeuo pipefail
DB='pacs_portal'
BACKUP_DIR="$HOME/pacs-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
COLUMN_EXISTS="$(sudo mysql "$DB" -Nse "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reports' AND column_name = 'study_date_snapshot';")"
printf 'COLUMN_EXISTS=%s\n' "$COLUMN_EXISTS"
if [ "$COLUMN_EXISTS" = '1' ]; then
  sudo mysql "$DB" -Nse "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reports' AND column_name = 'study_date_snapshot';"
  exit 0
fi
test "$COLUMN_EXISTS" = '0' || { echo 'ABORTADO: precheck de coluna inesperado.' >&2; exit 1; }
BACKUP_FILE="$BACKUP_DIR/reports-before-0059-$STAMP.sql"
sudo mysqldump --single-transaction --no-tablespaces --skip-comments "$DB" reports > "$BACKUP_FILE"
test -s "$BACKUP_FILE" || { echo 'ABORTADO: backup da tabela reports vazio.' >&2; exit 1; }
chmod 600 "$BACKUP_FILE"
printf 'BACKUP=%s\n' "$BACKUP_FILE"
sudo mysql "$DB" -e "ALTER TABLE reports ADD COLUMN study_date_snapshot DATE NULL AFTER previousVersionId;"
sudo mysql "$DB" -Nse "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reports' AND column_name = 'study_date_snapshot';"
MIGRAR_VM2_STUDY_DATE_SNAPSHOT
```

O resultado esperado ao fim é `study_date_snapshot`, `date`, `YES`. Não execute a atualização da VM1 se o comando terminar com erro.

## Atualização VM1

Após a migração bem-sucedida da VM2, atualize a VM1 para o commit validado da correção. O comando aceita somente os diretórios locais operacionais já conhecidos e valida TypeScript, testes direcionados, build, PM2 e resposta HTTP local. Antes de executá-lo, defina `TARGET_COMMIT` com o hash completo informado na entrega técnica.

```bash
bash <<'SYNC_VM1_STUDY_DATE_SNAPSHOT'
set -Eeuo pipefail
ROOT='/var/www/pacs-portal'
TARGET_COMMIT="${TARGET_COMMIT:?Informe TARGET_COMMIT com o hash completo validado}"
cd "$ROOT"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'ABORTADO: há alterações rastreadas locais.' >&2
  exit 1
fi
while IFS= read -r LINE; do
  STATUS="${LINE:0:2}"
  PATH_LOCAL="${LINE:3}"
  case "$STATUS:$PATH_LOCAL" in
    '??:.env.bak-'*|'??:diagnostico_'*.txt|'??:pm2_erros_'*.txt|'??:uploads/audio_reports/'*|'??:uploads/stamps/'*) ;;
    *) echo "ABORTADO: arquivo local não previsto: $STATUS $PATH_LOCAL" >&2; exit 1 ;;
  esac
done < <(git status --porcelain)
JWT_CONFIGURED=0
DATABASE_CONFIGURED=0
for ENV_FILE in "$ROOT/.env" '/opt/pacs-portal/.env'; do
  if [ -f "$ENV_FILE" ] && grep -qE '^[[:space:]]*JWT_SECRET=.+$' "$ENV_FILE"; then JWT_CONFIGURED=1; fi
  if [ -f "$ENV_FILE" ] && grep -qE '^[[:space:]]*DATABASE_URL=.+$' "$ENV_FILE"; then DATABASE_CONFIGURED=1; fi
done
test "$JWT_CONFIGURED" = '1' || { echo 'ABORTADO: JWT_SECRET não localizado.' >&2; exit 1; }
test "$DATABASE_CONFIGURED" = '1' || { echo 'ABORTADO: DATABASE_URL não localizada.' >&2; exit 1; }
printf 'COMMIT_ANTES='; git rev-parse --short HEAD
git fetch origin main
test "$(git rev-parse origin/main)" = "$TARGET_COMMIT" || { echo 'ABORTADO: origin/main não corresponde ao commit esperado.' >&2; exit 1; }
git diff --check HEAD "$TARGET_COMMIT"
git merge --ff-only "$TARGET_COMMIT"
pnpm install --frozen-lockfile
pnpm check
pnpm vitest run server/studyDate.snapshot.test.ts server/doctor-finance-view.test.ts
pnpm build
printf 'PID_ANTES='; pm2 pid pacs-portal
pm2 restart pacs-portal
sleep 5
printf 'COMMIT_DEPOIS='; git rev-parse --short HEAD
printf 'PID_DEPOIS='; pm2 pid pacs-portal
HTTP_LOCAL="$(curl --connect-timeout 3 --max-time 10 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)"
printf 'HTTP_LOCAL=%s\n' "$HTTP_LOCAL"
test "$HTTP_LOCAL" = '200' || { echo 'ABORTADO: aplicação sem HTTP 200 após o restart.' >&2; exit 1; }
pm2 status pacs-portal
pm2 save
SYNC_VM1_STUDY_DATE_SNAPSHOT
```

## Validação funcional

Depois da implantação, faça uma nova consulta PACS para um estudo cujo `StudyDate` esteja preenchido, abra o laudo, assine-o e gere o PDF financeiro. A linha **Data de realização do exame** deve mostrar a data DICOM desse estudo. A linha **Assinado em** deve continuar mostrando somente o instante da assinatura.
