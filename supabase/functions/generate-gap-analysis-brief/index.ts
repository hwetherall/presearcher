// supabase/functions/generate-gap-analysis-brief/index.ts

import { corsHeaders } from '../_shared/cors.ts'

const GAP_ANALYSIS_META_PROMPT = `
You are a sharp, skeptical Principal at a private equity firm, tasked with "red-teaming" an investment memo draft. Your job is to find the holes in the analysis and create a highly targeted research plan to find the specific evidence needed to plug them.

Read the [FOUNDATION REPORT] and the [FIRST DRAFT] provided below. Identify the 3-5 most significant weaknesses in the first draft. Look for vague quantifications, unsubstantiated assertions, and missing competitive details.

Based on these weaknesses, your only job is to generate a list of 3-5 surgical, evidence-seeking research questions. Each question must be a clear, self-contained task for a research analyst.

You MUST respond with ONLY a valid JSON object. The JSON object must have a single key, "research_plan", which contains an array of these research question strings. Do not include any other text, explanations, or markdown formatting in your response.

--- [FOUNDATION REPORT] ---
{foundation_report}

--- [FIRST DRAFT] ---
{first_draft}
---
`

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { first_draft, foundation_report } = await req.json()
    
    if (!first_draft) {
      return new Response(JSON.stringify({ error: "Missing 'first_draft' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (!foundation_report) {
      return new Response(JSON.stringify({ error: "Missing 'foundation_report' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Construct the full prompt
    let fullPrompt = GAP_ANALYSIS_META_PROMPT
    fullPrompt = fullPrompt.replace('{foundation_report}', foundation_report)
    fullPrompt = fullPrompt.replace('{first_draft}', first_draft)

    // Call OpenRouter for gap analysis
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!openRouterApiKey) {
      throw new Error('SERVER ERROR: OPENROUTER_API_KEY was not found in the environment.')
    }

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
      throw new Error(`OpenRouter API request failed: ${errorBody}`)
    }

    const aiResponse = await res.json()
    const generatedPlan = aiResponse.choices[0].message.content

    // Parse the JSON response to ensure it's valid
    let researchPlan
    try {
      researchPlan = JSON.parse(generatedPlan)
    } catch (parseError) {
      throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`)
    }

    // Validate the response structure
    if (!researchPlan.research_plan || !Array.isArray(researchPlan.research_plan)) {
      throw new Error('AI response does not contain a valid research_plan array')
    }

    // Return the research plan directly
    return new Response(JSON.stringify(researchPlan), {
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
