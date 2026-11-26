import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Trash2, RefreshCw, Copy, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/Button';

export const EvolutionStatus: React.FC = () => {
  const [connection, setConnection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchConnection();
  }, []);

  const fetchConnection = async () => {
    setLoading(true);
    try {
      const { data } = await (supabase
        .from('whatsapp_connections') as any)
        .select('*')
        .eq('provider', 'evolution')
        .maybeSingle();

      setConnection(data);
    } catch (err) {
      console.error('[EvolutionStatus] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterWebhook = async () => {
    if (!connection) {
      toast.error('Nenhuma conexão Evolution encontrada');
      return;
    }

    setRegistering(true);
    try {
      const { data, error } = await supabase.functions.invoke('register-evolution-webhook', {
        body: {
          evolutionServerUrl: connection.evolution_server_url,
          evolutionInstanceName: connection.evolution_instance_name,
          evolutionApiToken: connection.evolution_api_token,
        },
      });

      if (error) {
        toast.error('Erro ao registrar webhook: ' + error.message);
      } else {
        toast.success('Webhook registrado com sucesso!');
      }
    } catch (err) {
      toast.error('Erro: ' + (err instanceof Error ? err.message : 'Desconhecido'));
    } finally {
      setRegistering(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;

    if (!confirm('Desconectar Evolution? As mensagens inbound não serão mais recebidas.')) {
      return;
    }

    try {
      const { error } = await (supabase
        .from('whatsapp_connections') as any)
        .delete()
        .eq('id', connection.id);

      if (error) {
        toast.error('Erro ao desconectar: ' + error.message);
      } else {
        toast.success('Evolution desconectado');
        setConnection(null);
      }
    } catch (err) {
      toast.error('Erro: ' + (err instanceof Error ? err.message : 'Desconhecido'));
    }
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 text-center">
        <AlertCircle className="w-6 h-6 text-amber-400 mx-auto mb-3" />
        <p className="text-slate-400">Nenhuma conexão Evolution configurada</p>
        <p className="text-sm text-slate-500 mt-2">Configure no passo 2 do onboarding</p>
      </div>
    );
  }

  const isConnected = connection.evolution_connection_status === 'connected';

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className={`border rounded-lg p-6 ${
        isConnected
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-amber-500/30 bg-amber-500/5'
      }`}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-0.5">
            {isConnected ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-white mb-2">
              {isConnected ? '✅ Conectado' : '⚠️ Desconectado'}
            </h3>
            <div className="space-y-1 text-sm text-slate-400">
              <p>
                <span className="text-slate-300 font-medium">Instância:</span> {connection.evolution_instance_name}
              </p>
              <p>
                <span className="text-slate-300 font-medium">Servidor:</span> {connection.evolution_server_url}
              </p>
              {connection.evolution_authenticated_at && (
                <p>
                  <span className="text-slate-300 font-medium">Conectado em:</span>{' '}
                  {new Date(connection.evolution_authenticated_at).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-white">URL do Webhook</h4>
          <button
            onClick={copyWebhookUrl}
            className="p-2 hover:bg-slate-700/50 rounded transition-colors"
            title="Copiar URL"
          >
            {copied ? (
              <CheckCircle className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-slate-400 hover:text-slate-300" />
            )}
          </button>
        </div>
        <code className="block bg-slate-900/50 p-3 rounded text-xs text-slate-300 break-all border border-slate-700/30">
          {webhookUrl}
        </code>
        <p className="text-xs text-slate-500 mt-2">
          Configure esta URL no servidor Evolution para receber mensagens inbound
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-slate-800/50 border border-blue-500/20 rounded-lg p-6">
        <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-blue-400">ℹ️</span> Como configurar webhook manualmente
        </h4>
        <ol className="text-sm text-slate-400 space-y-2 ml-4 list-decimal">
          <li>Acesse as configurações da instância Evolution</li>
          <li>Localize "Webhook" ou "Webhook Settings"</li>
          <li>Cole a URL acima em "Webhook URL"</li>
          <li>Selecione eventos: <code className="text-xs bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">messages.upsert</code></li>
          <li>Salve e teste a conexão</li>
        </ol>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={handleRegisterWebhook}
          disabled={registering || !isConnected}
          className="flex-1 gap-2"
          variant="outline"
        >
          {registering ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Registrar Webhook
        </Button>
        <Button
          onClick={handleDisconnect}
          variant="destructive"
          size="sm"
          className="gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Desconectar
        </Button>
      </div>

      {/* Test Info */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
        <p className="text-sm text-slate-400">
          <span className="text-slate-300 font-medium">💡 Para testar:</span> Envie uma mensagem WhatsApp para o número conectado. Deve aparecer em Contatos em alguns segundos.
        </p>
      </div>
    </div>
  );
};
