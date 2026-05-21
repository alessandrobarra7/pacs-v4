ALTER TABLE `group_permission_configs`
ADD COLUMN IF NOT EXISTS `view_financial`
  BOOLEAN NOT NULL DEFAULT FALSE
  AFTER `manage_templates`;

UPDATE `group_permission_configs`
SET `view_financial` = TRUE
WHERE `group_key` = 'responsaveisFinanceiros';

UPDATE `group_permission_configs`
SET `view_financial` = TRUE
WHERE `group_key` = 'adminsMaster';
