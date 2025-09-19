-- Create the 'projects' table to store high-level project information
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  chapter_template_prompt text NOT NULL,
  project_context text NOT NULL,
  key_documents_summary text NULL
);

-- Create the 'reports' table to store the generated briefs and final reports
CREATE TABLE public.reports (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  report_type text NOT NULL,
  research_brief text NULL,
  final_report text NULL,
  status text NOT NULL DEFAULT 'pending'::text
);