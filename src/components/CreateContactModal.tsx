import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from './Button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface CreateContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContactCreated?: () => void;
}

/**
 * Modal para criar contatos manualmente (fallback).
 *
 * IMPORTANTE: Contatos são criados AUTOMATICAMENTE quando:
 * - Mensagens chegam via webhook Evolution (contacts.upsert, contacts.sync)
 * - Usuário envia mensagem para novo número
 *
 * Este modal é apenas para criar contatos manualmente quando necessário.
 */

export const CreateContactModal: React.FC<CreateContactModalProps> = ({
  isOpen,
  onClose,
  onContactCreated
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (!phone.trim()) {
      toast.error('Telefone é obrigatório');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          name: name.trim(),
          phone_number: phone.trim(),
          email: email.trim() || null,
          call_name: name.trim().split(' ')[0],
          user_id: null, // Single-tenant
          tags: [],
          is_business: false,
        })
        .select()
        .single();

      if (error) {
        console.error('[CreateContactModal] Error creating contact:', error);
        toast.error(`Erro ao criar contato: ${error.message}`);
        return;
      }

      console.log('[CreateContactModal] Contact created:', data.id);
      toast.success(`Contato "${name}" criado com sucesso!`);

      // Reset form
      setName('');
      setPhone('');
      setEmail('');

      // Callback
      onContactCreated?.();

      // Close modal
      onClose();
    } catch (err) {
      console.error('[CreateContactModal] Exception:', err);
      toast.error('Erro inesperado ao criar contato');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">Novo Contato</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Label htmlFor="name" className="text-sm font-medium text-slate-200">
              Nome <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="João Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="phone" className="text-sm font-medium text-slate-200">
              Telefone <span className="text-red-500">*</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="11999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">
              Apenas números, com código do país (ex: 55 + código de área + número)
            </p>
          </div>

          <div>
            <Label htmlFor="email" className="text-sm font-medium text-slate-200">
              Email (Opcional)
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="joao@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="mt-1"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Contato'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
