# Arquitetura Financeira por Unidade e Responsáveis

## Objetivo

O módulo financeiro deve refletir a responsabilidade operacional de cada pessoa, sem consolidar indevidamente dados de unidades diferentes. Uma mesma pessoa pode trabalhar em várias unidades, mas cada unidade constitui um contexto financeiro independente, com seus próprios usuários, ciclo, preços, produção, pagamentos e obrigação perante a LAUDS.

> A separação por unidade é uma regra de negócio e de acesso. Ela não é apenas uma escolha de interface.

## Perfis e limites confirmados

| Perfil | Escopo | Pode operar | Não pode operar |
|---|---|---|---|
| `admin_master` | Todas as unidades | Definir preço LAUDS por unidade, ciclo, ativação, recebimento da LAUDS, criar ou substituir responsável financeiro e supervisionar todos os contextos. | Não possui limitação de unidade. |
| Responsável financeiro | Somente unidades com vínculo ativo | Criar conta ou vincular conta existente como médico, operador ou visualizador; desativar ou desvincular sem apagar histórico; configurar preço do médico por unidade e modalidade; consultar produção e pagar médicos da unidade. | Criar administrador ou outro responsável; mudar ciclo ou preço LAUDS; confirmar pagamento da unidade para a LAUDS; acessar outra unidade. |
| Médico | Somente unidades em que possui acesso financeiro | Consultar as próprias assinaturas, eventos, valores, recebimentos e pendências dentro de uma unidade por vez. | Consultar outro médico, editar preço, administrar usuários ou consolidar valores entre unidades. |
| Operador e visualizador | Sem módulo financeiro | Nenhuma operação financeira. | Acessar páginas, procedimentos ou números financeiros. |

## Jornadas de uso

### Responsável financeiro

O responsável abre uma unidade específica e encontra quatro áreas no mesmo ambiente: **Participantes**, **Preços médicos**, **Produção e pagamentos médicos** e **Obrigação LAUDS**. A última área é consultiva: mostra número de eventos, valor devido, valor confirmado e pendência do ciclo, mas a confirmação de recebimento é exclusiva do `admin_master`.

O responsável pode criar uma nova conta ou vincular uma conta existente. Em ambos os casos, somente os perfis médico, operador e visualizador estarão disponíveis. A retirada de um participante significa desativação ou encerramento de vínculo; a conta e todo o histórico clínico e financeiro permanecem preservados.

### Médico

O médico escolhe uma unidade antes de consultar o financeiro. A tela exibe exclusivamente documentos assinados, evento financeiro correspondente, preço aplicado, valor recebido e pendência daquela unidade e do ciclo selecionado. Não haverá soma de produção ou valor entre hospitais.

### Administrador geral

O administrador geral seleciona qualquer unidade no backoffice. Ele define o ciclo, o valor cobrado pela LAUDS por laudo, confirma o recebimento da unidade e pode trocar o responsável financeiro. A substituição encerra o vínculo anterior de forma auditável e cria o vínculo ativo do novo responsável, sem afetar participantes, preços, documentos ou eventos históricos.

## Modelo técnico proposto

| Necessidade | Estrutura ou regra proposta |
|---|---|
| Contexto único por unidade | Todas as consultas e mutações financeiras exigem `unit_id` autorizado; telas não agregam unidades distintas. |
| Autor e histórico de gestão | Registrar o usuário que criou, vinculou, desativou ou desvinculou um participante no vínculo da unidade, sem substituir a autoria clínica existente. |
| Pagamento de médico | O responsável só pode marcar eventos de médico na unidade autorizada; a operação grava usuário e data de confirmação. |
| Obrigação LAUDS | Somente `admin_master` pode preencher `system_paid_at` e `system_paid_by_user_id`; os demais perfis recebem consulta somente leitura. |
| Preço por ciclo | Preço de médico é resolvido por médico, unidade, modalidade e vigência. Eventos preservam o valor aplicado na assinatura. |
| Substituição de responsável | Encerrar `financial_responsible_units.ends_at` do vínculo ativo e criar novo vínculo, preservando todo o histórico. |

## Critérios de validação

| Cenário | Resultado esperado |
|---|---|
| Responsável com duas unidades | Vê e opera uma unidade por vez; nenhuma soma ou consulta cruzada. |
| Médico com duas unidades | Vê apenas a própria produção e valores da unidade escolhida. |
| Responsável cria participante | Só pode selecionar médico, operador ou visualizador; o vínculo e a autoria ficam auditáveis. |
| Responsável marca médico como pago | Pode afetar apenas eventos do médico na unidade autorizada. |
| Responsável tenta marcar LAUDS como paga | O servidor retorna `FORBIDDEN`. |
| Administrador troca responsável | Novo responsável herda operações da unidade; participantes e histórico são preservados. |
