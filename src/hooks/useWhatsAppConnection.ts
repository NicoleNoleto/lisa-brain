import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppConnection, WhatsAppProvider } from '@/types';
import { toast } from 'sonner';

export function useWhatsAppConnection() {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [activeConnection, setActiveConnection] = useState<WhatsAppConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all connections for current user
  const fetchConnections = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;

      setConnections(data || []);

      // Set active connection
      const active = data?.find(c => c.is_active);
      setActiveConnection(active || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error fetching connections';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create new connection
  const createConnection = useCallback(
    async (
      provider: WhatsAppProvider,
      data: Partial<WhatsAppConnection>
    ): Promise<WhatsAppConnection | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: newConnection, error: err } = await supabase
          .from('whatsapp_connections')
          .insert({
            provider,
            is_active: true,
            ...data,
          })
          .select()
          .single();

        if (err) throw err;

        // If creating new connection, deactivate others with same provider
        if (newConnection.provider) {
          await supabase
            .from('whatsapp_connections')
            .update({ is_active: false })
            .neq('id', newConnection.id)
            .eq('provider', newConnection.provider);
        }

        await fetchConnections();
        toast.success(`${provider === 'official' ? 'API Oficial' : 'Evolution API'} conectada com sucesso!`);
        return newConnection;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error creating connection';
        setError(message);
        toast.error(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchConnections]
  );

  // Update connection
  const updateConnection = useCallback(
    async (id: string, updates: Partial<WhatsAppConnection>): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        const { error: err } = await supabase
          .from('whatsapp_connections')
          .update(updates)
          .eq('id', id);

        if (err) throw err;

        await fetchConnections();
        toast.success('Conexão atualizada com sucesso!');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error updating connection';
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchConnections]
  );

  // Delete connection
  const deleteConnection = useCallback(
    async (id: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        const { error: err } = await supabase
          .from('whatsapp_connections')
          .delete()
          .eq('id', id);

        if (err) throw err;

        await fetchConnections();
        toast.success('Conexão removida com sucesso!');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error deleting connection';
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchConnections]
  );

  // Switch active connection
  const switchActiveConnection = useCallback(
    async (connectionId: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        // Deactivate all
        await supabase
          .from('whatsapp_connections')
          .update({ is_active: false });

        // Activate selected
        const { error: err } = await supabase
          .from('whatsapp_connections')
          .update({ is_active: true })
          .eq('id', connectionId);

        if (err) throw err;

        await fetchConnections();
        toast.success('Conexão ativada com sucesso!');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error switching connection';
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchConnections]
  );

  // Update evolution connection status (for QR polling)
  const updateEvolutionStatus = useCallback(
    async (
      id: string,
      status: 'disconnected' | 'connecting' | 'connected' | 'qr_pending',
      qrCode?: string
    ): Promise<boolean> => {
      try {
        const updates: any = {
          evolution_connection_status: status,
        };

        if (qrCode) {
          updates.evolution_qr_code = qrCode;
        }

        if (status === 'connected') {
          updates.evolution_authenticated_at = new Date().toISOString();
        }

        const { error: err } = await supabase
          .from('whatsapp_connections')
          .update(updates)
          .eq('id', id);

        if (err) throw err;

        await fetchConnections();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error updating status';
        console.error(message);
        return false;
      }
    },
    [fetchConnections]
  );

  // Initial fetch
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  return {
    connections,
    activeConnection,
    isLoading,
    error,
    fetchConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    switchActiveConnection,
    updateEvolutionStatus,
  };
}
