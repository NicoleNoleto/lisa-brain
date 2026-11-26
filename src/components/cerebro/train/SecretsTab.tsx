import React, { useEffect, useState } from 'react';
import { Loader2, KeyRound, Sparkles, AlertTriangle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSecretsStatus, SECRET_NAMES, type SecretName } from '@/hooks/useSecretsStatus';
import { validateAnthropicKey, validateOpenAIKey } from '@/services/cerebroService';
import WriteOnlySecretField from './WriteOnlySecretField';

const SECRET_META: Record<SecretName, { label: string; note: string }> = {
  PANEL_TOKEN: { label: 'Token do painel', note: 'Interno · automático' },
  NINA_TOOLS_SECRET: { label: 'Segredo das ferramentas', note: 'Interno · automático' },
  GITHUB_BRAIN_TOKEN: { label: 'PAT do GitHub', note: 'Configure na aba Repositório' },
  ANTHROPIC_API_KEY: { label: 'Chave Anthropic', note: 'Configure abaixo' },
  OPENAI_API_KEY: { label: 'Chave OpenAI', note: 'Configure abaixo' },
};

const TEXT = {
  statusTitle: 'Status das credenciais',
  anthropicLabel: 'Chave Anthropic (API key)',
  anthropicPlaceholder: 'sk-ant-… (salva no Vault, nunca exibida de volta)',
  anthropicHint: 'Usada quando a Nina roda no cérebro próprio. Enviada direto ao cofre seguro (Vault); nunca gravada no navegador nem no banco.',
  anthropicSaved: 'Chave Anthropic salva com segurança',
  anthropicError: 'Erro ao salvar a chave Anthropic. Tente novamente.',
  openaiSaved: 'Chave OpenAI salva com segurança',
  openaiError: 'Erro ao salvar a chave OpenAI. Tente novamente.',
  configured: 'Configurado',
  notConfigured: 'Pendente',
  providerHint: 'A Nina usará a chave do provedor ativo nas chamadas síncronas. A seleção é salva nas configurações da Nina.',
  heartbeatNote: 'Trocou a chave? A nova se propaga sozinha para a VPS em ~5 min via heartbeat — não precisa reinstalar.',
} as const;

const SecretsTab: React.FC = () => {
  const { status, loading, refetch, recordSaved } = useSecretsStatus();
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('nina_settings').select('id, ai_provider').limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.id) setSettingsId(data.id);
        if (data?.ai_provider === 'openai') setProvider('openai');
      });
  }, []);

  const handleProviderChange = async (next: 'anthropic' | 'openai') => {
    setProvider(next);
    if (!settingsId) {
      setProvider(provider);
      toast.error('Configurações da Nina não encontradas.');
      return;
    }
    const { error } = await supabase.from('nina_settings').update({ ai_provider: next, updated_at: new Date().toISOString() }).eq('id', settingsId);
    if (error) {
      setProvider(provider);
      toast.error('Não foi possível alterar o provedor ativo.');
    } else {
      toast.success(`Provedor ativo: ${next === 'openai' ? 'OpenAI' : 'Anthropic'}`);
    }
  };

  const handleSaveAnthropic = async (value: string): Promise<boolean> => {
    try {
      const { error } = await supabase.functions.invoke('save-secret', {
        body: { name: 'ANTHROPIC_API_KEY', value },
      });
      if (error) throw error;
      recordSaved('ANTHROPIC_API_KEY');
      await refetch();
      toast.success(TEXT.anthropicSaved);
      return true;
    } catch (err) {
      console.error('[SecretsTab] Erro ao salvar Anthropic:', err);
      toast.error(TEXT.anthropicError);
      return false;
    }
  };

  const handleSaveOpenAI = async (value: string): Promise<boolean> => {
    try {
      const { error } = await supabase.functions.invoke('save-secret', { body: { name: 'OPENAI_API_KEY', value } });
      if (error) throw error;
      recordSaved('OPENAI_API_KEY');
      await refetch();
      toast.success(TEXT.openaiSaved);
      return true;
    } catch (err) {
      console.error('[SecretsTab] Erro ao salvar OpenAI:', err);
      toast.error(TEXT.openaiError);
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-3">{TEXT.statusTitle}</h4>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          </div>
        ) : (
          <ul className="space-y-2">
            {SECRET_NAMES.map((name) => {
              const ok = status[name];
              const meta = SECRET_META[name];
              return (
                <li
                  key={name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="text-sm text-slate-200 truncate">{meta.label}</span>
                    <span className="text-[11px] text-slate-600 truncate hidden sm:inline">· {meta.note}</span>
                  </div>
                  <span className={`text-[11px] font-semibold flex-shrink-0 ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {ok ? TEXT.configured : TEXT.notConfigured}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-800 pt-5 space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
          {TEXT.providerHint}
        </div>
        <label className="block text-xs font-medium text-slate-400">
          Provedor ativo
          <select value={provider} onChange={(e) => handleProviderChange(e.target.value as 'anthropic' | 'openai')} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </label>
        <WriteOnlySecretField
          label={TEXT.anthropicLabel}
          placeholder={TEXT.anthropicPlaceholder}
          configured={status.ANTHROPIC_API_KEY}
          onSave={handleSaveAnthropic}
          onTest={validateAnthropicKey}
          icon={<KeyRound className="w-4 h-4" />}
          hint={
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              {TEXT.anthropicHint}
            </span>
          }
        />
        <WriteOnlySecretField
          label="Chave OpenAI (API key)"
          placeholder="sk-… (salva no Vault, nunca exibida de volta)"
          configured={status.OPENAI_API_KEY}
          onSave={handleSaveOpenAI}
          onTest={validateOpenAIKey}
          icon={<KeyRound className="w-4 h-4" />}
          hint="Usada quando OpenAI estiver selecionada como provedor ativo."
        />
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-px text-cyan-400" />
          {TEXT.heartbeatNote}
        </p>
      </div>
    </div>
  );
};

export default SecretsTab;
