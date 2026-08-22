# Aprimoramentos da Visão Financeira do Médico

**Data:** 22 de agosto de 2026
**Escopo:** consulta financeira individual em `/financeiro/meu-financeiro`
**Alteração de dados:** nenhuma
**Migração de banco:** não aplicável

## Objetivo

Esta alteração melhora a consulta financeira do médico sem criar, recalcular, reativar, cancelar ou alterar eventos financeiros históricos. A página continua limitada ao usuário autenticado e à unidade financeira selecionada.

## Contrato funcional

| Área | Comportamento entregue | Garantia |
|---|---|---|
| Resumo | Indicadores compactos de laudos assinados e repasses do ciclo, com período civil explícito. | Os repasses exibem valores persistidos nos eventos ativos; não são recalculados pela configuração atual. |
| Laudos entregues | Busca local por paciente, descrição do exame, documento, modalidade ou situação, somente sobre a lista já autorizada do próprio médico na unidade. | A busca não amplia o escopo da consulta nem consulta documentos de outros médicos. |
| Documento | O botão **Imprimir ou baixar PDF** abre o editor em nova aba com `print=1`, usando a rota de impressão existente. | A impressão usa o documento, layout e logos configurados para a unidade; o endereço direto do arquivo não é exposto nesta resposta. |
| Preços | Exibe CT, CR, MR e US, com preço individual vigente antes do preço vigente de modalidade da unidade. | A origem é apresentada como valor individual, padrão da unidade ou ausência de configuração. `RM` e `MR` são tratados como a mesma modalidade de ressonância. |
| Ausência de preço | Mostra **Não configurado** com feedback explícito. | Nenhum valor é inventado ou recuperado de campos de preço padrão fora do contrato de eventos de catálogo. |

> Eventos cancelados, revertidos ou históricos continuam preservados na auditoria e permanecem fora dos totais ativos. A tela não oferece operações de alteração financeira ao médico.

## Regras de autorização

O extrato e os preços requerem acesso financeiro à unidade. A lista de documentos requer `view_studies`; o alvo de impressão exige também `print_reports` e confirmação de autoria ou assinatura pelo médico autenticado. A resposta entrega apenas um identificador mínimo para abrir o fluxo de impressão autorizado e remove a URL direta do arquivo.

## Cobertura de regressão

Foram adicionadas ou atualizadas regressões para a precedência de preços, o *fallback* da unidade, a normalização RM/MR, a ausência de URL direta, a busca local e a abertura da impressão configurada. A validação completa executada no ambiente de desenvolvimento registrou **82 arquivos de teste aprovados, 376 testes aprovados e 1 ignorado**, além de verificação de tipos e build de produção aprovados.

## Validação manual pendente em produção

Após atualização da VM1, um médico autorizado deve selecionar a unidade, buscar um paciente em **Laudos entregues**, abrir **Imprimir ou baixar PDF** e confirmar o layout e logos. Também deve verificar os rótulos de origem dos valores em CT, CR, RM e US. Essa validação não requer nenhuma ação na VM2.
