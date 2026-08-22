# Correção do log financeiro por ocorrência e do status de áudio

**Data:** 22/08/2026  
**Escopo:** apresentação auditável no Financeiro v2 e status de áudio na worklist.  
**Alteração de dados:** nenhuma.  
**Migração:** não necessária.

## Contexto

A auditoria independente confirmou que `billing_catalog_study_events` já armazena `billing_occurrence` e `source_report_id`, mas a fonte unificada do Financeiro não os retornava. Assim, a interface mostrava o médico de uma assinatura histórica sem identificar a ocorrência, permitindo confusão com o estado clínico atual da worklist.

Também foi confirmado que `audioReports.getStatusBatch` bloqueava `admin_master` por papel antes de verificar o acesso à unidade, produzindo respostas 403 para uma consulta que apenas determina se o ícone de áudio deve ser exibido.

## Implementação

| Área | Correção |
|---|---|
| Fonte financeira unificada | `listUnitCycleFinancialEvents` agora seleciona e propaga `billing_occurrence` e `source_report_id` para eventos de catálogo. Eventos legados recebem ambos como nulos. |
| Log auditável | O modal passou a identificar o campo como **Médico da assinatura**, mostrar se a assinatura histórica foi cancelada e exibir a ocorrência e o laudo de origem. Quando a origem antiga não possui laudo vinculado, a limitação é declarada na tela. |
| Eventos cancelados | Permanecem visíveis, com indicação de que estão fora dos totais e que a linha existe somente para auditoria. |
| Status de áudio | `audioReports.getStatusBatch` não bloqueia mais pelo papel clínico; cada UID continua sendo filtrado por `assertDicomFileAccess(..., "view_studies")`. Leitura detalhada, gravação e exclusão mantêm suas restrições originais. |

## Contrato de apresentação

O nome exibido no log representa a **assinatura registrada no evento financeiro**, não necessariamente o autor ou o estado da ocorrência clínica mais recente. Isso permite que um rascunho atual apareça como “Em Andamento” sem ocultar ou atribuir erroneamente uma assinatura histórica anterior.

## Regressões e validação

Foram ampliadas as regressões para verificar que:

1. Eventos de catálogo retornam ocorrência e laudo de origem; eventos legados mantêm campos nulos.
2. O log renderiza uma ocorrência histórica cancelada com origem explícita e sem confundi-la com o laudo atual.
3. O indicador de áudio usa autorização por acesso à unidade, sem 403 indevido para administrador.

Validações aprovadas no sandbox:

- `pnpm check`;
- regressões financeiras e de mídia focadas: 5 arquivos, 10 testes aprovados;
- suíte completa: 77 arquivos, 362 testes aprovados e 1 ignorado;
- build de produção concluído.

## Limites

Esta correção não reativa, cancela, precifica, recalcula ou dá baixa em evento financeiro algum. Em especial, não altera os eventos históricos 1 e 2. A implantação em produção exige apenas atualização do código da VM1; não requer migração de banco.
