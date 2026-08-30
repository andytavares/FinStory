-- Credit cards were written as not-day-to-day by an earlier `type = 'depository'`
-- check. For anyone whose spending runs through a card that emptied the dashboard,
-- so repair the rows the old rule could only ever have got wrong. Deliberate
-- user exclusions live on savings and investment accounts, which this leaves alone.
UPDATE `accounts` SET `is_everyday` = true WHERE lower(`type`) = 'credit';
