// WhatsApp Connection Type
export interface WhatsAppConnection {
  id: string;
  owner_user_id: string;
  provider: 'official' | 'evolution';
  is_active: boolean;

  // Official API fields
  official_access_token?: string;
  official_phone_number_id?: string;
  official_business_account_id?: string;
  official_verify_token?: string;

  // Evolution API fields
  evolution_server_url?: string;
  evolution_instance_name?: string;
  evolution_api_token?: string;
  evolution_qr_code?: string;
  evolution_connection_status?: 'disconnected' | 'connecting' | 'connected' | 'qr_pending';
  evolution_authenticated_at?: string;

  // Metadata
  last_tested_at?: string;
  test_error?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type WhatsAppProvider = 'official' | 'evolution';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'qr_pending';
