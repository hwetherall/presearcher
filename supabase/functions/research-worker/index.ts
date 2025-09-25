// supabase/functions/research-worker/index.ts

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// --- Types ---
interface Job {
  id: number;
  job_type: 'execute_research' | 'execute_gap_analysis';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  payload: {
    report_id: string;
    research_plan?: string[];
    atomic_results?: any[];
    next_task_index?: number;
    foundation_report?: string;
    first_draft?: string;
    custom_research_plan?: string[];
  };
  // ... other columns
}

// --- Constants ---
const SYNTHESIZER_META_PROMPT = `You are a meticulous and analytical synthesis agent. Your sole purpose is to transform a series of raw, atomic research reports into a structured, evidence-backed JSON object.

You will be given a collection of research findings, each corresponding to a specific research task.

Your task is to:
1.  Read and understand all the provided raw research data.
2.  Identify distinct, verifiable claims from the data.
3.  For each claim, you MUST identify and extract ALL source URL(s) that support it.
4.  Synthesize related findings into concise, well-formed claims. For example, if one source says the market is $10B and another says it's $12B, a good claim would be "The market size is estimated to be between $10B and $12B."
5.  Construct a single JSON object as your final output.

**CRITICAL SOURCE REQUIREMENTS:**
- You MUST extract and preserve ALL URLs mentioned in the raw data
- Look for URLs in square brackets [https://...], parentheses (https://...), or plain text
- Every claim must include ALL supporting URLs, not just one
- If multiple sources support a claim, include ALL of them in the evidence array
- Do NOT lose any source URLs from the original research data

**JSON OUTPUT REQUIREMENTS:**
- The root of the object must be a single key named "claims".
- The value of "claims" must be an array of objects.
- Each object in the array must have exactly two keys:
    1.  \`"claim"\`: A string containing the synthesized, evidence-based statement.
    2.  \`"evidence"\`: An array of strings, where each string is a complete URL pointing to the source. Include ALL URLs that support this claim.

**RULES:**
- You MUST respond with ONLY a valid JSON object. Do not include any explanatory text, markdown formatting, or any characters outside of the JSON structure.
- Every claim you generate MUST be directly supported by the provided raw data and its sources. DO NOT invent information.
- If the raw data for a task indicates that no verifiable evidence was found, do not generate a claim for it.
- PRESERVE ALL SOURCE URLS - do not summarize or omit any URLs found in the raw data

Here is the raw data from the research team:
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
  
  let research_plan: string[]
  
  if (job.job_type === 'execute_gap_analysis') {
    // For gap analysis jobs, generate plan using gap analysis function
    const planResponse = await supabaseAdminClient.functions.invoke('generate-gap-analysis-brief', {
      body: {
        foundation_report: job.payload.foundation_report,
        first_draft: job.payload.first_draft
      }
    })
    
    if (planResponse.error) {
      throw new Error(`Gap analysis planning failed: ${planResponse.error.message}`)
    }
    
    research_plan = planResponse.data.research_plan
  } else {
    // For regular research jobs, use existing logic
    // Fetch report and project data
    const { data: reportData } = await supabaseAdminClient.from('reports').select('project_id').eq('id', job.payload.report_id).single()
    const { data: projectData } = await supabaseAdminClient.from('projects').select(`
      project_context, key_documents_summary, custom_prompt, chapter_templates ( chapter_prompt )
    `).eq('id', reportData.project_id).single()

    // Check if custom research plan is provided, otherwise generate one
    research_plan = job.payload.custom_research_plan
    
    if (!research_plan) {
      // Generate the plan
      const chapterPrompt = projectData.custom_prompt || projectData.chapter_templates?.chapter_prompt || 'No prompt available'
      const planResponse = await supabaseAdminClient.functions.invoke('generate-research-plan', {
        body: {
          project_context: projectData.project_context,
          documents_summary: projectData.key_documents_summary,
          chapter_prompt: chapterPrompt
        }
      })

      research_plan = planResponse.data.research_plan
    }
  }
  
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
 * REUSABLE HELPER: Execute atomic research tasks in parallel with concurrency limit
 */
async function runAtomicResearch(supabaseAdminClient: SupabaseClient, research_plan: string[]): Promise<any[]> {
  const CONCURRENCY_LIMIT = 3 // Adjust based on your needs
  const results: any[] = []
  
  // Execute tasks in batches with concurrency limit
  for (let i = 0; i < research_plan.length; i += CONCURRENCY_LIMIT) {
    const batch = research_plan.slice(i, i + CONCURRENCY_LIMIT)
    const batchPromises = batch.map(async (question, batchIndex) => {
      const taskResponse = await supabaseAdminClient.functions.invoke('execute-atomic-task', {
        body: { question }
      })
      
      if (taskResponse.error) {
        console.warn(`Atomic task failed: ${taskResponse.error.message}`)
        return { report_text: `[Task failed: ${taskResponse.error.message}]` }
      }
      
      return taskResponse.data
    })
    
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)
  }
  
  return results
}

/**
 * REUSABLE HELPER: Synthesize raw research data into final report
 */
async function runSynthesis(supabaseAdminClient: SupabaseClient, rawData: string): Promise<string> {
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
  
  if (!synthesisResponse.ok) {
    throw new Error(`Synthesis API failed: ${await synthesisResponse.text()}`)
  }
  
  const synthesisAiResponse = await synthesisResponse.json()
  const finalReportContent = synthesisAiResponse.choices[0].message.content
  
  if (!finalReportContent) {
    throw new Error('Synthesizer returned empty content.')
  }
  
  // Parse the JSON response to validate it's properly formatted
  let parsedReport
  try {
    parsedReport = JSON.parse(finalReportContent)
  } catch (error) {
    throw new Error(`Synthesizer returned invalid JSON: ${error.message}`)
  }
  
  // Return the JSON as a string for storage in the database
  return JSON.stringify(parsedReport)
}

/**
 * STAGE 2: Execute the next single atomic research task (for backward compatibility).
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

  // Use the reusable synthesis helper
  const finalReport = await runSynthesis(supabaseAdminClient, rawData)

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

/**
 * NEW: Execute gap analysis workflow using reusable components
 */
async function executeGapAnalysisWorkflow(supabaseAdminClient: SupabaseClient, job: Job) {
  const { report_id, research_plan } = job.payload
  console.log(`[Job ${job.id}] Starting gap analysis workflow with ${research_plan.length} tasks.`)

  // Step B: Execute atomic research tasks in parallel
  console.log(`[Job ${job.id}] Executing atomic research tasks...`)
  const atomic_results = await runAtomicResearch(supabaseAdminClient, research_plan)

  // Step C: Combine results for synthesis
  const combinedReportTexts = atomic_results.map((result, index) => {
    const reportText = result?.report_text || `[This research task failed to produce data.]`
    return `## Research Task ${index + 1}: ${research_plan[index]}\n\n${reportText}`
  })
  const rawData = combinedReportTexts.join('\n\n---\n\n')

  // Step C: Synthesize final report
  console.log(`[Job ${job.id}] Synthesizing final gap analysis report...`)
  const finalReport = await runSynthesis(supabaseAdminClient, rawData)

  // Step D: Update database
  console.log(`[Job ${job.id}] Gap analysis complete. Saving final report.`)
  
  await supabaseAdminClient.from('reports').update({
    final_report: finalReport,
    status: 'complete'
  }).eq('id', report_id)

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
  let { data: job, error } = await supabaseAdminClient.from('jobs').select('*').eq('status', 'in_progress').in('job_type', ['execute_research', 'execute_gap_analysis']).order('last_ran_at', { ascending: true }).limit(1).maybeSingle()
  
  if (!job) {
    ({ data: job, error } = await supabaseAdminClient.from('jobs').select('*').eq('status', 'pending').in('job_type', ['execute_research', 'execute_gap_analysis']).order('created_at', { ascending: true }).limit(1).maybeSingle())
  }
  
  if (error) {
    console.error('Failed to fetch job:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch job' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  
  if (!job) {
    console.log('No pending or in-progress jobs found.')
    return new Response(JSON.stringify({ message: 'No jobs to process' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  
  // 2. Execute the correct workflow based on job type and status
  try {
    const { status, payload, job_type } = job
    
    if (status === 'pending') {
      await executePlanningStage(supabaseAdminClient, job)
    } else if (status === 'in_progress') {
      if (job_type === 'execute_gap_analysis') {
        // New gap analysis workflow - execute all steps at once
        await executeGapAnalysisWorkflow(supabaseAdminClient, job)
      } else {
        // Original execute_research workflow - step by step
        const { research_plan, next_task_index } = payload
        
        if (next_task_index < research_plan.length) {
          await executeResearchStage(supabaseAdminClient, job)
        } else {
          await executeSynthesisStage(supabaseAdminClient, job)
        }
      }
    }
    
    return new Response(JSON.stringify({ message: `Successfully processed job ${job.id}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e) {
    await handleFailure(supabaseAdminClient, job, e)
    return new Response(JSON.stringify({ error: `Failed to process job ${job.id}: ${e.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
