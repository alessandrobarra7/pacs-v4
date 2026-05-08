ALTER TABLE `model_layouts`
  ADD COLUMN `background_opacity` DECIMAL(3,2) NOT NULL DEFAULT 1.00
    COMMENT 'Opacidade do fundo: 0.05 a 1.00',
  ADD COLUMN `background_size` VARCHAR(30) NOT NULL DEFAULT 'cover'
    COMMENT 'CSS background-size: cover | contain | 100% 100% | 210mm 297mm';
