ALTER TABLE exam_legend_pacs_mappings
  ADD COLUMN matches_empty_description TINYINT(1) NOT NULL DEFAULT 0 AFTER pacs_description;

ALTER TABLE study_exam_legend_selections
  ADD COLUMN selection_source ENUM('manual', 'pacs_auto') NOT NULL DEFAULT 'manual' AFTER selected_by;

CREATE TABLE pacs_mapping_decisions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  study_instance_uid VARCHAR(128) NOT NULL,
  unit_id INT NOT NULL,
  mapping_id INT NOT NULL,
  exam_legend_id INT NOT NULL,
  raw_description VARCHAR(255) NOT NULL DEFAULT '',
  decision ENUM('applied', 'blocked_selection', 'blocked_report', 'blocked_unavailable', 'blocked_no_documents', 'failed') NOT NULL,
  reason VARCHAR(500) NULL,
  decided_by INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pacs_mapping_decision_study_unit_mapping (study_instance_uid, unit_id, mapping_id),
  KEY idx_pacs_mapping_decisions_unit_decision (unit_id, decision)
);
