// supabase/functions/research-worker/index.ts

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// --- Types ---
interface Job {
  id: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  payload: {
    report_id: string;
    research_plan?: string[];
    atomic_results?: any[];
    next_task_index?: number;
  };
  // ... other columns
}

// --- Constants ---
const SYNTHESIZER_META_PROMPT = `You are a Senior Partner at a top-tier strategy consulting firm, renowned for your ability to synthesize complex information into clear, decision-grade reports. You have been given a collection of raw research findings from your junior analyst team.

Your task is to read all the provided raw data and transform it into a single, cohesive, client-ready "Market Research Pack."

You must adhere to the following structure and principles:
1.  **Executive Summary:** Begin with a concise, powerful "Executive Summary" section that synthesizes the most critical, overarching findings from the entire document.
2.  **Cohesive Narrative:** Weave the individual research sections together into a smooth, logical narrative. Do not simply list the sections; ensure they flow together.
3.  **Professional Formatting:** Use clear Markdown formatting, including headers, sub-headers, bold text for key terms, and tables for comparative data.
4.  **Synthesize, Do Not Invent:** You MUST only use the information present in the "Raw Research Data" provided below. Do not introduce any outside knowledge or facts. Your job is to synthesize, not to conduct new research.

Here is the raw data from your team:
---
{raw_data}
---`

// --- Helper Functions ---

/**
 * Updates the status of a job and the associated report in case of a failure.
 */
async function handleFailure(supabaseAdminClient: SupabaseClient, job: Job, error: any) {
  console.error(`Job ${job.id} failed:`, error)
  await supabaseAdminClient.from('jobs').update({
    status: 'failed',
    error_log: error.message,
    last_ran_at: new Date().toISOString()
  }).eq('id', job.id)
  
  await supabaseAdminClient.from('reports').update({
    status: 'error'
  }).eq('id', job.payload.report_id)
}

/**
 * STAGE 1: Generate the research plan for a new job.
 */
async function executePlanningStage(supabaseAdminClient: SupabaseClient, job: Job) {
  console.log(`[Job ${job.id}] Starting planning stage for report ${job.payload.report_id}`)
  
  // Mark job as in_progress
  await supabaseAdminClient.from('jobs').update({
    status: 'in_progress',
    last_ran_at: new Date().toISOString()
  }).eq('id', job.id)
  
  // Fetch report and project data
  const { data: reportData } = await supabaseAdminClient.from('reports').select('project_id').eq('id', job.payload.report_id).single()
  const { data: projectData } = await supabaseAdminClient.from('projects').select(`
    project_context, key_documents_summary, chapter_templates ( chapter_prompt )
  `).eq('id', reportData.project_id).single()

  // Generate the plan
  const planResponse = await supabaseAdminClient.functions.invoke('generate-research-plan', {
    body: {
      project_context: projectData.project_context,
      documents_summary: projectData.key_documents_summary,
      chapter_prompt: projectData.chapter_templates.chapter_prompt
    }
  })

  const research_plan = planResponse.data.research_plan
  if (!Array.isArray(research_plan) || research_plan.length === 0) {
    throw new Error('Invalid or empty research plan received')
  }
  
  console.log(`[Job ${job.id}] Planning complete. Generated ${research_plan.length} tasks.`)

  // Initialize state and save to job payload
  await supabaseAdminClient.from('jobs').update({
    payload: {
      ...job.payload,
      research_plan,
      atomic_results: Array(research_plan.length).fill(null),
      next_task_index: 0,
    }
  }).eq('id', job.id)
}

/**
 * STAGE 2: Execute the next single atomic research task.
 */
