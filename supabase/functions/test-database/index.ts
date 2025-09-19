import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Database test function called')
    
    // Create Supabase client
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Test 1: Check if we can connect to projects table
    console.log('Testing projects table access...')
    const { data: projectsTest, error: projectsError } = await supabaseAdminClient
      .from('projects')
      .select('*')
      .limit(1)

    console.log('Projects test result:', { data: projectsTest, error: projectsError })

    // Test 2: Check if we can connect to reports table  
    console.log('Testing reports table access...')
    const { data: reportsTest, error: reportsError } = await supabaseAdminClient
      .from('reports')
      .select('*')
      .limit(1)

    console.log('Reports test result:', { data: reportsTest, error: reportsError })

    // Test 3: Try to create a test project
    console.log('Testing project creation...')
    const { data: newProject, error: createError } = await supabaseAdminClient
      .from('projects')
      .insert({
        name: 'Test Project',
        chapter_template_prompt: 'Test prompt',
        project_context: 'Test context',
        key_documents_summary: 'Test summary',
      })
      .select('id')
      .single()

    console.log('Project creation result:', { data: newProject, error: createError })

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Database test completed',
      tests: {
        projectsAccess: { success: !projectsError, error: projectsError?.message },
        reportsAccess: { success: !reportsError, error: reportsError?.message },
        projectCreation: { success: !createError, error: createError?.message, projectId: newProject?.id }
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Database test error:', error)
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
