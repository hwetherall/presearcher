'use client'

import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import ReportDisplay from '@/components/ReportDisplay'
// import BriefReviewModal from '@/components/BriefReviewModal' // No longer needed
import JobStatusDisplay from '@/components/JobStatusDisplay';
import { Upload, Sparkles, Search, ArrowRight, FileText, AlertCircle } from 'lucide-react'

export default function ResearchCopilot() {
  // Chapter Templates State
  const [templates, setTemplates] = useState<{ id: string; name: string; }[]>([])
  
  // Project Loading State
  const [existingProjects, setExistingProjects] = useState<any[]>([])
  const [showProjectLoader, setShowProjectLoader] = useState(false)

  // Stage 1: Foundation Report State
  const [projectContext, setProjectContext] = useState('')
  const [chapterTemplate, setChapterTemplate] = useState('')
  const [docsSummary, setDocsSummary] = useState('')
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [foundationReport, setFoundationReport] = useState('')
  const [currentReportId, setCurrentReportId] = useState<string | null>(null)
  
  // Task Review State
  const [researchTasks, setResearchTasks] = useState<string[]>([])
  const [showTaskReview, setShowTaskReview] = useState(false)
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false)

  // Stage 2: Gap Analysis State
  const [firstDraftForGapAnalysis, setFirstDraftForGapAnalysis] = useState('')
  const [isLoadingGapReport, setIsLoadingGapReport] = useState(false)
  const [gapAnalysisReport, setGapAnalysisReport] = useState('')
  const [gapReportId, setGapReportId] = useState<string | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)

  // Error state
  const [error, setError] = useState<string | null>(null)

  // Polling interval refs
  const foundationPollingRef = useRef<NodeJS.Timeout | null>(null)
  const gapPollingRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch chapter templates on component mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('chapter_templates')
          .select('id, name')
          .order('name')

        if (error) {
          console.error('Error fetching chapter templates:', error)
          setError('Failed to load chapter templates')
          return
        }

        setTemplates(data || [])
      } catch (err) {
        console.error('Error fetching chapter templates:', err)
        setError('Failed to load chapter templates')
      }
    }

    fetchTemplates()
  }, [])

  // Load existing projects
  const loadExistingProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, 
          name, 
          created_at,
          reports (
            id,
            status,
            report_type,
            created_at,
            final_report
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (error) throw error
      setExistingProjects(data || [])
      setShowProjectLoader(true)
    } catch (err) {
      console.error('Error loading projects:', err)
      setError('Failed to load existing projects')
    }
  }

  // Load existing project data
  const loadProject = async (projectId: string, reportId?: string) => {
    try {
      setError(null)
      
      // Load project data
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      
      if (projectError) throw projectError
      
      // Store project ID and populate form fields
      setCurrentProjectId(projectId)
      setProjectContext(projectData.project_context || '')
      setDocsSummary(projectData.key_documents_summary || '')
      setChapterTemplate(projectData.chapter_template_id || '')
      
      // If there's a specific report, load it
      if (reportId) {
        const { data: reportData, error: reportError } = await supabase
          .from('reports')
          .select('*')
          .eq('id', reportId)
          .single()
        
        if (reportError) throw reportError
        
        setCurrentReportId(reportId)
        setFoundationReport(reportData.final_report || '')
        
        // If report is complete, show it
        if (reportData.status === 'complete' && reportData.final_report) {
          setFoundationReport(reportData.final_report)
        } else if (reportData.status === 'pending' || reportData.status === 'in_progress') {
          // If report is pending but has a brief, allow user to continue
          // setShowBriefModal(true) // We will now handle this with a status component
          setCurrentReportId(reportId);
          pollForFoundationReport(reportId); // Start polling if we load an in-progress report
        }
      }
      
      setShowProjectLoader(false)
    } catch (err) {
      console.error('Error loading project:', err)
      setError('Failed to load project data')
    }
  }

  // Cleanup polling intervals on component unmount
  useEffect(() => {
    return () => {
      if (foundationPollingRef.current) {
        clearInterval(foundationPollingRef.current)
      }
      if (gapPollingRef.current) {
        clearInterval(gapPollingRef.current)
      }
    }
  }, [])

  const pollForFoundationReport = (reportId: string) => {
    // Clear any existing polling interval
    if (foundationPollingRef.current) {
      clearInterval(foundationPollingRef.current)
    }

    foundationPollingRef.current = setInterval(async () => {
      try {
        const { data: reportData, error: queryError } = await supabase
          .from('reports')
          .select('status, final_report')
          .eq('id', reportId)
          .single()

        if (queryError) {
          console.error('Error polling for report status:', queryError)
          return // Continue polling
        }

        if (reportData.status === 'complete') {
          if (foundationPollingRef.current) clearInterval(foundationPollingRef.current)
          setFoundationReport(reportData.final_report)
          setIsLoadingReport(false)
        } else if (reportData.status === 'error') {
          if (foundationPollingRef.current) clearInterval(foundationPollingRef.current)
          setError('The research process failed in the background.')
          setIsLoadingReport(false)
        }
        // If status is 'pending' or 'in_progress', we just keep polling.
        // A more advanced version could fetch job status for more detailed progress.

      } catch (pollingError) {
        console.error('Error during polling:', pollingError)
      }
    }, 5000) // Poll every 5 seconds
  }

  // Generate research tasks for review
  const generateResearchTasks = async () => {
    try {
      setError(null)
      setIsGeneratingTasks(true)

      if (!chapterTemplate) throw new Error('Please select a chapter template')

      // 1. Create Project
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: `Research Project ${new Date().toISOString()}`,
          chapter_template_id: chapterTemplate,
          project_context: projectContext,
          key_documents_summary: docsSummary,
        })
        .select('id')
        .single()

      if (projectError) throw projectError

      // Store the project ID for later use
      setCurrentProjectId(projectData.id)

      // 2. Generate Brief (which also creates the initial report record)
      const { data: briefData, error: briefError } = await supabase.functions.invoke('generate-foundation-brief', {
        body: { project_id: projectData.id },
      })

      if (briefError) throw briefError
      const reportId = briefData?.report_id
      if (!reportId) throw new Error('Failed to create a report record.')
      
      setCurrentReportId(reportId)

      // 3. Generate research plan to show tasks for review
      const { data: planData, error: planError } = await supabase.functions.invoke('generate-research-plan', {
        body: {
          project_context: projectContext,
          documents_summary: docsSummary,
          chapter_prompt: (await supabase.from('chapter_templates').select('chapter_prompt').eq('id', chapterTemplate).single()).data?.chapter_prompt
        }
      })

      if (planError) throw planError
      if (!planData?.research_plan) throw new Error('Failed to generate research plan')

      setResearchTasks(planData.research_plan)
      setShowTaskReview(true)

    } catch (err) {
      console.error('Error generating research tasks:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate research tasks')
    } finally {
      setIsGeneratingTasks(false)
    }
  }

  // Execute research with approved tasks
  const executeResearchWithTasks = async () => {
    try {
      setError(null)
      setIsLoadingReport(true)
      setShowTaskReview(false)

      if (!currentReportId) throw new Error('No report ID available')

      // Queue the job for execution with custom research plan
      const { error: executionError } = await supabase.functions.invoke('execute-research', {
        body: { 
          report_id: currentReportId,
          custom_research_plan: researchTasks.filter(task => task.trim()) // Remove empty tasks
        },
      })

      if (executionError) throw executionError

      // Start polling for the result
      pollForFoundationReport(currentReportId)

    } catch (err) {
      console.error('Error executing research:', err)
      setError(err instanceof Error ? err.message : 'Failed to execute research')
      setIsLoadingReport(false)
    }
  }

  // Polling function for gap analysis report
  const pollForGapAnalysisReport = (reportId: string) => {
    // Clear any existing polling interval
    if (gapPollingRef.current) {
      clearInterval(gapPollingRef.current)
    }

    console.log(`Starting gap analysis polling for report ${reportId}`)
    
    const poll = async () => {
      try {
        const { data, error } = await supabase
          .from('reports')
          .select('status, final_report')
          .eq('id', reportId)
          .single()

        if (error) {
          console.error('Polling error:', error)
          return
        }

        console.log(`Gap analysis report ${reportId} status:`, data.status)

        if (data.status === 'complete' && data.final_report) {
          // Report is complete
          setGapAnalysisReport(data.final_report)
          setIsLoadingGapReport(false)
          
          // Clear the polling interval
          if (gapPollingRef.current) {
            clearInterval(gapPollingRef.current)
            gapPollingRef.current = null
          }
          
          console.log('Gap analysis report completed and loaded')
        } else if (data.status === 'error') {
          // Report failed
          setError('Gap analysis report generation failed')
          setIsLoadingGapReport(false)
          
          // Clear the polling interval
          if (gapPollingRef.current) {
            clearInterval(gapPollingRef.current)
            gapPollingRef.current = null
          }
        }
        // Continue polling if status is still 'pending' or 'in_progress'
      } catch (err) {
        console.error('Error during gap analysis polling:', err)
      }
    }

    // Start polling immediately, then every 5 seconds
    poll()
    gapPollingRef.current = setInterval(poll, 5000)
  }

  // Execute Gap Analysis (renamed from generateGapAnalysisBrief)
  const executeGapAnalysis = async () => {
    try {
      setError(null)
      setIsLoadingGapReport(true)

      // Get project ID - either from state or from current report
      let projectId = currentProjectId
      
      if (!projectId && currentReportId) {
        // Fetch project ID from current report
        const { data: reportData, error: reportError } = await supabase
          .from('reports')
          .select('project_id')
          .eq('id', currentReportId)
          .single()
        
        if (reportError) throw reportError
        projectId = reportData.project_id
      }
      
      if (!projectId) {
        throw new Error('No project ID available. Please create or load a project first.')
      }

      // Call the queue-gap-analysis-job function
      const { data, error: functionError } = await supabase.functions.invoke('queue-gap-analysis-job', {
        body: { 
          project_id: projectId,
          foundation_report: foundationReport,
          first_draft: firstDraftForGapAnalysis
        },
      })

      if (functionError) throw functionError
      if (!data?.report_id) throw new Error('No report ID returned')

      console.log('Gap analysis job queued successfully:', data.message)
      setGapReportId(data.report_id)

      // Start polling for the gap analysis report
      pollForGapAnalysisReport(data.report_id)

    } catch (err) {
      console.error('Error executing gap analysis:', err)
      setError(err instanceof Error ? err.message : 'Failed to execute gap analysis')
      setIsLoadingGapReport(false)
    }
  }


  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Sparkles className="w-8 h-8 text-blue-500" />
              <div>
                <h1 className="text-2xl font-bold text-zinc-100">Research Co-pilot</h1>
                <p className="text-sm text-zinc-400">AI-powered two-stage research workflow</p>
              </div>
            </div>
            
            {/* Load Existing Project Button */}
            <button
              onClick={loadExistingProjects}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors duration-200 flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Load Project
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/50 border border-red-900 rounded-lg flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Error</p>
              <p className="text-sm text-red-300 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Stage 1: Foundation Report Generation */}
        <section className="mb-12">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-zinc-100 mb-2 flex items-center space-x-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold">1</span>
              <span>Foundation Report Generation</span>
              <span className="text-sm text-zinc-400 font-normal">(Breadth)</span>
            </h2>
          </div>

          {isLoadingReport && currentReportId && !foundationReport ? (
            <JobStatusDisplay 
              reportId={currentReportId}
              onComplete={(finalReport) => {
                setFoundationReport(finalReport);
                setIsLoadingReport(false);
              }}
              onError={(errorMessage) => {
                setError(errorMessage);
                setIsLoadingReport(false);
              }}
            />
          ) : foundationReport ? (
            <ReportDisplay 
              title="Foundation Report" 
              content={foundationReport} 
              className="animate-in fade-in duration-500"
            />
          ) : (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 mb-6">
              <div className="grid gap-6">
               {/* Project Context */}
               <div>
                 <div className="flex items-center justify-between mb-2">
                   <label htmlFor="project-context" className="block text-sm font-medium text-zinc-300">
                     Project Context
                   </label>
                   <button
                     onClick={() => setProjectContext(`The primary objective is to develop a comprehensive go-to-market strategy for a new, AI-powered workforce optimization platform developed by a large global consulting company. The platform represents a potential new software category, and we need to validate its product-market fit and quantify the opportunity.

Product Summary: The platform fuses a company's internal talent data (from HCM, ATS, VMS systems) with a proprietary external data lake of over 30 billion labor market data points. It provides a single source of truth for strategic workforce planning, using predictive AI to recommend the optimal worker type (e.g., full-time, contingent, gig) based on skills, role requirements, and real-time market supply and demand.

Key Business Questions to Answer:
Market Size: What is the realistic TAM, SAM, and SOM for this new category of integrated talent intelligence?
Product-Market Fit: What are the most compelling use cases and who is the ideal customer profile?
Competitive Landscape: Who are the true closest competitors, not just the legacy HCM players?
Go-to-Market Strategy: What are the most effective channels and pricing models for acquiring customers?
ROI: What is the potential return on investment for a typical enterprise client?

Strategic Guardrails & Nuances:
Category Creation: This is not a simple scheduling or optimization tool. Frame the research from the perspective that this is a new, complex, and core system for reimagining workforce management with AI. It has no direct precedent.

Competitor Scope (Crucial):
DO NOT include major HCM/ERP suites like Oracle, Microsoft Dynamics, SAP, or Workday as direct competitors. Their capabilities are not truly integrated, lack sophisticated predictive AI, and represent the legacy approach our client is disrupting.
DO NOT include niche "new market entrants" that focus on narrow tasks like call center shift scheduling. The client's platform is a fundamental, strategic system, not a point solution.
FOCUS ON companies that provide actionable, integrated talent insights to help enterprises strategically plan their entire workforce.`)}
                     className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors flex items-center space-x-1"
                   >
                     <FileText className="w-3 h-3" />
                     <span>Sample Context</span>
                   </button>
                 </div>
                 <textarea
                   id="project-context"
                   value={projectContext}
                   onChange={(e) => setProjectContext(e.target.value)}
                   className="w-full h-32 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                   placeholder="Describe your project background, goals, and any specific requirements..."
                 />
               </div>

              {/* Chapter Template */}
              <div>
                <label htmlFor="chapter-template" className="block text-sm font-medium text-zinc-300 mb-2">
                  Chapter Template
                </label>
                <select
                  id="chapter-template"
                  value={chapterTemplate}
                  onChange={(e) => setChapterTemplate(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="" className="text-zinc-500">Select a chapter..</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

               {/* Key Documents Summary */}
               <div>
                 <div className="flex items-center justify-between mb-2">
                   <label htmlFor="docs-summary" className="block text-sm font-medium text-zinc-300">
                     Key Documents Summary
                   </label>
                   <button
                     onClick={() => setDocsSummary(`Document Title: Project Equinox - AI-Powered Talent Intelligence Platform Overview
Document Type: Confidential Internal Product & Strategy Brief

Key Themes:
The document outlines the technical architecture and strategic rationale for a new enterprise platform designed to create a new software category in workforce management. It emphasizes the platform's unique ability to address the critical data fragmentation and lack of predictive insight inherent in current-generation HCM and ERP systems. The core thesis is that by leveraging a proprietary data lake, the platform can move companies from reactive hiring to proactive, strategic workforce optimization, generating significant ROI.

Core Capabilities Detailed:
Data Integration Engine: Details the platform's ability to seamlessly connect to and fuse data from disparate enterprise systems, including Human Capital Management (HCM), Applicant Tracking Systems (ATS), and Vendor Management Systems (VMS), creating a unified talent dataset.

Insight Library: Describes a library of pre-built, configurable analytics modules. These include dashboards for headcount distribution, real-time labor cost analysis, time-to-hire optimization, and sourcing channel effectiveness. The system uses these insights to propose concrete decisions.

Predictive Worker-Type Modeling: Explains the core AI agent's function. Based on a project's required skills, duration, and budget, it analyzes internal and external market data to recommend the most suitable worker type (e.g., full-time employee, contingent labor, gig worker, agency employee, or outsourced team).

External Labor Market Intelligence: Specifies the integration with a proprietary data lake containing over 30 billion external data points. This provides real-time insights into talent supply/demand, geographic skill density, and salary/rate benchmarks to drive optimized and evidence-based staffing decisions.`)}
                     className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors flex items-center space-x-1"
                   >
                     <FileText className="w-3 h-3" />
                     <span>Document Summary Sample</span>
                   </button>
                 </div>
                 <textarea
                   id="docs-summary"
                   value={docsSummary}
                   onChange={(e) => setDocsSummary(e.target.value)}
                   className="w-full h-32 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                   placeholder="Summarize key documents available for reference..."
                 />
               </div>

              {/* File Upload (Placeholder) */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Upload Documents (Visual Placeholder)
                </label>
                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center hover:border-zinc-600 transition-colors">
                  <Upload className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400">
                    Drag and drop files here, or click to browse
                  </p>
                  <p className="text-xs text-zinc-500 mt-2">
                    This is a visual placeholder for the POC
                  </p>
                </div>
              </div>


               {/* Generate Button */}
               <button
                 onClick={generateResearchTasks}
                 disabled={isGeneratingTasks || !projectContext || !chapterTemplate}
                 className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
               >
                 {isGeneratingTasks ? (
                   <>
                     <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                     <span>Generating Research Plan...</span>
                   </>
                 ) : (
                   <>
                     <FileText className="w-5 h-5" />
                     <span>Generate Research Plan</span>
                   </>
                 )}
               </button>
            </div>
          </div>
          )}

          {/* Task Review Interface */}
          {showTaskReview && (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 mb-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-zinc-100 mb-2 flex items-center space-x-2">
                  <Search className="w-5 h-5" />
                  <span>Review Research Tasks</span>
                </h3>
                <p className="text-sm text-zinc-400">
                  Review and edit the research questions below. You can modify, delete, or add new tasks before execution.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                {researchTasks.map((task, index) => (
                  <div key={index} className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-medium text-zinc-300">Task {index + 1}</span>
                      <button
                        onClick={() => {
                          const newTasks = researchTasks.filter((_, i) => i !== index)
                          setResearchTasks(newTasks)
                        }}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                    <textarea
                      value={task}
                      onChange={(e) => {
                        const newTasks = [...researchTasks]
                        newTasks[index] = e.target.value
                        setResearchTasks(newTasks)
                      }}
                      className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-zinc-100 text-sm resize-none"
                      rows={3}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center space-x-3 mb-4">
                <button
                  onClick={() => {
                    setResearchTasks([...researchTasks, ''])
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm"
                >
                  Add Task
                </button>
                <span className="text-sm text-zinc-400">
                  {researchTasks.length} tasks total
                </span>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowTaskReview(false)}
                  className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                >
                  Back to Form
                </button>
                <button
                  onClick={executeResearchWithTasks}
                  disabled={researchTasks.length === 0 || researchTasks.some(task => !task.trim())}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <ArrowRight className="w-5 h-5" />
                  <span>Execute Research ({researchTasks.length} tasks)</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Stage 2: Gap Analysis - Only show if foundation report exists */}
        {foundationReport && (
          <section className="mb-12">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-zinc-100 mb-2 flex items-center space-x-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold">2</span>
                <span>Gap Analysis</span>
                <span className="text-sm text-zinc-400 font-normal">(Depth)</span>
              </h2>
            </div>

            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 mb-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="first-draft" className="block text-sm font-medium text-zinc-300 mb-2">
                    Paste First Draft Output Here
                  </label>
                  <textarea
                    id="first-draft"
                    value={firstDraftForGapAnalysis}
                    onChange={(e) => setFirstDraftForGapAnalysis(e.target.value)}
                    className="w-full h-48 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none font-mono text-sm"
                    placeholder="Paste your first draft content here for gap analysis..."
                  />
                </div>

                <button
                  onClick={executeGapAnalysis}
                  disabled={isLoadingGapReport || !firstDraftForGapAnalysis || !foundationReport}
                  className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isLoadingGapReport ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Executing Gap Analysis...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      <span>Find Gaps & Go Deeper</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Loading State for Gap Report Execution */}
            {isLoadingGapReport && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 my-6">
                <div className="flex items-center space-x-3 text-blue-300">
                  <div className="w-8 h-8 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin" />
                  <div>
                    <p className="font-semibold">Executing gap analysis research...</p>
                    <p className="text-sm text-blue-400">This may take several minutes.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Gap Analysis Report Display */}
            {gapAnalysisReport && !isLoadingGapReport && (
              <ReportDisplay 
                title="Gap Analysis Report" 
                content={gapAnalysisReport} 
                className="animate-in fade-in duration-500"
              />
            )}
          </section>
        )}
      </main>

      {/* Modals are now removed */}
      
      {/* Project Loader Modal */}
      {showProjectLoader && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-zinc-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Load Existing Project</h2>
              <button
                onClick={() => setShowProjectLoader(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              {existingProjects.length === 0 ? (
                <p className="text-gray-400">No existing projects found.</p>
              ) : (
                existingProjects.map((project) => (
                  <div key={project.id} className="bg-zinc-700 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-white">{project.name}</h3>
                        <p className="text-sm text-gray-400">
                          Created: {new Date(project.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => loadProject(project.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
                      >
                        Load Project
                      </button>
                    </div>
                    
                    {project.reports && project.reports.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm text-gray-300 mb-2">Reports:</p>
                        <div className="space-y-1">
                          {project.reports.map((report: any) => (
                            <div key={report.id} className="flex justify-between items-center bg-zinc-600 rounded p-2">
                              <div>
                                <span className="text-sm text-white capitalize">{report.report_type}</span>
                                <span className={`ml-2 px-2 py-1 rounded text-xs ${
                                  report.status === 'complete' ? 'bg-green-600 text-white' :
                                  report.status === 'pending' ? 'bg-yellow-600 text-white' :
                                  'bg-red-600 text-white'
                                }`}>
                                  {report.status}
                                </span>
                              </div>
                              <button
                                onClick={() => loadProject(project.id, report.id)}
                                className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs"
                              >
                                Load Report
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