async function executeResearchStage(supabaseAdminClient: SupabaseClient, job: Job) {
  const { report_id, research_plan, atomic_results, next_task_index } = job.payload
  
  console.log(`[Job ${job.id}] Executing task ${next_task_index + 1} of ${research_plan.length}`)
  const question = research_plan[next_task_index]

  // Invoke the atomic task function
  const taskResponse = await supabaseAdminClient.functions.invoke('execute-atomic-task', {
    body: { question }
  })
  
  if (taskResponse.error) {
    // Note: A non-2xx response from the function will land here.
    // The atomic task function is designed to not throw errors but return a structured message,
    // so this path indicates a more fundamental issue (e.g., the function crashed).
    console.warn(`[Job ${job.id}] Atomic task invocation failed: ${taskResponse.error.message}`)
    atomic_results[next_task_index] = { report_text: `[Task invocation failed: ${taskResponse.error.message}]` };
  } else {
    atomic_results[next_task_index] = taskResponse.data
  }
  
  // Update payload with the result and increment the index
  await supabaseAdminClient.from('jobs').update({
    payload: {
      ...job.payload,
      atomic_results,
      next_task_index: next_task_index + 1,
    },
    last_ran_at: new Date().toISOString()
  }).eq('id', job.id)
  
  console.log(`[Job ${job.id}] Task ${next_task_index + 1} complete.`)
}

/**
 * STAGE 3: Synthesize the final report when all tasks are complete.
 */
async function executeSynthesisStage(supabaseAdminClient: SupabaseClient, job: Job) {
  const { report_id, research_plan, atomic_results } = job.payload
  console.log(`[Job ${job.id}] All tasks complete. Starting synthesis stage.`)

  // Combine results
  const combinedReportTexts = atomic_results.map((result, index) => {
    const reportText = result?.report_text || `[This research task failed to produce data.]`
    return `## Research Task ${index + 1}: ${research_plan[index]}\n\n${reportText}`
  })
  const rawData = combinedReportTexts.join('\n\n---\n\n')

  // Call synthesizer
  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
  const synthesisPrompt = SYNTHESIZER_META_PROMPT.replace('{raw_data}', rawData)
  
  const synthesisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openRouterApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: synthesisPrompt }],
      }),
    })
    
  if (!synthesisResponse.ok) throw new Error(`Synthesis API failed: ${await synthesisResponse.text()}`)
  
  const synthesisAiResponse = await synthesisResponse.json()
  const finalReport = synthesisAiResponse.choices[0].message.content
  if (!finalReport) throw new Error('Synthesizer returned empty content.')

  console.log(`[Job ${job.id}] Synthesis complete. Saving final report.`)
  
  // Save final report
  await supabaseAdminClient.from('reports').update({
    final_report: finalReport,
    status: 'complete'
  }).eq('id', report_id)

  // Mark job as completed
  await supabaseAdminClient.from('jobs').update({
    status: 'completed',
    last_ran_at: new Date().toISOString()
  }).eq('id', job.id)
}

// --- Main Handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  
  const supabaseAdminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 1. Find a job to work on. Prioritize in-progress, then pending.
  let { data: job, error } = await supabaseAdminClient.from('jobs').select('*').eq('status', 'in_progress').order('last_ran_at', { ascending: true }).limit(1).maybeSingle()
  
  if (!job) {
    ({ data: job, error } = await supabaseAdminClient.from('jobs').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(1).maybeSingle())
  }
  
  if (error) {
    console.error('Failed to fetch job:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch job' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  
  if (!job) {
    console.log('No pending or in-progress jobs found.')
    return new Response(JSON.stringify({ message: 'No jobs to process' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  
  // 2. Execute the correct stage based on the job's state
  try {
    const { status, payload } = job
    
    if (status === 'pending') {
      await executePlanningStage(supabaseAdminClient, job)
    } else if (status === 'in_progress') {
      const { research_plan, next_task_index } = payload
      
      if (next_task_index < research_plan.length) {
        await executeResearchStage(supabaseAdminClient, job)
      } else {
        await executeSynthesisStage(supabaseAdminClient, job)
      }
    }
    
    return new Response(JSON.stringify({ message: `Successfully processed job ${job.id}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e) {
    await handleFailure(supabaseAdminClient, job, e)
    return new Response(JSON.stringify({ error: `Failed to process job ${job.id}: ${e.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
