// supabase/functions/execute-atomic-task/index.ts

import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse the request body
    const { question } = await req.json()
    
    // Validate required input
    if (!question) {
      return new Response(JSON.stringify({ error: "Missing 'question' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Get OpenRouter API key from environment
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!openRouterApiKey) {
      throw new Error('SERVER ERROR: OPENROUTER_API_KEY was not found in the environment.')
    }

    // Make direct API call to OpenRouter with Perplexity model
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "perplexity/sonar-deep-research",
        messages: [{ role: "user", content: question }],
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`OpenRouter API request failed: ${res.status} ${res.statusText} - ${errorBody}`)
    }

    // Parse the AI response
    const aiResponse = await res.json()
    
    // Extract the report text from the response
    const reportText = aiResponse.choices[0].message.content

    if (!reportText) {
      throw new Error('No content received from AI model')
    }

    // Return success response with the report text
    return new Response(JSON.stringify({ report_text: reportText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in execute-atomic-task function:', error)
    
    // Return appropriate error response
    const statusCode = error.message.includes('Missing') ? 400 : 500
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: statusCode,
    })
  }
})
