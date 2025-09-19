import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Testing OpenRouter API directly...')
    
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    console.log('API Key exists:', !!openRouterApiKey)
    console.log('API Key first 10 chars:', openRouterApiKey?.substring(0, 10))
    
    if (!openRouterApiKey) {
      return new Response(JSON.stringify({ 
        success: false,
        error_type: 'missing_key',
        error: 'OPENROUTER_API_KEY not found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Return 200 so we can see the error details
      })
    }

    console.log('Making OpenRouter API call...')
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ 
          role: "user", 
          content: "Please respond with exactly: 'OpenRouter API test successful'" 
        }],
      }),
    })

    console.log('OpenRouter response status:', res.status)
    console.log('OpenRouter response headers:', Object.fromEntries(res.headers.entries()))

    if (!res.ok) {
      const errorBody = await res.text()
      console.error('OpenRouter API error response:', errorBody)
      return new Response(JSON.stringify({ 
        success: false,
        error_type: 'api_error',
        error: 'OpenRouter API failed',
        status: res.status,
        statusText: res.statusText,
        body: errorBody,
        headers: Object.fromEntries(res.headers.entries())
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Return 200 so we can see the error details
      })
    }

    const aiResponse = await res.json()
    console.log('OpenRouter success response:', aiResponse)

    return new Response(JSON.stringify({ 
      success: true,
      message: 'OpenRouter API test completed successfully',
      response: aiResponse.choices[0].message.content,
      model_used: aiResponse.model,
      usage: aiResponse.usage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Test OpenRouter error:', error)
    
    // Return detailed error information instead of 500
    return new Response(JSON.stringify({ 
      success: false,
      error_type: 'catch_block',
      error: error.message,
      stack: error.stack,
      name: error.name,
      toString: error.toString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Return 200 so we can see the error details
    })
  }
})
