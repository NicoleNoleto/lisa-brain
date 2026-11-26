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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[healthcheck-evolution-webhook] Starting webhook health check...');

    // 1. Find all active Evolution connections
    const { data: connections, error: connError } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('provider', 'evolution')
      .eq('is_active', true);

    if (connError) {
      console.error('[healthcheck-evolution-webhook] Error fetching connections:', connError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch connections', details: connError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!connections || connections.length === 0) {
      console.log('[healthcheck-evolution-webhook] No active Evolution connections found');
      return new Response(
        JSON.stringify({ success: true, checked: 0, reregistered: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[healthcheck-evolution-webhook] Found ${connections.length} active Evolution connections`);

    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
    let reregisteredCount = 0;
    const results: any[] = [];

    // 2. Check webhook status for each connection
    for (const connection of connections) {
      try {
        console.log(`[healthcheck-evolution-webhook] Checking webhook for instance: ${connection.evolution_instance_name}`);

        // Try to fetch webhook info from Evolution API
        // Note: Evolution API v1 may not have a dedicated webhook status endpoint
        // So we'll verify by attempting to re-register (idempotent operation)

        const registerResponse = await fetch(
          `${connection.evolution_server_url}/webhook/set`,
          {
            method: 'POST',
            headers: {
              'apikey': connection.evolution_api_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              enabled: true,
              url: webhookUrl,
              webhook_by_events: true,
              events: [
                'messages.upsert',
                'messages.update',
                'messages.delete',
                'send_message',
                'connection.update',
                'instance.create',
                'instance.delete',
                'instance.logout',
              ],
            }),
          }
        );

        if (!registerResponse.ok) {
          const errorData = await registerResponse.text();
          console.error(
            `[healthcheck-evolution-webhook] Failed to register webhook for ${connection.evolution_instance_name}:`,
            errorData
          );
          results.push({
            instance: connection.evolution_instance_name,
            status: 'failed',
            error: `HTTP ${registerResponse.status}`,
          });
        } else {
          const result = await registerResponse.json();
          console.log(
            `[healthcheck-evolution-webhook] ✓ Webhook verified/re-registered for ${connection.evolution_instance_name}`
          );
          reregisteredCount++;
          results.push({
            instance: connection.evolution_instance_name,
            status: 'success',
            message: 'Webhook re-registered',
          });

          // Update last_tested_at timestamp
          await supabase
            .from('whatsapp_connections')
            .update({
              last_tested_at: new Date().toISOString(),
              test_error: null,
            })
            .eq('id', connection.id);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `[healthcheck-evolution-webhook] Error checking webhook for ${connection.evolution_instance_name}:`,
          errorMsg
        );
        results.push({
          instance: connection.evolution_instance_name,
          status: 'error',
          error: errorMsg,
        });

        // Update test_error field
        await supabase
          .from('whatsapp_connections')
          .update({
            last_tested_at: new Date().toISOString(),
            test_error: errorMsg,
          })
          .eq('id', connection.id);
      }
    }

    console.log(
      `[healthcheck-evolution-webhook] Health check completed. Re-registered: ${reregisteredCount}/${connections.length}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        checked: connections.length,
        reregistered: reregisteredCount,
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[healthcheck-evolution-webhook] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
