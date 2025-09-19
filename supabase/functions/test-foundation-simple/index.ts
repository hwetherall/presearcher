import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Simple foundation test started')
    
    const { project_id } = await req.json()
    console.log('Received project_id:', project_id)
    
    if (!project_id) {
      return new Response(JSON.stringify({ error: "Missing 'project_id' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Test 1: Fetch project data
    console.log('Fetching project data...')
    const { data: projectData, error: projectError } = await supabaseAdminClient
      .from('projects')
      .select('chapter_template_prompt, project_context, key_documents_summary')
      .eq('id', project_id)
      .single()

    if (projectError) {
      console.error('Project fetch error:', projectError)
      return new Response(JSON.stringify({ 
        error: 'Project fetch failed',
        details: projectError 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if (!projectData) {
      console.error('No project data found')
      return new Response(JSON.stringify({ 
        error: 'Project not found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    console.log('Project data found:', projectData)

    // Test 2: Try a simple OpenRouter API call
    console.log('Testing OpenRouter API...')
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: "Say 'Hello from OpenRouter API test'" }],
      }),
    })

    console.log('OpenRouter response status:', res.status)
    
    if (!res.ok) {
      const errorBody = await res.text()
      console.error('OpenRouter API error:', errorBody)
      return new Response(JSON.stringify({ 
        error: 'OpenRouter API failed',
        status: res.status,
        details: errorBody
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const aiResponse = await res.json()
    console.log('OpenRouter success:', aiResponse.choices[0].message.content)

    // Test 3: Try creating a report
    console.log('Creating test report...')
    const { data: newReport, error: insertError } = await supabaseAdminClient
      .from('reports')
      .insert({
        project_id: project_id,
        research_brief: 'Test brief from simplified function',
        report_type: 'foundation',
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Report creation error:', insertError)
      return new Response(JSON.stringify({ 
        error: 'Report creation failed',
        details: insertError 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    console.log('Report created successfully:', newReport.id)

    return new Response(JSON.stringify({ 
      success: true,
      report_id: newReport.id,
      message: 'Simplified foundation brief test completed',
      project_data: projectData,
      ai_response: aiResponse.choices[0].message.content
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Function error:', error)
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
