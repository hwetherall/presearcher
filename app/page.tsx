'use client'

import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import ReportDisplay from '@/components/ReportDisplay'
import LiveProgressDisplay from '@/components/LiveProgressDisplay';
import AtomicTasksDisplay from '@/components/AtomicTasksDisplay';
import { Upload, Sparkles, Search, ArrowRight, FileText, AlertCircle, TestTube2, X } from 'lucide-react'

export default function ResearchCopilot() {
  // Chapter Templates State
  const [templates, setTemplates] = useState<{ id: string; name: string; }[]>([])
  
  // Project Loading State
  const [existingProjects, setExistingProjects] = useState<any[]>([])
  const [showProjectLoader, setShowProjectLoader] = useState(false)
  const [selectedReportForAtomicTasks, setSelectedReportForAtomicTasks] = useState<string | null>(null)

  // Demo Mode State
  const [isDemoMode, setIsDemoMode] = useState(false)

  // Demo mode content
  const DEMO_PROJECT_CONTEXT = `The primary objective is to develop a comprehensive go-to-market strategy for a new, AI-powered workforce optimization platform developed by a large global consulting company. The platform represents a potential new software category, and we need to validate its product-market fit and quantify the opportunity.

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
FOCUS ON companies that provide actionable, integrated talent insights to help enterprises strategically plan their entire workforce.`

  const DEMO_DOCS_SUMMARY = `Document Title: Project Equinox - AI-Powered Talent Intelligence Platform Overview
Document Type: Confidential Internal Product & Strategy Brief

Key Themes:
The document outlines the technical architecture and strategic rationale for a new enterprise platform designed to create a new software category in workforce management. It emphasizes the platform's unique ability to address the critical data fragmentation and lack of predictive insight inherent in current-generation HCM and ERP systems. The core thesis is that by leveraging a proprietary data lake, the platform can move companies from reactive hiring to proactive, strategic workforce optimization, generating significant ROI.

Core Capabilities Detailed:
Data Integration Engine: Details the platform's ability to seamlessly connect to and fuse data from disparate enterprise systems, including Human Capital Management (HCM), Applicant Tracking Systems (ATS), and Vendor Management Systems (VMS), creating a unified talent dataset.

Insight Library: Describes a library of pre-built, configurable analytics modules. These include dashboards for headcount distribution, real-time labor cost analysis, time-to-hire optimization, and sourcing channel effectiveness. The system uses these insights to propose concrete decisions.

Predictive Worker-Type Modeling: Explains the core AI agent's function. Based on a project's required skills, duration, and budget, it analyzes internal and external market data to recommend the most suitable worker type (e.g., full-time employee, contingent labor, gig worker, agency employee, or outsourced team).

External Labor Market Intelligence: Specifies the integration with a proprietary data lake containing over 30 billion external data points. This provides real-time insights into talent supply/demand, geographic skill density, and salary/rate benchmarks to drive optimized and evidence-based staffing decisions.`

  const DEMO_CUSTOM_PROMPT = `You are an expert market research analyst tasked with conducting comprehensive research for a new AI-powered workforce optimization platform. Your analysis should focus on:

## Market Analysis Framework
1. **Market Sizing & Opportunity Assessment**
   - Calculate realistic TAM, SAM, and SOM for integrated talent intelligence platforms
   - Identify key market segments and growth drivers
   - Analyze adoption barriers and market readiness

2. **Competitive Intelligence**
   - Map direct and indirect competitors (exclude legacy HCM/ERP suites)
   - Analyze competitive positioning and differentiation opportunities
   - Identify white space and market gaps

3. **Customer Research**
   - Define ideal customer profiles and buyer personas
   - Understand key use cases and value propositions
   - Analyze decision-making processes and buying criteria

4. **Go-to-Market Strategy**
   - Recommend optimal pricing models and strategies
   - Identify most effective sales and marketing channels
   - Propose customer acquisition and retention strategies

5. **ROI & Business Case**
   - Quantify potential customer value and ROI
   - Develop financial projections and business models
   - Assess implementation challenges and success factors

## Research Methodology
- Prioritize primary research over secondary sources
- Include quantitative market data and qualitative insights
- Provide specific, actionable recommendations
- Support all findings with credible sources and evidence

## Output Requirements
- Executive summary with key findings
- Detailed analysis for each framework area
- Strategic recommendations with implementation roadmap
- Risk assessment and mitigation strategies

Focus on creating a new software category rather than competing in existing markets. The platform represents a fundamental shift from reactive to predictive workforce management.`

  // Stage 1: Foundation Report State
  const [projectContext, setProjectContext] = useState('')
  const [chapterTemplate, setChapterTemplate] = useState('')
  const [docsSummary, setDocsSummary] = useState('')
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [foundationReport, setFoundationReport] = useState('')
  const [currentReportId, setCurrentReportId] = useState<string | null>(null)
  const [isRegeneratingReport, setIsRegeneratingReport] = useState(false)
  
  // Custom Prompt State
  const [promptMode, setPromptMode] = useState<'preselect' | 'custom'>('preselect')
  const [customPrompt, setCustomPrompt] = useState('')
  
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
          setCurrentReportId(reportId);
          pollForFoundationReport(reportId); // Start polling if we load an in-progress report
        }
        
        // Set this report for atomic tasks display
        setSelectedReportForAtomicTasks(reportId)
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

  // Handle demo mode toggle
  const handleDemoModeToggle = () => {
    const newDemoMode = !isDemoMode
    setIsDemoMode(newDemoMode)
    
    if (newDemoMode) {
      // Prefill the form fields when demo mode is turned ON
      setProjectContext(DEMO_PROJECT_CONTEXT)
      setDocsSummary(DEMO_DOCS_SUMMARY)
      
      // Set demo content based on current prompt mode
      if (promptMode === 'custom') {
        setCustomPrompt(DEMO_CUSTOM_PROMPT)
      } else {
        // Optionally select the first template if available
        if (templates.length > 0 && !chapterTemplate) {
          setChapterTemplate(templates[0].id)
        }
      }
    } else {
      // Clear the form fields when demo mode is turned OFF (optional)
      // You might want to comment these out if you want to keep the data
      setProjectContext('')
      setDocsSummary('')
      setChapterTemplate('')
      setCustomPrompt('')
      setPromptMode('preselect')
    }
  }

  // Demo workflow function
  const runDemoWorkflow = async (reportType: 'foundation' | 'gap_analysis') => {
    setError(null);
    const setLoading = reportType === 'foundation' ? setIsLoadingReport : setIsLoadingGapReport;
    const setReport = reportType === 'foundation' ? setFoundationReport : setGapAnalysisReport;
    const reportIdSetter = reportType === 'foundation' ? setCurrentReportId : setGapReportId;

    console.log(`--- DEMO MODE: Starting ${reportType} report generation ---`);
    setLoading(true);
    reportIdSetter('demo-report-id-12345'); // Dummy ID to trigger status display

    // Simulate a short network delay for realism
    setTimeout(async () => {
      try {
        // Fetch the curated report from our backend
        const { data, error } = await supabase.functions.invoke('get-demo-report', {
          body: { report_type: reportType },
        });

        if (error) throw error;
        if (!data.report_content) throw new Error("Demo report content was empty.");

        console.log(`--- DEMO MODE: Final report loaded from DB ---`);
        setReport(data.report_content);
      } catch (err) {
        console.error('Demo mode failed:', err);
        setError(err instanceof Error ? `Demo Mode Error: ${err.message}` : 'Failed to load demo report.');
        setReport(''); // Clear any previous report on error
      } finally {
        setLoading(false);
      }
    }, 3000); // 3-second simulation
  };

  // Generate research tasks for review
  const generateResearchTasks = async () => {
    try {
      setError(null)
      setIsGeneratingTasks(true)

      if (promptMode === 'preselect' && !chapterTemplate) {
        throw new Error('Please select a chapter template')
      }
      if (promptMode === 'custom' && !customPrompt.trim()) {
        throw new Error('Please enter a custom prompt')
      }

      // 1. Create Project
      const projectInsert: any = {
        name: `Research Project ${new Date().toISOString()}`,
        project_context: projectContext,
        key_documents_summary: docsSummary,
      }
      
      if (promptMode === 'preselect') {
        projectInsert.chapter_template_id = chapterTemplate
        projectInsert.custom_prompt = null
      } else {
        // For custom prompts, we'll use a null template_id and store the custom prompt
        projectInsert.chapter_template_id = null
        projectInsert.custom_prompt = customPrompt
      }
      
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert(projectInsert)
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
      let chapterPromptText = ''
      if (promptMode === 'preselect') {
        const { data: templateData } = await supabase
          .from('chapter_templates')
          .select('chapter_prompt')
          .eq('id', chapterTemplate)
          .single()
        chapterPromptText = templateData?.chapter_prompt || ''
      } else {
        chapterPromptText = customPrompt
      }
      
      const { data: planData, error: planError } = await supabase.functions.invoke('generate-research-plan', {
        body: {
          project_context: projectContext,
          documents_summary: docsSummary,
          chapter_prompt: chapterPromptText
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
    // Demo Mode Intercept
    if (isDemoMode) {
      runDemoWorkflow('foundation');
      return;
    }

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

  // Regenerate Foundation Research Report using existing atomic task data
  const regenerateFoundationReport = async () => {
    if (!currentReportId) {
      setError('No report ID available for regeneration')
      return
    }

    try {
      setError(null)
      setIsRegeneratingReport(true)

      console.log(`Regenerating report ${currentReportId}`)

      // Call the regenerate-report Supabase function
      const { data, error: regenerateError } = await supabase.functions.invoke('regenerate-report', {
        body: { report_id: currentReportId }
      })

      if (regenerateError) {
        console.error('Regeneration error details:', regenerateError)
        throw new Error(`Regeneration failed: ${regenerateError.message}`)
      }

      if (data?.final_report) {
        setFoundationReport(data.final_report)
        console.log(`Report regenerated successfully using ${data.atomic_tasks_used} atomic tasks`)
      } else {
        throw new Error('No final report returned from regeneration')
      }

    } catch (err) {
      console.error('Error regenerating report:', err)
      setError(err instanceof Error ? err.message : 'Failed to regenerate report')
    } finally {
      setIsRegeneratingReport(false)
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
          if (gapPollingRef.current) clearInterval(gapPollingRef.current)
          setGapAnalysisReport(data.final_report)
          setIsLoadingGapReport(false)
        } else if (data.status === 'error') {
          if (gapPollingRef.current) clearInterval(gapPollingRef.current)
          setError('Gap analysis failed. Please try again.')
          setIsLoadingGapReport(false)
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }

    gapPollingRef.current = setInterval(poll, 5000)
    poll() // Run immediately
  }

  // Execute Gap Analysis
  const executeGapAnalysis = async () => {
    // Demo Mode Intercept
    if (isDemoMode) {
      runDemoWorkflow('gap_analysis');
      return;
    }

    try {
      setError(null)
      setIsLoadingGapReport(true)

      if (!currentProjectId) {
        throw new Error('No project ID available. Please complete the foundation research first.')
      }

      // Call the queue-gap-analysis-job function
      const { data, error: functionError } = await supabase.functions.invoke('queue-gap-analysis-job', {
        body: { 
          project_id: currentProjectId,
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
            
            <div className="flex items-center space-x-3">
              {/* Demo Mode Toggle */}
              <button
                onClick={handleDemoModeToggle}
                className={`px-4 py-2 rounded-lg transition-colors duration-200 flex items-center gap-2 text-white ${
                  isDemoMode
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-zinc-700 hover:bg-zinc-600'
                }`}
                title="Toggle Demo Mode"
              >
                <TestTube2 className="w-4 h-4" />
                <span>Demo Mode: {isDemoMode ? 'ON' : 'OFF'}</span>
              </button>

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
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Error Display */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-200 px-4 py-3 rounded-lg mb-6 flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Project Loader Modal */}
        {showProjectLoader && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-zinc-800">
                <h2 className="text-xl font-semibold text-zinc-100">Load Existing Project</h2>
                <p className="text-zinc-400 mt-1">Select a project to continue working on</p>
              </div>
              <div className="p-6 max-h-96 overflow-y-auto">
                {existingProjects.length === 0 ? (
                  <p className="text-zinc-400 text-center py-8">No existing projects found</p>
                ) : (
                  <div className="space-y-3">
                    {existingProjects.map((project) => (
                      <div key={project.id} className="border border-zinc-700 rounded-lg p-4 hover:bg-zinc-800/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-zinc-100">{project.name}</h3>
                          <span className="text-sm text-zinc-400">
                            {new Date(project.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {project.reports && project.reports.length > 0 && (
                          <div className="space-y-2">
                            {project.reports.map((report: any) => (
                              <div key={report.id} className="bg-zinc-800 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm text-zinc-300">
                                    {report.report_type} - {report.status}
                                  </span>
                                  <span className="text-xs text-zinc-500">
                                    {new Date(report.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => loadProject(project.id, report.id)}
                                    className="flex-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                                  >
                                    Load Report
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedReportForAtomicTasks(report.id)
                                      setShowProjectLoader(false)
                                    }}
                                    className="flex-1 px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition-colors"
                                  >
                                    View Tasks
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => loadProject(project.id)}
                          className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Load Project Data
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-zinc-800 flex justify-end">
                <button
                  onClick={() => setShowProjectLoader(false)}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Atomic Tasks Display */}
        {selectedReportForAtomicTasks && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-zinc-100">Atomic Tasks</h2>
              <button
                onClick={() => setSelectedReportForAtomicTasks(null)}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Close
              </button>
            </div>
            <AtomicTasksDisplay 
              reportId={selectedReportForAtomicTasks}
              className="animate-in fade-in duration-500"
            />
          </section>
        )}

        {/* Stage 1: Foundation Research */}
        <section className="mb-12">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">1</div>
              <h2 className="text-2xl font-bold text-zinc-100">Foundation Research</h2>
            </div>

            {/* Task Review Modal */}
            {showTaskReview && (
              <div className="mb-6 p-6 bg-zinc-800 border border-zinc-700 rounded-lg">
                <h3 className="text-lg font-semibold text-zinc-100 mb-4">Review Research Tasks</h3>
                <p className="text-zinc-400 mb-4">
                  Review and modify the research tasks that will be executed. You can edit, add, or remove tasks as needed.
                </p>

                <div className="space-y-3 mb-6">
                  {researchTasks.map((task, index) => (
                    <div key={index} className="flex items-start space-x-3 group">
                      <span className="text-zinc-500 text-sm mt-2 w-8">{index + 1}.</span>
                      <textarea
                        value={task}
                        onChange={(e) => {
                          const newTasks = [...researchTasks]
                          newTasks[index] = e.target.value
                          setResearchTasks(newTasks)
                        }}
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        placeholder="Enter research task..."
                        rows={3}
                      />
                      <button
                        onClick={() => {
                          if (researchTasks.length > 1) {
                            const newTasks = researchTasks.filter((_, i) => i !== index)
                            setResearchTasks(newTasks)
                          }
                        }}
                        disabled={researchTasks.length <= 1}
                        className="mt-2 p-2 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-zinc-500 disabled:hover:bg-transparent"
                        title={researchTasks.length <= 1 ? "Cannot delete - at least one task is required" : "Delete this task"}
                      >
                        <X className="w-4 h-4" />
                      </button>
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
                    {researchTasks.length} task{researchTasks.length !== 1 ? 's' : ''} total
                    {researchTasks.length <= 1 && (
                      <span className="ml-2 text-xs text-amber-400">
                        (minimum 1 required)
                      </span>
                    )}
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

            {/* Form */}
            {!showTaskReview && (
              <div className="space-y-6">
                {/* Prompt Mode Toggle */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-3">
                    Prompt Selection Mode
                  </label>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => {
                        setPromptMode('preselect')
                        if (isDemoMode) {
                          setCustomPrompt('')
                          if (templates.length > 0 && !chapterTemplate) {
                            setChapterTemplate(templates[0].id)
                          }
                        }
                      }}
                      className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                        promptMode === 'preselect'
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      Pre-Select Template
                    </button>
                    <button
                      onClick={() => {
                        setPromptMode('custom')
                        if (isDemoMode) {
                          setChapterTemplate('')
                          setCustomPrompt(DEMO_CUSTOM_PROMPT)
                        }
                      }}
                      className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                        promptMode === 'custom'
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      Add Custom Prompt
                    </button>
                  </div>
                </div>

                {/* Chapter Template Selection (only show in preselect mode) */}
                {promptMode === 'preselect' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Chapter Template
                    </label>
                    <select
                      value={chapterTemplate}
                      onChange={(e) => setChapterTemplate(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a template...</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Custom Prompt Input (only show in custom mode) */}
                {promptMode === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Custom Research Prompt
                      {isDemoMode && <span className="ml-2 text-xs text-purple-400 font-normal">(Demo Content)</span>}
                    </label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      className={`w-full bg-zinc-800 border rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 ${
                        isDemoMode 
                          ? 'border-purple-500 focus:ring-purple-500' 
                          : 'border-zinc-700 focus:ring-blue-500'
                      }`}
                      rows={6}
                      placeholder="Enter your custom research prompt. This will guide the AI in generating research tasks and conducting the analysis. Be specific about what you want to research, analyze, and understand..."
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Tip: Include specific questions you want answered, methodologies to use, and the type of output you expect.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Project Context
                    {isDemoMode && <span className="ml-2 text-xs text-purple-400 font-normal">(Demo Content)</span>}
                  </label>
                  <textarea
                    value={projectContext}
                    onChange={(e) => setProjectContext(e.target.value)}
                    className={`w-full bg-zinc-800 border rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 ${
                      isDemoMode 
                        ? 'border-purple-500 focus:ring-purple-500' 
                        : 'border-zinc-700 focus:ring-blue-500'
                    }`}
                    rows={4}
                    placeholder="Describe your research project, objectives, and scope..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Key Documents Summary
                    {isDemoMode && <span className="ml-2 text-xs text-purple-400 font-normal">(Demo Content)</span>}
                  </label>
                  <textarea
                    value={docsSummary}
                    onChange={(e) => setDocsSummary(e.target.value)}
                    className={`w-full bg-zinc-800 border rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 ${
                      isDemoMode 
                        ? 'border-purple-500 focus:ring-purple-500' 
                        : 'border-zinc-700 focus:ring-blue-500'
                    }`}
                    rows={4}
                    placeholder="Summarize any key documents, research, or data you already have..."
                  />
                </div>

                <button
                  onClick={generateResearchTasks}
                  disabled={
                    isGeneratingTasks || 
                    !projectContext ||
                    (promptMode === 'preselect' && !chapterTemplate) ||
                    (promptMode === 'custom' && !customPrompt.trim())
                  }
                  className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isGeneratingTasks ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generating Research Plan...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      <span>Generate Research Plan</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Loading State for Foundation Report */}
          {isLoadingReport && currentReportId && (
            <LiveProgressDisplay
              reportId={currentReportId}
              onComplete={(finalReport) => {
                setFoundationReport(finalReport)
                setIsLoadingReport(false)
              }}
              onError={(errorMessage) => {
                setError(errorMessage)
                setIsLoadingReport(false)
              }}
            />
          )}

          {/* Foundation Report Display */}
          {foundationReport && !isLoadingReport && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-zinc-100">Foundation Research Report</h3>
                {currentReportId && (
                  <button
                    onClick={() => setSelectedReportForAtomicTasks(currentReportId)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
                  >
                    <FileText className="w-4 h-4" />
                    View Atomic Tasks
                  </button>
                )}
              </div>
              <ReportDisplay 
                title="Foundation Research Report" 
                content={foundationReport} 
                className="animate-in fade-in duration-500"
                onRegenerate={() => {
                  console.log('Regenerate button clicked, currentReportId:', currentReportId)
                  regenerateFoundationReport()
                }}
                isRegenerating={isRegeneratingReport}
              />
            </div>
          )}
        </section>

        {/* Stage 2: Gap Analysis - Only show if foundation report exists */}
        {foundationReport && (
          <section>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-semibold">2</div>
                <h2 className="text-2xl font-bold text-zinc-100">Gap Analysis</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    First Draft / Initial Analysis
                  </label>
                  <textarea
                    value={firstDraftForGapAnalysis}
                    onChange={(e) => setFirstDraftForGapAnalysis(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                    rows={6}
                    placeholder="Paste your first draft, initial analysis, or specific areas you want to explore further..."
                  />
                </div>

                <button
                  onClick={executeGapAnalysis}
                  disabled={isLoadingGapReport || !firstDraftForGapAnalysis}
                  className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isLoadingGapReport ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Analyzing Gaps...</span>
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
            {isLoadingGapReport && gapReportId && (
              <LiveProgressDisplay
                reportId={gapReportId}
                onComplete={(finalReport) => {
                  setGapAnalysisReport(finalReport)
                  setIsLoadingGapReport(false)
                }}
                onError={(errorMessage) => {
                  setError(errorMessage)
                  setIsLoadingGapReport(false)
                }}
              />
            )}

            {/* Gap Analysis Report Display */}
            {gapAnalysisReport && !isLoadingGapReport && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-zinc-100">Gap Analysis Report</h3>
                  {gapReportId && (
                    <button
                      onClick={() => setSelectedReportForAtomicTasks(gapReportId)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
                    >
                      <FileText className="w-4 h-4" />
                      View Atomic Tasks
                    </button>
                  )}
                </div>
                <ReportDisplay 
                  title="Gap Analysis Report" 
                  content={gapAnalysisReport} 
                  className="animate-in fade-in duration-500"
                />
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
