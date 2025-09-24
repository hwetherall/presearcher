// app/api/reset-stuck-tasks/route.ts
// API route to reset stuck tasks that are in 'processing' status for too long

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    // Find tasks that have been processing for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    
    const { data: stuckTasks, error: fetchError } = await supabaseAdmin
      .from('atomic_tasks')
      .select('*')
      .eq('status', 'processing')
      .or(`started_at.is.null,started_at.lt.${tenMinutesAgo}`)

    if (fetchError) {
      console.error('Error fetching stuck tasks:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch stuck tasks' }, { status: 500 })
    }

    if (!stuckTasks || stuckTasks.length === 0) {
      return NextResponse.json({ message: 'No stuck tasks found', reset: 0 })
    }

    console.log(`Found ${stuckTasks.length} stuck tasks, resetting to pending...`)

    // Reset stuck tasks back to pending
    const { error: updateError } = await supabaseAdmin
      .from('atomic_tasks')
      .update({ 
        status: 'pending',
        started_at: null,
        error_message: null
      })
      .eq('status', 'processing')
      .or(`started_at.is.null,started_at.lt.${tenMinutesAgo}`)

    if (updateError) {
      console.error('Error resetting stuck tasks:', updateError)
      return NextResponse.json({ error: 'Failed to reset stuck tasks' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: `Reset ${stuckTasks.length} stuck tasks to pending`,
      reset: stuckTasks.length 
    })

  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  // Check for stuck tasks without resetting them
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  
  const { data: stuckTasks, error } = await supabaseAdmin
    .from('atomic_tasks')
    .select('id, status, started_at')
    .eq('status', 'processing')
    .or(`started_at.is.null,started_at.lt.${tenMinutesAgo}`)

  if (error) {
    return NextResponse.json({ error: 'Failed to check stuck tasks' }, { status: 500 })
  }

  return NextResponse.json({ 
    stuckTasks: stuckTasks?.length || 0,
    tasks: stuckTasks || []
  })
}
