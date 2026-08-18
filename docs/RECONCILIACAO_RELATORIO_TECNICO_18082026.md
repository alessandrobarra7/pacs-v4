# Reconciliação do Relatório Técnico Consolidado — 18/08/2026

## Objetivo e critério de classificação

Este documento reconcilia o relatório externo de 18/08/2026 com o código-fonte, os checkpoints e as evidências operacionais efetivamente disponíveis no repositório. A classificação **corrigido no código** não deve ser confundida com **implantado na VM1**: a produção só passa a conter uma correção depois de atualização controlada, build validado e reinício do processo.

> Não foram registrados segredos, senhas, tokens, dados clínicos identificáveis ou comandos destrutivos neste documento.

## Estado consolidado

| Tema do relatório | Estado em 18/08/2026 | Evidência e encaminhamento |
|---|---|---|
| Erro `reading 'url'` em `reports.sign` | Corrigido no código; ainda não confirmado na VM1 atualizada | `storagePut` substituiu a chamada que retornava `void`. A VM1 permanece em commit anterior ao conjunto P0 e deve ser atualizada antes da validação operacional. |
| `dist/public/index.html` ausente | Histórico; não reproduzido no build atual da VM1 | O diagnóstico de 18/08 encontrou `dist/public/index.html` e `dist/index.js`; ambos foram gerados no mesmo build. Os logs antigos devem ser tratados como históricos até uma verificação após novo deploy. |
| Isolamento de `laudos/` por unidade | Corrigido no código; pendente de rollout | A rota `/api/media/*` verifica `laudos/{unitId}/...` contra a permissão `print_reports`. |
| Fallback legado com escrita indevida | Corrigido no código; pendente de rollout | `legacyFallbackAllows` concede somente `view_studies`, `view_anamnesis` e `print_reports`. |
| IDOR de áudio e anexos | Corrigido no código; pendente de rollout | Listagem, upload, status e remoção validam o estudo por `assertDicomFileAccess`. |
| Upload de conteúdo declarado incorretamente | Corrigido no código; pendente de rollout | Áudio e anexo exigem tipos detectados por magic bytes antes de persistir. |
| Autorização por fatia DICOM | Corrigido no sandbox; pendente de rollout | A rota por arquivo usa cache positivo de 60 segundos, específico a usuário, perfil, unidade, estudo e permissão. Negativas não entram no cache. |
| Ordenação DICOM lê arquivo completo | Corrigido no sandbox; pendente de rollout | A leitura agora é limitada a 256 KiB de cabeçalho, com até 12 leituras concorrentes, mantendo a ordem por série, instância e posição espacial. |
| Round-trips MinIO redundantes | Corrigido no sandbox; pendente de rollout | A existência do bucket é cacheada por cinco minutos e a rota privada reutiliza os metadados que já consultou. |
| Histórico SQL de storage | Formalizado e validado no sandbox; pendente de registro operacional na VM2 | A migration `0047_storage_vm3_reconciliation.sql` é idempotente e declara tabelas, índices e campos de exportação. O schema Drizzle agora declara os dois índices de estudo. |
| MinIO residual da VM2 | Concluído | Serviço `inactive`, `disabled` e portas 9000/9001 fechadas. Os dados legados em `/data/minio` foram preservados. |
| PostgreSQL na VM2 | Pendente de diagnóstico somente leitura | Não desligar antes de identificar bancos, listeners e eventuais consumidores. |
| Hostname idêntico em VM1 e VM2 | Pendente de planejamento | Renomear somente após checagem de dependências de hostname, certificados, scripts e inventário. |
| RAID1 em ressincronização | Pendente de acompanhamento | Não há ação destrutiva autorizada. Confirmar conclusão antes de qualquer decisão sobre discos ou topologia. |

## Divergência de deploy da VM1

A VM1 executava o commit `1df2863`, enquanto o repositório oficial já continha o checkpoint `fbe4bd6e` antes desta rodada de melhorias. Portanto, a existência do frontend no build atual não comprova a presença das correções P0 posteriores. O procedimento de atualização deve preservar `.env`, não executar limpeza destrutiva e exigir validação do arquivo `dist/public/index.html` antes do reinício do PM2.

### Evidência pós-deploy

Em 18/08/2026, a VM1 foi atualizada de forma controlada para o commit `a99b6d7`. O build confirmou os arquivos `dist/public/index.html` e `dist/index.js`, e o processo `pacs-portal` permaneceu online no PM2. Na sequência, foi realizado um teste de assinatura e exportação de laudo com monitoramento iniciado a partir do fim do log (`tail -n 0`). Nenhuma nova ocorrência de `reading 'url'`, `ENOENT` ou de falha de exportação foi registrada. Assim, os dois erros da Seção 0 do relatório ficam classificados como **históricos, corrigidos e não recorrentes no deploy atual**.

## Validação da migration no sandbox

O sandbox aplicou a migration de forma idempotente e confirmou as colunas `reports.export_file_key` e `reports.export_file_url`, as tabelas de metadados de áudio e anexos, e os índices `idx_study_audio_uid` e `idx_study_attachments_uid`. A primeira execução demonstrou uma nuance importante: `CREATE TABLE IF NOT EXISTS` não acrescenta índices em tabelas preexistentes. Por isso, a versão final da migration verifica `information_schema.statistics` e adiciona cada índice ausente por `ALTER TABLE` condicional.

## Decisões de segurança e desempenho

O cache de autorização não é global nem baseado apenas em `studyUid`. Ele incorpora a identidade e o contexto de acesso do usuário, mantém TTL curto e não armazena recusas. Assim, o ganho de desempenho do visualizador não vira uma autorização reutilizável entre usuários ou estudos.

O cache de bucket é separado pela configuração efetiva de endpoint, bucket, access key e TLS. Uma alteração de configuração gera uma nova chave de cache; já um bucket temporariamente indisponível é reavaliado após cinco minutos. A rota de mídia ainda preserva streaming e cabeçalhos HTTP Range para o player de áudio.

## Pendências operacionais fora do código

Antes de qualquer alteração nos serviços reais, devem ser executados diagnósticos somente de leitura. Na **VM2**, a prioridade é identificar o PostgreSQL e, na **VM3**, confirmar o término da ressincronização RAID1 e medir o bucket após um fluxo real de laudo, anexo e áudio. A proposta de RAID5 permanece fora de escopo até existir inventário de discos, backup externo comprovado e autorização explícita.

## Referências internas

1. `RELATORIO_TECNICO_CONSOLIDADO_18082026_1.txt`, recebido em 18/08/2026.
2. `server/authorization.ts`, `server/_core/index.ts` e `server/minio.ts`.
3. `drizzle/0047_storage_vm3_reconciliation.sql` e `drizzle/schema.ts`.
4. `docs/DESATIVACAO_MINIO_RESIDUAL_VM2.md`, `docs/EVIDENCIA_PERSISTENCIA_AUDIO_VM1_VM2_VM3.md` e `docs/VM3_ESTRUTURA_E_HOMOLOGACAO.md`.
