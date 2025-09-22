import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CheckCircle, Loader, AlertTriangle, FileText } from 'lucide-react';

interface JobStatusDisplayProps {
  reportId: string;
  onComplete: (finalReport: string) => void;
  onError: (errorMessage: string) => void;
}

const JobStatusDisplay: React.FC<JobStatusDisplayProps> = ({ reportId, onComplete, onError }) => {
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobPayload, setJobPayload] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const pollJobStatus = async () => {
      try {
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .select('status, payload, error_log')
          .eq('payload->>report_id', reportId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (jobError && jobError.code !== 'PGRST116') { // PGRST116 = no rows found
          throw jobError;
        }

        if (jobData) {
          setJobStatus(jobData.status);
          setJobPayload(jobData.payload);

          if (jobData.status === 'failed') {
            setError(jobData.error_log || 'An unknown error occurred.');
            if (pollingRef.current) clearInterval(pollingRef.current);
            onError(jobData.error_log || 'An unknown error occurred.');
          } else if (jobData.status === 'completed') {
            // Job is done, now fetch the final report
            const { data: reportData, error: reportError } = await supabase
              .from('reports')
              .select('final_report')
              .eq('id', reportId)
              .single();
            
            if (reportError) throw reportError;

            if (pollingRef.current) clearInterval(pollingRef.current);
            onComplete(reportData.final_report);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
        setError('Failed to get job status.');
        if (pollingRef.current) clearInterval(pollingRef.current);
        onError('Failed to get job status.');
      }
    };

    // Poll immediately and then set an interval
    pollJobStatus();
    pollingRef.current = setInterval(pollJobStatus, 4000); // Poll every 4 seconds

    // Cleanup on unmount
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [reportId, onComplete, onError]);

  const renderStatus = () => {
    if (error) {
      return (
        <div className="flex items-center space-x-3 text-red-400">
          <AlertTriangle className="w-8 h-8" />
          <div>
            <p className="font-semibold">Research Failed</p>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      );
    }

    if (jobStatus === 'completed') {
      return (
        <div className="flex items-center space-x-3 text-green-400">
          <CheckCircle className="w-8 h-8" />
          <p className="font-semibold">Report Generated</p>
        </div>
      );
    }

    let progressMessage = 'Initializing research...';
    if (jobStatus === 'pending') {
      progressMessage = 'Job is queued and waiting to be processed...';
    } else if (jobStatus === 'in_progress') {
      if (jobPayload?.research_plan && jobPayload?.next_task_index !== undefined) {
        const totalTasks = jobPayload.research_plan.length;
        const currentTask = jobPayload.next_task_index;
        if (currentTask >= totalTasks) {
          progressMessage = 'All research tasks complete. Synthesizing final report...';
        } else {
          progressMessage = `Researching task ${currentTask + 1} of ${totalTasks}...`;
        }
      } else {
        progressMessage = 'Generating research plan...';
      }
    }

    return (
      <div className="flex items-center space-x-3 text-blue-300">
        <Loader className="w-8 h-8 animate-spin" />
        <div>
            <p className="font-semibold">{progressMessage}</p>
            <p className="text-sm text-blue-400">This may take several minutes. You can safely leave this page.</p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 my-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-100 flex items-center space-x-2">
            <FileText className="w-5 h-5" />
            <span>Research Progress</span>
          </h3>
      </div>
      {renderStatus()}
    </div>
  );
};

export default JobStatusDisplay;
