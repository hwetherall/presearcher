-- Migration to support custom prompts alongside chapter templates
-- Allow chapter_template_id to be nullable for custom prompts
ALTER TABLE public.projects
ALTER COLUMN chapter_template_id DROP NOT NULL;

-- Add a custom_prompt field to store user-defined prompts
ALTER TABLE public.projects
ADD COLUMN custom_prompt text NULL;

-- Add a constraint to ensure either chapter_template_id OR custom_prompt is provided
ALTER TABLE public.projects
ADD CONSTRAINT projects_prompt_check
CHECK (
  (chapter_template_id IS NOT NULL AND custom_prompt IS NULL) OR
  (chapter_template_id IS NULL AND custom_prompt IS NOT NULL)
);

-- Add a comment to explain the new constraint
COMMENT ON CONSTRAINT projects_prompt_check ON public.projects IS 'Ensures either a chapter template or custom prompt is provided, but not both.';
