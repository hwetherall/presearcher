// supabase/functions/generate-research-plan/index.ts

import { corsHeaders } from '../_shared/cors.ts'

const RESEARCH_PLANNER_META_PROMPT = `You are a Research Planner AI. Your only job is to read the following comprehensive inputs and break them down into a list of 5-7 specific, self-contained, and actionable research tasks.

Each task must be a clear instruction that could be given to a junior analyst to execute as a standalone research project using a tool like Perplexity Pro. The tasks should be designed to gather the specific evidence needed to write the chapter described in the Chapter Prompt.

You MUST respond with ONLY a valid JSON object. The JSON object should have a single key, "research_plan", which contains an array of strings. Do not include any other text, explanations, or markdown formatting in your response.

Here are the inputs:

--- [CHAPTER PROMPT] ---
{chapter_prompt}

--- [PROJECT CONTEXT] ---
{project_context}

--- [DOCUMENTS SUMMARY] ---
{documents_summary}
---`

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse the request body
    const { project_context, documents_summary, chapter_prompt } = await req.json()
    
    // Validate required inputs
    if (!project_context) {
      return new Response(JSON.stringify({ error: "Missing 'project_context' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    
    if (!documents_summary) {
      return new Response(JSON.stringify({ error: "Missing 'documents_summary' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    
    if (!chapter_prompt) {
      return new Response(JSON.stringify({ error: "Missing 'chapter_prompt' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Construct the full prompt by replacing the placeholders
    const fullPrompt = RESEARCH_PLANNER_META_PROMPT
      .replace('{chapter_prompt}', chapter_prompt)
      .replace('{project_context}', project_context)
      .replace('{documents_summary}', documents_summary)

    // Get OpenRouter API key from environment
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!openRouterApiKey) {
      throw new Error('SERVER ERROR: OPENROUTER_API_KEY was not found in the environment.')
    }

    // Make API call to OpenRouter with retry logic
    let aiResponse
    let generatedContent
    const maxRetries = 3
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`OpenRouter API attempt ${attempt}/${maxRetries}`)
        
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
          lastError = new Error(`OpenRouter API request failed (attempt ${attempt}): ${res.status} ${res.statusText} - ${errorBody}`)
          console.log(`Attempt ${attempt} failed:`, lastError.message)
          
          // If this is not the last attempt, wait before retrying
          if (attempt < maxRetries) {
            const delay = attempt * 1000 // 1s, 2s, 3s delays
            console.log(`Waiting ${delay}ms before retry...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
          throw lastError
        }

        // Parse the AI response
        aiResponse = await res.json()
        generatedContent = aiResponse.choices[0].message.content
        console.log(`OpenRouter API call succeeded on attempt ${attempt}`)
        break

      } catch (error) {
        lastError = error
        console.log(`Attempt ${attempt} failed with error:`, error.message)
        
        if (attempt < maxRetries) {
          const delay = attempt * 1000
          console.log(`Waiting ${delay}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw lastError
      }
    }

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
