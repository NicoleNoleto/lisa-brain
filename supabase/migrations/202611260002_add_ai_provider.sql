-- Provider usado pelo fallback síncrono da Nina.
-- Mantém brain_provider separado: ele continua controlando OpenClaw vs fallback.
ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'anthropic';

ALTER TABLE public.nina_settings
  DROP CONSTRAINT IF EXISTS nina_settings_ai_provider_check;

ALTER TABLE public.nina_settings
  ADD CONSTRAINT nina_settings_ai_provider_check
  CHECK (ai_provider IN ('anthropic', 'openai'));
