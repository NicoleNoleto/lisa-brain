import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Loader, Check, RefreshCw, QrCode as QrCodeIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/Button';

interface StepEvolutionAPIProps {
  serverUrl: string;
  instanceName: string;
  apiToken: string;
  qrCode: string;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'qr_pending';
  onServerUrlChange: (value: string) => void;
  onInstanceNameChange: (value: string) => void;
  onApiTokenChange: (value: string) => void;
  onQrCodeChange: (value: string) => void;
  onConnectionStatusChange: (status: 'disconnected' | 'connecting' | 'connected' | 'qr_pending') => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 }
  },
};

export const StepEvolutionAPI: React.FC<StepEvolutionAPIProps> = ({
  serverUrl,
  instanceName,
  apiToken,
  qrCode,
  connectionStatus,
  onServerUrlChange,
  onInstanceNameChange,
  onApiTokenChange,
  onQrCodeChange,
  onConnectionStatusChange,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQrSection, setShowQrSection] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrSectionRef = useRef<HTMLDivElement | null>(null);

  const isFormValid = serverUrl && instanceName && apiToken;

  // Auto-scroll to QR code when it appears
  useEffect(() => {
    if (qrCode && qrSectionRef.current) {
      setTimeout(() => {
        qrSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [qrCode]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Auto-advance when connected
  useEffect(() => {
    if (connectionStatus === 'connected' && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
  }, [connectionStatus]);

  const handleGenerateQr = async () => {
    setError(null);
    setIsLoading(true);
    setShowQrSection(true);

    try {
      // Call Evolution API to generate QR code
      const response = await fetch(
        `${serverUrl}/instance/connect/${instanceName}`,
        {
          method: 'GET',
          headers: {
            'apikey': apiToken, // Official Evolution API uses "apikey" header
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || 'Erro ao gerar QR code. Verifique suas credenciais.'
        );
      }

      const data = await response.json();

      if (data.base64) {
        onQrCodeChange(data.base64);
        onConnectionStatusChange('qr_pending');

        // Start polling to check connection status
        startPollingConnection();
      } else {
        throw new Error('QR Code não recebido do servidor');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      onConnectionStatusChange('disconnected');
    } finally {
      setIsLoading(false);
    }
  };

  const startPollingConnection = () => {
    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Poll every 2 seconds for maximum 2 minutes (120 polls)
    let pollCount = 0;
    const maxPolls = 120;

    pollingIntervalRef.current = setInterval(async () => {
      pollCount++;

      try {
        const response = await fetch(
          `${serverUrl}/instance/connectionState/${instanceName}`,
          {
            method: 'GET',
            headers: {
              'apikey': apiToken, // Official Evolution API uses "apikey" header
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) throw new Error('Erro ao verificar status');

        const data = await response.json();

        // Check both formats: Evolution API returns state: "open"
        if (data.instance?.state === 'open' || data.state === 'open') {
          onConnectionStatusChange('connected');
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
        } else if (pollCount >= maxPolls) {
          // Timeout: stop polling after 4 minutes
          setError('QR Code expirou. Clique em "Regenerar QR" para tentar novamente.');
          onConnectionStatusChange('qr_pending');
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
        }
      } catch (err) {
        if (pollCount >= maxPolls) {
          setError('Tempo limite para autenticação expirou.');
          onConnectionStatusChange('disconnected');
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
        }
      }
    }, 2000); // Poll every 2 seconds
  };

  const handleRegenerateQr = async () => {
    setQrCode('');
    setError(null);
    await handleGenerateQr();
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-2xl mx-auto space-y-6"
    >
      <motion.div variants={itemVariants} className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Configurar Evolution API</h2>
        <p className="text-muted-foreground">
          Preencha as informações do seu servidor Evolution API
        </p>
      </motion.div>

      {/* Configuration Form */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div>
          <Label htmlFor="serverUrl" className="text-sm font-medium">
            URL do Servidor <span className="text-red-500">*</span>
          </Label>
          <Input
            id="serverUrl"
            type="url"
            placeholder="https://api.evolution.local"
            value={serverUrl}
            onChange={(e) => onServerUrlChange(e.target.value)}
            className="mt-1"
            disabled={connectionStatus === 'connecting' || connectionStatus === 'qr_pending'}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Exemplo: https://api.evolution.local ou https://your-server.com
          </p>
        </div>

        <div>
          <Label htmlFor="instanceName" className="text-sm font-medium">
            Nome da Instância <span className="text-red-500">*</span>
          </Label>
          <Input
            id="instanceName"
            type="text"
            placeholder="meu-whatsapp"
            value={instanceName}
            onChange={(e) => onInstanceNameChange(e.target.value)}
            className="mt-1"
            disabled={connectionStatus === 'connecting' || connectionStatus === 'qr_pending'}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Nome único para esta instância no Evolution API
          </p>
        </div>

        <div>
          <Label htmlFor="apiToken" className="text-sm font-medium">
            Token da API <span className="text-red-500">*</span>
          </Label>
          <Input
            id="apiToken"
            type="password"
            placeholder="seu-token-aqui"
            value={apiToken}
            onChange={(e) => onApiTokenChange(e.target.value)}
            className="mt-1"
            disabled={connectionStatus === 'connecting' || connectionStatus === 'qr_pending'}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Token de autenticação do seu servidor Evolution
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex gap-2"
          >
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </motion.div>
        )}

        <Button
          onClick={handleGenerateQr}
          disabled={!isFormValid || isLoading || connectionStatus === 'qr_pending'}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              Gerando QR Code...
            </>
          ) : (
            <>
              <QrCodeIcon className="w-4 h-4 mr-2" />
              {connectionStatus === 'qr_pending' ? 'QR Code Gerado' : 'Conectar e Gerar QR'}
            </>
          )}
        </Button>
      </motion.div>

      {/* QR Code Display Section */}
      <AnimatePresence>
        {showQrSection && (
          <motion.div
            ref={qrSectionRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="border-t pt-6 space-y-4"
          >
            <div className="text-center">
              <h3 className="font-semibold text-lg mb-2">Escaneie o QR Code</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Use o WhatsApp no seu celular para escanear o código
              </p>
            </div>

            {/* QR Code Canvas */}
            {qrCode && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex justify-center"
              >
                <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-border">
                  <img
                    src={qrCode}
                    alt="QR Code para autenticação"
                    className="w-64 h-64"
                  />
                </div>
              </motion.div>
            )}

            {/* Status Indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 py-4"
            >
              {connectionStatus === 'qr_pending' && (
                <>
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                  <span className="text-sm text-muted-foreground">Aguardando escaneamento...</span>
                </>
              )}
              {connectionStatus === 'connecting' && (
                <>
                  <Loader className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm text-blue-600 dark:text-blue-400">Conectando...</span>
                </>
              )}
              {connectionStatus === 'connected' && (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                    Conectado com sucesso!
                  </span>
                </>
              )}
            </motion.div>

            {/* QR Expiry Note */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-900 dark:text-blue-300">
                O QR Code expira após <strong>2 minutos</strong>. Se não conseguir escanear, clique em "Regenerar QR".
              </p>
            </div>

            {/* Regenerate Button */}
            {connectionStatus !== 'connected' && (
              <Button
                onClick={handleRegenerateQr}
                variant="outline"
                className="w-full"
                disabled={isLoading}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerar QR
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {connectionStatus === 'connected' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
        >
          <p className="text-sm text-green-900 dark:text-green-300">
            ✓ Sua conta Evolution API foi conectada com sucesso! Clique em "Continuar" para prosseguir.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
};
