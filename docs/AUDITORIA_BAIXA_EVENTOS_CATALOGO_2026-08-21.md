# Auditoria — Baixa Operacional dos Eventos de Catálogo

**Data de referência:** 21 de agosto de 2026.  
**Escopo:** baixa de pagamentos, detalhamento por médico, consolidação de métricas e regressões críticas do fluxo financeiro de catálogo.

## Achado confirmado

A auditoria do estudo externo foi confirmada no código: até esta correção, os eventos em `billing_catalog_study_events` integravam os totais financeiros, mas não possuíam os campos operacionais equivalentes aos de `billing_visit_events`. As mutações de baixa e o detalhe por médico operavam apenas no fluxo legado. Portanto, um valor de catálogo podia compor o total, porém não havia mecanismo para registrar sua quitação.

| Área | Situação anterior | Correção no sandbox |
|---|---|---|
| Repasse ao médico | Apenas eventos legados tinham baixa. | A baixa por unidade, médico e ciclo atualiza os dois fluxos, preservando data, usuário e observação no catálogo. |
| Obrigação da unidade com LAUDS | Apenas eventos legados tinham baixa. | A baixa exclusiva do `admin_master` atualiza os dois fluxos e preserva auditoria no catálogo. |
| Detalhe operacional por médico | Exibia somente eventos legados. | Retorna eventos legados e de catálogo, com origem explícita, modalidade, valor e estado de pagamento. |
| Resumos financeiros | Eventos de catálogo eram sempre considerados pendentes depois de pagos. | Os resumos passam a usar as baixas efetivamente registradas em ambos os conjuntos. |

## Migração 0055

A migração `0055_finance_catalog_payment_tracking.sql` é exclusivamente aditiva. Ela acrescenta seis campos a `billing_catalog_study_events`: data, usuário e observação para o pagamento ao médico; e data, usuário e observação para a baixa da obrigação da unidade com a LAUDS.

Nenhum evento anterior é apagado, atualizado automaticamente ou reprocessado. Um evento histórico que já esteja pendente preserva seu estado; somente operações futuras de baixa podem registrá-lo como pago quando existir valor aplicado.

## Regras de acesso e integridade

O pagamento ao médico preserva o escopo financeiro já existente por unidade. A confirmação da obrigação da unidade com a LAUDS continua exclusiva do `admin_master`. Eventos sem preço médico ou sem taxa do sistema não recebem baixa automática, pois não há valor financeiro definido para quitar.

## Testes comportamentais

Foram adicionados testes que executam os procedimentos reais com um adaptador de banco controlado, em vez de apenas procurar trechos de texto no arquivo. Eles validam a prioridade do preço por modalidade, o fallback da unidade, a criação pendente sem preço, o bloqueio da legenda antes de todas as assinaturas, a baixa conjunta dos dois fluxos e a restrição do `admin_master` para a LAUDS.

Esses testes não usam um servidor MySQL efêmero; por isso validam o comportamento do router e do coordenador com consultas controladas, mas não substituem uma futura suíte de integração contra banco descartável. A cobertura foi reforçada especificamente nos pontos que poderiam permitir regressões silenciosas de preço, criação e baixa de eventos.
