CREATE TABLE atomic_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id INTEGER REFERENCES jobs(id),
  report_id UUID REFERENCES reports(id),
  task_index INTEGER NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
