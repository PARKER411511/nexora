-- Reviewed installer; run manually by the database owner only after applying
-- 20261006_operations.sql and confirming the schedule and retention policy.
-- This file intentionally performs no action during application deploys.
-- It stores a private logical snapshot in the database; the encrypted
-- offsite artifact remains the GitHub workflow's ciphertext-only output.

create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid)
from cron.job
where jobname in ('nexora-review-reminders-hourly', 'nexora-application-snapshot-daily');

select cron.schedule(
  'nexora-review-reminders-hourly',
  '0 * * * *',
  $$select private.nexora_ops_run_review_reminders();$$
);

select cron.schedule(
  'nexora-application-snapshot-daily',
  '20 2 * * *',
  $$select private.nexora_ops_run_daily_snapshot(5000, 14);$$
);

-- Review after installation:
-- select jobid, jobname, schedule, active from cron.job where jobname like 'nexora-%';
-- select id, sha256, source, created_at from private.operations_snapshots order by created_at desc limit 14;
