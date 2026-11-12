// Delta · Edge Function "coach-ia" (botão ⚡ Adaptar + memória do fã).
// Publicada no projeto Central de Chat em 10/11/2026. Só responde depois que o secret AI_API_KEY for colocado no
// painel do Supabase: Edge Functions > Secrets. Aceita chave da Grok (xai-…, usa grok-4.20-0309-non-reasoning; reserva grok-4.7) ou da Anthropic (usa
// Claude Haiku). A chave fica só lá, nunca na extensão. A conversa do fã vai para o provedor da chave que você pôs.
// O que faz: recebe do painel do Delta a conversa que está na tela, a ficha, as notas, as últimas compras e o
// roteiro base; pede ao Claude Haiku 3 versões adaptadas + os dados do fã que aparecem na conversa; devolve JSON.
// Não grava nada, não guarda a conversa e não escreve o texto dela em log. Só quem passa em central.coach_pode() usa.
// Não fala com a Privacy. O painel ainda filtra as versões pelos alertas e pelo revisor antes de mostrar.
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

const CONTAS = ["arrudafree", "xlunavitaligratis", "louisefree"];
const MODELO = Deno.env.get("AI_MODEL") ?? "claude-haiku-5-5";
const corta = (v: unknown, n: number) => String(v ?? "").slice(0, n);

// Formato da resposta (saída estruturada: o modelo é obrigado a devolver este JSON).
const FORMATO = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["leitura", "versoes", "memoria"],
    properties: {
      leitura: { type: "string", description: "1 frase: o que ele disse por último e o que ele quer ou sente agora. Se a conversa não tem quase nada, dizer isso." },
      versoes: { type: "array", items: { type: "string" }, description: "Exatamente 3 versões da próxima mensagem da conta, cada uma respondendo ao que ele disse e usando um detalhe concreto dele." },
      memoria: {
        type: "object",
        additionalProperties: false,
        description: "Só o que o FÃ disse com clareza na conversa. Campo sem informação clara fica como string vazia.",
        required: ["nome", "trabalho", "horarios", "fetiches", "dia_pagamento", "recusas"],
        properties: {
          nome: { type: "string" },
          trabalho: { type: "string" },
          horarios: { type: "string" },
          fetiches: { type: "string" },
          dia_pagamento: { type: "string" },
          recusas: { type: "string" },
        },
      },
    },
  },
};

