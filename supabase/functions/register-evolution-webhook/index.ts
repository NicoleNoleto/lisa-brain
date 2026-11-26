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

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { evolutionServerUrl, evolutionInstanceName, evolutionApiToken } = await req.json();

    if (!evolutionServerUrl || !evolutionInstanceName || !evolutionApiToken) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: evolutionServerUrl, evolutionInstanceName, evolutionApiToken' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

    // Register webhook in Evolution API
    console.log(`[register-evolution-webhook] Registering webhook for instance: ${evolutionInstanceName}`);
    console.log(`[register-evolution-webhook] Webhook URL: ${webhookUrl}`);

    const registerResponse = await fetch(
      `${evolutionServerUrl}/webhook/set`,
      {
        method: 'POST',
        headers: {
          'apikey': evolutionApiToken,
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
      console.error(`[register-evolution-webhook] Error response:`, errorData);
      throw new Error(`Failed to register webhook: ${registerResponse.statusText}`);
    }

    const result = await registerResponse.json();
    console.log(`[register-evolution-webhook] Webhook registered successfully:`, result);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook registrado na Evolution',
        result,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[register-evolution-webhook] Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
