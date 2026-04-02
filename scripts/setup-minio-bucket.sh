#!/bin/bash
# Script para criar bucket e estrutura de pastas no MinIO
# Executar APÓS o MinIO estar rodando na VM2
# Requer: mc (MinIO Client) instalado

set -e

echo "=== Configuração do Bucket 'lauds' no MinIO ==="

# 1. Instalar MinIO Client (mc) se não existir
if ! command -v mc &> /dev/null; then
  echo "Instalando MinIO Client..."
  wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi

# 2. Configurar alias para o MinIO local
echo "Configurando conexão com MinIO..."
mc alias set vm2minio http://172.16.3.101:9000 lauds_admin Lauds@2026!Secure

# 3. Criar bucket principal
echo "Criando bucket 'lauds'..."
mc mb vm2minio/lauds --ignore-existing

# 4. Configurar política de acesso (privado — acesso apenas via API)
mc anonymous set none vm2minio/lauds

# 5. Criar estrutura de pastas (prefixos)
echo "Criando estrutura de pastas..."
echo "placeholder" | mc pipe vm2minio/lauds/unidades/.keep
echo "placeholder" | mc pipe vm2minio/lauds/usuarios/.keep
echo "placeholder" | mc pipe vm2minio/lauds/laudos/.keep

echo ""
echo "✅ Bucket 'lauds' criado com sucesso!"
echo ""
echo "📁 Estrutura de armazenamento:"
echo "   lauds/unidades/{unit_id}/logo/      → Logos das unidades"
echo "   lauds/usuarios/{user_id}/carimbo/   → Carimbos dos médicos"
echo "   lauds/laudos/{study_uid}/            → Arquivos de laudos (futuro)"
echo ""
echo "🔑 Credenciais para configurar no portal (VM1):"
echo "   MINIO_ENDPOINT=http://172.16.3.101:9000"
echo "   MINIO_ACCESS_KEY=lauds_admin"
echo "   MINIO_SECRET_KEY=Lauds@2026!Secure"
echo "   MINIO_BUCKET=lauds"
