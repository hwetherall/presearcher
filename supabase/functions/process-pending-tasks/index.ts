// supabase/functions/process-pending-tasks/index.ts
// Emergency function to manually process pending atomic tasks when Next.js app is not available

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get all pending atomic tasks
    const { data: pendingTasks, error: fetchError } = await supabaseAdminClient
      .from('atomic_tasks')
      .select('id, question, job_id, report_id, task_index')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10) // Process up to 10 tasks at a time

    if (fetchError) {
      throw new Error(`Failed to fetch pending tasks: ${fetchError.message}`)
    }

    if (!pendingTasks || pendingTasks.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No pending tasks found',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`Found ${pendingTasks.length} pending tasks to process`)

    // Process each task
    let successCount = 0
    let failureCount = 0

    for (const task of pendingTasks) {
      try {
        console.log(`Processing task ${task.id}: ${task.question.substring(0, 50)}...`)

        // Mark as processing
        await supabaseAdminClient
          .from('atomic_tasks')
          .update({ 
            status: 'processing',
            started_at: new Date().toISOString()
          })
          .eq('id', task.id)

        // Call the execute-atomic-task function
        const taskResponse = await supabaseAdminClient.functions.invoke('execute-atomic-task', {
          body: { question: task.question }
        })

        if (taskResponse.error) {
          throw new Error(`Task execution failed: ${taskResponse.error.message}`)
        }

        const { report_text } = taskResponse.data

        if (!report_text) {
          throw new Error('No report text returned from task execution')
        }

        // Update task with result
        await supabaseAdminClient
          .from('atomic_tasks')
          .update({ 
            status: 'completed',
            result: { report_text },
            completed_at: new Date().toISOString()
          })
          .eq('id', task.id)

        console.log(`Task ${task.id} completed successfully`)
        successCount++

      } catch (error: any) {
        console.error(`Task ${task.id} failed:`, error)
        
        // Mark task as failed
        await supabaseAdminClient
          .from('atomic_tasks')
          .update({ 
            status: 'failed',
            error_message: error.message,
            result: { report_text: '[This research task failed due to processing error. No data is available for this section.]' },
            completed_at: new Date().toISOString()
          })
          .eq('id', task.id)

        failureCount++
      }
    }

    return new Response(JSON.stringify({ 
      message: `Processed ${pendingTasks.length} tasks`,
      successful: successCount,
      failed: failureCount,
      total: pendingTasks.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Error in process-pending-tasks function:', error)
    
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
