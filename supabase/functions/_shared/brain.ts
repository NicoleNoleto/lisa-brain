// Brain Provider (Fase 1)
// Centraliza a escolha de "onde a Nina pensa": Lovable AI (padrão) ou OpenClaw.
// Ambos os provedores expõem o MESMO contrato OpenAI-compatible:
//   POST {url}  (com sufixo /v1/chat/completions) + header Authorization: Bearer {apiKey}
//   body { model, messages, temperature, max_tokens, tools?, tool_choice? }
// Mantido propositalmente flexível: o caminho primário é /v1/chat/completions; o
// spike do Integrador pode refinar detalhes sem alterar este contrato.

// Endpoint do Anthropic API
export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export type BrainProvider = "openclaw" | "anthropic" | "openai";

export interface BrainConfig {
  provider: BrainProvider;
  url: string;
  apiKey: string;
  model: string;
}

export interface GetBrainConfigOptions {
  // Modelo escolhido dinamicamente para Anthropic
  anthropicModel?: string;
  // Chave resolvida pelo Vault; env continua sendo fallback de compatibilidade.
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

// Normaliza a URL do OpenClaw para o endpoint OpenAI-compatible.
// Aceita base ("https://host") ou já com o path; evita path duplicado.
function normalizeOpenClawUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/\/v1\/chat\/completions$/.test(trimmed)) return trimmed;
  if (/\/v1$/.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

// Indica se o provedor OpenClaw está minimamente configurado (url + token).
export function isOpenClawConfigured(settings: any): boolean {
  return Boolean(settings?.openclaw_gateway_url?.trim() && settings?.openclaw_gateway_token?.trim());
}

/**
 * Resolve a configuração do "cérebro" da Nina a partir de nina_settings.
 *
 * - provider 'openclaw': usa openclaw_gateway_url + openclaw_gateway_token + openclaw_model.
 * - provider 'anthropic' (padrão): usa ANTHROPIC_API_URL + ANTHROPIC_API_KEY.
 */
export function getBrainConfig(settings: any, opts: GetBrainConfigOptions = {}): BrainConfig {
  const provider: BrainProvider = settings?.brain_provider === "openclaw"
    ? "openclaw"
    : settings?.ai_provider === "openai" ? "openai" : "anthropic";

  if (provider === "openclaw" && isOpenClawConfigured(settings)) {
    return {
      provider: "openclaw",
      url: normalizeOpenClawUrl(settings.openclaw_gateway_url),
      apiKey: String(settings.openclaw_gateway_token).trim(),
      model: (settings.openclaw_model?.trim() || "openclaw"),
    };
  }

  if (provider === "openai") {
    return {
      provider: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: opts.openaiApiKey ?? Deno.env.get("OPENAI_API_KEY") ?? "",
      model: settings?.openai_model?.trim() || "gpt-4o-mini",
    };
  }

  // Padrão: Anthropic (Claude Haiku)
  return {
    provider: "anthropic",
    url: ANTHROPIC_API_URL,
    apiKey: opts.anthropicApiKey ?? Deno.env.get("ANTHROPIC_API_KEY") ?? "",
    model: opts.anthropicModel ?? "claude-haiku-4-5",
  };
}
