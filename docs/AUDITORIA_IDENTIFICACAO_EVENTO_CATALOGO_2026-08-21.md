# Auditoria — Identificação Clínica no Evento Financeiro de Catálogo

**Data de referência:** 21 de agosto de 2026.  
**Escopo:** rastreabilidade do paciente e do estudo no drill-down financeiro por médico.

## Achado confirmado

O evento do catálogo já preservava `study_selection_id`, modalidade, valores e baixas, mas a resposta de `eventsByDoctorUnit` descartava artificialmente os campos clínicos ao enviar `patient_name: null` e `study_date: null`. Isso prejudicava a conferência manual de eventos originados no catálogo, embora o vínculo necessário para recuperar os dados já existisse.

## Correção aplicada no sandbox

O drill-down financeiro agora faz o encadeamento `billing_catalog_study_events → study_exam_legend_selections → studies_cache`. Ele retorna o nome do paciente e a data do estudo ao lado da modalidade, do exame, dos valores e da origem `catalog`. O mesmo encadeamento foi aplicado ao extrato do médico para evitar uma segunda tela com eventos sem identificação clínica.

| Campo retornado | Origem | Finalidade |
|---|---|---|
| `patient_name` | `studies_cache.patient_name` | Conferência manual do repasse e localização do caso. |
| `study_date` | `studies_cache.study_date` | Identificação temporal do estudo no ciclo. |
| `source` | Resposta financeira unificada | Diferencia evento `legacy` de evento `catalog` sem esconder sua origem. |

## Tipagem e validação

`FinanceModals.tsx` deixou de usar `as any` para a origem, modalidade e datas do evento. Um tipo explícito descreve o contrato exibido pela interface. O teste comportamental `catalog-event-identification.test.ts` executa `eventsByDoctorUnit` com um adaptador controlado e comprova que um evento de catálogo retorna paciente, data, modalidade e origem.

Nenhuma tabela foi alterada nesta correção; não há migração, reprocessamento ou modificação de dados históricos. A alteração permanece no sandbox até a revisão e publicação no repositório.
