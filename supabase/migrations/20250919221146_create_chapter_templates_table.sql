-- supabase/migrations/xxxxxxxx_create_chapter_templates_table.sql

CREATE TABLE public.chapter_templates (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL UNIQUE,
  chapter_prompt text NOT NULL
);

-- Optional: Add a comment to describe the table's purpose
COMMENT ON TABLE public.chapter_templates IS 'Stores reusable prompts for different research chapters.';