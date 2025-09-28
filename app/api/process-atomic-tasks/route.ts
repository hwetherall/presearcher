// app/api/process-atomic-tasks/route.ts
// This API route processes long-running atomic research tasks without timeout limitations

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Store active processing to prevent duplicate processing
const activeProcessing = new Set<string>()

interface AtomicTask {
  id: string
  job_id: number
  report_id: string
  task_index: number
  question: string
  context?: string // Add this new optional field
  status: string
}

async function callPerplexityAPI(question: string, context: string | undefined, model: string, timeout: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Construct a more intelligent prompt using the context
  const fullPrompt = `
**[Project Context]**
${context || 'No overall project context was provided.'}

**[Specific Question]**
Your specific task is to research and answer the following question. Use the project context above for strategic guidance and to ensure your answer is relevant to the overall goals.
Question: "${question}"

**CRITICAL CITATION REQUIREMENTS:**
- You MUST provide complete source URLs for every fact, statistic, or claim you make.
- Use inline citations with full URLs in brackets: [https://example.com]
- For each source, include the publication name and date when available.
- At the end of your response, provide a "Sources" section with a numbered list of all URLs used.
- If you cannot find reliable sources, explicitly state "No verifiable public evidence was found".
- Do NOT use placeholder citations like [1], [2], etc. - always provide the actual URLs.
`;

  try {
    console.log(`[Atomic Task] Attempting research with model: ${model}`);
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: fullPrompt }],
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const aiResponse = await response.json();
    const reportText = aiResponse.choices[0]?.message?.content;

    if (!reportText) {
      throw new Error('No content received from AI model');
    }
    
    console.log(`[Atomic Task] Successfully completed research with model: ${model}`);
    return reportText;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`API call to ${model} timed out after ${timeout / 1000}s`);
    }
    throw error;
  }
}

async function processAtomicTask(task: AtomicTask): Promise<void> {
  // Prevent duplicate processing
  if (activeProcessing.has(task.id)) {
    console.log(`[Atomic Task] Task ${task.id} is already being processed`)
    return
  }

  activeProcessing.add(task.id)

  try {
    // Mark task as processing
    await supabaseAdmin
      .from('atomic_tasks')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', task.id)

    console.log(`[Atomic Task] Processing task ${task.id}: "${task.question.substring(0, 50)}..."`)

    let reportText: string | null = null
    const errors: string[] = []

    // 1. Try the powerful, slower model first (5 minutes timeout)
    try {
      reportText = await callPerplexityAPI(task.question, task.context, "perplexity/sonar-deep-research", 300000)
    } catch (error: any) {
      console.warn(`[Atomic Task] Deep research model failed: ${error.message}`)
      errors.push(error.message)
      
      // 2. If it fails, fall back to the faster, reliable model (45s timeout)
      try {
        reportText = await callPerplexityAPI(task.question, task.context, "perplexity/sonar-pro", 45000)
      } catch (fallbackError: any) {
        console.warn(`[Atomic Task] Fallback model failed: ${fallbackError.message}`)
        errors.push(fallbackError.message)
        
        // 3. If that also fails, use the fastest, general-purpose model (25s timeout)
        try {
          reportText = await callPerplexityAPI(task.question, task.context, "google/gemini-2.5-flash", 25000)
        } catch (finalFallbackError: any) {
          console.error(`[Atomic Task] All models failed for task ${task.id}`)
          errors.push(finalFallbackError.message)
        }
      }
    }

    // Update task with result or failure
    if (reportText) {
      await supabaseAdmin
        .from('atomic_tasks')
        .update({ 
          status: 'completed',
          result: { report_text: reportText },
          completed_at: new Date().toISOString()
        })
        .eq('id', task.id)

      console.log(`[Atomic Task] Task ${task.id} completed successfully`)
    } else {
      const errorMessage = `All models failed: ${errors.join('; ')}`
      await supabaseAdmin
        .from('atomic_tasks')
        .update({ 
          status: 'failed',
          error_message: errorMessage,
          result: { report_text: '[This research task failed after multiple attempts due to API errors or timeouts. No data is available for this section.]' },
          completed_at: new Date().toISOString()
        })
        .eq('id', task.id)

      console.error(`[Atomic Task] Task ${task.id} failed: ${errorMessage}`)
    }

  } catch (error: any) {
    console.error(`[Atomic Task] Unexpected error processing task ${task.id}:`, error)
    
    await supabaseAdmin
      .from('atomic_tasks')
      .update({ 
        status: 'failed',
        error_message: error.message,
        result: { report_text: '[This research task failed due to an unexpected error. No data is available for this section.]' },
        completed_at: new Date().toISOString()
      })
      .eq('id', task.id)
  } finally {
    activeProcessing.delete(task.id)
  }
}

// Main API route handler
export async function POST(request: Request) {
  try {
    // Optional: Add authentication check here
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      // For now, we'll allow any requests, but in production you should secure this
      // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // First, let's check all tasks to debug
    const { data: allTasks, error: allError } = await supabaseAdmin
      .from('atomic_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    
    console.log('[Atomic Task Processor] All tasks in DB:', allTasks?.length || 0, 'tasks found')
    if (allTasks && allTasks.length > 0) {
      console.log('[Atomic Task Processor] Task statuses:', allTasks.map(t => ({ id: t.id.substring(0, 8), status: t.status })))
    }

    // Fetch pending atomic tasks (limit to prevent overwhelming the system)
    const { data: pendingTasks, error: fetchError } = await supabaseAdmin
      .from('atomic_tasks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5) // Process up to 5 tasks concurrently

    if (fetchError) {
      console.error('[Atomic Task Processor] Error fetching pending tasks:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
    }

    if (!pendingTasks || pendingTasks.length === 0) {
      console.log('[Atomic Task Processor] No pending tasks found')
      return NextResponse.json({ message: 'No pending tasks', processed: 0 })
    }

    console.log(`[Atomic Task Processor] Found ${pendingTasks.length} pending tasks`)

    // Process tasks concurrently
    const processingPromises = pendingTasks.map(task => processAtomicTask(task))
    await Promise.allSettled(processingPromises)

    return NextResponse.json({ 
      message: 'Tasks processed',
      processed: pendingTasks.length 
    })

  } catch (error: any) {
    console.error('[Atomic Task Processor] Unexpected error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    status: 'healthy',
    activeProcessing: activeProcessing.size 
  })
}
