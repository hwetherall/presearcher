-- Update the PostgreSQL wrapper function to call research-worker-v2
CREATE OR REPLACE FUNCTION trigger_research_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    response_status integer;
    response_content text;
BEGIN
    -- Get environment variables (these need to be set in your Supabase project)
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);
    
    -- Fallback to hardcoded values if settings are not available
    -- Note: Replace these with your actual Supabase URL in production
    IF supabase_url IS NULL OR supabase_url = '' THEN
        supabase_url := 'http://host.docker.internal:54321';  -- Use Docker's internal host address
    END IF;
    
    IF service_role_key IS NULL OR service_role_key = '' THEN
        -- Use default local development service role key
        -- In production, this should be configured as a database setting
        service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
    END IF;

    -- Make HTTP POST request to the research-worker-v2 Edge Function
    SELECT 
        status,
        content
    INTO 
        response_status,
        response_content
    FROM extensions.http((
        'POST',
        supabase_url || '/functions/v1/research-worker-v2',
        ARRAY[
            extensions.http_header('Authorization', 'Bearer ' || service_role_key),
            extensions.http_header('Content-Type', 'application/json')
        ],
        'application/json',
        '{}'
    )::extensions.http_request);

    -- Log the response for debugging
    IF response_status >= 400 THEN
        RAISE WARNING 'Research worker returned error status %: %', response_status, response_content;
    ELSE
        RAISE NOTICE 'Research worker completed with status %', response_status;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Log any errors but don't fail the cron job
        RAISE WARNING 'Error calling research worker: %', SQLERRM;
END;
$$;
