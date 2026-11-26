import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Get authenticated user's ID
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create client with service role (bypass RLS)
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Create client with user token (respects RLS)
    const supabaseUser = createClient(supabaseUrl, token || '');

    // 1. Get authenticated user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: 'Not authenticated',
          details: userError?.message || 'No user found'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[test-rls] Testing for user:', user.id);

    // 2. Test INSERT with user token (should respect RLS)
    const testInsertData = {
      provider: 'evolution',
      is_active: false,  // Mark as test
      owner_user_id: user.id,
      evolution_server_url: 'http://test-server:3000',
      evolution_instance_name: 'test-rls-' + Date.now(),
      evolution_api_token: 'test-token',
      evolution_connection_status: 'disconnected',
    };

    console.log('[test-rls] Attempting INSERT with user token...');
    const { data: insertData, error: insertError } = await supabaseUser
      .from('whatsapp_connections')
      .insert(testInsertData)
      .select()
      .single();

    // 3. Test SELECT with user token
    console.log('[test-rls] Attempting SELECT with user token...');
    const { data: selectData, error: selectError } = await supabaseUser
      .from('whatsapp_connections')
      .select('*')
      .eq('owner_user_id', user.id);

    // 4. Test SELECT with service role (bypass RLS)
    console.log('[test-rls] Attempting SELECT with service role...');
    const { data: selectServiceData, error: selectServiceError } = await supabaseService
      .from('whatsapp_connections')
      .select('*')
      .eq('owner_user_id', user.id);

    // 5. Cleanup test record if insert succeeded
    if (insertData && !insertError) {
      console.log('[test-rls] Cleaning up test record:', insertData.id);
      await supabaseService
        .from('whatsapp_connections')
        .delete()
        .eq('id', insertData.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: user.id,
        tests: {
          insert: {
            success: !insertError,
            error: insertError ? {
              code: insertError.code,
              message: insertError.message,
              details: (insertError as any).details,
            } : null,
            data: insertData ? { id: insertData.id, provider: insertData.provider } : null,
          },
          select_user_token: {
            success: !selectError,
            error: selectError ? {
              code: selectError.code,
              message: selectError.message,
            } : null,
            count: selectData?.length || 0,
          },
          select_service_role: {
            success: !selectServiceError,
            error: selectServiceError ? {
              code: selectServiceError.code,
              message: selectServiceError.message,
            } : null,
            count: selectServiceData?.length || 0,
          },
        },
        diagnosis: {
          rls_working: !insertError,
          can_read_own_records: !selectError && (selectData?.length || 0) > 0,
          service_role_bypass_ok: !selectServiceError,
          recommendation:
            insertError
              ? `RLS blocking INSERT - Error ${insertError.code}: ${insertError.message}`
              : 'RLS policy is working correctly - INSERT successful'
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[test-rls] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
