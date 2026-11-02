-- Imported accounts were written as not day-to-day, so imported spending never
-- reached the dashboard. They are a day old and the import gave no way to choose,
-- so repair them all. The Accounts screen can still exclude one.
UPDATE `accounts` SET `is_everyday` = true WHERE `institution_id` IN (SELECT `id` FROM `institutions` WHERE `source` = 'import');
