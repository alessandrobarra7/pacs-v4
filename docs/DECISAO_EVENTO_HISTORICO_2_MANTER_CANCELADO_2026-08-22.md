# Decisão administrativa — evento histórico 2 mantido cancelado

**Data da decisão:** 22/08/2026  
**Escopo:** caso histórico sanitizado da unidade Hospital da Criança, seleção financeira `2`, evento de catálogo `2`.

## Contexto reconciliado

Após a implantação da migração 0057 e da regra de cancelamento auditável, foi aberto um laudo no estudo histórico associado ao evento `2`. A evidência de auditoria confirmou que o report `51` foi criado e assinado às 10:36:21 de 22/08/2026 e cancelado pelo `admin_master` às 11:57:33, com o motivo registrado `kl`.

O cancelamento preservou a versão assinada no histórico (`report_versions.id = 5`) e registrou `CANCEL_REPORT` no audit log (`id = 3124`). A seleção contém somente o documento `primary`; por isso, a cascata atingiu exclusivamente o report `51`. O evento de catálogo `2` foi marcado como `cancelled`, com referência ao report de cancelamento, sem baixa do médico, sem quitação do sistema e sem valores financeiros aplicados.

## Decisão aprovada

O administrador determinou a opção **1 — manter cancelado**. Portanto, o evento histórico `2` não será reativado, recalculado, precificado, baixado, substituído ou recriado.

| Item | Estado final aprovado |
|---|---|
| Report 51 | `cancelled`, com versão e auditoria preservadas |
| Evento financeiro 2 | `cancelled`, sem baixa financeira |
| Preço médico e valor do sistema | Mantidos nulos; não aplicar taxa atual retroativamente |
| Nova ocorrência clínica | Não criada/persistida |
| Alterações futuras | Somente mediante nova autorização administrativa explícita, backup e trilha auditável |

## Limites

Esta decisão trata somente o evento `2`. O evento histórico `1` não foi alterado por esta reconciliação. Nenhuma regularização automática é autorizada para eventos históricos sem novo ato administrativo documentado.
