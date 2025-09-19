'use client'

import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import LoadingSpinner from '@/components/LoadingSpinner'
import ReportDisplay from '@/components/ReportDisplay'
import BriefReviewModal from '@/components/BriefReviewModal'
import { Upload, Sparkles, Search, ArrowRight, FileText, AlertCircle } from 'lucide-react'

export default function ResearchCopilot() {
  // Chapter Templates State
  const [templates, setTemplates] = useState<{ id: string; name: string; }[]>([])

  // Stage 1: Foundation Report State
  const [projectContext, setProjectContext] = useState('')
  const [chapterTemplate, setChapterTemplate] = useState('')
  const [docsSummary, setDocsSummary] = useState('')
  const [isLoadingBrief, setIsLoadingBrief] = useState(false)
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [foundationBrief, setFoundationBrief] = useState('')
  const [foundationReport, setFoundationReport] = useState('')
  const [showBriefModal, setShowBriefModal] = useState(false)
  const [selectedModel, setSelectedModel] = useState('perplexity/sonar-deep-research')
  const [currentReportId, setCurrentReportId] = useState<string | null>(null)

  // Stage 2: Gap Analysis State
  const [firstDraftForGapAnalysis, setFirstDraftForGapAnalysis] = useState('')
  const [isLoadingGapBrief, setIsLoadingGapBrief] = useState(false)
  const [isLoadingGapReport, setIsLoadingGapReport] = useState(false)
  const [gapAnalysisBrief, setGapAnalysisBrief] = useState('')
  const [gapAnalysisReport, setGapAnalysisReport] = useState('')
  const [showGapBriefModal, setShowGapBriefModal] = useState(false)
  const [gapReportId, setGapReportId] = useState<string | null>(null)

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

  // Generate Foundation Brief
  const generateFoundationBrief = async () => {
    try {
      setError(null)
      setIsLoadingBrief(true)

      // Validate that a template is selected
      if (!chapterTemplate) {
        throw new Error('Please select a chapter template')
      }

      // Create a new project
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: `Research Project ${new Date().toISOString()}`,
          // chapter_template_prompt: selectedTemplate.prompt, // Commented out - will be handled by backend
          chapter_template_id: chapterTemplate, // Save the selected template ID
          project_context: projectContext,
          key_documents_summary: docsSummary,
        })
        .select('id')
        .single()

      if (projectError) throw projectError

      // Call the generate-foundation-brief function
      const { data, error: functionError } = await supabase.functions.invoke('generate-foundation-brief', {
        body: { project_id: projectData.id },
      })

      if (functionError) throw functionError
      if (!data?.report_id) throw new Error('No report ID returned')

      setCurrentReportId(data.report_id)

      // Fetch the generated brief
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('research_brief')
        .eq('id', data.report_id)
        .single()

      if (reportError) throw reportError
      if (!reportData?.research_brief) throw new Error('No research brief generated')

      setFoundationBrief(reportData.research_brief)
      setShowBriefModal(true)
    } catch (err) {
      console.error('Error generating foundation brief:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate foundation brief')
    } finally {
      setIsLoadingBrief(false)
    }
  }

  // Execute Foundation Research
  const executeFoundationResearch = async () => {
    try {
      setError(null)
      setIsLoadingReport(true)
      setShowBriefModal(false)

      if (!currentReportId) throw new Error('No report ID available')

      // Clear any existing polling interval
      if (foundationPollingRef.current) {
        clearInterval(foundationPollingRef.current)
        foundationPollingRef.current = null
      }

      // Call the execute-research function (now returns 202 immediately)
      const { data, error: functionError } = await supabase.functions.invoke('execute-research', {
        body: { 
          report_id: currentReportId,
          model: selectedModel 
        },
      })

      if (functionError) throw functionError
      
      // The API now returns a success message, not the final report
      console.log('Research process started:', data?.message)

      // Start polling for the result
      foundationPollingRef.current = setInterval(async () => {
        try {
          const { data: reportData, error: queryError } = await supabase
            .from('reports')
            .select('status, final_report')
            .eq('id', currentReportId)
            .single()

          if (queryError) {
            console.error('Error polling for report status:', queryError)
            return // Continue polling despite query error
          }

          if (reportData.status === 'complete') {
            // Report is complete - stop polling and set the result
            if (foundationPollingRef.current) {
              clearInterval(foundationPollingRef.current)
              foundationPollingRef.current = null
            }
            setFoundationReport(reportData.final_report)
            setIsLoadingReport(false)
          } else if (reportData.status === 'error') {
            // Report failed - stop polling and show error
            if (foundationPollingRef.current) {
              clearInterval(foundationPollingRef.current)
              foundationPollingRef.current = null
            }
            setError('The research process failed in the background. Please check the logs.')
            setIsLoadingReport(false)
            setShowBriefModal(true) // Reopen modal on error
          }
          // For any other status (pending, in_progress), continue polling
        } catch (pollingError) {
          console.error('Error during polling:', pollingError)
          // Continue polling despite errors
        }
      }, 5000) // Poll every 5 seconds

    } catch (err) {
      console.error('Error starting research:', err)
      setError(err instanceof Error ? err.message : 'Failed to start research process')
      setShowBriefModal(true) // Reopen modal on error
      setIsLoadingReport(false)
    }
  }

  // Generate Gap Analysis Brief
  const generateGapAnalysisBrief = async () => {
    try {
      setError(null)
      setIsLoadingGapBrief(true)

      // Call the generate-gap-analysis-brief function
      const { data, error: functionError } = await supabase.functions.invoke('generate-gap-analysis-brief', {
        body: { 
          first_draft: firstDraftForGapAnalysis,
          foundation_report: foundationReport 
        },
      })

      if (functionError) throw functionError
      if (!data?.report_id) throw new Error('No report ID returned')

      setGapReportId(data.report_id)

      // Fetch the generated brief
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('research_brief')
        .eq('id', data.report_id)
        .single()

      if (reportError) throw reportError
      if (!reportData?.research_brief) throw new Error('No research brief generated')

      setGapAnalysisBrief(reportData.research_brief)
      setShowGapBriefModal(true)
    } catch (err) {
      console.error('Error generating gap analysis brief:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate gap analysis brief')
    } finally {
      setIsLoadingGapBrief(false)
    }
  }

  // Execute Gap Analysis Research
  const executeGapAnalysisResearch = async () => {
    try {
      setError(null)
      setIsLoadingGapReport(true)
      setShowGapBriefModal(false)

      if (!gapReportId) throw new Error('No report ID available')

      // Call the execute-research function with the selected model
      const { data, error: functionError } = await supabase.functions.invoke('execute-research', {
        body: { 
          report_id: gapReportId,
          model: selectedModel 
        },
      })

      if (functionError) throw functionError
      if (!data?.final_report) throw new Error('No final report generated')

      setGapAnalysisReport(data.final_report)
    } catch (err) {
      console.error('Error executing gap analysis:', err)
      setError(err instanceof Error ? err.message : 'Failed to execute gap analysis')
      setShowGapBriefModal(true) // Reopen modal on error
    } finally {
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

               {/* Test Buttons */}
               <div className="grid grid-cols-2 gap-2 mb-2">
                 <button
                   onClick={async () => {
                     try {
                       console.log('Testing OpenRouter API...')
                       const { data, error } = await supabase.functions.invoke('test-openrouter', {})
                       if (error) {
                         console.error('OpenRouter test error:', error)
                         setError(`❌ OpenRouter test failed: ${error.message}`)
                       } else {
                         console.log('OpenRouter test success:', data)
                         setError(`✅ OpenRouter test passed: ${data.response}`)
                       }
                     } catch (err) {
                       console.error('OpenRouter test error:', err)
                       setError(`OpenRouter test error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                     }
                   }}
                   className="py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors text-xs"
                 >
                   🤖 Test OpenRouter
                 </button>
                 
                 <button
                   onClick={async () => {
                     try {
                       if (!projectContext || !chapterTemplate) {
                         setError('❌ Please fill in Project Context and select Chapter Template first')
                         return
                       }

                       console.log('Testing foundation workflow...')
                       
                       // Create a test project first
                       const { data: projectData, error: projectError } = await supabase
                         .from('projects')
                         .insert({
                           name: `Test Project ${new Date().toISOString()}`,
                           // chapter_template_prompt: selectedTemplate!.prompt, // Commented out - will be handled by backend
                           chapter_template_id: chapterTemplate, // Save the selected template ID
                           project_context: projectContext,
                           key_documents_summary: docsSummary,
                         })
                         .select('id')
                         .single()

                       if (projectError) {
                         setError(`❌ Project creation failed: ${projectError.message}`)
                         return
                       }

                       // Test the simplified foundation function
                       const { data, error } = await supabase.functions.invoke('test-foundation-simple', {
                         body: { project_id: projectData.id }
                       })
                       
                       if (error) {
                         console.error('Foundation test error:', error)
                         setError(`❌ Foundation test failed: ${error.message}`)
                       } else {
                         console.log('Foundation test success:', data)
                         setError(`✅ Foundation workflow test passed! Report ID: ${data.report_id}`)
                       }
                     } catch (err) {
                       console.error('Foundation test error:', err)
                       setError(`Foundation test error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                     }
                   }}
                   className="py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 transition-colors text-xs"
                 >
                   🏗️ Test Foundation
                 </button>
               </div>
               <div className="grid grid-cols-2 gap-2 mb-2">
                 <button
                   onClick={async () => {
                     try {
                       console.log('Testing simple function...')
                       const { data, error } = await supabase.functions.invoke('test-simple', {})
                       if (error) {
                         console.error('Test function error:', error)
                         setError(`Test failed: ${error.message}`)
                       } else {
                         console.log('Test function success:', data)
                         setError(`✅ Basic test passed`)
                       }
                     } catch (err) {
                       console.error('Test error:', err)
                       setError(`Test error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                     }
                   }}
                   className="py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors text-xs"
                 >
                   🧪 Basic
                 </button>
                 
                 <button
                   onClick={async () => {
                     try {
                       console.log('Testing database function...')
                       const { data, error } = await supabase.functions.invoke('test-database', {})
                       if (error) {
                         console.error('Database test error:', error)
                         setError(`Database test failed: ${error.message}`)
                       } else {
                         console.log('Database test success:', data)
                         setError(`✅ Database test passed`)
                       }
                     } catch (err) {
                       console.error('Database test error:', err)
                       setError(`Database test error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                     }
                   }}
                   className="py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors text-xs"
                 >
                   🗄️ Database
                 </button>

                 <button
                   onClick={async () => {
                     try {
                       if (!projectContext || !chapterTemplate) {
                         setError('❌ Please fill in Project Context and select Chapter Template first')
                         return
                       }

                       console.log('Testing foundation workflow...')
                       
                       // Create a test project first
                       const { data: projectData, error: projectError } = await supabase
                         .from('projects')
                         .insert({
                           name: `Test Project ${new Date().toISOString()}`,
                           // chapter_template_prompt: selectedTemplate!.prompt, // Commented out - will be handled by backend
                           chapter_template_id: chapterTemplate, // Save the selected template ID
                           project_context: projectContext,
                           key_documents_summary: docsSummary,
                         })
                         .select('id')
                         .single()

                       if (projectError) {
                         setError(`❌ Project creation failed: ${projectError.message}`)
                         return
                       }

                       // Test the simplified foundation function
                       const { data, error } = await supabase.functions.invoke('test-foundation-simple', {
                         body: { project_id: projectData.id }
                       })
                       
                       if (error) {
                         console.error('Foundation test error:', error)
                         setError(`❌ Foundation test failed: ${error.message}`)
                       } else {
                         console.log('Foundation test success:', data)
                         setError(`✅ Foundation workflow test passed! Report ID: ${data.report_id}`)
                       }
                     } catch (err) {
                       console.error('Foundation test error:', err)
                       setError(`Foundation test error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                     }
                   }}
                   className="py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 transition-colors text-xs"
                 >
                   🏗️ Foundation
                 </button>
               </div>

               {/* Generate Button */}
               <button
                 onClick={generateFoundationBrief}
                 disabled={isLoadingBrief || !projectContext || !chapterTemplate}
                 className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
               >
                 {isLoadingBrief ? (
                   <>
                     <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                     <span>Generating Foundation Brief...</span>
                   </>
                 ) : (
                   <>
                     <FileText className="w-5 h-5" />
                     <span>Generate Foundation Brief</span>
                   </>
                 )}
               </button>
            </div>
          </div>

          {/* Loading State for Report Execution */}
          {isLoadingReport && (
            <LoadingSpinner message="Executing deep research, this may take a moment..." size="lg" />
          )}

          {/* Foundation Report Display */}
          {foundationReport && !isLoadingReport && (
            <ReportDisplay 
              title="Foundation Report" 
              content={foundationReport} 
              className="animate-in fade-in duration-500"
            />
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
                  onClick={generateGapAnalysisBrief}
                  disabled={isLoadingGapBrief || !firstDraftForGapAnalysis}
                  className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isLoadingGapBrief ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generating Gap Analysis Brief...</span>
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
              <LoadingSpinner message="Executing gap analysis research..." size="lg" />
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

      {/* Foundation Brief Review Modal */}
      <BriefReviewModal
        isOpen={showBriefModal}
        title="Review Foundation Brief"
        brief={foundationBrief}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        onExecute={executeFoundationResearch}
        onCancel={() => setShowBriefModal(false)}
        isExecuting={isLoadingReport}
      />

      {/* Gap Analysis Brief Review Modal */}
      <BriefReviewModal
        isOpen={showGapBriefModal}
        title="Review Gap Analysis Brief"
        brief={gapAnalysisBrief}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        onExecute={executeGapAnalysisResearch}
        onCancel={() => setShowGapBriefModal(false)}
        isExecuting={isLoadingGapReport}
      />
    </div>
  )
}
