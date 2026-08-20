# Contrato Financeiro por Perfil

## Contexto

Este contrato orienta a conclusão das telas financeiras depois da implantação do catálogo clínico-financeiro. Cada unidade permanece um contexto financeiro independente: nenhum painel deve somar, pagar ou configurar informações de unidades distintas sem seleção explícita.

## Matriz de acesso

| Ação | Médico | Responsável financeiro | Administrador geral |
|---|---:|---:|---:|
| Consultar produção e valores próprios | Sim, somente na unidade selecionada | Não aplicável | Supervisão por unidade |
| Consultar obrigação da unidade com a LAUDS | Não | Sim, somente leitura, nas unidades vinculadas | Sim |
| Criar ou vincular médico, operador ou visualizador | Não | Sim, somente nas unidades vinculadas | Sim, em qualquer unidade |
| Desativar ou desvincular participante | Não | Sim, preservando histórico, nas unidades vinculadas | Sim, em qualquer unidade |
| Configurar preço médico por legenda e vigência | Não | Sim, somente para médicos da unidade vinculada | Sim, em qualquer unidade |
| Marcar pagamento ao médico | Não | Sim, somente para participante atribuído à sua gestão na unidade | Sim, em qualquer unidade |
| Definir ciclo, responsável e preço LAUDS | Não | Não | Sim |
| Confirmar recebimento da obrigação da unidade com a LAUDS | Não | Não | Sim |

## Regras de autorização

1. `markSystemPaid` será exclusiva de `admin_master`. Qualquer acesso por `unit_admin` ou `responsavel_financeiro` será recusado no servidor, independentemente da interface.
2. `markDoctorPaid` exigirá a unidade vinculada ao responsável e a atribuição do médico à gestão desse responsável. O administrador geral preserva acesso integral.
3. A matriz de preços por legenda seguirá a mesma verificação de unidade e responsável já aplicada pelo servidor. Uma alteração vigente deverá começar somente na abertura de um novo ciclo.
4. A administração de participantes não apagará usuários ou produção financeira. A desativação e a desvinculação serão eventos preserváveis e auditáveis.
5. Operador, atendente e visualizador não receberão rota ou item de navegação financeira.

## Modelo de proveniência necessário

O vínculo atual `user_unit_permissions` identifica o acesso à unidade, mas não informa qual responsável financeiro criou ou vinculou o participante. Para cumprir a regra de pagamento de participantes sob gestão própria, será introduzido um vínculo aditivo de gestão contendo, no mínimo, responsável financeiro, unidade, usuário participante, data de início, data de término e usuário que registrou a operação.

Esse vínculo será usado para restringir pagamentos médicos e preservar o histórico mesmo após a desativação ou troca de responsável.
