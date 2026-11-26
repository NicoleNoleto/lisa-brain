-- Migration: Setup webhook healthcheck cronjob
-- Description: Run Evolution API webhook health check every 30 minutes
-- This ensures webhooks are re-registered if Evolution server restarts

-- Check if pg_cron extension is available
-- If not available, add it:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop existing cron job if it exists
SELECT cron.unschedule('healthcheck-evolution-webhooks')
  WHERE jobid IS NOT NULL;

-- Create new cron job to run healthcheck every 30 minutes
-- Schedule: "*/30 * * * *" = every 30 minutes
-- This will invoke the Supabase Edge Function via HTTP
SELECT cron.schedule(
  'healthcheck-evolution-webhooks',
  '*/30 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://' || current_setting('app.settings.supabase_url') || '/functions/v1/healthcheck-evolution-webhook',
      headers:=jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Verify the job was created
SELECT
  jobid,
  schedule_name,
  schedule,
  command
FROM cron.job
WHERE schedule_name = 'healthcheck-evolution-webhooks';

-- Note: You may need to run this migration after ensuring:
-- 1. pg_cron extension is enabled in Supabase
-- 2. pg_net extension is enabled in Supabase
-- 3. Environment variables are properly set

-- To manually trigger the healthcheck for testing:
-- SELECT net.http_post(
--   url:='https://your-supabase-url/functions/v1/healthcheck-evolution-webhook',
--   headers:=jsonb_build_object(
--     'Authorization', 'Bearer your-service-role-key',
--     'Content-Type', 'application/json'
--   ),
--   body:='{}'::jsonb
-- );
