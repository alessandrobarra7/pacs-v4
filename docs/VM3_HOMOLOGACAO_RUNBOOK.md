# Runbook de homologação VM1 → VM3

Este procedimento valida a infraestrutura sem recriar RAID, formatar discos ou expor credenciais. Execute comandos de VM3 somente na VM3 e comandos de Portal somente na VM1.

## 1. Pré-condições e segurança

Antes de ativar novos uploads, confirme que existe backup dos arquivos atuais da VM1 e backup do banco na VM2. Não execute `wipefs`, `mkfs`, `mdadm --create` ou qualquer comando destrutivo nos discos de dados da VM3. A conta de aplicação deve ser usada pelo Portal; a conta administrativa do MinIO não deve ser colocada no `.env` da aplicação.

A Secret Key que foi exibida em chat ou terminal compartilhado deve ser considerada comprometida. Gere uma nova chave e cadastre-a pelo gerenciador seguro de secrets, sem colar o valor em mensagens, logs ou documentação.

## 2. Verificar RAID e filesystem na VM3

```bash
printf '%s\n' '=== RAID ==='
sudo cat /proc/mdstat
sudo mdadm --detail /dev/md0

printf '%s\n' '=== MONTAGEM ==='
findmnt /data/storage
sudo df -hT /data/storage
sudo ls -ld /data/storage

printf '%s\n' '=== SERVIÇO MINIO ==='
sudo systemctl is-enabled minio
sudo systemctl is-active minio
sudo systemctl --no-pager --full status minio | sed -n '1,35p'
```

O RAID deve estar `active` e, após a sincronização inicial, com todos os dispositivos esperados. O filesystem deve estar montado em `/data/storage` e o serviço MinIO deve estar `active`.

## 3. Verificar health e firewall da VM3

Na VM3:

```bash
curl --connect-timeout 3 --max-time 5 -fsS -I http://127.0.0.1:9000/minio/health/live
sudo ufw status numbered
sudo ss -lntp | grep -E ':9000|:9001' || true
```

O health check deve retornar `HTTP/1.1 200 OK`. A porta 9000 deve escutar na rede interna; a regra deve permitir somente a origem da VM1. A porta 9001 deve permanecer restrita até existir uma necessidade operacional explícita.

## 4. Verificar conectividade a partir da VM1

Na VM1 (`172.16.3.100`):

```bash
curl --connect-timeout 3 --max-time 5 -fsS -I http://172.16.3.102:9000/minio/health/live
```

O resultado esperado é `HTTP/1.1 200 OK`. Esse teste não autentica e não substitui o teste S3; ele confirma apenas a rota privada e o firewall.

O utilitário `mc` não é obrigatório na VM1. O backend Node usa a biblioteca `minio` e autentica com as secrets do servidor. Se for necessária uma inspeção administrativa, faça-a na VM3 ou use a interface administrativa restrita.

## 5. Verificar policy e bucket na VM3 sem expor secrets

Na VM3, usando uma sessão administrativa local e os valores fornecidos somente pelo prompt, valide a existência da conta, da policy e do bucket:

```bash
sudo bash <<'VERIFY_MINIO'
set -euo pipefail
TMP_MC_CONFIG="$(mktemp -d)"
trap 'rm -rf "$TMP_MC_CONFIG"; unset MINIO_ADMIN_SECRET' EXIT
read -r -s -p 'Senha administrativa do MinIO: ' MINIO_ADMIN_SECRET </dev/tty
echo
MC_CONFIG_DIR="$TMP_MC_CONFIG" mc alias set vm3admin http://127.0.0.1:9000 pacs "$MINIO_ADMIN_SECRET" >/dev/null
MC_CONFIG_DIR="$TMP_MC_CONFIG" mc admin user info vm3admin pacs-app-20260817 >/dev/null
MC_CONFIG_DIR="$TMP_MC_CONFIG" mc admin policy info vm3admin app-policy >/dev/null
MC_CONFIG_DIR="$TMP_MC_CONFIG" mc ls vm3admin/vm3-storage >/dev/null
printf 'VM3_ADMIN_METADATA_OK\n'
VERIFY_MINIO
```

