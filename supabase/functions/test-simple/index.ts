import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Simple test function called')
    
    // Test environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    
    console.log('Environment check:', {
      supabaseUrl: !!supabaseUrl,
      serviceKey: !!serviceKey,
      openRouterKey: !!openRouterKey
    })

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Test function working',
      env: {
        supabaseUrl: !!supabaseUrl,
        serviceKey: !!serviceKey,
        openRouterKey: !!openRouterKey
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Test function error:', error)
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
