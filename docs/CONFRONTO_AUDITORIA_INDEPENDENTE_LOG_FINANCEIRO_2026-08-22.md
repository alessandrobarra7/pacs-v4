# Confronto da Auditoria Independente do Log Financeiro

**Data:** 22 de agosto de 2026

## Resultado do confronto

A auditoria independente confirmou três riscos relevantes: a possibilidade de ocultação por `INNER JOIN`, o mascaramento de erros da consulta como lista vazia e a existência de consultas independentes para resumo e log. As duas últimas observações eram compatíveis com o incidente observado e foram incorporadas à correção aprovada.

## Evidência adicional da VM2

A verificação somente leitura realizada para a unidade 20, no ciclo de 24/07 a 24/08, retornou os seguintes totais: dois eventos de catálogo contados, dois eventos de catálogo visíveis pela junção com `study_exam_legend_selections` e zero eventos sem seleção. Assim, a junção interna representava um defeito latente de integridade, mas não foi a causa demonstrada para os eventos 1 e 2 do incidente.

## Decisão técnica aplicada

A correção não depende de identificar uma única falha transitória entre tRPC e React. O resumo e o log agora usam a mesma lista centralizada de eventos; o vínculo clínico passou a ser opcional para fins de exibição; e a interface diferencia falha de consulta de ciclo sem eventos. Essa combinação elimina as três classes de divergência identificadas pela auditoria.

## Limites de evidência

Não foram incluídos neste registro credenciais, cookies, tokens, identificadores completos de estudo ou dados identificáveis de pacientes. Não houve alteração na VM2, reprocessamento, exclusão ou recriação dos eventos financeiros investigados.
