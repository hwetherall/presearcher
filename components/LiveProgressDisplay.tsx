// components/LiveProgressDisplay.tsx
'use client'

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CheckCircle, Loader, AlertTriangle, FileText, ChevronDown, Clock, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AtomicTask {
  id: string;
  task_index: number;
  question: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: { report_text: string };
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

interface LiveProgressDisplayProps {
  reportId: string;
  onComplete: (finalReport: string) => void;
  onError: (errorMessage: string) => void;
}

const LiveProgressDisplay: React.FC<LiveProgressDisplayProps> = ({ reportId, onComplete, onError }) => {
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobPayload, setJobPayload] = useState<any>(null);
  const [atomicTasks, setAtomicTasks] = useState<AtomicTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isCompleteRef = useRef(false);
  const lastPollRef = useRef<number>(0);

  useEffect(() => {
    const pollStatus = async () => {
      // Stop polling if the job has already completed or failed
      if (isCompleteRef.current) {
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }

      const now = Date.now();
      
      try {
        // Fetch job status
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .select('status, payload, error_log')
          .eq('payload->>report_id', reportId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (jobError && jobError.code !== 'PGRST116') throw jobError;

        if (jobData) {
          setJobStatus(jobData.status);
          setJobPayload(jobData.payload);

          // Only fetch atomic tasks if we haven't polled recently or if there are active tasks
          const shouldFetchTasks = 
            now - lastPollRef.current > 2000 || // Always fetch if it's been more than 2 seconds
            atomicTasks.some(task => task.status === 'processing') || // Fetch if any tasks are processing
            atomicTasks.length === 0; // Fetch if we don't have tasks yet

          if (shouldFetchTasks) {
            const { data: tasksData, error: tasksError } = await supabase
              .from('atomic_tasks')
              .select('id, task_index, question, status, result, error_message, started_at, completed_at')
              .eq('report_id', reportId)
              .order('task_index', { ascending: true });

            if (tasksError) {
              console.error('Error fetching atomic tasks:', tasksError);
            } else if (tasksData) {
              // Only update if tasks have actually changed
              const tasksChanged = JSON.stringify(tasksData) !== JSON.stringify(atomicTasks);
              if (tasksChanged) {
                setAtomicTasks(tasksData);
              }
            }
            lastPollRef.current = now;
          }

          if (jobData.status === 'failed') {
            isCompleteRef.current = true;
            setError(jobData.error_log || 'An unknown error occurred.');
            onError(jobData.error_log || 'An unknown error occurred.');
            if (pollingRef.current) {
              clearTimeout(pollingRef.current);
              pollingRef.current = null;
            }
          } else if (jobData.status === 'completed') {
            isCompleteRef.current = true;
            const { data: reportData, error: reportError } = await supabase
              .from('reports')
              .select('final_report')
              .eq('id', reportId)
              .single();
            
            if (reportError) throw reportError;
            onComplete(reportData.final_report);
            if (pollingRef.current) {
              clearTimeout(pollingRef.current);
              pollingRef.current = null;
            }
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
        setError('Failed to get status.');
        onError('Failed to get status.');
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
      }
    };

    // Adaptive polling strategy
    const startPolling = () => {
      pollStatus(); // Poll immediately
      
      // Use adaptive intervals based on activity
      const getPollingInterval = () => {
        const processingCount = atomicTasks.filter(task => task.status === 'processing').length;
        if (processingCount > 0) {
          return 2000; // 2 seconds when tasks are actively processing
        } else if (atomicTasks.length > 0 && atomicTasks.some(task => task.status === 'pending')) {
          return 4000; // 4 seconds when tasks are pending
        } else {
          return 6000; // 6 seconds for general status checks
        }
      };

      const scheduleNextPoll = () => {
        if (!isCompleteRef.current) {
          pollingRef.current = setTimeout(() => {
            pollStatus().then(() => scheduleNextPoll());
          }, getPollingInterval());
        }
      };

      scheduleNextPoll();
    };

    startPolling();

    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [reportId, onComplete, onError]);

  const renderOverallStatus = () => {
    if (error) return (
      <div className="flex items-center space-x-3 text-red-400">
        <AlertTriangle className="w-8 h-8 flex-shrink-0" />
        <div>
          <p className="font-semibold">Research Failed</p>
          <p className="text-sm text-red-300">{error}</p>
        </div>
      </div>
    );

    if (jobStatus === 'completed') return (
      <div className="flex items-center space-x-3 text-green-400">
        <CheckCircle className="w-8 h-8 flex-shrink-0" />
        <p className="font-semibold">Report Generation Complete</p>
      </div>
    );

    // Calculate progress based on atomic tasks
    const completedTasks = atomicTasks.filter(task => task.status === 'completed').length;
    const processingTasks = atomicTasks.filter(task => task.status === 'processing').length;
    const failedTasks = atomicTasks.filter(task => task.status === 'failed').length;
    const totalTasks = atomicTasks.length;

    let progressMessage = 'Initializing research...';
    let statusColor = 'text-blue-300';
    
    if (jobStatus === 'pending') {
      progressMessage = 'Job is queued and waiting to be processed...';
    } else if (totalTasks > 0) {
      if (completedTasks === totalTasks) {
        progressMessage = `All ${totalTasks} research tasks complete. Synthesizing final report...`;
        statusColor = 'text-green-300';
      } else if (processingTasks > 0) {
        progressMessage = `${completedTasks}/${totalTasks} tasks complete, ${processingTasks} in progress`;
        statusColor = 'text-blue-300';
      } else if (completedTasks > 0) {
        progressMessage = `${completedTasks}/${totalTasks} tasks complete`;
        statusColor = 'text-blue-300';
      } else {
        progressMessage = `${totalTasks} research tasks planned, starting execution...`;
      }
      
      if (failedTasks > 0) {
        progressMessage += ` (${failedTasks} failed)`;
        statusColor = 'text-yellow-300';
      }
    } else if (jobStatus === 'in_progress') {
      progressMessage = 'Generating research plan...';
    }

    return (
      <div className={`flex items-center space-x-3 ${statusColor}`}>
        <Loader className="w-8 h-8 animate-spin flex-shrink-0" />
        <div>
          <p className="font-semibold">{progressMessage}</p>
          <p className="text-sm opacity-75">
            {totalTasks > 0 ? 'Reports appear below as tasks complete in parallel' : 'Results will appear below as they complete.'}
          </p>
        </div>
      </div>
    );
  };

  // Helper function to format timestamps
  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Helper function to calculate duration
  const calculateDuration = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return '';
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const minutes = Math.floor(diffSec / 60);
    const seconds = diffSec % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 my-6 animate-in fade-in duration-500">
      <div className="mb-4">
        {renderOverallStatus()}
      </div>

      {atomicTasks.length > 0 && (
        <div className="border-t border-zinc-700 pt-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-md font-semibold text-zinc-200">Atomic Research Progress</h4>
            <div className="text-xs text-zinc-400 flex items-center space-x-4">
              <span className="flex items-center">
                <CheckCircle className="w-3 h-3 mr-1" />
                {atomicTasks.filter(t => t.status === 'completed').length} completed
              </span>
              <span className="flex items-center">
                <Loader className="w-3 h-3 mr-1" />
                {atomicTasks.filter(t => t.status === 'processing').length} processing
              </span>
              <span className="flex items-center">
                <FileText className="w-3 h-3 mr-1" />
                {atomicTasks.filter(t => t.status === 'pending').length} pending
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {atomicTasks
              .sort((a, b) => {
                // Sort by completion time (completed tasks first, in order of completion)
                if (a.status === 'completed' && b.status === 'completed') {
                  return (a.completed_at || '').localeCompare(b.completed_at || '');
                }
                if (a.status === 'completed') return -1;
                if (b.status === 'completed') return 1;
                
                // Then by processing status
                if (a.status === 'processing' && b.status !== 'processing') return -1;
                if (b.status === 'processing' && a.status !== 'processing') return 1;
                
                // Finally by task index
                return a.task_index - b.task_index;
              })
              .map((task) => {
                const isComplete = task.status === 'completed';
                const isProcessing = task.status === 'processing';
                const isFailed = task.status === 'failed';

                return (
                  <details 
                    key={task.id} 
                    className={`border rounded-lg group transition-all duration-300 ${
                      isComplete 
                        ? 'bg-green-900/20 border-green-800/50 animate-in fade-in duration-500' 
                        : isProcessing 
                        ? 'bg-blue-900/20 border-blue-800/50' 
                        : isFailed 
                        ? 'bg-red-900/20 border-red-800/50' 
                        : 'bg-zinc-800/50 border-zinc-700'
                    }`}
                    {...(isComplete ? { open: true } : {})}
                  >
                    <summary className="flex items-center justify-between p-3 cursor-pointer list-none">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="flex items-center mr-3">
                          {isComplete ? (
                            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                          ) : isProcessing ? (
                            <Loader className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
                          ) : isFailed ? (
                            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                          ) : (
                            <FileText className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-300 truncate pr-2">{task.question}</p>
                          <div className="flex items-center space-x-3 mt-1 text-xs text-zinc-500">
                            <span>Task #{task.task_index + 1}</span>
                            {task.started_at && (
                              <span className="flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                Started {formatTimestamp(task.started_at)}
                              </span>
                            )}
                            {task.completed_at && (
                              <span className="flex items-center text-green-400">
                                <Zap className="w-3 h-3 mr-1" />
                                Completed in {calculateDuration(task.started_at, task.completed_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronDown className="w-5 h-5 text-zinc-400 group-open:rotate-180 transition-transform flex-shrink-0" />
                    </summary>
                    <div className="p-4 border-t border-current/20">
                      {isComplete && task.result?.report_text ? (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:text-zinc-300">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {task.result.report_text}
                          </ReactMarkdown>
                        </div>
                      ) : isFailed ? (
                        <div className="text-sm text-red-300">
                          <p className="font-medium">Task Failed</p>
                          <p className="text-red-400 mt-1">{task.error_message || 'Unknown error occurred'}</p>
                        </div>
                      ) : isProcessing ? (
                        <p className="text-sm text-blue-300 italic flex items-center">
                          <Loader className="w-4 h-4 animate-spin mr-2" />
                          Research currently in progress...
                        </p>
                      ) : (
                        <p className="text-sm text-zinc-400 italic">This task is pending execution.</p>
                      )}
                    </div>
                  </details>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveProgressDisplay;
