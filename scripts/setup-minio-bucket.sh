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
# Script para criar bucket e estrutura de pastas no MinIO
# Executar APÓS o MinIO estar rodando na VM2
# Requer: mc (MinIO Client) instalado

set -e

# Credenciais do MinIO devem ser fornecidas via variaveis de ambiente, nunca hardcoded.
: "${MINIO_ROOT_USER:?Defina a variavel de ambiente MINIO_ROOT_USER antes de rodar este script}"
: "${MINIO_ROOT_PASSWORD:?Defina a variavel de ambiente MINIO_ROOT_PASSWORD antes de rodar este script}"

echo "=== Configuração do Bucket 'lauds' no MinIO ==="

# 1. Instalar MinIO Client (mc) se não existir
if ! command -v mc &> /dev/null; then
  echo "Instalando MinIO Client..."
  wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi

# 2. Configurar alias para o MinIO local
echo "Configurando conexão com MinIO..."
mc alias set vm2minio http://172.16.3.101:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"

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
echo "🔑 Credenciais lidas de MINIO_ROOT_USER/MINIO_ROOT_PASSWORD — configure o mesmo valor no portal (VM1):"
echo "   MINIO_ENDPOINT=http://172.16.3.101:9000"
echo "   MINIO_ACCESS_KEY=(valor de MINIO_ROOT_USER, não exibido aqui)"
echo "   MINIO_SECRET_KEY=(valor de MINIO_ROOT_PASSWORD, não exibido aqui)"
echo "   MINIO_BUCKET=lauds"
