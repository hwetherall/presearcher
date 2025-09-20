// supabase/functions/research-worker/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

async function runOrchestration(report_id: string, job_id: number) {
  let supabaseAdminClient: any
  
  try {
    // Create a Supabase admin client
    supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Step A: Fetch the Brief
    console.log(`Step A: Fetching report with ID: ${report_id}`)
    const { data: reportData, error: fetchError } = await supabaseAdminClient
      .from('reports')
      .select('research_brief, project_id, report_type')
      .eq('id', report_id)
      .single()

    if (fetchError) {
      throw new Error(`Failed to fetch report: ${fetchError.message}`)
    }

    if (!reportData.research_brief) {
      throw new Error('Report does not have a research_brief')
    }

    // Fetch the project data needed for the enhanced research plan generation
    console.log(`Step A: Fetching project data for project ID: ${reportData.project_id}`)
    const { data: projectData, error: projectError } = await supabaseAdminClient
      .from('projects')
      .select(`
        project_context,
        key_documents_summary,
        chapter_templates ( chapter_prompt )
      `)
      .eq('id', reportData.project_id)
      .single()

    if (projectError) {
      throw new Error(`Failed to fetch project data: ${projectError.message}`)
    }

    if (!projectData.project_context || !projectData.key_documents_summary || !projectData.chapter_templates?.chapter_prompt) {
      throw new Error('Project is missing required data (project_context, key_documents_summary, or chapter_prompt from template)')
    }

    console.log('Step A completed: Research brief and project data fetched successfully')

    // Check if this report already has a final report (indicating completion) or if we should skip research
    console.log('Step A.5: Checking report completion status')
    const { data: reportStatus, error: statusError } = await supabaseAdminClient
      .from('reports')
      .select('status, final_report')
      .eq('id', report_id)
      .single()
    
    if (statusError) {
      console.warn('Could not check report status:', statusError.message)
    } else if (reportStatus?.status === 'complete' && reportStatus?.final_report) {
      // Report already complete - no need to process
      console.log('Step A.5 completed: Report already complete - no processing needed')
      console.log('Step F: Orchestration completed successfully (report was already complete)')
      return // Exit early - already complete
    }
    
    // Report is pending - proceed with research flow
    console.log('Step A.5 completed: Report is pending - proceeding with research')

    // Step B: Generate the Plan
    console.log('Step B: Generating research plan')
    const planResponse = await supabaseAdminClient.functions.invoke('generate-research-plan', {
      body: {
        project_context: projectData.project_context,
        documents_summary: projectData.key_documents_summary,
        chapter_prompt: projectData.chapter_templates.chapter_prompt
      }
    })

    if (planResponse.error) {
      throw new Error(`Failed to generate research plan: ${planResponse.error.message}`)
    }

    const { research_plan } = planResponse.data
    
    if (!Array.isArray(research_plan) || research_plan.length === 0) {
      throw new Error('Invalid or empty research plan received')
    }

    console.log(`Step B completed: Generated ${research_plan.length} research tasks`)

    // Step C: Execute Tasks in Parallel with Controlled Concurrency
    console.log('Step C: Executing atomic research tasks with controlled concurrency')
    const CONCURRENCY_LIMIT = 1
    const atomicResults: any[] = new Array(research_plan.length)
    const taskErrors: { index: number; error: string }[] = []
    
    // Helper function to execute a single atomic task with timeout and retry handling
    const runTask = async (question: string, index: number): Promise<{ result: any; index: number; success: boolean }> => {
      const MAX_RETRIES = 2
      const TASK_TIMEOUT_MS = 180000 // 3 minutes timeout per task
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const attemptSuffix = attempt > 1 ? ` (attempt ${attempt}/${MAX_RETRIES})` : ''
          console.log(`Starting atomic task ${index + 1}${attemptSuffix}: ${question.substring(0, 100)}...`)
          
          // Create a timeout promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Task timeout after 3 minutes')), TASK_TIMEOUT_MS)
          })
          
          // Race between the actual task and the timeout
          const taskPromise = supabaseAdminClient.functions.invoke('execute-atomic-task', {
            body: { question }
          })
          
          const taskResponse = await Promise.race([taskPromise, timeoutPromise])

          if (taskResponse.error) {
            const errorMsg = `Task ${index + 1} failed${attemptSuffix}: ${taskResponse.error.message}`
            console.error(errorMsg)
            
            // If this was the last attempt, record the error
            if (attempt === MAX_RETRIES) {
              taskErrors.push({ index, error: errorMsg })
              return { result: null, index, success: false }
            }
            
            // Otherwise, try again after a short delay
            console.log(`Retrying task ${index + 1} in 5 seconds...`)
            await new Promise(resolve => setTimeout(resolve, 5000))
            continue
          }

          console.log(`Completed atomic task ${index + 1}${attemptSuffix}`)
          return { result: taskResponse.data, index, success: true }
          
        } catch (error) {
          const errorMsg = `Task ${index + 1} threw exception${attempt > 1 ? ` (attempt ${attempt}/${MAX_RETRIES})` : ''}: ${error.message}`
          console.error(errorMsg)
          
          // If this was the last attempt, record the error
          if (attempt === MAX_RETRIES) {
            taskErrors.push({ index, error: errorMsg })
            return { result: null, index, success: false }
          }
          
          // For timeouts or 504s, try again after a longer delay
          if (error.message.includes('timeout') || error.message.includes('504') || error.message.includes('Gateway Timeout')) {
            console.log(`Task ${index + 1} timed out, retrying in 10 seconds...`)
            await new Promise(resolve => setTimeout(resolve, 10000))
          } else {
            // For other errors, try again after a short delay
            console.log(`Retrying task ${index + 1} in 5 seconds...`)
            await new Promise(resolve => setTimeout(resolve, 5000))
          }
        }
      }
      
      // This should never be reached due to the return statements above
      return { result: null, index, success: false }
    }

    // Concurrent queue implementation using worker pool pattern with error resilience
    let taskIndex = 0

    // Create worker function that processes tasks from the queue
    const createWorker = async (): Promise<void> => {
      while (taskIndex < research_plan.length) {
        const currentIndex = taskIndex++
        const taskResult = await runTask(research_plan[currentIndex], currentIndex)
        
        // Store result regardless of success/failure
        atomicResults[taskResult.index] = taskResult.success ? taskResult.result : null
      }
    }

    // Start worker pool (up to concurrency limit)
    const workerCount = Math.min(CONCURRENCY_LIMIT, research_plan.length)
    const workers: Promise<void>[] = []
    
    for (let i = 0; i < workerCount; i++) {
      workers.push(createWorker())
    }

    // Wait for all workers to complete
    await Promise.all(workers)
    
    // Report results and handle errors
    const successfulTasks = atomicResults.filter(result => result !== null).length
    const failedTasks = taskErrors.length
    
    console.log(`Step C completed: ${successfulTasks} successful, ${failedTasks} failed out of ${research_plan.length} total tasks`)
    
    if (failedTasks > 0) {
      console.warn('Failed tasks:', taskErrors.map(e => `Task ${e.index + 1}: ${e.error}`).join('; '))
    }

    // If all tasks failed, throw an error
    if (successfulTasks === 0) {
      throw new Error(`All ${research_plan.length} atomic tasks failed. First error: ${taskErrors[0]?.error || 'Unknown error'}`)
    }
    
    // If more than half failed, log a warning but continue
    if (failedTasks > successfulTasks) {
      console.warn(`Warning: More tasks failed (${failedTasks}) than succeeded (${successfulTasks}). Proceeding with available results.`)
    }

    // Step D: Combine the Results
    console.log('Step D: Combining research results')
    const combinedReportTexts = atomicResults
      .map((result, index) => {
        if (result === null) {
          // Task failed, create a placeholder entry
          return `## Research Task ${index + 1}: ${research_plan[index]}\n\n*[This research task failed to complete and no data is available]*`
        }
        const reportText = result.report_text || ''
        return `## Research Task ${index + 1}: ${research_plan[index]}\n\n${reportText}`
      })
      .filter(text => text.trim().length > 0) // Remove any completely empty entries

    const rawData = combinedReportTexts.join('\n\n---\n\n')
    console.log(`Step D completed: Combined ${combinedReportTexts.length} reports into raw data (including ${taskErrors.length} failed task placeholders)`)

    // Step D.5: Synthesize the Raw Data into Professional Report
    console.log('Step D.5: Synthesizing raw data into professional report')
    
    // Get OpenRouter API key from environment
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterApiKey) {
      throw new Error('SERVER ERROR: OPENROUTER_API_KEY was not found in the environment.')
    }

    // Construct the synthesis prompt
    const synthesisPrompt = SYNTHESIZER_META_PROMPT.replace('{raw_data}', rawData)

    // Call OpenRouter for synthesis using large-context model
    const synthesisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: synthesisPrompt }],
      }),
    })

    if (!synthesisResponse.ok) {
      const errorBody = await synthesisResponse.text()
      throw new Error(`Synthesis API request failed: ${synthesisResponse.status} ${synthesisResponse.statusText} - ${errorBody}`)
    }

    const synthesisAiResponse = await synthesisResponse.json()
    const finalReport = synthesisAiResponse.choices[0].message.content

    if (!finalReport) {
      throw new Error('No synthesized content received from AI model')
    }

    console.log('Step D.5 completed: Raw data synthesized into professional report')

    // Step E: Save the Final Report
    console.log('Step E: Saving synthesized final report to database')
    const { data: updatedReport, error: updateError } = await supabaseAdminClient
      .from('reports')
      .update({
        final_report: finalReport,
        status: 'complete'
      })
      .eq('id', report_id)
      .select('*')
      .single()

    if (updateError) {
      throw new Error(`Failed to update report: ${updateError.message}`)
    }

    console.log('Step E completed: Synthesized final report saved successfully')

    // Update job status to completed
    await supabaseAdminClient
      .from('jobs')
      .update({ 
        status: 'completed',
        last_ran_at: new Date().toISOString()
      })
      .eq('id', job_id)

    console.log('Step F: Orchestration completed successfully')

  } catch (error) {
    console.error('Error in runOrchestration:', error)
    
    // Update job status to failed with error log
    try {
      if (!supabaseAdminClient) {
        supabaseAdminClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
      }
      
      await supabaseAdminClient
        .from('jobs')
        .update({ 
          status: 'failed',
          error_log: error.message,
          last_ran_at: new Date().toISOString()
        })
        .eq('id', job_id)
        
      console.log(`Job ${job_id} status updated to 'failed' due to orchestration failure`)
      
      // Also update report status to error
      await supabaseAdminClient
        .from('reports')
        .update({ status: 'error' })
        .eq('id', report_id)
        
      console.log(`Report ${report_id} status updated to 'error' due to orchestration failure`)
    } catch (updateError) {
      console.error('Failed to update job/report status to failed/error:', updateError)
    }
    
    throw error // Re-throw to be caught by the main handler
  }
}

