'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

interface AtomicTask {
  id: string
  task_index: number
  question: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: {
    report_text?: string
    [key: string]: any
  }
  error_message?: string
  started_at?: string
  completed_at?: string
  created_at: string
}

interface AtomicTasksDisplayProps {
  reportId: string
  className?: string
}

const AtomicTasksDisplay: React.FC<AtomicTasksDisplayProps> = ({ reportId, className = '' }) => {
  const [atomicTasks, setAtomicTasks] = useState<AtomicTask[]>([])
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch atomic tasks for the given report ID
  useEffect(() => {
    const fetchAtomicTasks = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const { data, error: fetchError } = await supabase
          .from('atomic_tasks')
          .select('id, task_index, question, status, result, error_message, started_at, completed_at, created_at')
          .eq('report_id', reportId)
          .order('task_index', { ascending: true })

        if (fetchError) throw fetchError

        setAtomicTasks(data || [])
      } catch (err) {
        console.error('Error fetching atomic tasks:', err)
        setError('Failed to load atomic tasks')
      } finally {
        setIsLoading(false)
      }
    }

    if (reportId) {
      fetchAtomicTasks()
    }
  }, [reportId])

  const toggleTaskExpansion = (taskId: string) => {
    const newExpanded = new Set(expandedTasks)
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId)
    } else {
      newExpanded.add(taskId)
    }
    setExpandedTasks(newExpanded)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'processing':
        return <Clock className="w-5 h-5 text-blue-500 animate-pulse" />
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400'
      case 'failed':
        return 'text-red-400'
      case 'processing':
        return 'text-blue-400'
      case 'pending':
        return 'text-yellow-400'
      default:
        return 'text-gray-400'
    }
  }

  const expandAll = () => {
    setExpandedTasks(new Set(atomicTasks.map(task => task.id)))
  }

  const collapseAll = () => {
    setExpandedTasks(new Set())
  }

  if (isLoading) {
    return (
      <div className={`bg-zinc-900 rounded-lg border border-zinc-800 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
          <span className="ml-3 text-zinc-400">Loading atomic tasks...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`bg-zinc-900 rounded-lg border border-zinc-800 p-6 ${className}`}>
        <div className="flex items-center text-red-400">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (atomicTasks.length === 0) {
    return (
      <div className={`bg-zinc-900 rounded-lg border border-zinc-800 p-6 ${className}`}>
        <div className="text-center py-8 text-zinc-400">
          No atomic tasks found for this report.
        </div>
      </div>
    )
  }

  const completedTasks = atomicTasks.filter(task => task.status === 'completed').length
  const failedTasks = atomicTasks.filter(task => task.status === 'failed').length
  const processingTasks = atomicTasks.filter(task => task.status === 'processing').length
  const pendingTasks = atomicTasks.filter(task => task.status === 'pending').length

  return (
    <div className={`bg-zinc-900 rounded-lg border border-zinc-800 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-zinc-100 mb-2">Atomic Tasks</h3>
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-zinc-400">
                Total: <span className="text-zinc-200 font-medium">{atomicTasks.length}</span>
              </span>
              {completedTasks > 0 && (
                <span className="text-green-400">
                  Completed: <span className="font-medium">{completedTasks}</span>
                </span>
              )}
              {processingTasks > 0 && (
                <span className="text-blue-400">
                  Processing: <span className="font-medium">{processingTasks}</span>
                </span>
              )}
              {pendingTasks > 0 && (
                <span className="text-yellow-400">
                  Pending: <span className="font-medium">{pendingTasks}</span>
                </span>
              )}
              {failedTasks > 0 && (
                <span className="text-red-400">
                  Failed: <span className="font-medium">{failedTasks}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={expandAll}
              className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="divide-y divide-zinc-800">
        {atomicTasks.map((task) => {
          const isExpanded = expandedTasks.has(task.id)
          const hasResult = task.result && task.result.report_text
          
          return (
            <div key={task.id} className="p-4">
              {/* Task Header */}
              <button
                onClick={() => toggleTaskExpansion(task.id)}
                className="w-full flex items-start space-x-3 text-left hover:bg-zinc-800/50 p-2 rounded-lg transition-colors"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  )}
                </div>
                
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(task.status)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-sm font-medium text-zinc-300">
                      Task #{task.task_index + 1}
                    </span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                  </div>
                  
                  <p className="text-zinc-100 text-sm leading-relaxed">
                    {task.question}
                  </p>
                  
                  <div className="flex items-center space-x-4 mt-2 text-xs text-zinc-500">
                    <span>Created: {new Date(task.created_at).toLocaleDateString()}</span>
                    {task.started_at && (
                      <span>Started: {new Date(task.started_at).toLocaleDateString()}</span>
                    )}
                    {task.completed_at && (
                      <span>Completed: {new Date(task.completed_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="mt-4 ml-9 space-y-4">
                  {/* Error Message */}
                  {task.status === 'failed' && task.error_message && (
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
                      <h4 className="text-red-400 font-medium mb-2 flex items-center">
                        <XCircle className="w-4 h-4 mr-2" />
                        Error Message
                      </h4>
                      <p className="text-red-200 text-sm whitespace-pre-wrap">
                        {task.error_message}
                      </p>
                    </div>
                  )}

                  {/* Result */}
                  {hasResult && (
                    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
                      <h4 className="text-zinc-300 font-medium mb-3 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                        Research Result
                      </h4>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <div 
                          className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ 
                            __html: task.result.report_text.replace(/\n/g, '<br/>') 
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Raw Result Data (if available and different from report_text) */}
                  {task.result && Object.keys(task.result).length > 0 && (
                    <details className="bg-zinc-800/50 border border-zinc-700 rounded-lg">
                      <summary className="p-3 cursor-pointer text-zinc-400 hover:text-zinc-300 text-sm">
                        Raw Result Data (JSON)
                      </summary>
                      <div className="p-3 pt-0">
                        <pre className="text-xs text-zinc-400 overflow-x-auto">
                          {JSON.stringify(task.result, null, 2)}
                        </pre>
                      </div>
                    </details>
                  )}

                  {/* No result message for completed tasks without results */}
                  {task.status === 'completed' && !hasResult && (
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
                      <p className="text-zinc-400 text-sm">
                        Task completed but no result data is available.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AtomicTasksDisplay
