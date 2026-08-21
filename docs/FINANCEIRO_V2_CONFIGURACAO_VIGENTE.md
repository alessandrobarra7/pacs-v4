# Financeiro v2 — Configuração Vigente por Unidade

**Situação:** implementada e validada exclusivamente no sandbox em 21 de agosto de 2026. Esta etapa não foi aplicada à VM1 nem à VM2 de produção.

## Finalidade

O detalhe financeiro de cada unidade passa a concentrar a configuração por rota em `/financeiro/dashboard/:unitSlug`. A composição clínica continua sendo definida pelas legendas; os valores financeiros são configurados separadamente por unidade, modalidade e médico. Um valor individual do médico prevalece sobre o valor padrão vigente da unidade para a mesma modalidade.

| Elemento | Persistência | Regra de vigência |
|---|---|---|
| Taxa LAUDS por evento | `billing_system_unit_prices` | Uma nova taxa encerra a anterior e, quando já houver taxa ativa, somente pode iniciar no próximo ciclo financeiro. |
| Valor padrão por modalidade | `billing_unit_modality_prices` | Cada alteração cria uma linha nova e encerra a anterior, preservando autor, início e término. |
| Valor individual do médico por modalidade | `billing_doctor_modality_prices` | Usa o histórico já existente e continua a registrar uma nova vigência para cada alteração. |

## Alterações visuais aprovadas

O cabeçalho da unidade não mostra mais uma referência fixa a mês. Foram retirados os cartões e blocos de **Margem atual**, **Soma individual por médico** e **Total de repasses médicos**. Permanecem em destaque a taxa LAUDS, os eventos do ciclo e a soma do sistema, calculada como taxa vigente multiplicada pela quantidade de eventos do ciclo.

A área **Valor vigente por modalidade** exibe CT, CR, RM e US com valor inicial de R$ 0,00. Para administradores e responsáveis financeiros autorizados, cada campo pode ser alterado diretamente. A tabela de médicos também foi simplificada: os valores por modalidade são editados na própria célula, sem botão ou linha adicional de edição. Campo sem valor individual deixa explícito o uso do fallback da unidade.

## Migração 0053

A migração `drizzle/0053_finance_v2_unit_modality_prices.sql` é exclusivamente aditiva. Ela cria `billing_unit_modality_prices` e o índice único por unidade, modalidade e instante de início da vigência. Nenhuma tabela existente, evento financeiro, preço legado ou dado clínico é removido ou modificado pela migração.

O gerador automático foi interrompido no sandbox porque o metadado histórico do Drizzle tentou reinterpretar tabelas já existentes como criações ou renomeações. Por segurança, a migração foi escrita de forma explícita, revisada e aplicada apenas ao banco de desenvolvimento. A aplicação na VM2 exige backup prévio e execução controlada da mesma migração após aprovação do sandbox.

## Limites desta etapa

O fechamento formal de ciclo e as telas dedicadas para iniciar ou encerrar ciclos continuam pendentes. Os totais por médico ainda leem os eventos já consolidados pelo fluxo financeiro preexistente; a próxima etapa deve fazer a apuração por médico considerar diretamente o preço por modalidade efetivamente aplicado em cada evento novo, sem reprocessar registros históricos.

## Validação visual no sandbox

Em sessão autenticada de administrador, foi validado o caminho `/financeiro/dashboard` até `/financeiro/dashboard/pacs-principal`. O catálogo mostrou a unidade e os três indicadores esperados. O detalhe exibiu somente os três cartões aprovados, os quatro campos CT/CR/RM/US iniciados em R$ 0,00 e a tabela de médicos com células editáveis por modalidade. Não foram encontrados na tela a referência fixa de mês, a margem, a soma individual por médico ou o total de repasses.
