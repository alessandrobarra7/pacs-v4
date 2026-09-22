-- Migration 0062: Opção A do documento de requisitos
-- REQUISITOS_FUNCIONALIDADE_RESPONSAVEL_FINANCEIRO_2026-09-17 (seção 4),
-- decisão confirmada pelo Alessandro em 2026-09-20 após a revisão de
-- claude/gestao-usuarios-responsavel-financeiro pelo Manus (Bloqueio 2).
--
-- Troca a unique key de financial_responsible_users de
-- (financial_responsible_id, user_id) para (user_id) sozinho: uma conta só
-- pode ter um responsável financeiro ativo por vez, garantido pelo próprio
-- banco (não só pela camada de aplicação — o documento exige verificação
-- transacional no servidor, e uma unique key é a forma mais forte disso).
--
-- Trocar de responsável passa a ser sempre: revogar o vínculo antigo
-- (DELETE) e conceder um novo (INSERT) — nunca duas linhas simultâneas pro
-- mesmo user_id. Nenhum dado de eventos, preços, ciclos ou pagamentos é
-- afetado; esta migration só altera a tabela de vínculo usuário↔responsável.
--
-- APLICAÇÃO OBRIGATÓRIA POR SCRIPT COM PREFLIGHT:
--   DATABASE_URL=... node scripts/apply_migration_0062.mjs
-- O script recusa aplicar se já existir qualquer user_id vinculado a mais de
-- um responsável neste banco (precisaria de limpeza manual antes — decidir
-- qual vínculo prevalece — e isso não é uma decisão que um script deva tomar
-- sozinho), e valida o índice antes e depois.

ALTER TABLE `financial_responsible_users`
  DROP INDEX `uq_resp_user`;

ALTER TABLE `financial_responsible_users`
  ADD UNIQUE INDEX `uq_resp_user` (`user_id`);
