# Auditoria de Divergência de Preço — Painel do Médico

**Data:** 22 de agosto de 2026
**Modo:** somente leitura na VM2
**Alteração de dados:** nenhuma

## Conclusão

A divergência observada não é reprecificação e não indica que o repasse histórico foi calculado com uma configuração errada. O evento ativo de modalidade CT recebeu **R$ 10,00** no momento da assinatura, utilizando a origem **fallback da modalidade da unidade**. A consulta de vigência aplicada ao instante da assinatura também retornou **R$ 10,00**.

O painel de configuração mostra agora **R$ 10,01** para CT, com vigência iniciada no mesmo dia civil da assinatura. Como a auditoria por data preserva apenas o dia, e a consulta de vigência no instante da assinatura retornou R$ 10,00, a mudança para R$ 10,01 ocorreu posteriormente à assinatura dentro desse dia ou após o instante efetivo considerado pela regra.

| Elemento | Valor confirmado | Interpretação |
|---|---:|---|
| Evento de CT ativo | R$ 10,00 | Valor histórico imutável do repasse. |
| Origem do evento | *fallback* da modalidade da unidade | Não existia preço individual vigente aplicável à assinatura. |
| Configuração efetiva na assinatura | R$ 10,00 | Confirma coerência entre regra de preço e evento persistido. |
| Configuração vigente atual de CT | R$ 10,01 | Regra atual para novas assinaturas, sem recálculo retroativo. |

> O evento financeiro deve permanecer em R$ 10,00. Alterar esse evento para R$ 10,01 violaria a imutabilidade financeira e criaria reprecificação retroativa.

## Transparência recomendada

Para eliminar a ambiguidade visual, uma alteração futura da interface pode separar explicitamente os conceitos: **“Configuração vigente para novas assinaturas”** e **“Valor aplicado na assinatura”**. A lista de laudos entregues pode mostrar o valor histórico do evento ao lado da data de assinatura, preservando o painel de configuração apenas para o preço atual.

## Achado adicional não tratado

A auditoria identificou dois ciclos abertos com o mesmo intervalo civil para a unidade auditada. Esse achado é independente da diferença entre R$ 10,00 e R$ 10,01 e não foi modificado nesta etapa. Deve ser analisado em auditoria própria antes de qualquer fechamento, exclusão ou reprocessamento de ciclo.
