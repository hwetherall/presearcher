// supabase/functions/execute-research/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Execute research function started')
    
    // Step 1: Get the report_id and model from the request
    const { report_id, model } = await req.json()
    console.log('Received parameters:', { report_id, model })
    
    if (!report_id) {
      return new Response(JSON.stringify({ error: "Missing 'report_id' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    
    // Use the provided model or default to alibaba/tongyi-deepresearch-30b-a3b
    const selectedModel = model || 'alibaba/tongyi-deepresearch-30b-a3b'
    console.log('Using model:', selectedModel)

    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Step 2: Fetch the research brief from the 'reports' table.
    console.log('Fetching research brief from database...')
    const { data: reportData, error: fetchError } = await supabaseAdminClient
      .from('reports')
      .select('research_brief')
      .eq('id', report_id)
      .single()

    if (fetchError) {
      console.error('Database fetch error:', fetchError)
      throw fetchError
    }
    if (!reportData || !reportData.research_brief) {
      console.error('No report data or brief found for ID:', report_id)
      throw new Error('Report not found or research brief is empty.')
    }
    console.log('Research brief fetched successfully, length:', reportData.research_brief.length)

    // Step 3: (Optional but good practice) Update the report status to "in_progress".
    await supabaseAdminClient
      .from('reports')
      .update({ status: 'in_progress' })
      .eq('id', report_id)

    // Step 4: Send the brief to a specialized research model via OpenRouter.
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel, // Use the model selected by the user
        messages: [{ role: "user", content: reportData.research_brief }],
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`OpenRouter API request failed: ${errorBody}`)
    }

    const aiResponse = await res.json()
    const final_report = aiResponse.choices[0].message.content

    // Step 5: Save the final report and update the status to "complete".
    const { data: updatedReport, error: updateError } = await supabaseAdminClient
      .from('reports')
      .update({ final_report: final_report, status: 'complete' })
      .eq('id', report_id)
      .select() // Ask Supabase to return the updated row
      .single()

    if (updateError) throw updateError

    // Step 6: Return the completed report as a success response.
    return new Response(JSON.stringify(updatedReport), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // Enhanced error logging
    console.error('Execute research error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})