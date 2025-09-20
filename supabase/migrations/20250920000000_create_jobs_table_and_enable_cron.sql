-- Enable pg_cron extension for PostgreSQL job scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Create jobs table for queuing long-running AI research tasks
CREATE TABLE jobs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,
    job_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    last_ran_at timestamptz,
    error_log text
);

-- Add check constraint to ensure valid status values
ALTER TABLE jobs 
ADD CONSTRAINT jobs_status_check 
CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'));

-- Create index on status for efficient querying of pending jobs
CREATE INDEX idx_jobs_status ON jobs(status);

-- Create index on job_type for filtering by job type
CREATE INDEX idx_jobs_type ON jobs(job_type);

-- Create index on created_at for chronological ordering
CREATE INDEX idx_jobs_created_at ON jobs(created_at);
