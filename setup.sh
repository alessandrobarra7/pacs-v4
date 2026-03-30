#!/bin/bash
# =============================================================================
# PACS Portal — Script de Instalação Completo para VM1
# Desenvolvimento StudioBarra7
# =============================================================================
set -e

REPO_URL="https://github.com/alessandrobarra7/pacs-v4.git"
APP_DIR="/var/www/pacs-portal"
DB_NAME="pacs_portal"
DB_USER="pacs_user"
DB_PASS="137946"
DB_ROOT_PASS="137946"
APP_PORT=3000

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }
err()  { echo -e "${RED}[✗] $1${NC}"; exit 1; }
step() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

[ "$EUID" -ne 0 ] && err "Execute como root: sudo bash setup.sh"

# =============================================================================
step "1/9 — Atualizando sistema"
# =============================================================================
apt-get update -qq
apt-get install -y -qq curl git wget gnupg2 ca-certificates lsb-release \
  software-properties-common apt-transport-https unzip build-essential
log "Sistema atualizado"

# =============================================================================
step "2/9 — Instalando Node.js 22.x"
# =============================================================================
if ! node --version 2>/dev/null | grep -q "v22"; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs
fi
log "Node.js $(node --version) instalado"

# =============================================================================
step "3/9 — Instalando pnpm e PM2"
# =============================================================================
npm install -g pnpm@10 pm2 --silent
log "pnpm $(pnpm --version) e PM2 $(pm2 --version) instalados"

# =============================================================================
step "4/9 — Instalando Python 3.11"
# =============================================================================
if ! /usr/bin/python3.11 --version > /dev/null 2>&1; then
  add-apt-repository ppa:deadsnakes/ppa -y > /dev/null 2>&1
  apt-get update -qq
  apt-get install -y -qq python3.11 python3.11-distutils python3.11-dev
fi

# Garantir pip para python3.11
if ! python3.11 -m pip --version > /dev/null 2>&1; then
  curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11 > /dev/null 2>&1
fi
log "Python $(python3.11 --version) instalado"

# =============================================================================
step "5/9 — Instalando bibliotecas DICOM (pynetdicom + pydicom)"
# =============================================================================
python3.11 -m pip install --quiet pynetdicom pydicom
python3.11 -c "import pynetdicom; import pydicom; print('pynetdicom', pynetdicom.__version__, '| pydicom', pydicom.__version__)" \
  || err "Falha ao instalar pynetdicom/pydicom"
log "pynetdicom e pydicom instalados"

# =============================================================================
step "6/9 — Instalando e configurando MySQL"
# =============================================================================
if ! systemctl is-active --quiet mysql 2>/dev/null; then
  apt-get install -y -qq mysql-server
  systemctl enable mysql
  systemctl start mysql
fi

# Criar banco e usuário
MYSQL_CMD="CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}'; GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost'; FLUSH PRIVILEGES;"
mysql -u root -p"${DB_ROOT_PASS}" -e "${MYSQL_CMD}" 2>/dev/null || \
mysql -u root -e "${MYSQL_CMD}" 2>/dev/null || \
warn "MySQL: banco/usuário já existem ou acesso root sem senha — verifique manualmente"
log "MySQL configurado — banco: ${DB_NAME}, usuário: ${DB_USER}"

# =============================================================================
step "7/9 — Clonando/atualizando repositório"
# =============================================================================
if [ -d "${APP_DIR}/.git" ]; then
  warn "Repositório já existe — fazendo git pull"
  cd "${APP_DIR}"
  git pull origin main
else
  mkdir -p "$(dirname ${APP_DIR})"
  git clone "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi
log "Código atualizado em ${APP_DIR}"

# =============================================================================
step "8/9 — Configurando variáveis de ambiente"
# =============================================================================
ENV_FILE="${APP_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "${ENV_FILE}" <<ENV
NODE_ENV=production
PORT=${APP_PORT}
DATABASE_URL=mysql://${DB_USER}:${DB_PASS}@localhost:3306/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
VITE_APP_ID=pacs-portal
OAUTH_SERVER_URL=https://api.manus.im
OWNER_OPEN_ID=
OWNER_NAME=StudioBarra7
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=
VITE_OAUTH_PORTAL_URL=https://login.manus.im
ENV
  log "Arquivo .env criado"
else
  warn ".env já existe — não sobrescrito"
fi

# =============================================================================
step "9/9 — Instalando dependências e fazendo build"
# =============================================================================
cd "${APP_DIR}"
pnpm install --frozen-lockfile
pnpm build

# Verificar bundle limpo
MODULE_EXPORTS_COUNT=$(grep -c "module\.exports" dist/public/assets/index-*.js 2>/dev/null || echo "0")
if [ "${MODULE_EXPORTS_COUNT}" -gt "0" ]; then
  warn "Atenção: ${MODULE_EXPORTS_COUNT} ocorrência(s) de module.exports no bundle"
else
  log "Bundle limpo — 0 ocorrências de module.exports"
fi

# Diretório de cache DICOM
mkdir -p /tmp/dicom-cache
chmod 777 /tmp/dicom-cache
log "Diretório de cache DICOM criado: /tmp/dicom-cache"

# =============================================================================
# Iniciar com PM2
# =============================================================================
if pm2 list | grep -q "pacs-portal"; then
  pm2 restart pacs-portal
  log "PM2: pacs-portal reiniciado"
else
  pm2 start "${APP_DIR}/ecosystem.config.cjs"
  log "PM2: pacs-portal iniciado"
fi

pm2 save
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true

# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   PACS Portal instalado com sucesso!                 ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║   URL:      http://$(hostname -I | awk '{print $1}'):${APP_PORT}              ║${NC}"
echo -e "${GREEN}║   App dir:  ${APP_DIR}                  ║${NC}"
echo -e "${GREEN}║   Logs:     pm2 logs pacs-portal                     ║${NC}"
echo -e "${GREEN}║   Status:   pm2 status                               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
