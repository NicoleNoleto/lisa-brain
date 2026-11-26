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
 * Normalize phone number to Evolution API format: country code + area code + 9 + number
 * Example: "11999999999" or "11 99999999" -> "5511999999999"
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');

  // If already has country code (55), use as is
  if (cleaned.startsWith('55')) {
    // Check if needs the '9' for mobile (11 digits after 55 means it needs 9)
    if (cleaned.length === 12) {
      // Format: 55 + 11 (DDD) + 8 digits - needs 9 for mobile
      return cleaned.slice(0, 4) + '9' + cleaned.slice(4);
    }
    return cleaned;
  }

  // If starts with 0, it's a Brazilian number without country code
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  // If 10 digits (DDD + 8), add 9 for mobile
  if (cleaned.length === 10) {
    return '55' + cleaned.slice(0, 2) + '9' + cleaned.slice(2);
  }

  // If 11 digits (DDD + 9 + 8), just add country code
  if (cleaned.length === 11) {
    return '55' + cleaned;
  }

  // Return as-is with country code if not matching patterns
  return '55' + cleaned;
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
  const url = `${connection.evolution_server_url}${endpoint}/${connection.evolution_instance_name}`;
  const normalizedNumber = normalizePhoneNumber(to);

  const body = messageType === "text"
    ? {
        number: normalizedNumber,
        textMessage: {
          text: message,
        },
      }
    : {
        number: normalizedNumber,
        audioMessage: {
          media: mediaUrl,
        },
      };

  console.log(`[Evolution] Original number: ${to} -> Normalized: ${normalizedNumber}`);
  console.log(`[Evolution] Sending to URL: ${url}`);
  console.log(`[Evolution] Payload:`, JSON.stringify(body));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": connection.evolution_api_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  console.log(`[Evolution] Response status: ${response.status}`);

  if (!response.ok) {
    const error = await response.json();
    console.error(`[Evolution] API error:`, error);
    return {
      success: false,
      error: `Evolution API error: ${error.message || error.error?.message || response.statusText}`,
    };
  }

  const result = await response.json();
  console.log(`[Evolution] Success response:`, result);
  return {
    success: true,
    messageId: result.key?.id || result.messageId,
  };
}
