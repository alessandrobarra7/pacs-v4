# Contenção de uploads clínicos legados

## Objetivo

Este documento registra a proteção aplicada para impedir que **áudios de laudo**, **anexos de estudo** e **HTMLs de laudos** armazenados anteriormente no diretório local `uploads/` sejam acessados sem autenticação.

> A contenção não remove nem altera os arquivos legados. Ela separa a entrega pública de ativos visuais da entrega autenticada de conteúdo clínico.

## Regra de acesso vigente

| Categoria | Rota de entrega | Exigência de acesso |
|---|---|---|
| `layout-backgrounds`, `layout-logos`, `logos`, `signatures`, `stamps`, `avatars`, `profiles` | `/uploads/...` | Pública por decisão explícita de produto |
| `audio_reports`, `attachments` | `/api/media/...` | Sessão válida e permissão `view_studies` sobre o estudo |
| `laudos` | `/api/media/...` | Sessão válida e permissão `print_reports` na unidade |
| Qualquer prefixo não listado | `/uploads/...` | Negado por padrão com HTTP 403 |

O bloqueio é uma **allowlist**. Portanto, uma nova categoria criada sob `uploads/` não fica pública sem inclusão explícita na lista de ativos permitidos.

## Compatibilidade com arquivos legados

As referências clínicas legadas no formato `/uploads/<chave>` são normalizadas para `/api/media/<chave>` pelas camadas de leitura. A rota `/api/media/*` primeiro aplica a autorização clínica já existente e, depois, tenta obter o objeto no MinIO. Se o objeto ainda não existir no MinIO, ela pode servir somente a cópia local correspondente, desde que pertença a `audio_reports`, `attachments` ou `laudos`.

Esse fallback impede a interrupção do acesso legítimo durante a transição. Ele não transforma o diretório local em público e não aceita outras categorias como fallback.

## Ordem segura de implantação

1. Fazer inventário somente leitura dos diretórios locais clínicos e do estado das variáveis `MINIO_*`, sem listar identificadores de pacientes em relatórios compartilhados.
2. Implantar a allowlist de `/uploads` junto do fallback autenticado de `/api/media`.
3. Validar que uma URL pública clínica responde HTTP 403 e que um usuário autorizado consegue abrir o mesmo conteúdo pela tela do Portal.
4. Confirmar que os arquivos legados permanecem no disco durante a validação inicial.
5. Somente depois criar e executar uma migração idempotente para o MinIO, com checksum, log de cada objeto e backup não público.
6. Remover cópias locais apenas depois de validação por amostragem e do período de retenção definido pelo responsável operacional.

## Validação pós-implantação

| Verificação | Resultado esperado |
|---|---|
| URL pública de áudio, anexo ou laudo legado | HTTP 403, sem redirecionamento para o conteúdo |
| Ativo visual permitido em `/uploads` | HTTP 200 quando existir |
| Áudio/anexo/laudo legado aberto por usuário autorizado | Carrega pela rota `/api/media/...` |
| Usuário sem acesso ao estudo ou unidade | HTTP 401 ou 403, conforme a sessão |
| Arquivos locais legados | Permanecem intactos até a migração física autorizada |

## Limites desta contenção

Esta etapa não migra objetos ao MinIO, não apaga arquivos locais e não altera o histórico financeiro ou clínico. A revisão da exposição pública de imagens de assinatura e carimbos deve ser tratada como decisão de produto e segurança separada, pois esses ativos ainda são classificados como públicos no modelo atual.
