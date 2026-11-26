/** Valida a OPENAI_API_KEY armazenada no Vault sem expor o valor. */
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/panel.ts";
import { getSecret } from "../_shared/secrets.ts";
import { getJwtUser } from "../_shared/userauth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  if (!(await getJwtUser(req))) return errorResponse("Auth obrigatória", 401);

  const key = await getSecret("OPENAI_API_KEY", { fresh: true });
  if (!key) return jsonResponse({ ok: false, error: "chave_nao_configurada" });

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    return jsonResponse({ ok: response.status !== 401, ...(response.status === 401 ? { error: "chave_invalida" } : {}) });
  } catch {
    return jsonResponse({ ok: false, error: "erro_rede" });
  }
});
