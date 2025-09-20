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

    // Helper function to make API call with timeout
    const makeApiCall = async (model: string, timeout: number) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      try {
        console.log(`Attempting research with model: ${model}`)
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: question }],
          }),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!res.ok) {
          const errorBody = await res.text()
          throw new Error(`OpenRouter API request failed: ${res.status} ${res.statusText} - ${errorBody}`)
        }

        const aiResponse = await res.json()
        const reportText = aiResponse.choices[0].message.content

        if (!reportText) {
          throw new Error('No content received from AI model')
        }

        console.log(`Successfully completed research with model: ${model}`)
        return reportText
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    }

    // Try deep research model first, then fallback to faster model
    let reportText: string
    
    try {
      // First attempt: Deep research model with 120 second timeout
      reportText = await makeApiCall("perplexity/sonar-deep-research", 120000)
    } catch (error) {
      console.log(`Deep research model failed: ${error.message}`)
      console.log('Falling back to faster research model...')
      
      try {
        // Fallback: Faster research model with 60 second timeout
        reportText = await makeApiCall("perplexity/sonar-pro", 60000)
      } catch (fallbackError) {
        console.log(`Fallback model also failed: ${fallbackError.message}`)
        console.log('Trying final fallback to general model...')
        
        // Final fallback: General purpose model with shorter timeout
        reportText = await makeApiCall("google/gemini-2.5-flash", 30000)
      }
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
