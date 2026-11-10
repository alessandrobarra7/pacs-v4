#!/bin/bash
# AVISO DE SEGURANCA (auditoria-seguranca-rbac-20261110):
# Este script continha anteriormente a credencial real "lauds_admin" / <senha em texto puro>
# (o valor exato da senha foi removido deste comentario para nao reintroduzir o segredo no
# arquivo atual; ele permanece recuperavel no historico do Git, que e justamente o problema).
# hardcoded, commitada no historico do Git desde ~04/2026. A instancia da VM2 a que essa
# credencial se referia foi desativada em 18/08/2026, mas os dados em /data/minio NAO foram
# apagados, e nao ha confirmacao de que a senha tenha sido rotacionada ou de que a VM3 ativa
# usa uma senha diferente. ACAO NECESSARIA (fora do escopo deste commit, requer acesso real
# a infraestrutura): rotacionar essa senha em qualquer instancia MinIO ativa que ainda a use,
# e considerar os dados remanescentes em /data/minio da VM2 como potencialmente expostos ate
# essa rotacao ser confirmada. Isso deve ser feito por alguem com acesso operacional real
# (Manus/ops), nao por este commit.
# Script de instalação do MinIO na VM2 (172.16.3.101)
# Executar como root ou com sudo

set -e

# Credenciais do MinIO devem ser fornecidas via variaveis de ambiente, nunca hardcoded.
: "${MINIO_ROOT_USER:?Defina a variavel de ambiente MINIO_ROOT_USER antes de rodar este script}"
: "${MINIO_ROOT_PASSWORD:?Defina a variavel de ambiente MINIO_ROOT_PASSWORD antes de rodar este script}"

echo "=== Instalação do MinIO na VM2 ==="

# 1. Criar diretório de dados
echo "Criando diretório de armazenamento..."
mkdir -p /data/minio
chown -R $(whoami):$(whoami) /data/minio

# 2. Baixar binário do MinIO
echo "Baixando MinIO..."
wget https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
chmod +x /usr/local/bin/minio

# 3. Criar usuário minio (se não existir)
if ! id -u minio > /dev/null 2>&1; then
  useradd -r -s /sbin/nologin minio
fi
chown -R minio:minio /data/minio

# 4. Criar arquivo de configuração
echo "Criando arquivo de variáveis de ambiente..."
cat > /etc/default/minio <<EOF
# MinIO Configuration
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
MINIO_VOLUMES="/data/minio"
MINIO_OPTS="--console-address :9001"
EOF

# 5. Criar serviço systemd
echo "Criando serviço systemd..."
cat > /etc/systemd/system/minio.service <<EOF
[Unit]
Description=MinIO
Documentation=https://min.io/docs/minio/linux/index.html
Wants=network-online.target
After=network-online.target
AssertFileIsExecutable=/usr/local/bin/minio

[Service]
WorkingDirectory=/usr/local

User=minio
Group=minio
ProtectProc=invisible

EnvironmentFile=-/etc/default/minio
ExecStartPre=/bin/bash -c "if [ -z \"\${MINIO_VOLUMES}\" ]; then echo \"Variable MINIO_VOLUMES not set in /etc/default/minio\"; exit 1; fi"
ExecStart=/usr/local/bin/minio server \$MINIO_OPTS \$MINIO_VOLUMES

# MinIO RELEASE.2023-05-04T21-44-30Z adds support for Type=notify (https://www.freedesktop.org/software/systemd/man/systemd.service.html#Type=)
# This may improve systemctl setups where other services use `After=minio.server`
# Uncomment the line to enable the functionality
# Type=notify

# Let systemd restart this service always
Restart=always

# Specifies the maximum file descriptor number that can be opened by this process
LimitNOFILE=65536

# Specifies the maximum number of threads this process can create
TasksMax=infinity

# Disable timeout logic and wait until process is stopped
TimeoutStopSec=infinity
SendSIGKILL=no

[Install]
WantedBy=multi-user.target
EOF

# 6. Recarregar systemd e iniciar MinIO
echo "Iniciando MinIO..."
systemctl daemon-reload
systemctl enable minio
systemctl start minio

# 7. Aguardar MinIO iniciar
sleep 5

# 8. Verificar status
if systemctl is-active --quiet minio; then
  echo ""
  echo "✅ MinIO instalado e rodando com sucesso!"
  echo ""
  echo "📋 Informações de acesso:"
  echo "   API Endpoint: http://172.16.3.101:9000"
  echo "   Console Web:  http://172.16.3.101:9001"
  echo "   Usuário:      (definido pela variável de ambiente MINIO_ROOT_USER)"
  echo "   Senha:        (definida pela variável de ambiente MINIO_ROOT_PASSWORD, não exibida aqui)"
  echo ""
  echo "⚠️  IMPORTANTE: Configure o firewall para permitir as portas 9000 e 9001"
  echo "   sudo ufw allow 9000/tcp"
  echo "   sudo ufw allow 9001/tcp"
  echo ""
  echo "📦 Próximo passo: Acessar http://172.16.3.101:9001 e criar o bucket 'lauds'"
else
  echo "❌ Erro ao iniciar MinIO. Verifique os logs:"
  echo "   sudo journalctl -u minio -n 50"
  exit 1
fi
