import React from 'react';
import { EvolutionStatus } from './EvolutionStatus';

export const ConnectionsBlock: React.FC = () => {
  return (
    <div className="border border-slate-700/50 rounded-lg p-6 bg-slate-900/40 backdrop-blur-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="text-2xl">🔗</span>
          Conexões WhatsApp
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          Gerencie suas integrações de WhatsApp (Evolution API ou API Oficial)
        </p>
      </div>

      <div className="space-y-4">
        <EvolutionStatus />
      </div>
    </div>
  );
};
