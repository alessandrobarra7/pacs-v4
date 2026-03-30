#!/bin/bash
# ============================================================
# PACS Portal — Diagnóstico de Ambiente VM1
# Execute como root: bash check_vm1_env.sh
# ============================================================

OK="  ✅"
WARN="  ⚠️ "
FAIL="  ❌"

echo ""
echo "============================================================"
echo "  PACS Portal — Diagnóstico de Ambiente VM1"
echo "  $(date '+%d/%m/%Y %H:%M:%S')"
echo "============================================================"

# --- Sistema Operacional ---
echo ""
echo "[ SISTEMA OPERACIONAL ]"
OS=$(lsb_release -d 2>/dev/null | cut -f2 || cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)
echo "$OK OS: $OS"
ARCH=$(uname -m)
echo "$OK Arquitetura: $ARCH"
MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
MEM_FREE=$(free -m | awk '/^Mem:/{print $7}')
echo "$OK Memória: ${MEM_TOTAL}MB total, ${MEM_FREE}MB disponível"
DISK=$(df -h /var/www 2>/dev/null | awk 'NR==2{print $4" livre de "$2}' || df -h / | awk 'NR==2{print $4" livre de "$2}')
echo "$OK Disco (/var/www): $DISK"

# --- Node.js ---
echo ""
echo "[ NODE.JS ]"
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo $NODE_VER | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    echo "$OK Node.js: $NODE_VER"
  else
    echo "$WARN Node.js: $NODE_VER (recomendado 18+)"
  fi
else
  echo "$FAIL Node.js: NÃO INSTALADO"
fi

# --- pnpm ---
echo ""
echo "[ PNPM ]"
if command -v pnpm &>/dev/null; then
  echo "$OK pnpm: $(pnpm --version)"
else
  echo "$FAIL pnpm: NÃO INSTALADO (instale com: npm install -g pnpm)"
fi

# --- PM2 ---
echo ""
echo "[ PM2 ]"
if command -v pm2 &>/dev/null; then
  echo "$OK pm2: $(pm2 --version)"
  PM2_STATUS=$(pm2 list 2>/dev/null | grep pacs-portal | awk '{print $18}' || echo "desconhecido")
  echo "$OK pacs-portal status: $PM2_STATUS"
else
  echo "$FAIL pm2: NÃO INSTALADO (instale com: npm install -g pm2)"
fi

# --- Python 3.11 ---
echo ""
echo "[ PYTHON 3.11 ]"
PYTHON311="/usr/bin/python3.11"
if [ -f "$PYTHON311" ]; then
  PY_VER=$($PYTHON311 --version 2>&1)
  echo "$OK python3.11: $PY_VER ($PYTHON311)"
else
  echo "$FAIL python3.11: NÃO ENCONTRADO em /usr/bin/python3.11"
  ALT=$(which python3.11 2>/dev/null || which python3 2>/dev/null)
  [ -n "$ALT" ] && echo "$WARN   Alternativa encontrada: $ALT ($($ALT --version 2>&1))"
fi

# --- pynetdicom ---
echo ""
echo "[ DEPENDÊNCIAS PYTHON DICOM ]"
if $PYTHON311 -c "import pynetdicom; print('pynetdicom', pynetdicom.__version__)" 2>/dev/null; then
  echo "$OK pynetdicom: instalado"
else
  echo "$FAIL pynetdicom: NÃO INSTALADO"
  echo "       Instale com: pip3.11 install pynetdicom"
fi

if $PYTHON311 -c "import pydicom; print('pydicom', pydicom.__version__)" 2>/dev/null; then
  echo "$OK pydicom: instalado"
else
  echo "$FAIL pydicom: NÃO INSTALADO"
  echo "       Instale com: pip3.11 install pydicom"
fi

# --- Nginx ---
echo ""
echo "[ NGINX ]"
if command -v nginx &>/dev/null; then
  echo "$OK nginx: $(nginx -v 2>&1 | head -1)"
  NGINX_STATUS=$(systemctl is-active nginx 2>/dev/null || service nginx status 2>/dev/null | grep -o 'running\|stopped' | head -1)
  echo "$OK nginx status: $NGINX_STATUS"
  TIMEOUT=$(grep -r "proxy_read_timeout" /etc/nginx/ 2>/dev/null | head -1)
  if [ -n "$TIMEOUT" ]; then
    echo "$OK proxy_read_timeout: $TIMEOUT"
  else
    echo "$WARN proxy_read_timeout: não configurado (recomendado: 300s para C-GET)"
  fi
