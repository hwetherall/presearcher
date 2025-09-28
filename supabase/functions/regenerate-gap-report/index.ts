// supabase/functions/regenerate-gap-report/index.ts
// Regenerates a Gap Analysis Report using existing atomic task results

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const GAP_ANALYSIS_SYNTHESIZER_META_PROMPT = `You are a sharp, skeptical Principal at a private equity firm, tasked with synthesizing the results of targeted gap analysis research into a comprehensive final report.

You have been provided with the results of specific research tasks that were designed to address weaknesses and gaps in an initial investment analysis. Your job is to synthesize this research into a cohesive, decision-grade "Gap Analysis Final Report."

You must adhere to the following structure and principles:
1.  **Executive Summary:** Begin with a concise, powerful "Executive Summary" section that synthesizes the most critical findings from the gap analysis research.
2.  **Key Findings:** Organize the research results into clear, logical sections that address the specific gaps that were identified.
3.  **Evidence-Based Analysis:** Focus on concrete evidence, quantified metrics, and substantiated claims. Highlight where gaps have been filled and where uncertainties remain.
4.  **Professional Formatting:** Use clear Markdown formatting, including headers, sub-headers, bold text for key terms, and tables for comparative data.
5.  **Synthesize, Do Not Invent:** You MUST only use the information present in the "Gap Analysis Research Data" provided below. Do not introduce any outside knowledge or facts.

**CRITICAL SOURCE AND BIBLIOGRAPHY REQUIREMENTS:**
6.  **Complete Source Citations:** You MUST cite ALL sources with full URLs throughout the report. Use inline citations in the format: [Source Name](https://full-url.com)
7.  **Preserve All URLs:** Extract and include EVERY URL mentioned in the research data. Do not lose or omit any source URLs.
8.  **Complete Bibliography:** End your report with a comprehensive "Bibliography" section that lists ALL sources used, formatted as:
    - [Source Name](https://full-url.com) - Brief description if available
9.  **No Placeholder Citations:** Never use [1], [2], etc. Always use the actual URLs and source names.
10. **Source Verification:** If a claim has multiple sources, cite ALL of them, not just one.

**REQUIRED FINAL SECTION:**
Your report MUST end with:

## Bibliography

[List ALL sources found in the gap analysis research data as clickable markdown links with full URLs]

Here is the gap analysis research data:
---
{raw_data}
---`

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { report_id } = await req.json()
    
    // Validate required input
    if (!report_id) {
      return new Response(JSON.stringify({ error: "Missing 'report_id' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`Starting gap analysis report regeneration for report ID: ${report_id}`)

    // Step 1: Get the report basic data
    const { data: reportData, error: reportError } = await supabaseAdminClient
      .from('reports')
      .select('id, project_id, status, report_type')
      .eq('id', report_id)
      .eq('report_type', 'gap_analysis')
      .single()

    if (reportError) {
      throw new Error(`Failed to fetch report: ${reportError.message}`)
    }

    if (!reportData) {
      throw new Error('Report not found or is not a gap analysis report')
    }

    console.log(`Found gap analysis report for project ${reportData.project_id}`)

    // Step 2: Get all completed atomic tasks for this report
    const { data: atomicTasks, error: tasksError } = await supabaseAdminClient
      .from('atomic_tasks')
      .select('id, task_index, question, status, result, job_id')
      .eq('report_id', report_id)
      .in('status', ['completed', 'failed'])
      .order('task_index', { ascending: true })

    if (tasksError) {
      throw new Error(`Failed to fetch atomic tasks: ${tasksError.message}`)
    }

    if (!atomicTasks || atomicTasks.length === 0) {
      throw new Error('No completed atomic tasks found for this gap analysis report. Cannot regenerate without research data.')
    }

    console.log(`Found ${atomicTasks.length} atomic tasks to synthesize for gap analysis`)

    // Step 3: Combine atomic task results into raw data
    const combinedReportTexts = atomicTasks.map((task, index) => {
      const reportText = task?.result?.report_text || `[This research task failed to produce data.]`
      return `## Research Task ${index + 1}: ${task.question}\n\n${reportText}`
    })
    const rawData = combinedReportTexts.join('\n\n---\n\n')

    console.log(`Combined raw data length: ${rawData.length} characters`)

    // Step 4: Synthesize final report using OpenRouter
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!openRouterApiKey) {
      throw new Error('SERVER ERROR: OPENROUTER_API_KEY was not found in the environment.')
    }

    const fullPrompt = GAP_ANALYSIS_SYNTHESIZER_META_PROMPT.replace('{raw_data}', rawData)

    console.log(`Calling OpenRouter for gap analysis synthesis...`)

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: fullPrompt }],
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`OpenRouter API request failed: ${errorBody}`)
    }

    const aiResponse = await res.json()
    const finalReport = aiResponse.choices[0].message.content

    console.log(`Gap analysis synthesis complete. Final report length: ${finalReport.length} characters`)

    // Step 5: Update the report with the regenerated content
    const { error: updateError } = await supabaseAdminClient
      .from('reports')
      .update({
        final_report: finalReport,
        status: 'complete'
      })
      .eq('id', report_id)

    if (updateError) {
      throw new Error(`Failed to update report: ${updateError.message}`)
    }

    console.log(`Gap analysis report regenerated successfully`)

    return new Response(JSON.stringify({
      message: 'Gap analysis report regenerated successfully',
      final_report: finalReport,
      atomic_tasks_used: atomicTasks.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in regenerate-gap-report:', error)
    return new Response(JSON.stringify({ 
      error: error.message || 'An unexpected error occurred during gap analysis regeneration' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
