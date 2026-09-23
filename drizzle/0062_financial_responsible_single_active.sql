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
-- afetado, só a tabela de vínculo usuário-responsável.
--
-- FIX (2026-09-23, revisão Manus — bloqueio crítico 1): a versão anterior
-- desta migration tinha DROP INDEX e ADD UNIQUE INDEX como duas instruções
-- ALTER TABLE separadas, e o aplicador fazia parsing manual por ponto e
-- vírgula — que quebrava porque este próprio arquivo tem ponto e vírgula
-- dentro dos comentários explicativos (ex.: a frase anterior). Corrigido
-- combinando as duas operações num único ALTER TABLE atômico (uma só
-- instrução, um só ponto e vírgula de verdade no arquivo todo) e o
-- aplicador agora envia o arquivo inteiro para o MySQL sem parsing manual,
-- mesma técnica já usada em apply_migration_0060.mjs.
--
-- APLICAÇÃO OBRIGATÓRIA POR SCRIPT COM PREFLIGHT:
--   DATABASE_URL=... node scripts/apply_migration_0062.mjs
-- O script recusa aplicar se já existir qualquer user_id vinculado a mais de
-- um responsável neste banco (precisaria de limpeza manual antes, decidir
-- qual vínculo prevalece, e isso não é uma decisão que um script deva tomar
-- sozinho), e valida o índice antes e depois.

ALTER TABLE `financial_responsible_users`
  DROP INDEX `uq_resp_user`,
  ADD UNIQUE INDEX `uq_resp_user` (`user_id`);
