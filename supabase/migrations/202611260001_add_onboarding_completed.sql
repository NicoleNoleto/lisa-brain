-- Add onboarding_completed flag to nina_settings
ALTER TABLE nina_settings
ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
