// supabase/functions/execute-research/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Step 1: Get the report_id from the request. This tells us which brief to execute.
    const { report_id } = await req.json()
    if (!report_id) {
      return new Response(JSON.stringify({ error: "Missing 'report_id' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Step 2: Fetch the research brief from the 'reports' table.
    const { data: reportData, error: fetchError } = await supabaseAdminClient
      .from('reports')
      .select('research_brief')
      .eq('id', report_id)
      .single()

    if (fetchError) throw fetchError
    if (!reportData || !reportData.research_brief) {
      throw new Error('Report not found or research brief is empty.')
    }

    // Step 3: (Optional but good practice) Update the report status to "in_progress".
    await supabaseAdminClient
      .from('reports')
      .update({ status: 'in_progress' })
      .eq('id', report_id)

    // Step 4: Send the brief to a specialized research model via OpenRouter.
    // We'll use a Perplexity model here, as discussed in the project plan.
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "alibaba/tongyi-deepresearch-30b-a3b", // A powerful, web-connected model for research
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
    // If anything goes wrong, return an error.
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})