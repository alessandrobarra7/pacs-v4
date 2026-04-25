-- Migration 0031: Popular user_unit_permissions para usuários legados
-- Resolve o problema de transição entre users.unit_id (legado) e user_unit_permissions (novo)
-- Garante que todos os usuários com unit_id configurado tenham registros de permissão correspondentes

INSERT INTO user_unit_permissions
(user_id, unit_id, view_studies, edit_reports, view_anamnesis, edit_anamnesis, edit_exam_legend, print_reports, manage_templates, created_at, updated_at)
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
  NOW() AS created_at,
  NOW() AS updated_at
FROM users u
LEFT JOIN user_unit_permissions p
  ON p.user_id = u.id AND p.unit_id = u.unit_id
WHERE u.unit_id IS NOT NULL
  AND p.id IS NULL;
