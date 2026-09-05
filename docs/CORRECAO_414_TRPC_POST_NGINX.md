# Correção do erro HTTP 414 em batches tRPC

> **Escopo:** esta correção remove os parâmetros grandes da URL das consultas tRPC da worklist PACS. Ela não altera dados clínicos, banco de dados, estudos DICOM, laudos, valores financeiros ou arquivos MinIO.

## 1. Sintoma e causa

Em dias com muitos estudos, a worklist PACS dispara consultas de enriquecimento em lote para prioridade, laudo, metadados, anamnese, anexos, áudio, SLA e legendas. Antes desta correção, o cliente usava `httpBatchLink` com consultas HTTP `GET`; os arrays de `StudyInstanceUID` eram serializados e repetidos na URL.

O Nginx pode recusar essas URLs extensas com **HTTP 414 — Request-URI Too Large**. A lista principal ainda aparece, mas os dados complementares ficam dependentes de novas tentativas e os badges podem demorar a surgir.

## 2. Correção de aplicação

O arquivo `client/src/main.tsx` agora configura `methodOverride: "POST"` no `httpBatchLink`. As consultas em lote continuam sendo queries tRPC, mas os dados seguem no corpo JSON, e não na query string.

O arquivo `server/_core/index.ts` habilita `allowMethodOverride: true` no `createExpressMiddleware`. Esse ajuste é obrigatório para o servidor aceitar queries tRPC transportadas por `POST`. Mutations não passam a usar `GET`, e subscriptions continuam bloqueadas nesse modo.

| Elemento | Antes | Depois |
|---|---|---|
| Transporte de query tRPC | `GET` | `POST` |
| Arrays de UIDs | Query string | Corpo JSON |
| URL do batch | Incluía entrada serializada | Mantém rota e `batch=1` |
| Rate limit de login | Identifica rota e `batch=1` | Mantido, pois ambos permanecem disponíveis |

Não foi adotado `maxURLLength: 2000` como correção isolada. Esse limite separa operações de um batch, mas não divide o array interno de uma única chamada `getBatch`; uma operação única grande poderia ser rejeitada no navegador. O transporte por POST evita esse limite para o caso de uso atual.

## 3. Regressão automatizada

O arquivo `server/trpc-post-batch-transport.test.ts` protege o contrato mínimo:

1. O cliente preserva `methodOverride: "POST"` e envio de credenciais por cookie.
2. O middleware tRPC do servidor mantém `allowMethodOverride: true`.
3. O rate limiter batch-aware continua montado antes da API tRPC.

Antes de publicar, executar:

```bash
pnpm vitest run server/trpc-post-batch-transport.test.ts server/dicom-study-uid-security.test.ts server/pacs.test.ts server/pacs.query.test.ts
pnpm check
pnpm build
```

## 4. Defesa complementar no Nginx da VM1

A mudança de aplicação é a correção principal. Como defesa adicional para URLs legítimas de outros recursos, configurar buffers de cabeçalho no bloco HTTPS ativo que atende o domínio público:

```nginx
client_header_buffer_size 4k;
large_client_header_buffers 4 32k;
```

O procedimento precisa localizar primeiro o bloco ativo com `sudo nginx -T`, fazer backup do arquivo real e executar `sudo nginx -t` antes de `sudo systemctl reload nginx`. Não usar `restart` para essa alteração.

## 5. Critérios de validação após implantação

Na worklist com volume alto, confirme no DevTools que as consultas `/api/trpc` são `POST` e que não há respostas 414. Os badges de urgência, alerta crítico, anamnese, anexos, áudio e SLA devem aparecer sem a sequência de falha e retry anterior.

Na VM1, acompanhar os registros sem expor dados clínicos:

```bash
sudo tail -n 200 /var/log/nginx/access.log | grep ' /api/trpc' | grep ' 414 ' || true
```

Uma evolução futura, separada desta correção, pode consolidar as múltiplas consultas de enriquecimento da worklist em um endpoint backend único. Essa refatoração requer medição e testes próprios; não é necessária para eliminar o erro 414 atual.
