import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppMessage } from "../helpers/whatsapp-connection.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { requireAuth } = await import("../_shared/auth.ts");
  const authFail = await requireAuth(req, corsHeaders);
  if (authFail) return authFail;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Sender] Starting send process...');

    const MAX_EXECUTION_TIME = 25000; // 25 seconds
    const startTime = Date.now();
    let totalSent = 0;
    let iterations = 0;

    console.log('[Sender] Starting polling loop');

    // Cache de settings por user_id para evitar múltiplas queries
    const settingsCache: Record<string, any> = {};

    while (Date.now() - startTime < MAX_EXECUTION_TIME) {
      iterations++;
      console.log(`[Sender] Iteration ${iterations}, elapsed: ${Date.now() - startTime}ms`);

      // Claim batch of messages to send
      const { data: queueItems, error: claimError } = await supabase
        .rpc('claim_send_queue_batch', { p_limit: 10 });

      if (claimError) {
        console.error('[Sender] Error claiming batch:', claimError);
        throw claimError;
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('[Sender] No messages ready to send, checking for scheduled messages...');
        
        // Check for messages scheduled in the next 5 seconds
        const { data: upcoming, error: upcomingError } = await supabase
          .from('send_queue')
          .select('id, scheduled_at')
          .eq('status', 'pending')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', new Date(Date.now() + 5000).toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1);

        if (upcomingError) {
          console.error('[Sender] Error checking upcoming messages:', upcomingError);
        }

        if (upcoming && upcoming.length > 0) {
          const scheduledAt = new Date(upcoming[0].scheduled_at).getTime();
          const now = Date.now();
          const waitTime = Math.min(
            Math.max(scheduledAt - now + 100, 0),
            5000
          );
          
          if (waitTime > 0 && (Date.now() - startTime + waitTime) < MAX_EXECUTION_TIME) {
            console.log(`[Sender] Waiting ${waitTime}ms for scheduled message at ${upcoming[0].scheduled_at}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        // No more messages to process
        console.log('[Sender] No more messages to process, exiting loop');
        break;
      }

      console.log(`[Sender] Processing batch of ${queueItems.length} messages`);

      for (const item of queueItems) {
        try {
          // Buscar user_id da conversation para multi-tenancy
          const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('user_id, whatsapp_connection_id')
            .eq('id', item.conversation_id)
            .single();

          if (convError || !conversation) {
            console.error(`[Sender] Error fetching conversation ${item.conversation_id}:`, convError);
            throw new Error('Conversation not found');
          }

          const userId = conversation.user_id;

          // Buscar settings do cache ou do banco com fallback triplo
          const cacheKey = conversation.whatsapp_connection_id || userId || 'global';
          let settings = settingsCache[cacheKey];
          if (!settings) {
            let settingsData = null;

            // Prefer the connection that originated the conversation. This is
            // essential when Official and Evolution are both configured.
            let connection = null;
            if (conversation.whatsapp_connection_id) {
              const { data } = await supabase
                .from('whatsapp_connections')
                .select('*')
                .eq('id', conversation.whatsapp_connection_id)
                .eq('is_active', true)
                .maybeSingle();
              connection = data;
            }

            // Owner-scoped fallback for legacy conversations without a link.
            if (!connection && userId) {
              const { data } = await supabase
                .from('whatsapp_connections')
                .select('*')
                .eq('owner_user_id', userId)
                .eq('is_active', true)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              connection = data;
            }

            // Single-tenant fallback: never use maybeSingle() across all rows,
            // because Official + Evolution may both be active.
            if (!connection) {
              const { data } = await supabase
                .from('whatsapp_connections')
                .select('*')
                .eq('is_active', true)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              connection = data;
            }

            if (connection) {
              console.log('[Sender] Using whatsapp_connections for provider:', connection.provider);
              settingsData = {
                connection_id: connection.id,
                provider: connection.provider,
                whatsapp_access_token: connection.official_access_token,
                whatsapp_phone_number_id: connection.official_phone_number_id,
                evolution_server_url: connection.evolution_server_url,
                evolution_instance_name: connection.evolution_instance_name,
                evolution_api_token: connection.evolution_api_token,
              };
            } else {
              // Fallback to legacy nina_settings
              // 1. Tentar por user_id da conversa
              if (userId) {
                const { data } = await supabase
                  .from('nina_settings')
                  .select('provider, whatsapp_access_token, whatsapp_phone_number_id, evolution_server_url, evolution_instance_name, evolution_api_token')
                  .eq('user_id', userId)
                  .maybeSingle();
                settingsData = data;
              }

              // 2. Fallback: buscar global (user_id IS NULL)
              if (!settingsData) {
                console.log('[Sender] No user-specific settings, trying global...');
                const { data } = await supabase
                  .from('nina_settings')
                  .select('provider, whatsapp_access_token, whatsapp_phone_number_id, evolution_server_url, evolution_instance_name, evolution_api_token')
                  .is('user_id', null)
                  .maybeSingle();
                settingsData = data;
              }

              // 3. Último fallback: qualquer settings com WhatsApp configurado
              if (!settingsData) {
                console.log('[Sender] No global settings, fetching any with WhatsApp...');
                const { data } = await supabase
                  .from('nina_settings')
                  .select('whatsapp_access_token, whatsapp_phone_number_id')
                  .not('whatsapp_phone_number_id', 'is', null)
                  .limit(1)
                  .maybeSingle();
                settingsData = data;
              }
            }

            if (!settingsData) {
              console.error('[Sender] No settings found with any fallback');
              throw new Error('Settings not found');
            }

            // Validate provider-specific settings
            const isOfficial = settingsData.provider === 'official' || settingsData.whatsapp_access_token;
            const isEvolution = settingsData.provider === 'evolution' || settingsData.evolution_server_url;

            if (isOfficial && (!settingsData.whatsapp_access_token || !settingsData.whatsapp_phone_number_id)) {
              console.error('[Sender] Official WhatsApp not configured in settings');
              throw new Error('WhatsApp not configured');
            }

            if (isEvolution && (!settingsData.evolution_server_url || !settingsData.evolution_instance_name || !settingsData.evolution_api_token)) {
              console.error('[Sender] Evolution API not configured in settings');
              throw new Error('Evolution API not configured');
            }

            if (!isOfficial && !isEvolution) {
              console.error('[Sender] No valid WhatsApp provider configured');
              throw new Error('No WhatsApp provider configured');
            }

            settings = settingsData;
            settingsCache[cacheKey] = settings;
          }

          const response = await sendMessage(supabase, settings, item);

          // Mark as completed
          console.log(`[Sender] Response from sendMessage:`, response);
          await supabase
            .from('send_queue')
            .update({
              status: 'completed',
              error_message: `Evolution Response: ${JSON.stringify(response)}`,
              sent_at: new Date().toISOString()
            })
            .eq('id', item.id);

          totalSent++;
          console.log(`[Sender] Successfully sent message ${item.id} (${totalSent} total)`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Sender] Error sending item ${item.id}:`, error);
          
          // Mark as failed with retry
          const newRetryCount = (item.retry_count || 0) + 1;
          const shouldRetry = newRetryCount < 3;
          
          await supabase
            .from('send_queue')
            .update({ 
              status: shouldRetry ? 'pending' : 'failed',
              retry_count: newRetryCount,
              error_message: errorMessage,
              scheduled_at: shouldRetry 
                ? new Date(Date.now() + newRetryCount * 60000).toISOString() 
                : null
            })
            .eq('id', item.id);
        }
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`[Sender] Completed: sent ${totalSent} messages in ${iterations} iterations (${executionTime}ms)`);

    return new Response(JSON.stringify({ 
      sent: totalSent, 
      iterations,
      executionTime 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Sender] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function sendMessage(supabase: any, settings: any, queueItem: any) {
  console.log(`[Sender] Sending message: ${queueItem.id}`);

  // Get contact phone number
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number, whatsapp_id')
    .eq('id', queueItem.contact_id)
    .maybeSingle();

  if (!contact) {
    throw new Error('Contact not found');
  }

  const phoneNumber = contact.phone_number;

  // Build connection object from settings (works for both Official and Evolution)
  const connection = {
    provider: settings.provider || 'official',
    official_access_token: settings.whatsapp_access_token,
    official_phone_number_id: settings.whatsapp_phone_number_id,
    evolution_server_url: settings.evolution_server_url,
    evolution_instance_name: settings.evolution_instance_name,
    evolution_api_token: settings.evolution_api_token,
    // Sender já validou as credenciais; não bloquear por flag de status possivelmente defasada.
    evolution_connection_status: 'connected' as const,
    id: settings.connection_id,
  };

  console.log(`[Sender] Sending via provider: ${connection.provider}`);

  // Send via sendWhatsAppMessage (routes to Official or Evolution automatically)
  const response = await sendWhatsAppMessage(
    connection,
    phoneNumber,
    queueItem.content,
    queueItem.message_type || 'text',
    queueItem.media_url || null
  );

  if (!response.success) {
    throw new Error(response.error || 'Failed to send message');
  }

  const whatsappMessageId = response.messageId;
  console.log('[Sender] Message sent, WA ID:', whatsappMessageId);

  // Update or create message record in database
  if (queueItem.message_id) {
    // UPDATE existing message (for human messages)
    console.log('[Sender] Updating existing message:', queueItem.message_id);
    const { error: msgError } = await supabase
      .from('messages')
      .update({
        whatsapp_message_id: whatsappMessageId,
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', queueItem.message_id);

    if (msgError) {
      console.error('[Sender] Error updating message record:', msgError);
      // Don't throw - message was sent successfully
    }
  } else {
    // INSERT new message (for Nina messages)
    console.log('[Sender] Creating new message record');
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: queueItem.conversation_id,
        whatsapp_message_id: whatsappMessageId,
        content: queueItem.content,
        type: queueItem.message_type,
        from_type: queueItem.from_type,
        status: 'sent',
        media_url: queueItem.media_url || null,
        sent_at: new Date().toISOString(),
        metadata: queueItem.metadata || {}
      });

    if (msgError) {
      console.error('[Sender] Error creating message record:', msgError);
      // Don't throw - message was sent successfully
    }
  }

  // Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', queueItem.conversation_id);

  return response;
}
