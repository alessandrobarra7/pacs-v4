-- Migration 0032: Tabela model_layouts — layout visual por unidade
-- Cada unidade pode ter no máximo um layout ativo (unit_id UNIQUE)

CREATE TABLE `model_layouts` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `unit_id`       INT NOT NULL UNIQUE,
  `header_html`   TEXT,
  `footer_html`   TEXT,
  `preferences`   JSON,
  `is_active`     BOOLEAN NOT NULL DEFAULT TRUE,
  `created_by`    INT NOT NULL,
  `createdAt`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_model_layouts_unit`
    FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_model_layouts_user`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT
);
