// supabase/functions/execute-research/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SYNTHESIZER_META_PROMPT = `You are a Senior Partner at a top-tier strategy consulting firm, renowned for your ability to synthesize complex information into clear, decision-grade reports. You have been given a collection of raw research findings from your junior analyst team.

Your task is to read all the provided raw data and transform it into a single, cohesive, client-ready "Market Research Pack."

You must adhere to the following structure and principles:
1.  **Executive Summary:** Begin with a concise, powerful "Executive Summary" section that synthesizes the most critical, overarching findings from the entire document.
2.  **Cohesive Narrative:** Weave the individual research sections together into a smooth, logical narrative. Do not simply list the sections; ensure they flow together.
3.  **Professional Formatting:** Use clear Markdown formatting, including headers, sub-headers, bold text for key terms, and tables for comparative data.
4.  **Synthesize, Do Not Invent:** You MUST only use the information present in the "Raw Research Data" provided below. Do not introduce any outside knowledge or facts. Your job is to synthesize, not to conduct new research.

Here is the raw data from your team:
---
{raw_data}
---`

async function runOrchestration(report_id: string) {
  try {
    // Create a Supabase admin client
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Step A: Fetch the Brief
    console.log(`Step A: Fetching report with ID: ${report_id}`)
    const { data: reportData, error: fetchError } = await supabaseAdminClient
      .from('reports')
      .select('research_brief, project_id, report_type')
      .eq('id', report_id)
      .single()

    if (fetchError) {
      throw new Error(`Failed to fetch report: ${fetchError.message}`)
    }

    if (!reportData.research_brief) {
      throw new Error('Report does not have a research_brief')
    }

    // Fetch the project data needed for the enhanced research plan generation
    console.log(`Step A: Fetching project data for project ID: ${reportData.project_id}`)
    const { data: projectData, error: projectError } = await supabaseAdminClient
      .from('projects')
      .select(`
        project_context,
        key_documents_summary,
        chapter_templates ( chapter_prompt )
      `)
      .eq('id', reportData.project_id)
      .single()

    if (projectError) {
      throw new Error(`Failed to fetch project data: ${projectError.message}`)
    }

    if (!projectData.project_context || !projectData.key_documents_summary || !projectData.chapter_templates?.chapter_prompt) {
      throw new Error('Project is missing required data (project_context, key_documents_summary, or chapter_prompt from template)')
    }

    console.log('Step A completed: Research brief and project data fetched successfully')

    // Step B: Generate the Plan
    console.log('Step B: Generating research plan')
    const planResponse = await supabaseAdminClient.functions.invoke('generate-research-plan', {
      body: {
        project_context: projectData.project_context,
        documents_summary: projectData.key_documents_summary,
        chapter_prompt: projectData.chapter_templates.chapter_prompt
      }
    })

    if (planResponse.error) {
      throw new Error(`Failed to generate research plan: ${planResponse.error.message}`)
    }

    const { research_plan } = planResponse.data
    
    if (!Array.isArray(research_plan) || research_plan.length === 0) {
      throw new Error('Invalid or empty research plan received')
    }

    console.log(`Step B completed: Generated ${research_plan.length} research tasks`)

    // Step C: Execute Tasks in Parallel
    console.log('Step C: Executing atomic research tasks in parallel')
    const atomicTaskPromises = research_plan.map(async (question: string, index: number) => {
      console.log(`Starting atomic task ${index + 1}: ${question.substring(0, 100)}...`)
      
      const taskResponse = await supabaseAdminClient.functions.invoke('execute-atomic-task', {
        body: { question }
      })

      if (taskResponse.error) {
        console.error(`Task ${index + 1} failed:`, taskResponse.error)
        throw new Error(`Atomic task ${index + 1} failed: ${taskResponse.error.message}`)
      }

      console.log(`Completed atomic task ${index + 1}`)
      return taskResponse.data
    })

    // Wait for all tasks to complete
    const atomicResults = await Promise.all(atomicTaskPromises)
    console.log(`Step C completed: All ${atomicResults.length} atomic tasks finished`)

    // Step D: Combine the Results
    console.log('Step D: Combining research results')
    const combinedReportTexts = atomicResults.map((result, index) => {
      const reportText = result.report_text || ''
      return `## Research Task ${index + 1}: ${research_plan[index]}\n\n${reportText}`
    })

    const rawData = combinedReportTexts.join('\n\n---\n\n')
    console.log(`Step D completed: Combined ${combinedReportTexts.length} reports into raw data`)

    // Step D.5: Synthesize the Raw Data into Professional Report
    console.log('Step D.5: Synthesizing raw data into professional report')
    
    // Get OpenRouter API key from environment
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterApiKey) {
      throw new Error('SERVER ERROR: OPENROUTER_API_KEY was not found in the environment.')
    }

    // Construct the synthesis prompt
    const synthesisPrompt = SYNTHESIZER_META_PROMPT.replace('{raw_data}', rawData)

    // Call OpenRouter for synthesis using large-context model
    const synthesisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: synthesisPrompt }],
      }),
    })

    if (!synthesisResponse.ok) {
      const errorBody = await synthesisResponse.text()
      throw new Error(`Synthesis API request failed: ${synthesisResponse.status} ${synthesisResponse.statusText} - ${errorBody}`)
    }

    const synthesisAiResponse = await synthesisResponse.json()
    const finalReport = synthesisAiResponse.choices[0].message.content

    if (!finalReport) {
      throw new Error('No synthesized content received from AI model')
    }

    console.log('Step D.5 completed: Raw data synthesized into professional report')

    // Step E: Save the Final Report
    console.log('Step E: Saving synthesized final report to database')
    const { data: updatedReport, error: updateError } = await supabaseAdminClient
      .from('reports')
      .update({
        final_report: finalReport,
        status: 'complete'
      })
      .eq('id', report_id)
      .select('*')
      .single()

    if (updateError) {
      throw new Error(`Failed to update report: ${updateError.message}`)
    }

    console.log('Step E completed: Synthesized final report saved successfully')

    console.log('Step F: Orchestration completed successfully')

  } catch (error) {
    console.error('Error in runOrchestration:', error)
    
    // Update report status to error in the background
    try {
      const supabaseAdminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      await supabaseAdminClient
        .from('reports')
        .update({ status: 'error' })
        .eq('id', report_id)
        
      console.log(`Report ${report_id} status updated to 'error' due to orchestration failure`)
    } catch (updateError) {
      console.error('Failed to update report status to error:', updateError)
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse the request body
    const { report_id } = await req.json()
    
    // Validate required input
    if (!report_id) {
      return new Response(JSON.stringify({ error: "Missing 'report_id' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Start the orchestration process in the background (fire and forget)
    runOrchestration(report_id)

    // Return immediate 202 Accepted response
    return new Response(JSON.stringify({ message: "Research process started successfully." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 202,
    })

  } catch (error) {
    console.error('Error in execute-research handler:', error)
    
    // Return appropriate error response
    const statusCode = error.message.includes('Missing') ? 400 : 500
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: statusCode,
    })
  }
})
