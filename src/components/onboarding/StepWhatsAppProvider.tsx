import React from 'react';
import { MessageSquare, QrCode } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/Button';

interface StepWhatsAppProviderProps {
  selectedProvider: 'official' | 'evolution' | null;
  onProviderSelect: (provider: 'official' | 'evolution') => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
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

const cardVariants = {
  initial: { scale: 0.95, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  whileHover: { scale: 1.02 },
};

export const StepWhatsAppProvider: React.FC<StepWhatsAppProviderProps> = ({
  selectedProvider,
  onProviderSelect,
}) => {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-2xl mx-auto space-y-8"
    >
      <motion.div variants={itemVariants} className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Escolha sua forma de conexão</h2>
        <p className="text-muted-foreground">
          Selecione como você deseja conectar seu WhatsApp
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Official WhatsApp API Card */}
        <motion.div
          variants={cardVariants}
          initial="initial"
          animate="animate"
          whileHover="whileHover"
          onClick={() => onProviderSelect('official')}
          className={`p-6 border-2 rounded-xl cursor-pointer transition-all ${
            selectedProvider === 'official'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 bg-card'
          }`}
        >
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <MessageSquare className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">WhatsApp API Oficial</h3>
              <p className="text-sm text-muted-foreground">
                Conexão via Meta Business Account
              </p>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 text-left w-full">
              <li>✓ Estável e confiável</li>
              <li>✓ Suporte oficial Meta</li>
              <li>✓ Produção pronta</li>
            </ul>
            {selectedProvider === 'official' && (
              <div className="mt-4">
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  ✓ Selecionado
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Evolution API Card */}
        <motion.div
          variants={cardVariants}
          initial="initial"
          animate="animate"
          whileHover="whileHover"
          onClick={() => onProviderSelect('evolution')}
          className={`p-6 border-2 rounded-xl cursor-pointer transition-all ${
            selectedProvider === 'evolution'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 bg-card'
          }`}
        >
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <QrCode className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Evolution API</h3>
              <p className="text-sm text-muted-foreground">
                Conexão via QR Code
              </p>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 text-left w-full">
              <li>✓ Autenticação por QR Code</li>
              <li>✓ Setup rápido</li>
              <li>✓ Sem API Key</li>
            </ul>
            {selectedProvider === 'evolution' && (
              <div className="mt-4">
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  ✓ Selecionado
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {selectedProvider && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
        >
          <p className="text-sm text-blue-900 dark:text-blue-300">
            {selectedProvider === 'official'
              ? 'Você será direcionado para configurar suas credenciais da API oficial do WhatsApp Business.'
              : 'Você será direcionado para gerar um QR Code e conectar sua conta Evolution API.'}
          </p>
        </motion.div>
      )}

      <motion.div
        variants={itemVariants}
        className="flex gap-4 pt-4"
      >
        <Button
          disabled={!selectedProvider}
          className="flex-1"
        >
          Continuar
        </Button>
      </motion.div>
    </motion.div>
  );
};
