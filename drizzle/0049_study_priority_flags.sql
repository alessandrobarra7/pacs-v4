ALTER TABLE users
  MODIFY COLUMN role ENUM('admin_master', 'unit_admin', 'medico', 'viewer', 'operador', 'atendente', 'responsavel_financeiro') NOT NULL DEFAULT 'viewer';

ALTER TABLE user_unit_permissions
  MODIFY COLUMN group_key ENUM('responsaveisFinanceiros', 'medicos', 'operadores', 'atendentes', 'visualizadores', 'administradoresUnidade', 'adminsMaster', 'outros') DEFAULT 'outros';

ALTER TABLE audit_log
  MODIFY COLUMN action ENUM('LOGIN', 'LOGOUT', 'VIEW_STUDY', 'OPEN_VIEWER', 'CREATE_REPORT', 'UPDATE_REPORT', 'SIGN_REPORT', 'DELETE_REPORT', 'REVISE_REPORT', 'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'ACTIVATE_USER', 'DEACTIVATE_USER', 'CREATE_UNIT', 'UPDATE_UNIT', 'DELETE_UNIT', 'PACS_QUERY', 'PACS_DOWNLOAD', 'CREATE_ANAMNESIS', 'EDIT_STUDY_METADATA', 'SET_STUDY_PRIORITY', 'UPDATE_STUDY_PRIORITY', 'CLEAR_STUDY_PRIORITY', 'RESET_DOCTOR_BILLING', 'CREATE_LAYOUT', 'UPDATE_LAYOUT', 'DELETE_LAYOUT', 'BILLING_EVENT_FAILED', 'FINANCIAL_ENABLED', 'FINANCIAL_DISABLED', 'BILLING_EVENT_WITHOUT_FINANCIAL_ENABLED', 'BILLING_EVENT_CANCELLED') NOT NULL;

CREATE TABLE IF NOT EXISTS study_priority_flags (
  id INT NOT NULL AUTO_INCREMENT,
  study_instance_uid VARCHAR(128) NOT NULL,
  unit_id INT NOT NULL,
  priority ENUM('urgencia', 'prioridade_maxima') NOT NULL,
  marked_by_user_id INT NOT NULL,
  marked_by_name VARCHAR(255) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY study_priority_flags_uid_unit_unique (study_instance_uid, unit_id),
  KEY study_priority_flags_unit_priority_idx (unit_id, priority)
);
