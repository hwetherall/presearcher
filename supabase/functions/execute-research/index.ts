// supabase/functions/execute-research/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse the request body
    const { report_id } = await req.json()
    
    // Validate required input
    if (!report_id) {
      return new Response(JSON.stringify({ error: "Missing 'report_id' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Create a Supabase admin client
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Insert job into the jobs table
    console.log(`Queueing research job for report ID: ${report_id}`)
    const { data: jobData, error: insertError } = await supabaseAdminClient
      .from('jobs')
      .insert({
        job_type: 'execute_research',
        payload: { report_id }
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Failed to insert job:', insertError)
      throw new Error(`Failed to queue research job: ${insertError.message}`)
    }

    console.log(`Research job successfully queued with ID: ${jobData.id}`)

    // Return immediate 202 Accepted response
    return new Response(JSON.stringify({ message: "Research job successfully queued." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 202,
    })

  } catch (error) {
    console.error('Error in execute-research handler:', error)
    
    // Return appropriate error response
    const statusCode = error.message.includes('Missing') ? 400 : 500
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: statusCode,
    })
  }
})
