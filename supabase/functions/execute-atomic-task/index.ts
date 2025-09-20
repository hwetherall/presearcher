// supabase/functions/execute-atomic-task/index.ts

import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse the request body
    const { question } = await req.json()
    
    // Validate required input
    if (!question) {
      return new Response(JSON.stringify({ error: "Missing 'question' in request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Get OpenRouter API key from environment
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!openRouterApiKey) {
      throw new Error('SERVER ERROR: OPENROUTER_API_KEY was not found in the environment.')
    }

    // A more robust API call function with independent timeout
    const callApiWithTimeout = (model: string, timeout: number): Promise<string> => {
      return new Promise(async (resolve, reject) => {
        const timeoutPromise = new Promise((_, rejectTimeout) => {
          setTimeout(() => rejectTimeout(new Error(`API call to ${model} timed out after ${timeout / 1000}s`)), timeout)
        })

        const apiPromise = (async () => {
          try {
            console.log(`Attempting research with model: ${model}`)
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openRouterApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: question }],
              }),
            })

            if (!res.ok) {
              const errorBody = await res.text()
              throw new Error(`API request failed: ${res.status} ${res.statusText} - ${errorBody}`)
            }

            const aiResponse = await res.json()
            const reportText = aiResponse.choices[0]?.message?.content

            if (!reportText) {
              throw new Error('No content received from AI model')
            }
            
            console.log(`Successfully completed research with model: ${model}`)
            return reportText
          } catch (error) {
            // Re-throw the error to be caught by the Promise.race reject
            throw error
          }
        })()

        try {
          // Race the API call against the timeout
          const result = await Promise.race([apiPromise, timeoutPromise])
          resolve(result as string)
        } catch (error) {
          reject(error)
        }
      })
    }

    // --- Execution Flow ---
    let reportText: string | null = null
    const errors: string[] = []

    // 1. Try the powerful, slower model first
    try {
      reportText = await callApiWithTimeout("perplexity/sonar-deep-research", 300000) // 5-minute timeout
    } catch (error) {
      console.warn(`Deep research model failed: ${error.message}`)
      errors.push(error.message)
      
      // 2. If it fails, fall back to the faster, reliable model
      try {
        reportText = await callApiWithTimeout("perplexity/sonar-pro", 45000) // 45s timeout
      } catch (fallbackError) {
        console.warn(`Fallback model failed: ${fallbackError.message}`)
        errors.push(fallbackError.message)
        
        // 3. If that also fails, use the fastest, general-purpose model
        try {
          reportText = await callApiWithTimeout("google/gemini-2.5-flash", 25000) // 25s timeout
        } catch (finalFallbackError) {
          console.error(`All models failed for question: "${question.substring(0, 50)}..."`)
          errors.push(finalFallbackError.message)
        }
      }
    }

    // 4. If all attempts failed, return a structured error message
    if (reportText === null) {
      console.error(`Final failure. Errors: ${errors.join('; ')}`)
      reportText = `[This research task failed after multiple attempts due to API errors or timeouts. No data is available for this section.]`
    }

    // Return success response with the report text
    return new Response(JSON.stringify({ report_text: reportText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in execute-atomic-task function:', error)
    
    // Return appropriate error response
    const statusCode = error.message.includes('Missing') ? 400 : 500
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: statusCode,
    })
  }
})
