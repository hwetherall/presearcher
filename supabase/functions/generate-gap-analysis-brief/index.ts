// supabase/functions/generate-gap-analysis-brief/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const GAP_ANALYSIS_META_PROMPT = `
**CONTEXT:**
You are a Managing Director at a top-tier strategy consulting firm, conducting a critical gap analysis review. You've received a first draft from your analyst team and the original research report, and now need to identify gaps and areas requiring deeper investigation.

**INPUTS YOU WILL BE GIVEN:**
1. **{Foundation_Report}:** The comprehensive research report that was generated based on the original brief.
2. **{First_Draft}:** The initial draft output created by the team based on the research.

**YOUR TASK:**
Analyze the first draft against the foundation report and identify critical gaps, missing evidence, and areas requiring deeper investigation. Generate a focused research brief for the AI Research Engine to fill these gaps.

**GAP ANALYSIS FRAMEWORK:**

1. **Identify Missing Evidence:** What specific data points, statistics, or examples mentioned in the foundation report are missing from the first draft?

2. **Surface Unexplored Dimensions:** What important aspects covered in the research were completely omitted or insufficiently addressed in the draft?

3. **Depth Deficiencies:** Where does the draft lack sufficient detail, nuance, or analytical depth compared to what the research uncovered?

4. **Validation Gaps:** What claims in the draft lack proper supporting evidence that exists in the research?

5. **Strategic Blind Spots:** What competitive, market, or strategic insights from the research didn't make it into the draft?

**RESEARCH BRIEF STRUCTURE:**

Your output should be a clear, actionable research brief that:

1. **Assigns Clear Role:** "You are a specialist research analyst tasked with conducting deep-dive analysis on specific gaps..."

2. **Defines Specific Gaps:** List 5-7 specific gaps identified, each with:
   - What's missing
   - Why it matters
   - What evidence to find

3. **Prescribes Search Parameters:**
   - Timeframe: Focus on most recent 12-18 months unless historical context needed
   - Source hierarchy: Prioritize primary sources, case studies, and implementation details
   - Depth requirement: Go 2-3 levels deeper than surface information

4. **Evidence Requirements:**
   - Specific examples with names, dates, and figures
   - Implementation details and methodologies
   - Quantitative metrics and performance indicators
   - Failure cases and lessons learned

5. **Output Format:** 
   - Each gap should have its own section with clear Markdown headers
   - Include comparison tables where relevant
   - Explicitly state if no evidence found

**BEGIN. Generate the gap analysis research brief now.**
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

    // Create a Supabase client with the service_role key
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Construct the full prompt
    let fullPrompt = GAP_ANALYSIS_META_PROMPT
    fullPrompt = fullPrompt.replace('{Foundation_Report}', foundation_report || 'No foundation report provided.')
    fullPrompt = fullPrompt.replace('{First_Draft}', first_draft)

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
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: fullPrompt }],
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`OpenRouter API request failed: ${errorBody}`)
    }

    const aiResponse = await res.json()
    const generatedBrief = aiResponse.choices[0].message.content

    // Create a simple project record for the gap analysis
    const { data: projectData, error: projectError } = await supabaseAdminClient
      .from('projects')
      .insert({
        name: `Gap Analysis ${new Date().toISOString()}`,
        chapter_template_prompt: 'Gap Analysis',
        project_context: 'Gap analysis based on first draft review',
        key_documents_summary: first_draft.substring(0, 500) + '...' // Store first 500 chars as summary
      })
      .select('id')
      .single()

    if (projectError) throw projectError

    // Insert the new report with gap_analysis type
    const { data: newReport, error: insertError } = await supabaseAdminClient
      .from('reports')
      .insert({
        project_id: projectData.id,
        research_brief: generatedBrief,
        report_type: 'gap_analysis',
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

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
