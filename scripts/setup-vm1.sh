#!/bin/bash
# =============================================================================
# Script de Setup do Portal PACS - VM1 (172.16.3.100)
# Executa como root no diretório /opt/pacs-portal
# =============================================================================
set -e

PORTAL_DIR="/opt/pacs-portal"
DB_HOST="172.16.3.101"
DB_PORT="3306"
DB_NAME="pacs_portal"
DB_USER="pacs_user"
DB_PASS="PacsPortal2025"
APP_PORT="3000"

echo "============================================"
echo "  PACS Portal - Setup VM1"
echo "============================================"

cd "$PORTAL_DIR"

# 1. Criar arquivo .env
echo "[1/5] Criando arquivo .env..."
cat > .env << EOF
# Banco de dados MySQL na VM2
DATABASE_URL=mysql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# Segredo JWT para sessões (altere para uma string aleatória segura em produção)
JWT_SECRET=$(openssl rand -hex 32)

# OAuth Manus (não usado em produção local, mas necessário para compilar)
VITE_APP_ID=local
OAUTH_SERVER_URL=http://localhost
VITE_OAUTH_PORTAL_URL=http://localhost
OWNER_OPEN_ID=local_admin
OWNER_NAME=Administrador

# Forge API (não usado em produção local)
BUILT_IN_FORGE_API_URL=http://localhost
BUILT_IN_FORGE_API_KEY=local
VITE_FRONTEND_FORGE_API_KEY=local
VITE_FRONTEND_FORGE_API_URL=http://localhost

# App
NODE_ENV=production
PORT=${APP_PORT}
EOF
echo "   ✅ .env criado"

# 2. Instalar dependências
echo "[2/5] Instalando dependências..."
pnpm install --frozen-lockfile 2>&1 | tail -3
echo "   ✅ Dependências instaladas"

# 3. Build do frontend
echo "[3/5] Compilando frontend..."
pnpm build 2>&1 | tail -5
echo "   ✅ Frontend compilado"

# 4. Executar seed do banco
echo "[4/5] Configurando banco de dados..."
node scripts/seed-production.mjs
echo "   ✅ Banco configurado"

# 5. Iniciar com PM2
echo "[5/5] Iniciando servidor com PM2..."
pm2 delete pacs-portal 2>/dev/null || true
pm2 start pnpm --name "pacs-portal" -- start
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "============================================"
echo "  ✅ Portal iniciado com sucesso!"
echo "  Acesse: http://172.16.3.100:${APP_PORT}"
echo "  Acesso externo: http://45.189.160.17"
echo ""
echo "  Login inicial:"
echo "  Username: admin"
echo "  Senha:    Admin@2025"
echo "  ⚠️  ALTERE A SENHA APÓS O PRIMEIRO LOGIN!"
echo "============================================"
