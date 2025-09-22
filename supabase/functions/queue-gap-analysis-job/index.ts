// supabase/functions/queue-gap-analysis-job/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { project_id, foundation_report, first_draft } = await req.json()
    
    // Validate required inputs
    if (!project_id) {
      return new Response(JSON.stringify({ error: "Missing 'project_id' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (!foundation_report) {
      return new Response(JSON.stringify({ error: "Missing 'foundation_report' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (!first_draft) {
      return new Response(JSON.stringify({ error: "Missing 'first_draft' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Create a Supabase client with the service_role key
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Step A: Create a new "Gap Analysis" report record
    const { data: newReport, error: reportError } = await supabaseAdminClient
      .from('reports')
      .insert({
        project_id: project_id,
        report_type: 'gap_analysis',
        status: 'pending',
      })
      .select('id')
      .single()

    if (reportError) {
      throw new Error(`Failed to create gap analysis report: ${reportError.message}`)
    }

    // Step B: Queue the job
    const jobPayload = {
      report_id: newReport.id,
      foundation_report: foundation_report,
      first_draft: first_draft
    }

    const { error: jobError } = await supabaseAdminClient
      .from('jobs')
      .insert({
        job_type: 'execute_gap_analysis',
        payload: jobPayload
      })

    if (jobError) {
      throw new Error(`Failed to queue gap analysis job: ${jobError.message}`)
    }

    // Return success response with 202 Accepted
    return new Response(JSON.stringify({
      message: "Gap analysis job successfully queued.",
      report_id: newReport.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 202,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
