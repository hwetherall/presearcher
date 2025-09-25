// supabase/functions/regenerate-report/index.ts
// Regenerates a Foundation Research Report using existing atomic task results

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SYNTHESIZER_META_PROMPT = `You are a Senior Partner at a top-tier strategy consulting firm, renowned for your ability to synthesize complex information into clear, decision-grade reports. You have been given a collection of raw research findings from your junior analyst team.

Your task is to read all the provided raw data and transform it into a single, cohesive, client-ready "Market Research Pack."

You must adhere to the following structure and principles:
1.  **Executive Summary:** Begin with a concise, powerful "Executive Summary" section that synthesizes the most critical, overarching findings from the entire document.
2.  **Cohesive Narrative:** Weave the individual research sections together into a smooth, logical narrative. Do not simply list the sections; ensure they flow together.
3.  **Professional Formatting:** Use clear Markdown formatting, including headers, sub-headers, bold text for key terms, and tables for comparative data.
4.  **Synthesize, Do Not Invent:** You MUST only use the information present in the "Raw Research Data" provided below. Do not introduce any outside knowledge or facts. Your job is to synthesize, not to conduct new research.

**CRITICAL SOURCE AND BIBLIOGRAPHY REQUIREMENTS:**
5.  **Complete Source Citations:** You MUST cite ALL sources with full URLs throughout the report. Use inline citations in the format: [Source Name](https://full-url.com)
6.  **Preserve All URLs:** Extract and include EVERY URL mentioned in the raw research data. Do not lose or omit any source URLs.
7.  **Complete Bibliography:** End your report with a comprehensive "Bibliography" section that lists ALL sources used, formatted as:
    - [Source Name](https://full-url.com) - Brief description if available
8.  **No Placeholder Citations:** Never use [1], [2], etc. Always use the actual URLs and source names.
9.  **Source Verification:** If a claim has multiple sources, cite ALL of them, not just one.

**REQUIRED FINAL SECTION:**
Your report MUST end with:

## Bibliography

[List ALL sources found in the raw data as clickable markdown links with full URLs]

Here is the raw data from your team:
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

    console.log(`Starting report regeneration for report ID: ${report_id}`)

    // Step 1: Get the report basic data
    const { data: reportData, error: reportError } = await supabaseAdminClient
      .from('reports')
      .select('id, project_id, status, report_type')
      .eq('id', report_id)
      .eq('report_type', 'foundation')
      .single()

    if (reportError) {
      throw new Error(`Failed to fetch report: ${reportError.message}`)
    }

    if (!reportData) {
      throw new Error('Report not found or is not a foundation report')
    }

    console.log(`Found report for project ${reportData.project_id}`)

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
      throw new Error('No completed atomic tasks found for this report. Cannot regenerate without research data.')
    }

    console.log(`Found ${atomicTasks.length} atomic tasks to synthesize`)

    // Step 3: Get the research plan from the job that created these tasks
    let researchPlan: string[] = []
    
    if (atomicTasks.length > 0 && atomicTasks[0].job_id) {
      const { data: jobData, error: jobError } = await supabaseAdminClient
        .from('jobs')
        .select('payload')
        .eq('id', atomicTasks[0].job_id)
        .single()
      
      if (jobError) {
        console.warn(`Could not fetch job data: ${jobError.message}`)
      } else {
        researchPlan = jobData?.payload?.research_plan || []
      }
    }
    
    // Fallback: use the questions from atomic tasks if we don't have the research plan
    if (researchPlan.length === 0) {
      console.log('Using atomic task questions as research plan fallback')
      researchPlan = atomicTasks.map(task => task.question)
    }

    console.log(`Using research plan with ${researchPlan.length} questions`)

    // Step 4: Combine the atomic task results
    const combinedReportTexts = atomicTasks.map((task, index) => {
      const question = researchPlan[task.task_index] || `Research Task ${task.task_index + 1}`
      const reportText = task.result?.report_text || '[This research task failed to produce data.]'
      
      return `## Research Task ${task.task_index + 1}: ${question}\n\n${reportText}`
    })

    const rawData = combinedReportTexts.join('\n\n---\n\n')
    
    console.log(`Combined raw data: ${rawData.length} characters`)
    console.log(`Raw data preview:`, rawData.substring(0, 300))

    // Step 5: Synthesize the report
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY not found in environment')
    }

    const synthesisPrompt = SYNTHESIZER_META_PROMPT.replace('{raw_data}', rawData)
    
    console.log('Starting synthesis with AI...')
    
    const synthesisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${openRouterApiKey}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: synthesisPrompt }],
      }),
    })
    
    if (!synthesisResponse.ok) {
      const errorText = await synthesisResponse.text()
      throw new Error(`Synthesis API failed: ${synthesisResponse.status} ${synthesisResponse.statusText} - ${errorText}`)
    }
    
    const synthesisAiResponse = await synthesisResponse.json()
    const finalReportContent = synthesisAiResponse.choices[0]?.message?.content
    
    if (!finalReportContent) {
      throw new Error('Synthesizer returned empty content')
    }

    console.log('Synthesis completed successfully')

    // Step 6: Update the report with the new content
    const { error: updateError } = await supabaseAdminClient
      .from('reports')
      .update({
        final_report: finalReportContent,
        status: 'complete'
      })
      .eq('id', report_id)

    if (updateError) {
      throw new Error(`Failed to update report: ${updateError.message}`)
    }

    console.log(`Report ${report_id} regenerated successfully`)

    return new Response(JSON.stringify({ 
      message: 'Report regenerated successfully',
      report_id: report_id,
      atomic_tasks_used: atomicTasks.length,
      final_report: finalReportContent
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Error in regenerate-report function:', error)
    console.error('Error stack:', error.stack)
    
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
