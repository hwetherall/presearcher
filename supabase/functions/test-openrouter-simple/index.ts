import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    
    if (!openRouterApiKey) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'OPENROUTER_API_KEY not found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Test with a free model
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.2-3b-instruct:free",
        messages: [{ role: "user", content: "Say 'API test successful'" }],
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      return new Response(JSON.stringify({ 
        success: false,
        error: 'API call failed',
        status: res.status,
        body: errorBody
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const aiResponse = await res.json()
    return new Response(JSON.stringify({ 
      success: true,
      response: aiResponse.choices[0].message.content
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
