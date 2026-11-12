// Delta · ⚡ Adaptar: manda o roteiro base para a Edge Function coach-ia e recebe 3 versões.
// Recortado do painel.js sem nenhuma mudança de lógica. Carrega ANTES do painel.js.
// Nada é enviado à Privacy: continua sendo copiar e colar.

// ---------- v2.2 · ⚡ Adaptar (Edge Function coach-ia) + memória do fã ----------
// Manda a conversa da tela, a ficha, as notas, as últimas compras e o roteiro base para a função coach-ia do SEU
// Supabase e recebe 3 versões adaptadas. Cada versão passa pelos alertas de termos e pelo revisor do motor: a que
// der faixa vermelha é descartada. Nada é enviado à Privacy; continua sendo copiar e colar.
const chaveIA = (res) => [salaK(), res.jogada.roteiro].join("|");
// versões da IA em uso para o roteiro atual desta conversa (ou null)
function iaAtiva(res) { return ia && res && res.roteiro && ia.chave === chaveIA(res) && Array.isArray(ia.versoes) && ia.versoes.length ? ia.versoes : null; }
function botaoAdaptar(res, base) {
  const meu = ia && ia.chave === chaveIA(res), ligado = !!iaAtiva(res);
  return el("button", { class: "btn mini nav adaptar" + (ligado ? " on" : ""), type: "button", disabled: !!(meu && ia.carregando), "aria-label": ligado ? "Voltar ao roteiro normal" : "Adaptar o roteiro a este fã com a IA", "aria-pressed": ligado ? "true" : "false",
    title: ligado ? "Versões da IA em uso. Clique para voltar ao roteiro normal." : "Adaptar este roteiro a este fã com a IA: 3 versões, já filtradas pelos alertas, entram no lugar das variantes.",
    onclick: () => { if (ligado) desligarIA(res); else adaptar(res, typeof base === "function" ? base() : base); } }, meu && ia.carregando ? "…" : "⚡");
}
// v2.3.4 · qual situação da biblioteca de exemplos (coach_exemplos.json) combina com a jogada de agora. Objeção e
// vulnerável não levam exemplo. Escolha fixa por conversa (a mesma sala recebe os mesmos), variando entre conversas.
function situacaoExemplo(res) {
  const f = res.fase.id, rot = res.jogada.roteiro || "";
  if (f === "vulneravel" || f === "objecao") return null;
  if (/^RE_/.test(rot) || f === "reengajamento" || res.selos.some((s) => s.id === "esfriou")) return "reabrir";
  if (f === "abertura" || f === "qualificacao" || f === "rapport") return "abertura";
  if (rot === "VD_PEDIU_PRECO") return "pediu";
  if (f === "hora_de_vender" || f === "pos_compra") {
    const pagou = Number(res.ctx && res.ctx.total) > 0 || Number(res.ctx && res.ctx.ultCompraValor) > 0;
    return res.selos.some((s) => s.id === "nunca") || !pagou ? "primeiro_ppv" : "recompra";
  }
  return null;
}
function exemplosPara(res) {
  const s = situacaoExemplo(res); if (!s || !EX || !Array.isArray(EX.exemplos)) return null;
  const lista = EX.exemplos.filter((e) => e.situacao === s); if (!lista.length) return null;
  const n = Math.min(lista.length, EX.por_pedido || 4);
  let h = 0; for (const ch of salaK()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ini = h % lista.length, sel = Array.from({ length: n }, (_, i) => lista[(ini + i) % lista.length]);
  return { situacao: s, descricao: (EX.situacoes || {})[s] || "", itens: sel.map((e) => ({ fa: e.fa || "", conta: e.conta || "", msg: e.msg })) };
}
// v2.3.10: lembranças antigas dele (coach_recall_fatos). Pega as palavras mais fortes das últimas falas dele, procura
// no que ele já escreveu antes e devolve só o que NÃO está na conversa que já vai para a IA. Sem a função no banco: [].
let recallDisp = true;
async function lembrancasPara(todas, idsUsados) {
  const cf = (R.ia && R.ia.recall) || {};
  if (!recallDisp || cf.ativo === false || !ficha || !ficha.fa || !ficha.fa.id) return [];
  const ign = new Set((cf.ignorar || []).map((x) => String(x).toLowerCase()));
  const vistas = new Set(), palavras = [];
  todas.filter((m) => m.de_fa).slice(-3).reverse().forEach((m) => {
    String(m.texto || "").toLowerCase().split(/[^a-zà-ú0-9]+/).forEach((w) => { if (w.length >= (cf.min_letras || 4) && !ign.has(w) && !vistas.has(w)) { vistas.add(w); palavras.push(w); } });
  });
  const alvo = palavras.sort((a, b) => b.length - a.length).slice(0, cf.max_palavras || 4);
  if (!alvo.length) return [];
  try {
    const rs = await Promise.all(alvo.map((w) => rpc("coach_recall_fatos", { p_fa: ficha.fa.id, p_busca: w, p_limite: 3 }).catch((e) => { if (faltaFuncao(e)) recallDisp = false; return []; })));
    const porMsg = new Map();
    rs.forEach((r) => (Array.isArray(r) ? r : []).forEach((x) => { if (x && x.msg_id && !idsUsados.has(x.msg_id) && x.texto) porMsg.set(x.msg_id, x); }));
    return [...porMsg.values()].sort((a, b) => Date.parse(b.em) - Date.parse(a.em)).slice(0, cf.max_itens || 5)
      .map((x) => ({ ha_min: x.em ? Math.max(0, Math.round((Date.now() - Date.parse(x.em)) / 60000)) : null, texto: String(x.texto).slice(0, cf.max_chars || 300) }));
  } catch (_) { return []; }
}
// v2.4.2 · IA no automático (ia.automatico no coach_regras.json): o Delta pede as versões sozinho, sem o ⚡.
// Freios, para não gastar à toa: uma vez só por roteiro de cada conversa, só quando a última mensagem é do fã
// (é a sua vez de responder), uma folga entre chamadas e um teto por hora. Desligar na mão (⚡, tecla A ou
// "voltar ao roteiro normal") vale até o roteiro mudar. Continua passivo: nada é enviado à Privacy.
const semAuto = new Set();   // chaves que você desligou na mão
const autoFeito = new Map(); // chave -> quando o automático já pediu
let autoUltimo = 0, autoHora = [];
// único jeito de voltar ao roteiro normal: marca para o automático não pedir de novo na mesma hora
function desligarIA(res) { if (res) semAuto.add(chaveIA(res)); ia = null; variante = 0; desenhar(); }
function autoAdaptar(res, base) {
  const cf = (R && R.ia && R.ia.automatico) || {};
  if (!cf.ativo || !est || !est.conv || !res || !res.roteiro || !res.jogada) return;
  const chave = chaveIA(res);
  if (semAuto.has(chave) || autoFeito.has(chave)) return;   // já desligado na mão ou já pedido
  if (ia && ia.chave === chave) return;                     // já tem versões, já falhou ou está carregando
  const ms = est.msgs || [], ult = ms[ms.length - 1];
  if (cf.so_na_sua_vez !== false && !(ult && ult.de_fa)) return; // você já respondeu: não gasta
  const agora = Date.now();
  if (agora - autoUltimo < (cf.folga_ms || 5000)) return;
  autoHora = autoHora.filter((t) => agora - t < 3600000);
  if (autoHora.length >= (cf.max_por_hora || 60)) return;
  autoFeito.set(chave, agora); autoUltimo = agora; autoHora.push(agora);
  setTimeout(() => adaptar(res, base), 0); // fora do desenho (desenhar() roda a cada segundo)
}
async function adaptar(res, base) {
  const chave = chaveIA(res), cfg = R.ia || {};
  if (ia && ia.chave === chave && ia.carregando) return;
  ia = { chave, carregando: true }; desenhar();
  // v2.3.3: junta o histórico SALVO desta conversa (coach_conversa) com o que está na tela; a tela vale por cima.
  // Assim a IA lê também o que a Privacy já não mostra. Sem nada salvo, é só a tela (como antes).
  const maxMsgs = cfg.max_msgs || 60, porId = new Map();
  (await conversaSalva(maxMsgs)).forEach((s) => { if (s && s.msg_id) porId.set(s.msg_id, { id: s.msg_id, de_fa: !!s.de_fa, em: s.em ? Date.parse(s.em) : null, tipo: s.tipo, texto: s.texto, salva: true }); });
  (est.msgs || []).forEach((m) => porId.set(m.id || "tela:" + porId.size, m));
  const todas = [...porId.values()].sort((a, b) => (a.em || 0) - (b.em || 0)).slice(-maxMsgs);
  const lembrancas = await lembrancasPara(todas, new Set(todas.map((m) => m.id).filter(Boolean)));
  if (!ia || ia.chave !== chave) return;
  const corpo = {
    conta: est.conta, modo: res.modo, fase: res.fase.id + (res.fase.tipo ? ":" + res.fase.tipo : ""), jogada: res.jogada.txt,
    roteiro: { id: res.jogada.roteiro, situacao: res.roteiro ? res.roteiro.situacao : "", base, nota: (res.roteiro && res.roteiro.nota) || "" },
    preco: { min: res.preco.min, max: res.preco.max, ultima: res.preco.ultima || null },
    fa: { nome: res.nome, total: res.ctx.total, selos: res.selos.map((s) => s.txt), perfil: res.perfil ? res.perfil.rotulo : null },
    notas: ficha ? [].concat(ficha.notas || [], ficha.tags || []).map((n) => n.texto).slice(0, 30) : [],
    compras: ficha && !ligacaoProvavel() && Array.isArray(ficha.ultimas) ? ficha.ultimas.slice(0, 10).map((c) => ({ data: c.data, valor: c.valor, tipo: c.tipo || null })) : [],
    // v2.3.2: a conversa vai com a hora de cada mensagem e o PPV marcado (preço, pago ou não), para a IA responder
    // ao que ele disse de fato e não só reescrever o roteiro
    msgs: todas.map((m) => ({ fa: !!m.de_fa, texto: String(m.texto || "").slice(0, cfg.max_chars_msg || 600),
      ha_min: m.em ? Math.max(0, Math.round((Date.now() - m.em) / 60000)) : null, ppv: m.ppv ? { preco: m.preco || null, pago: m.comprado === true ? true : m.comprado === false ? false : null } : null })),
    // o que o motor já sabe dele: jeito de escrever, dados das notas, por que está nesta fase
    estilo: res.espelho ? { palavras_por_msg: res.espelho.palavras, emojis: res.espelho.emojis, msgs_por_vez: res.espelho.por_vez, responde_em_s: res.espelho.resposta_s, dica: res.espelho.dica } : null,
    termometro: res.termometro ? res.termometro.n : null,
    dados: res.dados || null, fase_motivo: res.fase.motivo || "",
    usados: Array.isArray(historico) ? historico.slice(0, 8).map((h) => h.roteiro_id) : [],
    exemplos: exemplosPara(res),
    lembrancas
  };
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), cfg.timeout_ms || 12000);
  try {
    const t = await acesso();
    const r = await fetch(CFG.url + "/functions/v1/" + (cfg.funcao || "coach-ia"), { method: "POST", signal: ctl.signal, headers: { apikey: CFG.chave, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error((j && (j.erro || j.message || j.msg)) || "erro " + r.status), { status: r.status });
    if (!ia || ia.chave !== chave) return;
    // filtro do motor: descarta o que daria faixa vermelha; guarda os avisos do revisor para mostrar ao lado
    const Rm = M.aplicarModo(R, modo), c = M.contexto(contexto(), Rm);
    const versoes = (Array.isArray(j && j.versoes) ? j.versoes : []).map((v) => String(v || "").trim()).filter(Boolean).slice(0, 5).map((v) => {
      const al = M.alertas(v, c, Rm), rv = M.revisor(v, c, res.fase, Rm).filter((x) => x.id !== "copiado_igual");
      const bloq = al.filter((x) => x.nivel === "bloqueio_visual");
      // v2.5.0: guarda TAMBÉM o motivo do bloqueio, porque a versão não é mais descartada — ela aparece avisada
      return { texto: v, barrada: bloq.length > 0, motivos: bloq.map((x) => x.motivo),
        avisos: al.filter((x) => x.nivel !== "bloqueio_visual" && x.nivel !== "info").map((x) => x.motivo).concat(rv.map((x) => x.motivo)) };
    });
    const mem = j && j.memoria && typeof j.memoria === "object" ? Object.fromEntries(Object.entries(j.memoria).filter(([, v]) => v != null && String(v).trim()).map(([k, v]) => [k, String(v).trim().slice(0, 200)])) : {};
    // v2.5.0: nada é descartado calado. As 3 versões aparecem; a que bate num alerta vem marcada em
    // vermelho com o motivo, e quem decide é você. As limpas continuam vindo primeiro.
    const boas = versoes.slice().sort((x, y) => (x.barrada ? 1 : 0) - (y.barrada ? 1 : 0)).slice(0, 3);
    ia = { chave, versoes: boas, barradas: versoes.filter((v) => v.barrada).length, memoria: Object.keys(mem).length ? mem : null,
      leitura: j && j.leitura ? String(j.leitura).trim().slice(0, 240) : "", lidas: corpo.msgs.length, salvas: todas.filter((m) => m.salva).length };
    if (!boas.length) ia.erro = "A IA respondeu sem versões" + (j && j.erro ? " (" + j.erro + ")" : "") + ". Use o roteiro normal.";
    else variante = 0;
  } catch (e) {
    if (!ia || ia.chave !== chave) return;
    ia = { chave, erro: e.name === "AbortError" ? "A IA demorou demais. Tente de novo." : e.status === 404 ? "A IA ainda não está ligada: falta publicar a função coach-ia no Supabase." : e.status === 503 ? "A IA ainda não está ligada: falta a chave AI_API_KEY no Supabase." : "A IA não respondeu: " + e.message };
  }
  clearTimeout(tm); desenhar();
}
async function salvarMemoria() {
  if (!ia || !ia.memoria || !ficha || !ficha.fa || ia.salvando) return;
  ia.salvando = true; desenhar();
  try { await rpc("coach_memoria", { p_fa: ficha.fa.id, p_campos: ia.memoria }); ia.salvou = true; const k = fichaChave; if (k) abrirFicha(k); }
  catch (e) { ia.erroMem = faltaFuncao(e) ? "Rode o coach_sql.sql v2.2 no Supabase para salvar a memória." : "Não salvou: " + e.message; }
  ia.salvando = false; desenhar();
}
function blocoIA(res) {
  if (!ia || ia.chave !== chaveIA(res) || ia.carregando) return null;
  const b = el("div", { class: "ia" });
  if (ia.erro && !ia.memoria) return null; // o erro já aparece em cima do texto do roteiro
  const vAtual = ia.versoes && ia.versoes.length ? ia.versoes[variante % ia.versoes.length] : null;
  // o que a IA entendeu da conversa (para você ver se ela leu mesmo) e quantas mensagens da tela ela recebeu
  if (vAtual && ia.leitura) b.append(el("div", { class: "ia-leu" }, el("b", {}, "A IA leu: "), ia.leitura, el("small", { class: "fraco" }, " · " + (ia.lidas || 0) + " msgs" + (ia.salvas ? " (" + ia.salvas + " do histórico salvo, fora da tela)" : " da tela"))));
  if (vAtual) b.append(el("div", { class: "ia-t" }, "⚡ Versões da IA no lugar do roteiro · use ‹ › para trocar" + (ia.barradas ? " · " + ia.barradas + " com alerta" : "")));
  // v2.5.0: a versão que bateria num bloqueio aparece com o aviso em vermelho, em vez de sumir. Você decide.
  if (vAtual && vAtual.barrada) b.append(el("div", { class: "ia-bloq" }, el("b", {}, "Alerta: "), (vAtual.motivos && vAtual.motivos[0]) || vAtual.avisos[0] || "esta versão bate numa regra de risco.", el("small", {}, " Leia antes de copiar — o Delta não decide por você.")));
  else if (vAtual && vAtual.avisos.length) b.append(el("div", { class: "ia-a" }, "Revisor: " + vAtual.avisos[0]));
  if (ia.memoria) b.append(el("div", { class: "ia-m" }, el("span", {}, el("b", {}, "Memória do fã: "), Object.entries(ia.memoria).map(([k, v]) => k.replace(/_/g, " ") + ": " + v).join(" · ")),
    ia.salvou ? el("span", { class: "ok" }, "✓ salvo nas notas") : el("button", { class: "btn mini", type: "button", disabled: !!ia.salvando || !ficha || !ficha.fa, title: "Grava nas notas da ficha (as mesmas do Aura), uma nota por campo", onclick: salvarMemoria }, ia.salvando ? "Salvando…" : "Salvar nas notas"),
    ia.erroMem ? el("div", { class: "nota falhou" }, ia.erroMem) : null));
  b.append(el("button", { class: "link ia-f", type: "button", onclick: () => desligarIA(res) }, "voltar ao roteiro normal"));
  return b;
}
