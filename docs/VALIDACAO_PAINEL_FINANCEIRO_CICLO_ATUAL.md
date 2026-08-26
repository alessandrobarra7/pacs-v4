# Validação do Painel Financeiro por Ciclo Atual

## Contrato de interface

A página inicial do módulo financeiro exibe somente o **ciclo operacional aberto** de cada unidade. Cada cartão apresenta o valor configurado para novos eventos, a quantidade de eventos registrada no ciclo atual e o rendimento acumulado nesse mesmo período.

A consulta de períodos anteriores não deve contaminar esses indicadores. Ela permanece disponível somente dentro da unidade, na aba **Histórico**, com seletor de competência próprio.

## Verificação visual no preview

Em 26/08/2026, a tela inicial foi conferida no preview após a reestruturação. O cabeçalho passou a informar **Ciclos financeiros atuais**, a mensagem de contexto esclarece que os cartões usam apenas o ciclo aberto e a interface removeu o seletor mensal da página principal. A carga dos dados financeiros no preview permaneceu pendente por depender das respostas do ambiente de desenvolvimento, portanto a validação final dos valores requer a VM1 com a base operacional.