async function processNextJob() {
  const supabaseAdminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // Find the oldest pending job of type 'execute_research'
    console.log('Looking for pending research jobs...')
    const { data: pendingJob, error: fetchError } = await supabaseAdminClient
      .from('jobs')
      .select('*')
      .eq('job_type', 'execute_research')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        // No pending jobs found
        console.log('No pending research jobs found')
        return
      }
      throw new Error(`Failed to fetch pending job: ${fetchError.message}`)
    }

    console.log(`Found pending job: ${pendingJob.id}`)

    // Immediately update job status to 'in_progress' to prevent other workers from picking it up
    const { error: updateError } = await supabaseAdminClient
      .from('jobs')
      .update({ 
        status: 'in_progress',
        last_ran_at: new Date().toISOString()
      })
      .eq('id', pendingJob.id)

    if (updateError) {
      throw new Error(`Failed to update job status to in_progress: ${updateError.message}`)
    }

    console.log(`Job ${pendingJob.id} marked as in_progress`)

    // Extract report_id from payload
    const { report_id } = pendingJob.payload
    if (!report_id) {
      throw new Error('Job payload missing report_id')
    }

    console.log(`Processing job ${pendingJob.id} for report ${report_id}`)

    // Execute the full orchestration logic
    await runOrchestration(report_id, pendingJob.id)

    console.log(`Job ${pendingJob.id} completed successfully`)

  } catch (error) {
    console.error('Error in processNextJob:', error)
    throw error
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Research worker triggered')
    
    // Process the next pending job
    await processNextJob()

    // Return success response
    return new Response(JSON.stringify({ message: "Worker completed successfully" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in research-worker handler:', error)
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
