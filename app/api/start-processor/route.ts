// app/api/start-processor/route.ts
// API route to manually start/stop the atomic task processor

import { NextResponse } from 'next/server'
import atomicTaskProcessor from '@/lib/atomicTaskProcessor'

export async function POST(request: Request) {
  try {
    const { action } = await request.json()
    
    if (action === 'start') {
      await atomicTaskProcessor.start()
      return NextResponse.json({ message: 'Processor started' })
    } else if (action === 'stop') {
      atomicTaskProcessor.stop()
      return NextResponse.json({ message: 'Processor stopped' })
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'Ready to process',
    info: 'POST with {"action": "start"} to begin processing'
  })
}