const SISTEMA = `Você ajuda um atendente humano de uma criadora de conteúdo adulto numa plataforma de assinatura (Privacy, Brasil). Ele vai LER e decidir se copia: você nunca envia nada.

PASSO 1 (LEITURA): leia a CONVERSA inteira (a mais recente está no fim; "há X min" mostra quando foi) e tudo o que se sabe dele. Em "leitura", escreva numa frase o que ele disse por último e o que ele quer ou sente agora (ex.: "Contou que chegou cansado da obra e pediu algo pra relaxar"). Se só existe a mensagem automática de boas-vindas ou quase nada, diga isso.

PASSO 2 (VERSÕES): escreva 3 versões da PRÓXIMA mensagem da conta.
- Cada versão RESPONDE ao que ele disse por último. Use pelo menos 1 detalhe concreto DELE (algo que falou na conversa, o trabalho, o time, o dia, o gosto, o horário, o nome) e, de preferência, um detalhe diferente em cada versão.
- O OBJETIVO vem da JOGADA (ex.: reabrir a conversa, vender o PPV, cobrar o PPV sem compra, descobrir o trabalho). O ROTEIRO BASE é só um exemplo de tom e de objetivo: não copie nem parafraseie o roteiro frase por frase.
- Espelhe o jeito dele (veja JEITO DELE): se ele escreve curto, seja curta; se usa gíria ou emoji, use parecido. 1 a 3 frases, português do Brasil informal, pronta para colar.
- Proibido frase que serviria para qualquer fã ("oi amor, tudo bem?", "tô pensando em você", "sumiu?"). Se a conversa não tem quase nada, use o nome ou o username dele e uma pergunta específica e fácil de responder.
- As 3 versões precisam ser diferentes entre si: outro ângulo, outro detalhe dele ou outra pergunta.
- Não repita uma mensagem que a CONTA já mandou nesta conversa.
- Se vierem EXEMPLOS REAIS QUE FUNCIONARAM (de outra conta, mesma situação), imite o JEITO deles: tamanho, ousadia, como respondem ao que o fã acabou de dizer, a pergunta ou o convite no fim. NUNCA copie frases, nomes nem o conteúdo que eles descrevem (esta conta pode não ter aquele conteúdo).

Regras que valem para todas as versões:
- Nunca prometa nem insinue encontro presencial, cidade, endereço ou agenda. É 100% online.
- Nunca leve a conversa para fora da plataforma (WhatsApp, Telegram, Instagram, telefone, e-mail, Pix por fora).
- Nunca ofereça desconto, promoção ou preço menor. Não escreva valores em R$: o preço fica com o atendente.
- Nunca invente urgência, emergência, doença, dívida ou culpa. Nada de pressão.
- Só afirme sobre a conta o que está no roteiro base, nas notas ou na conversa. Não invente conteúdo que a conta não tem. Se o roteiro base tem um campo entre chaves como {qtd_conteudo}, mantenha o campo igual, sem preencher.
- Se o fã demonstrar vulnerabilidade, falar em ser menor de idade ou pedir para parar de gastar, as versões não vendem: só acolhem.
- Não ofenda o fã, nada de dominação ou humilhação, e não use o nome real da criadora.

PASSO 3 (memória): extraia SOMENTE o que o próprio fã disse com clareza: primeiro nome, trabalho, horários em que costuma estar online ou livre, do que ele gosta (fetiches, de forma curta e neutra), dia de pagamento (ex.: "dia 5") e o que ele já recusou (ex.: "achou caro o de R$ 80"). Sem certeza, deixe vazio. Nunca registre dados de saúde, documento, endereço, sobrenome ou contato.`;

// Monta a resposta para o painel a partir do JSON que o modelo devolveu.
function resposta(textoJson: string, modelo: string): Response {
  const saida = JSON.parse(textoJson) as { leitura?: string; versoes: string[]; memoria: Record<string, string> };
  const versoes = (saida.versoes ?? []).map((v) => String(v).trim()).filter(Boolean).slice(0, 3);
  const memoria = Object.fromEntries(Object.entries(saida.memoria ?? {}).map(([k, v]) => [k, String(v ?? "").trim().slice(0, 200)]).filter(([, v]) => v));
  return json({ leitura: String(saida.leitura ?? "").trim().slice(0, 240), versoes, memoria, modelo });
}

