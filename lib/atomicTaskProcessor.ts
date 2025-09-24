// lib/atomicTaskProcessor.ts
// Background processor for atomic research tasks

class AtomicTaskProcessor {
  private isRunning: boolean = false
  private intervalId: NodeJS.Timeout | null = null
  private processingInterval: number = 10000 // Check every 10 seconds

  async start() {
    if (this.isRunning) {
      console.log('[AtomicTaskProcessor] Already running')
      return
    }

    console.log('[AtomicTaskProcessor] Starting background processor')
    this.isRunning = true

    // Process immediately on start
    await this.processTasks()

    // Then set up interval for continuous processing
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.processTasks()
      }
    }, this.processingInterval)
  }

  stop() {
    console.log('[AtomicTaskProcessor] Stopping background processor')
    this.isRunning = false
    
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async processTasks() {
    try {
      // Use the internal API route to process tasks
      const response = await fetch('/api/process-atomic-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      })

      if (!response.ok) {
        console.error('[AtomicTaskProcessor] Failed to trigger task processing:', response.statusText)
        return
      }

      const result = await response.json()
      if (result.processed > 0) {
        console.log(`[AtomicTaskProcessor] Processed ${result.processed} tasks`)
      }
    } catch (error) {
      console.error('[AtomicTaskProcessor] Error processing tasks:', error)
    }
  }

  setInterval(ms: number) {
    this.processingInterval = ms
    
    // Restart with new interval if running
    if (this.isRunning) {
      this.stop()
      this.start()
    }
  }
}

// Create singleton instance
const atomicTaskProcessor = new AtomicTaskProcessor()

export default atomicTaskProcessor
