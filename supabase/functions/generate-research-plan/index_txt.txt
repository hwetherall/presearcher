// supabase/functions/generate-research-plan/index.ts

import { corsHeaders } from '../_shared/cors.ts'

const RESEARCH_PLANNER_META_PROMPT = `You are a Research Planner AI. Your only job is to read the following detailed research brief and break it down into a list of 5-7 specific, self-contained, and actionable research questions or tasks.

Each task must be a clear instruction that could be given to a junior analyst to execute as a standalone research project.

You MUST respond with ONLY a valid JSON object. The JSON object should have a single key, "research_plan", which contains an array of strings. Do not include any other text, explanations, or markdown formatting in your response.

Here is the research brief:
---
{research_brief}
---`

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse the request body
    const { research_brief } = await req.json()
    
    // Validate required input
    if (!research_brief) {
      return new Response(JSON.stringify({ error: "Missing 'research_brief' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Construct the full prompt by replacing the placeholder
    const fullPrompt = RESEARCH_PLANNER_META_PROMPT.replace('{research_brief}', research_brief)

    // Get OpenRouter API key from environment
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!openRouterApiKey) {
      throw new Error('SERVER ERROR: OPENROUTER_API_KEY was not found in the environment.')
    }

    // Make API call to OpenRouter
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: fullPrompt }],
        response_format: { "type": "json_object" }
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`OpenRouter API request failed: ${res.status} ${res.statusText} - ${errorBody}`)
    }

    // Parse the AI response
    const aiResponse = await res.json()
    const generatedContent = aiResponse.choices[0].message.content

    // Parse the JSON response from the AI
    let researchPlan
    try {
      const parsedResponse = JSON.parse(generatedContent)
      researchPlan = parsedResponse.research_plan
      
      // Validate that research_plan is an array
      if (!Array.isArray(researchPlan)) {
        throw new Error('AI response does not contain a valid research_plan array')
      }
    } catch (parseError) {
      throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`)
    }

    // Return success response with the research plan
    return new Response(JSON.stringify({ research_plan: researchPlan }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in generate-research-plan function:', error)
    
    // Return appropriate error response
    const statusCode = error.message.includes('Missing') ? 400 : 500
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: statusCode,
    })
  }
})