// Grok (xAI): API de chat com saída estruturada (response_format json_schema).
// Modelo: o secret AI_MODEL, se existir; senão grok-4.20-0309-non-reasoning, que NÃO raciocina antes de responder
// (o grok-4.7 sempre raciocina: no teste real de 11/11/2026 levou 12 s com esforço "low" e passava de 20 s no padrão).
// Se a conta não tiver o modelo rápido (a xAI recusar o pedido), cai sozinho no grok-4.7 com esforço "low".
const GROK_RAPIDO = "grok-4.20-0309-non-reasoning", GROK_RESERVA = "grok-4.7";
async function viaGrok(chave: string, pedido: string): Promise<Response> {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 20_000);
  const esforco = Deno.env.get("AI_EFFORT") ?? "low";
  const pede = (modelo: string, comEsforco: boolean) => fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    signal: ctl.signal,
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: "system", content: SISTEMA }, { role: "user", content: pedido }],
      response_format: { type: "json_schema", json_schema: { name: "coach_ia", schema: FORMATO.schema, strict: true } },
      ...(comEsforco ? { reasoning_effort: esforco } : {}),
    }),
  });
  try {
    const t0 = Date.now();
    const escolhido = Deno.env.get("AI_MODEL");
    let modelo = escolhido ?? GROK_RAPIDO;
    let r = await pede(modelo, modelo === GROK_RESERVA);
    // modelo rápido indisponível para esta chave (ou nome recusado): volta ao grok-4.7 com esforço baixo
    if (!escolhido && [400, 403, 404, 422].includes(r.status)) {
      console.error("coach-ia: xAI recusou", modelo, r.status, "- usando", GROK_RESERVA);
      modelo = GROK_RESERVA; r = await pede(modelo, true);
    }
    // se a API não aceitar o campo de esforço, tenta uma vez sem ele
    if (modelo === GROK_RESERVA && (r.status === 400 || r.status === 422)) { console.error("coach-ia: xAI recusou reasoning_effort", r.status); r = await pede(modelo, false); }
    console.log("coach-ia:", modelo, "respondeu", r.status, "em", Date.now() - t0, "ms"); // só modelo, status e tempo; nunca o texto
    if (r.status === 401 || r.status === 403) return json({ erro: "a chave AI_API_KEY não foi aceita" }, 503);
    if (r.status === 429) return json({ erro: "muitos pedidos agora; tente em instantes" }, 429);
    if (!r.ok) { console.error("coach-ia: erro da API xAI", r.status); return json({ erro: "erro da IA (" + r.status + ")" }, 502); }
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content;
    if (typeof txt !== "string" || !txt.trim()) return json({ erro: "resposta vazia" }, 502);
    return resposta(txt, String(j?.model ?? "grok"));
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return json({ erro: "a IA não respondeu a tempo" }, 504);
    console.error("coach-ia: erro inesperado (xAI)", err instanceof Error ? err.name : "desconhecido");
    return json({ erro: "erro inesperado" }, 500);
  } finally {
    clearTimeout(tm);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  const chave = Deno.env.get("AI_API_KEY");
  if (!chave) return json({ erro: "falta o secret AI_API_KEY no Supabase" }, 503);

  // 1) Quem chama precisa estar logado E liberado no Delta (mesma regra das funções coach_*).
  const auth = req.headers.get("Authorization") ?? "";
  // chave pública do projeto: a do ambiente ou, se o projeto não a expõe com esse nome, a que o painel mandou no cabeçalho
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey");
  if (!auth.startsWith("Bearer ") || !url || !anon) return json({ erro: "sem login" }, 401);
  const pode = await fetch(`${url}/rest/v1/rpc/coach_placar`, {
    method: "POST",
    headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!pode.ok) return json({ erro: pode.status === 401 ? "sem login" : "sem permissão" }, pode.status === 401 ? 401 : 403);

  // 2) Entrada: só os campos esperados, com tamanho limitado. Nada é guardado.
  let e: Record<string, any>;
  try { e = await req.json(); } catch { return json({ erro: "corpo inválido" }, 400); }
  if (!e || !CONTAS.includes(e.conta)) return json({ erro: "conta fora do Delta" }, 400);
  const base = corta(e.roteiro?.base, 1200);
  if (!base.trim()) return json({ erro: "falta o roteiro base" }, 400);
  // v7: até 60 mensagens de até 600 caracteres, com "há X min" e o PPV marcado (antes 30 × 400, sem hora)
  const lista = (Array.isArray(e.msgs) ? e.msgs : []).slice(-60);
  const linha = (m: any) => {
    const quando = Number.isFinite(Number(m?.ha_min)) && m?.ha_min != null ? ` [há ${Number(m.ha_min) >= 1440 ? Math.round(Number(m.ha_min) / 1440) + " d" : Number(m.ha_min) >= 60 ? Math.round(Number(m.ha_min) / 60) + " h" : Number(m.ha_min) + " min"}]` : "";
    const ppv = m?.ppv ? ` [PPV${m.ppv.preco ? " R$ " + Number(m.ppv.preco) : ""}${m.ppv.pago === true ? ", ele comprou" : m.ppv.pago === false ? ", ainda não comprou" : ""}]` : "";
    return `${m?.fa ? "FÃ" : "CONTA"}${quando}${ppv}: ${corta(m?.texto, 600)}`;
  };
  const msgs = lista.map(linha).join("\n");
  const ultimasFa = lista.filter((m: any) => m?.fa).slice(-3).map((m: any) => "- " + corta(m?.texto, 600)).join("\n");
  // v9: lembranças antigas dele (coach_recall_fatos, buscadas pelo painel): coisas que ele disse e já saíram da conversa
  const lembrancas = (Array.isArray(e.lembrancas) ? e.lembrancas : []).slice(0, 5).map((m: any) => {
    const h = Number(m?.ha_min), q = Number.isFinite(h) && m?.ha_min != null ? ` [há ${h >= 1440 ? Math.round(h / 1440) + " d" : h >= 60 ? Math.round(h / 60) + " h" : h + " min"}]` : "";
    return `-${q} ${corta(m?.texto, 300)}`;
  }).join("\n");
  const notas = (Array.isArray(e.notas) ? e.notas : []).slice(0, 30).map((n: unknown) => "- " + corta(n, 200)).join("\n");
  const compras = (Array.isArray(e.compras) ? e.compras : []).slice(0, 10)
    .map((c: any) => `- ${corta(c?.data, 10)} · R$ ${Number(c?.valor) || 0}${c?.tipo ? " · " + corta(c.tipo, 30) : ""}`).join("\n");
  const est = e.estilo && typeof e.estilo === "object" ? e.estilo : null;
  const jeito = est ? `${Number(est.palavras_por_msg) || "?"} palavras por mensagem · ${Number(est.emojis) || 0} emoji · manda ${Number(est.msgs_por_vez) || 1} msg por vez` +
    (est.responde_em_s != null ? ` · responde em ~${Math.round(Number(est.responde_em_s) / 60)} min` : "") + (est.dica ? ` · ${corta(est.dica, 160)}` : "") : "";
  const dados = e.dados && typeof e.dados === "object" ? Object.entries(e.dados).filter(([, v]) => v).slice(0, 10).map(([k, v]) => `${corta(k, 30)}: ${corta(v, 80)}`).join(" · ") : "";
  const usados = Array.isArray(e.usados) && e.usados.length ? e.usados.slice(0, 8).map((x: unknown) => corta(x, 40)).join(", ") : "";
  // v8: exemplos reais que funcionaram (biblioteca coach_exemplos.json do painel), no máximo 6
  const ex = e.exemplos && typeof e.exemplos === "object" && Array.isArray(e.exemplos.itens) ? e.exemplos : null;
  const exemplos = ex ? ex.itens.slice(0, 6).map((x: any, i: number) =>
    `${i + 1}) ${x?.fa ? "Fã: \"" + corta(x.fa, 200) + "\" → " : ""}${x?.conta ? "Conta antes: \"" + corta(x.conta, 240) + "\" → " : ""}Conta: \"${corta(x?.msg, 320)}\"`).join("\n") : "";
  const pedido = [
    `MODO: ${e.modo === "dominante" ? "dominante (confiante, direto, nunca ofensivo)" : "normal (leve e simpático)"}`,
    `FASE: ${corta(e.fase, 60)}${e.fase_motivo ? " (" + corta(e.fase_motivo, 160) + ")" : ""} · JOGADA (o objetivo da mensagem): ${corta(e.jogada, 200)}`,
    `FÃ: ${corta(e.fa?.nome, 40) || "(sem nome)"} · total gasto R$ ${Number(e.fa?.total) || 0}` +
      (Array.isArray(e.fa?.selos) && e.fa.selos.length ? ` · selos: ${e.fa.selos.slice(0, 8).map((s: unknown) => corta(s, 40)).join(", ")}` : "") +
      (e.fa?.perfil ? ` · perfil: ${corta(e.fa.perfil, 30)}` : "") + (Number.isFinite(Number(e.termometro)) && e.termometro != null ? ` · termômetro ${Number(e.termometro)}/10` : ""),
    dados ? `DADOS DELE (das notas): ${dados}` : "",
    jeito ? `JEITO DELE ESCREVER: ${jeito}` : "",
    `O QUE ELE DISSE POR ÚLTIMO:\n${ultimasFa || "(nada dele na tela)"}`,
    `CONVERSA NA TELA (${lista.length} mensagens, a mais recente por último):\n${msgs || "(vazia)"}`,
    lembrancas ? `LEMBRANÇAS ANTIGAS DELE (coisas que ELE disse antes e já saíram da conversa; use só se encaixar de verdade, sem forçar nem citar a data):\n${lembrancas}` : "",
    `NOTAS DA FICHA:\n${notas || "(nenhuma)"}`,
    `ÚLTIMAS COMPRAS:\n${compras || "(nenhuma)"}`,
    usados ? `ROTEIROS JÁ USADOS COM ELE: ${usados}` : "",
    exemplos ? `EXEMPLOS REAIS QUE FUNCIONARAM (outra conta; situação: ${corta(ex.situacao, 30)}${ex.descricao ? " — " + corta(ex.descricao, 160) : ""}). Imite o jeito, não copie:\n${exemplos}` : "",
    `ROTEIRO BASE — exemplo de tom e objetivo, NÃO copiar (${corta(e.roteiro?.id, 40)} · ${corta(e.roteiro?.situacao, 200)}):\n${base}`,
    e.roteiro?.nota ? `NOTA DO ROTEIRO: ${corta(e.roteiro.nota, 300)}` : "",
  ].filter(Boolean).join("\n\n");

  // 3) Chave da Grok (começa com "xai-"): API da xAI. Qualquer outra: Claude Haiku pela SDK da Anthropic.
  if (chave.startsWith("xai-")) return await viaGrok(chave, pedido);
  // Claude Haiku, esforço baixo (resposta em ~2 s) e saída estruturada.
  const cliente = new Anthropic({ apiKey: chave, timeout: 20_000, maxRetries: 1 });
  try {
    const r = await cliente.messages.create({
      model: MODELO,
      max_tokens: 4000,
      system: SISTEMA,
      output_config: { effort: "low", format: FORMATO },
      messages: [{ role: "user", content: pedido }],
    });
    if (r.stop_reason === "refusal") return json({ erro: "a IA recusou este pedido", versoes: [], memoria: {} }, 200);
    if (r.stop_reason === "max_tokens") return json({ erro: "resposta cortada; tente de novo" }, 502);
    const texto = r.content.find((b) => b.type === "text");
    if (!texto || texto.type !== "text") return json({ erro: "resposta vazia" }, 502);
    return resposta(texto.text, r.model);
  } catch (err) {
    // Só o tipo do erro vai para o log; nunca o texto da conversa.
    if (err instanceof Anthropic.AuthenticationError) return json({ erro: "a chave AI_API_KEY não foi aceita" }, 503);
    if (err instanceof Anthropic.RateLimitError) return json({ erro: "muitos pedidos agora; tente em instantes" }, 429);
    if (err instanceof Anthropic.APIConnectionError) return json({ erro: "a IA não respondeu a tempo" }, 504);
    if (err instanceof Anthropic.APIError) { console.error("coach-ia: erro da API", err.status); return json({ erro: "erro da IA (" + err.status + ")" }, 502); }
    console.error("coach-ia: erro inesperado", err instanceof Error ? err.name : "desconhecido");
    return json({ erro: "erro inesperado" }, 500);
  }
});
