# Validação Isolada de Build na VM1 — Correções de Segurança

**Data:** 19/08/2026  
**Objetivo:** validar a compilação completa do commit auditado diretamente na VM1, sem alterar o diretório ativo do Portal, sem modificar o PM2 e sem interromper o serviço em produção.

## Condição de uso

Este procedimento é exclusivamente de pré-validação. Ele cria uma árvore de trabalho Git temporária em `/var/tmp`, instala as dependências definidas pelo *lockfile* e executa o build fora de `/var/www/pacs-portal`. Caso o build falhe, a aplicação em produção permanece no commit e nos artefatos atuais.

| Item | Estado preservado durante esta validação |
|---|---|
| Diretório ativo | `/var/www/pacs-portal` não recebe `merge`, `checkout` ou alteração de artefatos. |
| Serviço | O processo `pacs-portal` no PM2 não é reiniciado. |
| Banco de dados e MinIO | Não são acessados nem modificados pelo procedimento. |
| Git | Apenas `fetch` do commit já publicado e criação temporária de *worktree*. |

## Comando controlado

Execute **somente na VM1**, como usuário com acesso administrativo. O comando encerra e remove a área temporária mesmo se uma etapa falhar.

```bash
sudo bash <<'VALIDATE_VM1_SECURITY_BUILD'
set -euo pipefail
ROOT='/var/www/pacs-portal'
CANDIDATE="/var/tmp/pacs-portal-security-build-$(date +%Y%m%d_%H%M%S)"
cd "$ROOT"
git fetch origin main
git worktree add --detach "$CANDIDATE" origin/main
cleanup() {
  git -C "$ROOT" worktree remove --force "$CANDIDATE" 2>/dev/null || rm -rf "$CANDIDATE"
}
trap cleanup EXIT
cd "$CANDIDATE"
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=2048 pnpm build
test -s dist/public/index.html
test -s dist/index.js
printf 'CANDIDATE_COMMIT='; git rev-parse --short HEAD
stat -c '%n | %s bytes' dist/public/index.html dist/index.js
printf 'PM2_ATIVO_SEM_REINICIO\n'
pm2 status pacs-portal
VALIDATE_VM1_SECURITY_BUILD
```

## Critério de aprovação

A validação só é aprovada quando o comando termina com código zero, os dois artefatos existem e o processo `pacs-portal` permanece **online** sem reinício. O resultado deve ser registrado junto ao `CANDIDATE_COMMIT`, aos tamanhos de `dist/public/index.html` e `dist/index.js`, e ao estado do PM2.

> Não execute `git merge`, `pm2 restart`, migrações SQL ou mudanças de firewall durante esta validação. A atualização real da VM1 é uma etapa separada, condicionada ao build isolado aprovado e a uma nova verificação do commit publicado.

## Resultado registrado

A validação isolada foi executada na **VM1** no commit `0af226d` e foi aprovada. O Vite transformou 4.803 módulos e concluiu em 35,83 segundos; o bundle do servidor também terminou sem erro. Foram verificados `dist/public/index.html` com 367.349 bytes e `dist/index.js` com 538.774 bytes.

O processo ativo `pacs-portal` permaneceu **online**, sem reinício, com o mesmo PID e contador de reinicializações durante o procedimento. Os avisos de módulos Node externalizados pelo Vite e de *chunk* acima de 500 KiB são avisos conhecidos do conjunto Cornerstone e não impediram a compilação. A área temporária do *worktree* foi removida pelo `trap` ao término do comando.
