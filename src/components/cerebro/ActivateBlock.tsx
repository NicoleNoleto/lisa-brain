import React from 'react';
import { BrainCircuit, Server } from 'lucide-react';
import type { InstanceStatus } from '@/hooks/useInstance';

const TEXT = {
  title: 'Cérebro Ativo',
  subtitle: 'OpenClaw está configurado como cérebro de processamento.',
  openclaw: 'OpenClaw (sua VPS)',
  openclawDesc: 'Agente autônomo rodando na sua instância.',
} as const;

interface ActivateBlockProps {
  status: InstanceStatus;
}

const ActivateBlock: React.FC<ActivateBlockProps> = ({ status }) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex items-center gap-3 mb-1">
        <BrainCircuit className="w-5 h-5 text-cyan-400" />
        <h3 className="font-semibold text-white">{TEXT.title}</h3>
      </div>
      <p className="text-sm text-slate-400 mb-5">{TEXT.subtitle}</p>

      <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Server className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-white">{TEXT.openclaw}</span>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
            Ativo
          </span>
        </div>
        <p className="text-xs text-slate-500">{TEXT.openclawDesc}</p>
      </div>
    </div>
  );
};

export default ActivateBlock;
