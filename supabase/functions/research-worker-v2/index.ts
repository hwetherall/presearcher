// supabase/functions/research-worker-v2/index.ts
// Modified version that creates atomic tasks for the Next.js app to process

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
}

interface AtomicTask {
  id: string;
  job_id: number;
  report_id: string;
  task_index: number;
  question: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: { report_text: string };
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
 * Triggers the Next.js app to process pending atomic tasks
 */
async function triggerTaskProcessor(): Promise<void> {
  try {
    // Get the app URL from environment or use localhost for development
    const appUrl = Deno.env.get('NEXT_APP_URL') || 'http://host.docker.internal:3000'
    const internalApiKey = Deno.env.get('INTERNAL_API_KEY') || 'development-key'
    
    console.log(`Attempting to trigger task processor at ${appUrl}/api/process-atomic-tasks`)
    
    const response = await fetch(`${appUrl}/api/process-atomic-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${internalApiKey}`
      },
      body: JSON.stringify({})
    })

    if (!response.ok) {
      console.warn(`Task processor trigger failed: ${response.status} ${response.statusText}`)
    } else {
      const result = await response.json()
      console.log(`Task processor triggered successfully: ${result.message}`)
    }
  } catch (error) {
    // Don't fail the job if we can't trigger the processor
    // The processor might be running on a schedule anyway
    console.warn(`Could not reach Next.js app (this is OK if it's not running yet): ${error.message}`)
    console.warn(`Tasks are queued and will be processed when the Next.js app starts.`)
  }
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

  // Create atomic tasks in the database
  const tasksToCreate = research_plan.map((question, index) => ({
    job_id: job.id,
    report_id: job.payload.report_id,
    task_index: index,
    question: question,
    status: 'pending'
  }))

  console.log(`[Job ${job.id}] Attempting to create ${tasksToCreate.length} atomic tasks:`, JSON.stringify(tasksToCreate, null, 2))
  
  const { data: insertResult, error: insertError } = await supabaseAdminClient
    .from('atomic_tasks')
    .insert(tasksToCreate)
    .select()

  if (insertError) {
    console.error(`[Job ${job.id}] Failed to create atomic tasks:`, insertError)
    throw new Error(`Failed to create atomic tasks: ${insertError.message}`)
  }

  console.log(`[Job ${job.id}] Successfully created ${insertResult?.length || 0} atomic tasks:`, insertResult?.map(t => ({ id: t.id.substring(0, 8), status: t.status })))

  // Update job payload
  await supabaseAdminClient.from('jobs').update({
    payload: {
      ...job.payload,
      research_plan,
      atomic_results: Array(research_plan.length).fill(null),
      next_task_index: 0,
    }
  }).eq('id', job.id)

  // Trigger the task processor in the Next.js app
  await triggerTaskProcessor()
}

/**
 * Check if all atomic tasks for a job are completed
 */
async function checkTasksCompletion(supabaseAdminClient: SupabaseClient, job: Job): Promise<boolean> {
  const { data: tasks, error } = await supabaseAdminClient
    .from('atomic_tasks')
    .select('id, status, result')
    .eq('job_id', job.id)
    .order('task_index', { ascending: true })

  if (error) {
    console.error(`Failed to fetch tasks for job ${job.id}:`, error)
    return false
  }

  if (!tasks || tasks.length === 0) {
    return false
  }

  // Check if all tasks are completed or failed
  const allDone = tasks.every(task => 
    task.status === 'completed' || task.status === 'failed'
  )

  if (allDone) {
    // Update job payload with results
    const atomic_results = tasks.map(task => task.result || { report_text: '[Task failed]' })
    
    await supabaseAdminClient.from('jobs').update({
      payload: {
        ...job.payload,
        atomic_results,
        next_task_index: tasks.length
      },
      last_ran_at: new Date().toISOString()
    }).eq('id', job.id)

    return true
  }

  // If some tasks are still pending, trigger the processor again
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  if (pendingCount > 0) {
    console.log(`[Job ${job.id}] ${pendingCount} tasks still pending, triggering processor`)
    await triggerTaskProcessor()
  }

  return false
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
  
  // Return the narrative report directly (no JSON parsing needed)
  return finalReportContent
}

/**
 * STAGE 2: Monitor task completion and proceed to synthesis when ready
 */
async function executeResearchStage(supabaseAdminClient: SupabaseClient, job: Job) {
  const { report_id } = job.payload
  
  console.log(`[Job ${job.id}] Checking task completion status`)

  // Check if all tasks are completed
  const allTasksCompleted = await checkTasksCompletion(supabaseAdminClient, job)

  if (!allTasksCompleted) {
    // Tasks are still processing, update last_ran_at to prevent timeout
    await supabaseAdminClient.from('jobs').update({
      last_ran_at: new Date().toISOString()
    }).eq('id', job.id)
    
    console.log(`[Job ${job.id}] Tasks still processing, will check again later`)
    return
  }

  // All tasks are completed, proceed to synthesis
  await executeSynthesisStage(supabaseAdminClient, job)
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
 * NEW: Execute gap analysis workflow using the new task-based approach
 */
async function executeGapAnalysisWorkflow(supabaseAdminClient: SupabaseClient, job: Job) {
  const { report_id } = job.payload
  console.log(`[Job ${job.id}] Checking gap analysis task completion`)

  // Check if all tasks are completed
  const allTasksCompleted = await checkTasksCompletion(supabaseAdminClient, job)

  if (!allTasksCompleted) {
    // Tasks are still processing
    await supabaseAdminClient.from('jobs').update({
      last_ran_at: new Date().toISOString()
    }).eq('id', job.id)
    
    console.log(`[Job ${job.id}] Gap analysis tasks still processing`)
    return
  }

  // All tasks completed, proceed to synthesis
  const { research_plan, atomic_results } = job.payload
  
  const combinedReportTexts = atomic_results.map((result, index) => {
    const reportText = result?.report_text || `[This research task failed to produce data.]`
    return `## Research Task ${index + 1}: ${research_plan[index]}\n\n${reportText}`
  })
  const rawData = combinedReportTexts.join('\n\n---\n\n')

  console.log(`[Job ${job.id}] Synthesizing final gap analysis report...`)
  const finalReport = await runSynthesis(supabaseAdminClient, rawData)

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
      // Create atomic tasks and start processing
      await executePlanningStage(supabaseAdminClient, job)
    } else if (status === 'in_progress') {
      if (job_type === 'execute_gap_analysis') {
        // Gap analysis workflow
        if (!payload.research_plan) {
          // First time processing, need to create tasks
          await executePlanningStage(supabaseAdminClient, job)
        } else {
          // Check task completion
          await executeGapAnalysisWorkflow(supabaseAdminClient, job)
        }
      } else {
        // Regular research workflow
        if (!payload.research_plan) {
          // First time processing, need to create tasks
          await executePlanningStage(supabaseAdminClient, job)
        } else {
          // Check task completion
          await executeResearchStage(supabaseAdminClient, job)
        }
      }
    }
    
    return new Response(JSON.stringify({ message: `Successfully processed job ${job.id}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e) {
    await handleFailure(supabaseAdminClient, job, e)
    return new Response(JSON.stringify({ error: `Failed to process job ${job.id}: ${e.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
