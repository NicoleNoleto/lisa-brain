-- Add whatsapp_connection_id tracking to conversations
ALTER TABLE conversations
ADD COLUMN whatsapp_connection_id UUID
REFERENCES whatsapp_connections(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_conversations_whatsapp_connection_id
ON conversations(whatsapp_connection_id);

-- Add whatsapp_connection_id tracking to messages (for auditability)
ALTER TABLE messages
ADD COLUMN whatsapp_connection_id UUID
REFERENCES whatsapp_connections(id) ON DELETE SET NULL;

-- Add index for messages
CREATE INDEX idx_messages_whatsapp_connection_id
ON messages(whatsapp_connection_id);

-- Add comment explaining the relationship
COMMENT ON COLUMN conversations.whatsapp_connection_id IS 'Links conversation to the specific WhatsApp connection (Official or Evolution) that created it';
COMMENT ON COLUMN messages.whatsapp_connection_id IS 'Links message to the WhatsApp connection that processed it';
