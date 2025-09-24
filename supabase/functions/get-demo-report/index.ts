// supabase/functions/get-demo-report/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { report_type } = await req.json()

    if (!report_type) {
      return new Response(JSON.stringify({ error: "Missing 'report_type' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabaseAdminClient
      .from('demo_reports')
      .select('content')
      .eq('report_type', report_type)
      .single()

    if (error) {
      throw new Error(`Failed to fetch demo report: ${error.message}`)
    }

    if (!data) {
        return new Response(JSON.stringify({ error: `No demo report found for type: ${report_type}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
        })
    }

    return new Response(JSON.stringify({ report_content: data.content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
