# Auditoria — Snapshot de Exame Legado no Log Financeiro

O fluxo legado registra `exam_name_snapshot` no próprio evento financeiro. A consulta `financeSimple.auditEventsByUnit` passou a retornar esse campo como `clinical_label`, tal como já fazia com `exam_name_snapshot` dos eventos de catálogo.

Com isso, o log auditável prioriza a descrição permanente gravada no instante da cobrança. `studies_cache.description` permanece disponível apenas como complemento de estudo e não é mais a única fonte para descrever o exame legado. A alteração é somente leitura: não recalcula, atualiza ou reprocessa eventos existentes.

O teste comportamental `finance-audit-trail.test.ts` agora fornece um evento legado sem descrição no cache e confirma que o snapshot do evento ainda é retornado pela consulta.
