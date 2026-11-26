import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROUPING_DELAY_MS = 10000; // 10 seconds

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // GET request = Webhook verification from WhatsApp
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      // Get verify token from settings (get the first one that has a token)
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('whatsapp_verify_token')
        .not('whatsapp_verify_token', 'is', null)
        .limit(1)
        .maybeSingle();

      const verifyToken = settings?.whatsapp_verify_token || 'webhook-verify-token';

      if (mode === 'subscribe' && token === verifyToken) {
        console.log('[Webhook] Verification successful');
        return new Response(challenge, { status: 200, headers: corsHeaders });
      } else {
        console.error('[Webhook] Verification failed');
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }
    }

    // POST request = Incoming message from WhatsApp
    if (req.method === 'POST') {
      const body = await req.json();
      console.log('[Webhook] Received payload:', JSON.stringify(body, null, 2));

      // Detect which provider sent this webhook and route accordingly
      // Official WhatsApp API: has entry[0].changes[0].value.messages
      // Evolution API: has event property at top level

      if (body.event && body.instance) {
        // Evolution API format detected
        // Route to specific handler based on event type
        if (body.event === 'connection.update') {
          return await handleEvolutionConnectionUpdate(body, supabase, corsHeaders);
        } else if (body.event.startsWith('contacts.')) {
          return await handleEvolutionContactEvent(body, supabase, corsHeaders);
        } else {
          return await handleEvolutionWebhook(body, supabase, corsHeaders);
        }
      } else if (body.entry?.[0]?.changes?.[0]?.value) {
        // Official WhatsApp API format detected
        return await handleOfficialWebhook(body, supabase, corsHeaders);
      } else {
        console.log('[Webhook] Unknown webhook format, ignoring');
        return new Response(JSON.stringify({ status: 'ignored' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ status: 'error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Handler for Official WhatsApp Cloud API webhooks
async function handleOfficialWebhook(body: any, supabase: any, corsHeaders: any) {
  try {
    // Extract message data from WhatsApp Cloud API format
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      console.log('[Webhook] No value in payload, ignoring');
      return new Response(JSON.stringify({ status: 'ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const messages = value.messages;
    const contacts = value.contacts;
    const phoneNumberId = value.metadata?.phone_number_id;

      // Detect provider: Check new whatsapp_connections table first, then fallback to nina_settings
      const { data: connection } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .eq('provider', 'official')
        .eq('is_active', true)
        .maybeSingle();

      if (!connection) {
        console.log('[Webhook] No active whatsapp_connections found, using fallback');
      }

      // Find the user who owns this phone number ID
      const { data: ownerSettings } = await supabase
        .from('nina_settings')
        .select('user_id, whatsapp_access_token')
        .eq('whatsapp_phone_number_id', phoneNumberId)
        .maybeSingle();

      let ownerId = ownerSettings?.user_id || null;
      
      // Se não encontrou owner específico ou user_id é null, buscar o admin do sistema
      if (!ownerId) {
        console.log('[Webhook] No owner in settings, looking for system admin...');
        const { data: adminRole } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin')
          .limit(1)
          .maybeSingle();
        
        ownerId = adminRole?.user_id || null;
        
        if (ownerId) {
          console.log('[Webhook] Using admin as owner:', ownerId);
        } else {
          console.warn('[Webhook] No admin found in system - contacts will have null user_id');
        }
      } else {
        console.log('[Webhook] Found owner user_id:', ownerId);
      }

      // Handle status updates (delivered, read, etc)
      if (value.statuses) {
        for (const status of value.statuses) {
          console.log('[Webhook] Status update:', status);
          
          // Update message status in database
          if (status.id) {
            const statusMap: Record<string, string> = {
              'sent': 'sent',
              'delivered': 'delivered',
              'read': 'read',
              'failed': 'failed'
            };
            
            const newStatus = statusMap[status.status];
            if (newStatus) {
              await supabase
                .from('messages')
                .update({ 
                  status: newStatus,
                  ...(newStatus === 'delivered' && { delivered_at: new Date().toISOString() }),
                  ...(newStatus === 'read' && { read_at: new Date().toISOString() })
                })
                .eq('whatsapp_message_id', status.id);
            }
          }
        }
        
        return new Response(JSON.stringify({ status: 'processed_statuses' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Process incoming messages - CREATE RECORDS IMMEDIATELY
      if (messages && messages.length > 0) {
        const processAfter = new Date(Date.now() + GROUPING_DELAY_MS).toISOString();

        for (const message of messages) {
          const contactInfo = contacts?.find((c: any) => c.wa_id === message.from);
          const phoneNumber = message.from;
          const whatsappId = contactInfo?.wa_id || phoneNumber;
          const contactName = contactInfo?.profile?.name || null;

          // 1. Get or create contact IMMEDIATELY
          let { data: contact } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone_number', phoneNumber)
            .maybeSingle();

          if (!contact) {
            const { data: newContact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                phone_number: phoneNumber,
                whatsapp_id: whatsappId,
                name: contactName,
                call_name: contactName?.split(' ')[0] || null,
                user_id: null
              })
              .select()
              .single();

            if (contactError) {
              console.error('[Webhook] Error creating contact:', contactError);
              continue;
            }
            contact = newContact;
            console.log('[Webhook] Created new contact:', contact.id);
          } else {
            // Update contact activity
            const updates: any = { last_activity: new Date().toISOString() };
            if (contactName && !contact.name) {
              updates.name = contactName;
              updates.call_name = contactName.split(' ')[0];
            }
            // Removed user_id update to maintain single-tenant null pattern
            
            await supabase
              .from('contacts')
              .update(updates)
              .eq('id', contact.id);
          }

          // 2. Get or create conversation IMMEDIATELY
          let { data: conversation } = await supabase
            .from('conversations')
            .select('*')
            .eq('contact_id', contact.id)
            .eq('is_active', true)
            .maybeSingle();

          if (!conversation) {
            const { data: newConversation, error: convError } = await supabase
              .from('conversations')
              .insert({
                contact_id: contact.id,
                status: 'nina',
                is_active: true,
                user_id: null
              })
              .select()
              .single();

            if (convError) {
              console.error('[Webhook] Error creating conversation:', convError);
              continue;
            }
            conversation = newConversation;
            console.log('[Webhook] Created new conversation:', conversation.id);
          }
          // Removed user_id update to maintain single-tenant null pattern

          // 3. Determine message content and type
          let messageContent = '';
          let messageType = 'text';
          let mediaType = null;

          switch (message.type) {
            case 'text':
              messageContent = message.text?.body || '';
              messageType = 'text';
              break;
            case 'image':
              messageContent = message.image?.caption || '[imagem recebida]';
              messageType = 'image';
              mediaType = 'image';
              break;
            case 'audio':
              // Audio will be transcribed by message-grouper
              messageContent = '[áudio - processando transcrição...]';
              messageType = 'audio';
              mediaType = 'audio';
              break;
            case 'video':
              messageContent = message.video?.caption || '[vídeo recebido]';
              messageType = 'video';
              mediaType = 'video';
              break;
            case 'document':
              messageContent = message.document?.filename || '[documento recebido]';
              messageType = 'document';
              mediaType = 'document';
              break;
            default:
              messageContent = `[${message.type}]`;
          }

          // 4. Create message IMMEDIATELY (for realtime updates)
          const { data: dbMessage, error: msgError } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversation.id,
              whatsapp_message_id: message.id,
              content: messageContent,
              type: messageType,
              from_type: 'user',
              status: 'sent',
              media_type: mediaType,
              sent_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
              metadata: { 
                original_type: message.type,
                media_id: message.audio?.id || message.image?.id || message.video?.id || message.document?.id || null
              }
            })
            .select()
            .single();

          if (msgError) {
            // If duplicate key error, message was already processed
            if (msgError.code === '23505') {
              console.log('[Webhook] Duplicate message ignored:', message.id);
              continue;
            }
            console.error('[Webhook] Error creating message:', msgError);
            continue;
          }

          console.log('[Webhook] Created message:', dbMessage.id, 'for conversation:', conversation.id);

          // 5. Update conversation last_message_at
          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversation.id);

          // 6. FIRST reset timer for all pending messages from same phone, THEN insert new queue entry
          await supabase
            .from('message_grouping_queue')
            .update({ process_after: processAfter })
            .eq('processed', false)
            .eq('phone_number_id', phoneNumberId)
            .filter('message_data->>from', 'eq', phoneNumber);

          // 7. Insert into message_grouping_queue with message_id reference
          const { error: queueError } = await supabase
            .from('message_grouping_queue')
            .insert({
              whatsapp_message_id: message.id,
              phone_number_id: phoneNumberId,
              message_id: dbMessage.id,
              message_data: message,
              contacts_data: contactInfo || null,
              process_after: processAfter
            });

          if (queueError) {
            if (queueError.code === '23505') {
              console.log('[Webhook] Duplicate queue entry ignored:', message.id);
            } else {
              console.error('[Webhook] Queue insert error:', queueError);
            }
          } else {
            console.log('[Webhook] Message queued:', message.id, 'process_after:', processAfter);
          }
        }

        // Trigger message-grouper in background (non-blocking)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/message-grouper`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'whatsapp-webhook' })
          }).catch(err => console.error('[Webhook] Error triggering message-grouper:', err))
        );
      }

      return new Response(JSON.stringify({ status: 'processed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handler for Evolution API webhooks
async function handleEvolutionWebhook(body: any, supabase: any, corsHeaders: any) {
  try {
    console.log('[Webhook] Evolution event received:', body.event);

    // Evolution webhook format:
    // Real webhook: { event: 'messages.upsert', instance: '...', data: { key: {...}, message: {...}, pushName: '...', messageTimestamp: ... } }
    // Test/grouped: { event: 'messages.upsert', instance: '...', data: { messages: [...] } }
    const { event, instance, data } = body;

    if (event !== 'messages.upsert') {
      console.log('[Webhook] Ignoring Evolution event:', event);
      return new Response(JSON.stringify({ status: 'ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Support both formats: single message (real webhook) and array (test/grouped)
    let messages: any[] = [];
    if (data?.messages && Array.isArray(data.messages)) {
      // Format: { messages: [...] }
      messages = data.messages;
    } else if (data?.key && data?.message !== undefined) {
      // Format: single message object (real webhook from Evolution)
      messages = [{
        id: data.key?.id,
        from: data.key?.remoteJid,
        body: data.message?.conversation || '',
        timestamp: data.messageTimestamp,
        type: data.messageType || 'text',
        fromMe: data.key?.fromMe || false,
        pushName: data.pushName
      }];
      console.log('[Webhook] Converted single Evolution message to array format');
    } else {
      console.log('[Webhook] Ignoring Evolution event - no messages data');
      return new Response(JSON.stringify({ status: 'ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const GROUPING_DELAY_MS = 10000;

    // Find the connection for this Evolution instance
    const { data: connection } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('provider', 'evolution')
      .eq('evolution_instance_name', instance)
      .maybeSingle();

    if (!connection) {
      console.warn('[Webhook] Evolution instance not found:', instance);
      return new Response(JSON.stringify({ status: 'instance_not_found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const processAfter = new Date(Date.now() + GROUPING_DELAY_MS).toISOString();

    for (const message of messages) {
      // Evolution format: fromMe: false = incoming, fromMe: true = outgoing
      if (message.fromMe) {
        console.log('[Webhook] Ignoring outgoing message from Evolution');
        continue;
      }

      const phoneNumber = message.from?.replace('@s.whatsapp.net', '').replace('@lid', '');
      const contactName = message.pushName || null;

      if (!phoneNumber) {
        console.warn('[Webhook] Evolution message missing phone number:', message);
        continue;
      }

      // 1. Get or create contact
      let { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('phone_number', phoneNumber)
        .maybeSingle();

      if (!contact) {
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            phone_number: phoneNumber,
            whatsapp_id: message.from,
            name: contactName,
            call_name: contactName?.split(' ')[0] || null,
            user_id: null
          })
          .select()
          .single();

        if (contactError) {
          console.error('[Webhook] Error creating contact:', contactError);
          continue;
        }
        contact = newContact;
        console.log('[Webhook] Created new Evolution contact:', contact.id);
      } else {
        const updates: any = { last_activity: new Date().toISOString() };
        if (contactName && !contact.name) {
          updates.name = contactName;
          updates.call_name = contactName.split(' ')[0];
        }
        await supabase
          .from('contacts')
          .update(updates)
          .eq('id', contact.id);
      }

      // 2. Get or create conversation
      let { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_id', contact.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!conversation) {
        const { data: newConversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            contact_id: contact.id,
            whatsapp_connection_id: connection.id,
            status: 'nina',
            is_active: true,
            user_id: null
          })
          .select()
          .single();

        if (convError) {
          console.error('[Webhook] Error creating conversation:', convError);
          continue;
        }
        conversation = newConversation;
        console.log('[Webhook] Created new Evolution conversation:', conversation.id);
      }

      // 3. Determine message content and type
      let messageContent = '';
      let messageType = 'text';
      let mediaType = null;

      if (message.body) {
        messageContent = message.body;
        messageType = 'text';
      } else if (message.image) {
        messageContent = '[imagem recebida]';
        messageType = 'image';
        mediaType = 'image';
      } else if (message.audio) {
        messageContent = '[áudio - processando transcrição...]';
        messageType = 'audio';
        mediaType = 'audio';
      } else if (message.video) {
        messageContent = '[vídeo recebido]';
        messageType = 'video';
        mediaType = 'video';
      } else if (message.document) {
        messageContent = message.document.filename || '[documento recebido]';
        messageType = 'document';
        mediaType = 'document';
      } else {
        messageContent = '[mensagem recebida]';
      }

      // 4. Create message
      const { data: dbMessage, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          whatsapp_message_id: message.id,
          content: messageContent,
          type: messageType,
          from_type: 'user',
          status: 'sent',
          media_type: mediaType,
          sent_at: message.timestamp ? new Date(message.timestamp * 1000).toISOString() : new Date().toISOString(),
          metadata: {
            original_type: message.type,
            evolution_message_id: message.id
          }
        })
        .select()
        .single();

      if (msgError) {
        if (msgError.code === '23505') {
          console.log('[Webhook] Duplicate Evolution message ignored:', message.id);
          continue;
        }
        console.error('[Webhook] Error creating message:', msgError);
        continue;
      }

      console.log('[Webhook] Created Evolution message:', dbMessage.id);

      // 5. Update conversation last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation.id);

      // 6. Enqueue for message grouping
      const { error: queueError } = await supabase
        .from('message_grouping_queue')
        .insert({
          whatsapp_message_id: message.id,
          phone_number_id: connection.evolution_instance_name,
          message_id: dbMessage.id,
          message_data: message,
          contacts_data: null,
          process_after: processAfter
        });

      if (queueError) {
        if (queueError.code === '23505') {
          console.log('[Webhook] Duplicate queue entry ignored');
        } else {
          console.error('[Webhook] Queue insert error:', queueError);
        }
      }
    }

    // Trigger message-grouper
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    EdgeRuntime.waitUntil(
      fetch(`${supabaseUrl}/functions/v1/message-grouper`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'whatsapp-webhook-evolution' })
      }).catch(err => console.error('[Webhook] Error triggering message-grouper:', err))
    );

    return new Response(JSON.stringify({ status: 'processed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Webhook] Evolution handler error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handler for Evolution API contact events (contacts.upsert, contacts.sync)
async function handleEvolutionContactEvent(body: any, supabase: any, corsHeaders: any) {
  try {
    console.log('[Webhook] Evolution contact event received:', body.event);

    // Evolution contact webhook format:
    // { event: 'contacts.upsert', instance: 'instance-name', data: {...} }
    const { event, instance, data } = body;

    if (!data?.contacts) {
      console.log('[Webhook] Contact event missing contacts data:', event);
      return new Response(JSON.stringify({ status: 'ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find the connection for this Evolution instance
    const { data: connection, error: connError } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('provider', 'evolution')
      .eq('evolution_instance_name', instance)
      .maybeSingle();

    if (connError) {
      console.error('[Webhook] Error finding connection:', connError);
      return new Response(JSON.stringify({ status: 'error', error: connError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!connection) {
      console.warn('[Webhook] Evolution instance not found:', instance);
      return new Response(JSON.stringify({ status: 'instance_not_found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const contacts = data.contacts || [];
    console.log(`[Webhook] Processing ${contacts.length} contact(s) from ${event}...`);

    let upsertedCount = 0;

    for (const contactData of contacts) {
      try {
        const phoneNumber = contactData.jid?.replace('@s.whatsapp.net', '') || contactData.number?.toString();
        const contactName = contactData.pushName || contactData.name || null;

        if (!phoneNumber) {
          console.warn('[Webhook] Contact missing phone number:', contactData);
          continue;
        }

        console.log(`[Webhook] Processing contact: ${phoneNumber} (${contactName || 'no name'})`);

        // Upsert contact (create if not exists, update if exists)
        const { data: upsertedContact, error: upsertError } = await supabase
          .from('contacts')
          .upsert(
            {
              phone_number: phoneNumber,
              whatsapp_id: `${phoneNumber}@s.whatsapp.net`,
              name: contactName,
              call_name: contactName?.split(' ')[0] || null,
              user_id: null, // Single-tenant
              last_activity: new Date().toISOString(),
              is_business: false,
              tags: [],
            },
            {
              onConflict: 'phone_number', // Update if phone_number exists
            }
          )
          .select()
          .single();

        if (upsertError) {
          console.error('[Webhook] Error upserting contact:', upsertError);
          continue;
        }

        console.log('[Webhook] ✓ Contact upserted:', upsertedContact.id, `(${upsertedContact.name || 'no name'})`);
        upsertedCount++;
      } catch (err) {
        console.error('[Webhook] Exception processing contact:', err);
        continue;
      }
    }

    console.log(`[Webhook] ✓ Finished processing contacts event: ${upsertedCount}/${contacts.length} upserted`);

    return new Response(
      JSON.stringify({ status: 'processed', upserted_count: upsertedCount }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Webhook] Contact event handler error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handler for Evolution API connection status updates
async function handleEvolutionConnectionUpdate(body: any, supabase: any, corsHeaders: any) {
  try {
    console.log('[Webhook] Evolution connection update received:', body.event);

    const { instance, data } = body;

    if (!instance || !data?.connection) {
      console.warn('[Webhook] Connection update missing required fields');
      return new Response(JSON.stringify({ status: 'ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Map Evolution state to our status
    // { data: { connection: { state: "open"|"closed", ... } } }
    const evolutionState = data.connection.state;
    const newStatus = (evolutionState === 'open' || evolutionState === 'connected') ? 'connected' : 'disconnected';

    console.log(`[Webhook] Connection update: ${instance} → ${newStatus}`);

    // Update whatsapp_connections table
    const { error } = await supabase
      .from('whatsapp_connections')
      .update({
        evolution_connection_status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('evolution_instance_name', instance);

    if (error) {
      console.error('[Webhook] Connection update failed:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Webhook] ✓ Connection status updated: ${instance}`);

    return new Response(
      JSON.stringify({ status: 'processed', instance, newStatus }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Webhook] Connection update handler error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
