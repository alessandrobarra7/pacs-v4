# Visão financeira individual do médico

## Finalidade

A rota `/financeiro/meu-financeiro` apresenta ao médico somente o seu contexto financeiro na unidade selecionada. A página não permite editar preços, vigências, ciclos, baixas ou eventos.

## Informações exibidas

| Área | Regra de origem |
|---|---|
| Unidade e ciclo | Unidade escolhida explicitamente e datas civis de início e término do ciclo. |
| Laudos assinados | Contagem de documentos do próprio médico com situação `signed` ou `revised` no ciclo. |
| Repasses gerados | Soma dos eventos financeiros ativos do médico com valores efetivamente aplicados na assinatura. |
| Configuração vigente | Preços por modalidade vigentes para o médico na unidade, somente para consulta. |
| Laudos entregues | Documentos do próprio médico assinados, retificados ou cancelados, com paciente, modalidade, situação e download quando autorizado. |

## Integridade e autorização

O valor de repasse é obtido dos eventos financeiros ativos e preserva o valor aplicado no momento da assinatura. Alterações posteriores na configuração por modalidade não recalculam documentos já entregues.

A consulta exige acesso financeiro à unidade. A lista de documentos exige `view_studies`; a URL de download exige também `print_reports`. Ambas as verificações são aplicadas no servidor, além do filtro pelo autor ou assinante igual ao usuário logado e pela unidade selecionada.

> Laudos cancelados podem aparecer apenas como histórico clínico de conferência. Seus eventos financeiros cancelados não entram na contagem de repasses gerados.

## Validação

Foram executados TypeScript, regressões específicas da visão médica, suíte completa Vitest e build de produção. Não há migração de banco nem alteração de dados clínicos ou financeiros nesta entrega.

## Experiência móvel

Em telas abaixo do breakpoint `md`, a relação de laudos entregues deixa de depender de uma tabela larga: cada documento é apresentado em cartão com paciente, assinatura, modalidade, situação, descrição e ação de download em largura total. A tabela detalhada permanece disponível no desktop. A validação visual final deve ser feita por um médico autorizado em dispositivo móvel após a atualização de produção.
