import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { WhatsAppConnection } from "./types.ts";

/**
 * Get the active WhatsApp connection
 * Falls back to legacy nina_settings if whatsapp_connections table doesn't have active connection
 */
export async function getActiveWhatsAppConnection(
  supabase: SupabaseClient
): Promise<WhatsAppConnection | null> {
  try {
    // Try to get active connection from whatsapp_connections table
    const { data: connection, error: connError } = await supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!connError && connection) {
      return connection as WhatsAppConnection;
    }

    // Fallback: Check legacy nina_settings for Official API credentials
    const { data: settings, error: settingsError } = await supabase
      .from("nina_settings")
      .select("id, whatsapp_access_token, whatsapp_phone_number_id, whatsapp_verify_token, whatsapp_business_account_id")
      .or("user_id.is.null, user_id.eq.null")
      .limit(1)
      .single();

    if (!settingsError && settings) {
      // Convert legacy settings to WhatsAppConnection format
      return {
        id: settings.id,
        owner_user_id: settings.user_id || "legacy",
        provider: "official",
        is_active: true,
        official_access_token: settings.whatsapp_access_token,
        official_phone_number_id: settings.whatsapp_phone_number_id,
        official_business_account_id: settings.whatsapp_business_account_id,
        official_verify_token: settings.whatsapp_verify_token,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as WhatsAppConnection;
    }

    return null;
  } catch (error) {
    console.error("Error getting active WhatsApp connection:", error);
    return null;
  }
}

/**
 * Validate WhatsApp connection credentials based on provider
 */
export function validateWhatsAppConnection(connection: WhatsAppConnection | null): {
  valid: boolean;
  error?: string;
} {
  if (!connection) {
    return { valid: false, error: "No WhatsApp connection found" };
  }

  if (connection.provider === "official") {
    if (!connection.official_access_token || !connection.official_phone_number_id) {
      return {
        valid: false,
        error: "Official WhatsApp credentials incomplete (missing access_token or phone_number_id)",
      };
    }
  } else if (connection.provider === "evolution") {
    if (!connection.evolution_server_url || !connection.evolution_instance_name || !connection.evolution_api_token) {
      return {
        valid: false,
        error: "Evolution API credentials incomplete (missing server_url, instance_name, or api_token)",
      };
    }

    if (connection.evolution_connection_status !== "connected") {
      return {
        valid: false,
        error: `Evolution API not connected. Status: ${connection.evolution_connection_status}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Send message via active WhatsApp provider
 */
export async function sendWhatsAppMessage(
  connection: WhatsAppConnection,
  to: string,
  message: string,
  messageType: "text" | "audio" = "text",
  mediaUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const validation = validateWhatsAppConnection(connection);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    if (connection.provider === "official") {
      return await sendViaOfficial(connection, to, message, messageType, mediaUrl);
    } else if (connection.provider === "evolution") {
      return await sendViaEvolution(connection, to, message, messageType, mediaUrl);
    }

    return { success: false, error: "Unknown provider" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Send message via Official WhatsApp Cloud API
 */
async function sendViaOfficial(
  connection: WhatsAppConnection,
  to: string,
  message: string,
  messageType: "text" | "audio" = "text",
  mediaUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const url = `https://graph.facebook.com/v18.0/${connection.official_phone_number_id}/messages`;

  const body = messageType === "text"
    ? {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message },
      }
    : {
        messaging_product: "whatsapp",
        to: to,
        type: "audio",
        audio: { link: mediaUrl },
      };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.official_access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: `WhatsApp API error: ${error.error?.message || response.statusText}`,
    };
  }

  const result = await response.json();
  return {
    success: true,
    messageId: result.messages?.[0]?.id,
  };
}

/**
 * Send message via Evolution API
 */
async function sendViaEvolution(
  connection: WhatsAppConnection,
  to: string,
  message: string,
  messageType: "text" | "audio" = "text",
  mediaUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const endpoint = messageType === "text" ? "/message/sendText" : "/message/sendAudio";
  const url = `${connection.evolution_server_url}${endpoint}`;

  const body = messageType === "text"
    ? {
        number: to,
        textMessage: {
          text: message,
        },
        instanceName: connection.evolution_instance_name,
      }
    : {
        number: to,
        audioMessage: {
          media: mediaUrl,
        },
        instanceName: connection.evolution_instance_name,
      };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": connection.evolution_api_token, // Official Evolution API uses "apikey" header
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: `Evolution API error: ${error.message || response.statusText}`,
    };
  }

  const result = await response.json();
  return {
    success: true,
    messageId: result.key?.id || result.messageId,
  };
}