Não imprima o conteúdo de `MINIO_SECRET_KEY`. Se a conta de aplicação foi rotacionada para outro nome, substitua apenas o identificador público da conta no comando; nunca coloque a secret no script versionado.

## 6. Validar pelo Portal

Com as secrets configuradas na VM1:

```text
MINIO_ENDPOINT=http://172.16.3.102:9000
MINIO_BUCKET=vm3-storage
MINIO_ACCESS_KEY=<conta de aplicação restrita>
MINIO_SECRET_KEY=<valor fornecido pelo gerenciador seguro>
MINIO_USE_SSL=false
```

Reinicie o processo somente durante uma janela controlada:

```bash
cd /var/www/pacs-portal
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=2048 pnpm build
pm2 restart pacs-portal --update-env
pm2 save
pm2 status
```

Depois, pelo Portal, faça um upload controlado de uma logo ou assinatura. Confirme que a operação retorna sucesso, que a prévia aparece no editor e que a leitura após recarregar a página continua funcionando. A referência salva no banco deve ser estável (`/api/media/...` para objetos novos), nunca uma URL pré-assinada permanente.

## 7. Confirmar o objeto na VM3

Na VM3, após o upload controlado, use uma sessão administrativa para procurar o objeto no bucket. Não copie URLs pré-assinadas nem secrets para o chat:

```bash
sudo bash <<'VERIFY_OBJECT'
set -euo pipefail
TMP_MC_CONFIG="$(mktemp -d)"
trap 'rm -rf "$TMP_MC_CONFIG"; unset MINIO_ADMIN_SECRET' EXIT
read -r -s -p 'Senha administrativa do MinIO: ' MINIO_ADMIN_SECRET </dev/tty
echo
MC_CONFIG_DIR="$TMP_MC_CONFIG" mc alias set vm3admin http://127.0.0.1:9000 pacs "$MINIO_ADMIN_SECRET" >/dev/null
MC_CONFIG_DIR="$TMP_MC_CONFIG" mc ls --recursive vm3admin/vm3-storage | tail -20
VERIFY_OBJECT
```

## 8. Migração gradual de `/uploads`

Não mova ou apague arquivos locais em massa antes de mapear as referências existentes no banco. O código mantém leitura de `/uploads/` durante a transição. A migração deve ser feita por lotes, com os seguintes passos: inventariar arquivos e referências; copiar cada arquivo para uma chave MinIO opaca; validar tamanho e checksum; atualizar a referência somente após cópia confirmada; testar a leitura pelo Portal; e somente depois retirar o arquivo local em uma janela de manutenção.

O primeiro lote deve conter logos, assinaturas e carimbos administrativos. Anexos de estudo, áudios e PDFs devem ser migrados depois do caminho base ser validado. Em qualquer falha, preserve a referência legada e registre o objeto que precisa de nova tentativa.

## 9. Rollback

Se o upload controlado falhar, não apague `/uploads/` e não revogue imediatamente a conta antiga. Restaure as secrets anteriores somente se ainda forem válidas e seguras, reinicie o PM2 e confirme que os fluxos legados continuam acessíveis. Após estabilizar o Portal, corrija a causa e repita a homologação com uma nova credencial.

## 10. Critério de aceite

A migração pode ser considerada homologada somente quando o health check VM1 → VM3 responder 200, o bucket e a policy existirem, um upload autenticado pelo Portal criar um objeto no MinIO, a leitura usar URL temporária, a exclusão remover o objeto, a autorização impedir acesso por unidade incorreta, o RAID estiver saudável e houver backup externo definido. RAID1 sozinho não é critério de backup.
