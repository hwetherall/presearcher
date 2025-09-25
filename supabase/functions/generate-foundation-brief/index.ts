// supabase/functions/generate-foundation-brief/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const FOUNDATION_META_PROMPT = `
**CONTEXT:**
You are a world-class Managing Director at a top-tier strategy consulting firm, kicking off a critical workstream for an investment memo. Your task is to design a comprehensive research brief for your junior analyst team (which is an AI Research Engine).

This brief must be so clear, specific, and well-structured that it leaves no room for ambiguity and ensures the final research output is decision-grade.

**INPUTS YOU WILL BE GIVEN:**
1.  **{Chapter_Template_Prompt}:** The high-level prompt for the chapter we are building. This defines the overall structure and goals.
2.  **{Project_Context}:** A summary of the project's background, goals, and any specific client requirements (e.g., budgets, timelines).
3.  **{Key_Documents_Summary}:** A brief summary of the key documents available in the client's dataroom.

**YOUR TASK:**
Based on the provided inputs, generate a complete and detailed research prompt (a "brief") for the AI Research Engine. This brief must adhere to the following principles:

1.  **Assign a Persona & Objective:** Start the brief by assigning a clear role to the AI Research Engine (e.g., "You are a market intelligence analyst...").
2.  **Define Explicit Guardrails:** The brief must include sections for \`Scope\`, \`Timeframe\` (default to 2023-2025), and a \`Source Quality Hierarchy\` (prioritizing official reports, regulatory filings, and reputable industry analysis over general news).
3.  **Create Structured Research Pillars:** Analyze the {Chapter_Template_Prompt} and {Project_Context} to create 5-7 logical research pillars. These pillars should become the main sections of the research brief.
4.  **Formulate Evidence-Seeking Questions:** For each pillar, formulate 3-5 specific, evidence-seeking questions that hunt for verifiable **nouns and numbers** (e.g., "What are the *specific names* of competitor products?", "What were the *contract values*?", "What is the *market size in USD*?").
5.  **Adopt a Skeptical Stance:** Ensure some questions are designed to find "negative space"—gaps, weaknesses, failed attempts, and customer complaints about existing solutions.
6.  **Prescribe the Output Structure:** The brief must end with a section detailing the required \`Output Requirements\`. Instruct the AI Research Engine to structure its final report with clear Markdown headers for each research pillar and to present tabular data using Markdown tables. It must also include a clear instruction on how to handle missing information (e.g., "If you cannot find specific data, you must explicitly state 'No verifiable public evidence was found'").

**CRITICAL: SOURCE CITATION REQUIREMENTS**
The brief MUST include explicit instructions for the AI Research Engine to:
- Provide complete, working URLs for every fact, statistic, and claim
- Use inline citations with full URLs: [Source Name](https://complete-url.com)
- NEVER use placeholder citations like [1], [2], etc.
- Include a comprehensive "Bibliography" section with ALL sources at the end
- Preserve and cite ALL sources found during research - do not omit any URLs

**WHAT NOT TO DO:**
*   Do not write the research report yourself. You are only writing the *prompt* for the research AI.
*   Do not ask vague questions like "What is the market?" Instead, ask "What was the total addressable market size in USD for workforce analytics in 2024, according to Gartner or Forrester?"

**BEGIN. Generate the research brief now.**
`

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Function started, parsing request body...')
    const { project_id } = await req.json()
    console.log('Received project_id:', project_id)
    
    if (!project_id) {
      return new Response(JSON.stringify({ error: "Missing 'project_id' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Create a Supabase client with the service_role key
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch project data with chapter template via join (left join for custom prompts)
    console.log('Fetching project data from database...')
    const { data: projectData, error: projectError } = await supabaseAdminClient
      .from('projects')
      .select(`
        project_context,
        key_documents_summary,
        custom_prompt,
        chapter_templates ( chapter_prompt )
      `)
      .eq('id', project_id)
      .single()

    if (projectError) {
      console.error('Project fetch error:', projectError)
      throw projectError
    }
    if (!projectData) {
      console.error('No project data found for ID:', project_id)
      throw new Error('Project not found.')
    }
    console.log('Project data fetched successfully')

    // Determine the chapter prompt to use (template or custom)
    let chapterPrompt = ''
    if (projectData.custom_prompt) {
      // Use custom prompt directly
      chapterPrompt = projectData.custom_prompt
      console.log('Using custom prompt for project')
    } else if (projectData.chapter_templates && 'chapter_prompt' in projectData.chapter_templates) {
      // Use template prompt
      chapterPrompt = (projectData.chapter_templates as any).chapter_prompt
      console.log('Using template prompt for project')
    } else {
      chapterPrompt = 'No chapter template or custom prompt provided.'
      console.warn('No prompt found for project - using fallback')
    }

    // Construct the full prompt
    let fullPrompt = FOUNDATION_META_PROMPT
    fullPrompt = fullPrompt.replace('{Chapter_Template_Prompt}', chapterPrompt)
    fullPrompt = fullPrompt.replace('{Project_Context}', projectData.project_context)
    fullPrompt = fullPrompt.replace('{Key_Documents_Summary}', projectData.key_documents_summary || 'No documents provided.')

    // Get OpenRouter API key
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!openRouterApiKey) {
      throw new Error('SERVER ERROR: OPENROUTER_API_KEY was not found in the environment.')
    }

    console.log('OpenRouter API key found, making request...')

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // CORRECTED MODEL NAME: Using the official ID for Gemini 2.5 Pro on OpenRouter
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: fullPrompt }],
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`OpenRouter API request failed: ${errorBody}`)
    }

    const aiResponse = await res.json()
    const generatedBrief = aiResponse.choices[0].message.content

    // Insert the new report
    const { data: newReport, error: insertError } = await supabaseAdminClient
      .from('reports')
      .insert({
        project_id: project_id,
        research_brief: generatedBrief,
        report_type: 'foundation',
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError) throw insertError

    // Return success
    return new Response(JSON.stringify({ report_id: newReport.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Function error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})