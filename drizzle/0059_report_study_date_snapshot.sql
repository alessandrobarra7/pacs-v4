ALTER TABLE reports
  ADD COLUMN study_date_snapshot DATE NULL AFTER previousVersionId;
