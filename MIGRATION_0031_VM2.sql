-- ============================================================================
-- MIGRATION 0031: Popular user_unit_permissions para usuários legados
-- ============================================================================
-- Descrição: Sincroniza usuários com users.unit_id legado para ter registros
--            em user_unit_permissions com permissões apropriadas por role
-- Segurança: Idempotente - pode ser rodada múltiplas vezes sem duplicatas
-- Data: 2026-04-25
-- ============================================================================

-- ============================================================================
-- PASSO 1: VERIFICAÇÃO ANTES DA MIGRATION
-- ============================================================================
SELECT '=== ANTES DA MIGRATION ===' AS status;

-- Contar usuários com unit_id legado mas SEM permissão granular
SELECT 
  'Usuários órfãos (unit_id mas sem permissão)' AS problema,
  COUNT(*) AS total
FROM users u
LEFT JOIN user_unit_permissions p 
  ON p.user_id = u.id AND p.unit_id = u.unit_id
WHERE u.unit_id IS NOT NULL 
  AND p.id IS NULL;

-- Listar usuários que serão sincronizados
SELECT 
  u.id,
  u.username,
  u.name,
  u.role,
  u.unit_id,
  COUNT(p.id) AS permissoes_existentes
FROM users u
LEFT JOIN user_unit_permissions p ON p.user_id = u.id
WHERE u.unit_id IS NOT NULL
GROUP BY u.id, u.username, u.name, u.role, u.unit_id
ORDER BY u.id;

-- ============================================================================
-- PASSO 2: EXECUTAR MIGRATION
-- ============================================================================
SELECT '=== EXECUTANDO MIGRATION ===' AS status;

INSERT INTO user_unit_permissions
(user_id, unit_id, view_studies, edit_reports, view_anamnesis, edit_anamnesis, edit_exam_legend, print_reports, manage_templates, group_key, created_at, updated_at)
SELECT
  u.id,
  u.unit_id,
  CASE WHEN u.role IN ('admin_master','unit_admin','medico','operador','viewer') THEN 1 ELSE 0 END AS view_studies,
  CASE WHEN u.role IN ('admin_master','medico') THEN 1 ELSE 0 END AS edit_reports,
  CASE WHEN u.role IN ('admin_master','medico','operador') THEN 1 ELSE 0 END AS view_anamnesis,
  CASE WHEN u.role IN ('admin_master','medico','operador') THEN 1 ELSE 0 END AS edit_anamnesis,
  CASE WHEN u.role IN ('admin_master','medico','operador') THEN 1 ELSE 0 END AS edit_exam_legend,
  CASE WHEN u.role IN ('admin_master','unit_admin','medico','viewer') THEN 1 ELSE 0 END AS print_reports,
  CASE WHEN u.role IN ('admin_master','medico') THEN 1 ELSE 0 END AS manage_templates,
  CASE 
    WHEN u.role = 'admin_master' THEN 'adminsMaster'
    WHEN u.role = 'unit_admin' THEN 'administradoresUnidade'
    WHEN u.role = 'medico' THEN 'medicos'
    WHEN u.role = 'operador' THEN 'operadores'
    WHEN u.role = 'viewer' THEN 'visualizadores'
    WHEN u.role = 'responsavel_financeiro' THEN 'responsaveisFinanceiros'
    ELSE 'unknown'
  END AS group_key,
  NOW() AS created_at,
  NOW() AS updated_at
FROM users u
LEFT JOIN user_unit_permissions p
  ON p.user_id = u.id AND p.unit_id = u.unit_id
WHERE u.unit_id IS NOT NULL
  AND p.id IS NULL;

SELECT '✅ Migration executada com sucesso!' AS status;

-- ============================================================================
-- PASSO 3: VERIFICAÇÃO DEPOIS DA MIGRATION
-- ============================================================================
SELECT '=== DEPOIS DA MIGRATION ===' AS status;

-- Verificar se ainda há usuários órfãos
SELECT 
  'Usuários órfãos (unit_id mas sem permissão)' AS problema,
  COUNT(*) AS total
FROM users u
LEFT JOIN user_unit_permissions p 
  ON p.user_id = u.id AND p.unit_id = u.unit_id
WHERE u.unit_id IS NOT NULL 
  AND p.id IS NULL;

-- Listar todos os usuários com suas permissões
SELECT 
  u.id,
  u.username,
  u.name,
  u.role,
  u.unit_id,
  COUNT(p.id) AS permissoes_totais,
  GROUP_CONCAT(DISTINCT p.group_key) AS groups
FROM users u
LEFT JOIN user_unit_permissions p ON p.user_id = u.id
GROUP BY u.id, u.username, u.name, u.role, u.unit_id
ORDER BY u.id;

-- Matriz de permissões por role
SELECT 
  u.role,
  COUNT(DISTINCT u.id) AS usuarios,
  COUNT(DISTINCT p.id) AS vinculos_permissao,
  SUM(p.view_studies) AS ver_exames,
  SUM(p.edit_reports) AS editar_laudos,
  SUM(p.view_anamnesis) AS ver_anamnese,
  SUM(p.edit_anamnesis) AS editar_anamnese,
  SUM(p.edit_exam_legend) AS editar_legenda,
  SUM(p.print_reports) AS imprimir,
  SUM(p.manage_templates) AS modelos
FROM users u
LEFT JOIN user_unit_permissions p ON p.user_id = u.id
GROUP BY u.role
ORDER BY u.role;

SELECT '✅ Verificação concluída!' AS status;

-- ============================================================================
-- PASSO 4: VALIDAÇÃO DE INTEGRIDADE
-- ============================================================================
SELECT '=== VALIDAÇÃO DE INTEGRIDADE ===' AS status;

-- Verificar permissões órfãs (usuário ou unidade deletados)
SELECT 
  'Permissões órfãs' AS problema,
  COUNT(*) AS total
FROM user_unit_permissions p
LEFT JOIN users u ON u.id = p.user_id
LEFT JOIN units un ON un.id = p.unit_id
WHERE u.id IS NULL OR un.id IS NULL;

-- Verificar coerência role vs group_key
SELECT 
  'Role vs group_key mismatch' AS problema,
  COUNT(*) AS total
FROM user_unit_permissions p
JOIN users u ON u.id = p.user_id
WHERE 
  (u.role = 'medico' AND p.group_key <> 'medicos')
  OR (u.role = 'operador' AND p.group_key <> 'operadores')
  OR (u.role = 'viewer' AND p.group_key <> 'visualizadores')
  OR (u.role = 'unit_admin' AND p.group_key <> 'administradoresUnidade')
  OR (u.role = 'admin_master' AND p.group_key <> 'adminsMaster')
  OR (u.role = 'responsavel_financeiro' AND p.group_key <> 'responsaveisFinanceiros');

SELECT '✅ Validação concluída!' AS status;
