'use client'

import { useEffect, useRef } from 'react'

export default function BackgroundProcessor() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isProcessingRef = useRef(false)

  useEffect(() => {
    const processAtomicTasks = async () => {
      // Prevent concurrent processing
      if (isProcessingRef.current) return
      
      isProcessingRef.current = true
      
      try {
        const response = await fetch('/api/process-atomic-tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({})
        })

        if (response.ok) {
          const result = await response.json()
          if (result.processed > 0) {
            console.log(`[Background Processor] Processed ${result.processed} atomic tasks`)
          }
        }
      } catch (error) {
        console.error('[Background Processor] Error:', error)
      } finally {
        isProcessingRef.current = false
      }
    }

    // Process immediately on mount
    processAtomicTasks()

    // Then set up interval for continuous processing
    intervalRef.current = setInterval(processAtomicTasks, 10000) // Check every 10 seconds

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  // This component doesn't render anything visible
  return null
}