else
  echo "$WARN nginx: NÃO INSTALADO (opcional, mas recomendado como proxy reverso)"
fi

# --- MySQL / Banco de Dados ---
echo ""
echo "[ BANCO DE DADOS ]"
DB_URL=$(grep DATABASE_URL /var/www/pacs-portal/.env 2>/dev/null | cut -d= -f2-)
if [ -n "$DB_URL" ]; then
  DB_HOST=$(echo $DB_URL | grep -oP '(?<=@)[^:]+')
  DB_PORT=$(echo $DB_URL | grep -oP '(?<=:)\d+(?=/)' | tail -1)
  echo "$OK DATABASE_URL configurado: host=$DB_HOST porta=$DB_PORT"
  if command -v mysql &>/dev/null; then
    DB_USER=$(echo $DB_URL | grep -oP '(?<=//)[^:]+')
    DB_PASS=$(echo $DB_URL | grep -oP '(?<=:)[^@]+(?=@)')
    DB_NAME=$(echo $DB_URL | grep -oP '[^/]+$')
    CONN=$(mysql -h$DB_HOST -P$DB_PORT -u$DB_USER -p$DB_PASS $DB_NAME -e "SELECT COUNT(*) as units FROM units;" 2>/dev/null | tail -1)
    if [ -n "$CONN" ]; then
      echo "$OK MySQL: conectado — $CONN unidades cadastradas"
    else
      echo "$WARN MySQL: client instalado mas conexão falhou (verifique credenciais)"
    fi
  else
    echo "$WARN mysql client: não instalado (não é obrigatório, só para diagnóstico)"
  fi
else
  echo "$FAIL DATABASE_URL: não encontrado em /var/www/pacs-portal/.env"
fi

# --- Conectividade PACS ---
echo ""
echo "[ CONECTIVIDADE PACS ]"
PACS_HOSTS=("172.16.3.250:3004" "45.189.160.17:3004")
for HOST_PORT in "${PACS_HOSTS[@]}"; do
  HOST=$(echo $HOST_PORT | cut -d: -f1)
  PORT=$(echo $HOST_PORT | cut -d: -f2)
  if timeout 3 bash -c "echo >/dev/tcp/$HOST/$PORT" 2>/dev/null; then
    echo "$OK PACS $HOST:$PORT — ACESSÍVEL"
  else
    echo "$FAIL PACS $HOST:$PORT — INACESSÍVEL (timeout)"
  fi
done

# --- Porta da Aplicação ---
echo ""
echo "[ PORTA DA APLICAÇÃO ]"
if ss -tlnp 2>/dev/null | grep -q ':3000'; then
  echo "$OK Porta 3000: ESCUTANDO"
elif netstat -tlnp 2>/dev/null | grep -q ':3000'; then
  echo "$OK Porta 3000: ESCUTANDO"
else
  echo "$FAIL Porta 3000: NÃO ESCUTANDO (servidor não está rodando)"
fi

HTTP_RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/ 2>/dev/null)
if [ "$HTTP_RESP" = "200" ]; then
  echo "$OK HTTP localhost:3000 → $HTTP_RESP OK"
else
  echo "$FAIL HTTP localhost:3000 → $HTTP_RESP (esperado 200)"
fi

# --- Diretório de Cache DICOM ---
echo ""
echo "[ CACHE DICOM ]"
CACHE_DIR="/tmp/dicom-cache"
if [ -d "$CACHE_DIR" ]; then
  CACHE_COUNT=$(find $CACHE_DIR -name "*.dcm" 2>/dev/null | wc -l)
  CACHE_SIZE=$(du -sh $CACHE_DIR 2>/dev/null | cut -f1)
  echo "$OK Cache DICOM: $CACHE_DIR — $CACHE_COUNT arquivos, $CACHE_SIZE"
else
  echo "$OK Cache DICOM: $CACHE_DIR — vazio (normal se nenhum estudo foi aberto)"
fi

# --- Disco livre para cache ---
DISK_TMP=$(df -h /tmp | awk 'NR==2{print $4}')
echo "$OK Espaço livre em /tmp: $DISK_TMP"

# --- Resumo ---
echo ""
echo "============================================================"
echo "  DIAGNÓSTICO CONCLUÍDO"
echo "============================================================"
echo ""
