# Setup do Agente de SDR

## 1. Clone e Instale

```bash
git clone <seu-repositorio>
cd Agente\ de\ SDR
npm install
```

## 2. Configure o Banco de Dados

### Opção A: Supabase (Recomendado)

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **SQL Editor** → **New Query**
3. Copie todo o conteúdo de `dbx-schema.sql`
4. Cole e execute no SQL Editor

### Opção B: PostgreSQL Direto (Digital Ocean, etc)

```bash
psql -h seu-host -U seu-usuario -d seu-banco < dbx-schema.sql
```

## 3. Configure as Variáveis de Ambiente

Copie `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Edite `.env.local` com suas credenciais:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
```

**⚠️ IMPORTANTE**: Nunca commite `.env` ou `.env.local` no git!

## 4. Rodando Localmente

```bash
npm run dev
```

Acesse: http://localhost:5173

## 5. Deploy no Digital Ocean

### No seu Droplet:

1. **Clone o repositório:**
```bash
cd /app
git clone <seu-repositorio>
cd Agente\ de\ SDR
npm install
npm run build
```

2. **Configure variáveis de ambiente:**
```bash
export VITE_SUPABASE_URL=https://seu-projeto.supabase.co
export VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
```

Ou adicione em `/etc/environment`:
```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
```

3. **Configure nginx/pm2 para servir:**
```bash
npm install -g pm2
pm2 start "npm run dev" --name agente-sdr
pm2 startup
pm2 save
```

## 🔄 Multi-Client Setup

Para usar o mesmo código em múltiplos clientes:

1. **Cada cliente tem seu próprio Supabase/Banco de Dados**
2. **As variáveis de ambiente são diferentes por cliente**
3. **Mesmo código, diferentes dados**

Exemplo:
- **Cliente A** → `VITE_SUPABASE_URL=https://cliente-a.supabase.co`
- **Cliente B** → `VITE_SUPABASE_URL=https://cliente-b.supabase.co`

## 📋 Variáveis de Ambiente Disponíveis

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `VITE_SUPABASE_URL` | URL do seu projeto Supabase ou banco PostgreSQL | `https://abc123.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública de acesso | `sb_publishable_...` |

---

**Dúvidas?** Verifique os logs:
- Navegador: DevTools (F12) → Console
- Node: `npm run dev` mostra os erros
