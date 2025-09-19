-- Add a new column to the 'projects' table to store the foreign key.
-- We make it nullable at first to avoid issues with existing data.
ALTER TABLE public.projects
ADD COLUMN chapter_template_id uuid NULL;

-- Now, add the foreign key constraint to link it to our new table.
-- This ensures data integrity.
ALTER TABLE public.projects
ADD CONSTRAINT projects_chapter_template_id_fkey
FOREIGN KEY (chapter_template_id) REFERENCES public.chapter_templates(id);

-- (Optional but Recommended) Now that the link is established,
-- we can make the column required for all new projects.
ALTER TABLE public.projects
ALTER COLUMN chapter_template_id SET NOT NULL;

-- Finally, we can safely remove the old, redundant column.
ALTER TABLE public.projects
DROP COLUMN chapter_template_prompt;