// Motor de regras do Coach. Funções puras: recebem o que foi lido e as regras (coach_regras.json)
// e devolvem fase, jogada, roteiro, preço, recursos, alertas e relógio. Não fala com ninguém.
(function (raiz) {
  "use strict";
  const MIN = 60000, HORA = 3600000, DIA = 86400000;

  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cacheRe = new Map();
  function reTermo(t) {
    if (cacheRe.has(t)) return cacheRe.get(t);
    const re = t.startsWith("re:") ? new RegExp(t.slice(3), "i") : new RegExp("(^|[^a-z0-9@])" + esc(norm(t)) + "(?=$|[^a-z0-9])");
    cacheRe.set(t, re); return re;
  }
  // devolve os termos da lista que aparecem no texto
  function casa(texto, lista) {
    const n = norm(texto), cru = String(texto || "");
    return (lista || []).filter((t) => (t.startsWith("re:") ? reTermo(t).test(cru) : reTermo(t).test(n)));
  }
  // ---------- v2.3.14 · compliance enquanto digita: Aho-Corasick em JS puro ----------
  // Uma varredura só no texto digitado acha TODOS os termos de risco de todos os grupos ao mesmo tempo, sem uma regex por
  // termo. Os grupos e os termos ficam em coach_regras.json > compliance_digitando (nada chumbado aqui). Só aviso: nunca bloqueia.
  function construirAC(termos) {
    const nos = [{ f: new Map(), fail: 0, out: [] }];
    for (const t of termos) {
      let n = 0;
      for (let k = 0; k < t.length; k++) { let nx = nos[n].f.get(t[k]); if (nx === undefined) { nx = nos.length; nos.push({ f: new Map(), fail: 0, out: [] }); nos[n].f.set(t[k], nx); } n = nx; }
      nos[n].out.push(t);
    }
    const fila = [...nos[0].f.values()];
    while (fila.length) {
      const u = fila.shift();
      for (const [ch, v] of nos[u].f) {
        let f = nos[u].fail; while (f && !nos[f].f.has(ch)) f = nos[f].fail;
        const alvo = nos[f].f.get(ch); nos[v].fail = alvo !== undefined && alvo !== v ? alvo : 0;
        nos[v].out = nos[v].out.concat(nos[nos[v].fail].out); fila.push(v);
      }
    }
    return nos;
  }
  // devolve os termos achados (só os que começam e terminam numa palavra inteira, como o resto dos alertas)
  function buscarAC(nos, texto) {
    const ach = new Set(), ehLetra = (c) => c !== undefined && /[a-z0-9@]/.test(c); let n = 0;
    for (let i = 0; i < texto.length; i++) {
      while (n && !nos[n].f.has(texto[i])) n = nos[n].fail;
      const nx = nos[n].f.get(texto[i]); n = nx === undefined ? 0 : nx;
      for (const t of nos[n].out) if (!ehLetra(texto[i - t.length]) && !ehLetra(texto[i + 1])) ach.add(t);
    }
    return [...ach];
  }
  const cacheAC = new WeakMap();
  function varrerRisco(texto, CD) {
    if (!CD || CD.ativo === false || !Array.isArray(CD.grupos) || !texto || !String(texto).trim()) return [];
    let pre = cacheAC.get(CD);
    if (!pre) {
      const porTermo = new Map();
      CD.grupos.forEach((g) => (g.termos || []).forEach((t) => { const k = norm(t); if (k) porTermo.set(k, (porTermo.get(k) || []).concat(g.id)); }));
      pre = { nos: construirAC([...porTermo.keys()]), porTermo }; cacheAC.set(CD, pre);
    }
    const todos = buscarAC(pre.nos, norm(texto)), out = [];
    const achados = todos.filter((t) => !todos.some((u) => u !== t && u.includes(t))); // "te garanto" já cobre "garanto": mostra só o maior
    for (const g of CD.grupos) { const hit = achados.filter((t) => (pre.porTermo.get(t) || []).includes(g.id)); if (hit.length) out.push({ id: g.id, nivel: g.nivel || "aviso", motivo: g.motivo || "", termos: hit }); }
    return out;
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  const arred90 = (v) => Math.max(14.9, Math.round(v - 0.9) + 0.9);
  // Modo Dominante: piso arredonda PRA CIMA (nunca abaixo da última compra) e teto PRA BAIXO (nunca acima do dobro)
  const arredCima = (v) => Math.max(14.9, Math.ceil(r2(v) - 0.9 - 1e-9) + 0.9);
  const arredBaixo = (v) => Math.max(14.9, Math.floor(r2(v) - 0.9 + 1e-9) + 0.9);
  function valoresReais(texto) {
    const out = []; const re = /R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi; let m;
    while ((m = re.exec(texto || ""))) {
      let s = m[1]; if (/\.\d{3}/.test(s)) s = s.replace(/\./g, ""); s = s.replace(",", ".");
      const v = Number(s); if (isFinite(v)) out.push(v);
    }
    return out;
  }
  const L = (R, k) => (R.limiares[k] && R.limiares[k].v !== undefined ? R.limiares[k].v : R.limiares[k]);
  // hora de Brasília (a base de compras é em horário de SP), independente do relógio do PC
  const FMT_SP = typeof Intl !== "undefined" ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : null;
  function horaSP(d) { if (!FMT_SP) return d.getHours() + d.getMinutes() / 60; const [h, m] = FMT_SP.format(d).split(":").map(Number); return h + m / 60; }
  function emNobre(d, R) {
    const h = horaSP(d), ini = parseInt(R.limiares.horario_nobre.inicio), fim = parseInt(R.limiares.horario_nobre.fim);
    return ini > fim ? h >= ini || h < fim : h >= ini && h < fim;
  }
  function emPico(d) { const h = horaSP(d); return h >= 22.5 && h < 23.5; }
  const dataMs = (x) => { if (!x) return null; const t = Date.parse(x); return isNaN(t) ? null : t; };

  // ---------- modo (normal | dominante) ----------
  // Devolve uma cópia das regras com os limiares/preço do modo por cima. As travas (vulnerável, ToS) não mudam.
  const cacheModo = new WeakMap();
  function nomeModo(R, modo) { const M = R.modos || {}; const m = modo || M.padrao || "normal"; return m === "dominante" && M.dominante ? "dominante" : "normal"; }
  function aplicarModo(R, modo) {
    const m = nomeModo(R, modo);
    if (m === "normal") return Object.assign({}, R, { _modo: "normal", _dom: null });
    let c = cacheModo.get(R); if (c) return c;
    const D = R.modos.dominante;
    c = Object.assign({}, R, { _modo: "dominante", _dom: D, limiares: Object.assign({}, R.limiares, D.limiares || {}) });
    cacheModo.set(R, c); return c;
  }
  const ehDom = (R) => R && R._modo === "dominante";

  // ---------- contexto ----------
  // ctx = { agora, conta, conv:{nome,perfil,total}, msgs:[{id,em,de_fa,texto,ppv,preco}], ppvs:[...]|null, ficha|null,
  //         compraTelaEm, config, texto (campo de mensagem), salaNova }
  function contexto(ctx, R) {
    const agora = ctx.agora || Date.now();
    const msgs = (ctx.msgs || []).map((m) => Object.assign({}, m, { t: typeof m.em === "number" ? m.em : Date.parse(m.em) })).sort((a, b) => a.t - b.t);
    const doFa = msgs.filter((m) => m.de_fa), daConta = msgs.filter((m) => !m.de_fa);
    // PPVs: banco (emp_ppvs) primeiro; senão o que o leitor achou na tela (palpite)
    let ppvs = null, fontePpv = "nenhuma";
    if (Array.isArray(ctx.ppvs) && ctx.ppvs.length) {
      ppvs = ctx.ppvs.map((p) => ({ id: p.msg_id, t: dataMs(p.enviado_em || p.criado_em || p.em), preco: Number(p.preco) || null, comprado: !!p.comprado, compradoEm: dataMs(p.comprado_em) })).filter((p) => p.t).sort((a, b) => a.t - b.t);
      fontePpv = "banco";
    } else {
      const tela = daConta.filter((m) => m.ppv);
      // comprado vem da tela quando a Privacy mostra "pago"/"não pago" no PPV (leitor.js); senão fica null (não sei).
      if (tela.length) { ppvs = tela.map((m) => ({ id: m.id, t: m.t, preco: m.preco || null, comprado: m.comprado === true ? true : m.comprado === false ? false : null, compradoEm: m.comprado === true && m.comprado_em ? m.comprado_em : null })); fontePpv = "tela"; }
    }
    const ultPpv = ppvs && ppvs.length ? ppvs[ppvs.length - 1] : null;
    const desde = ultPpv ? ultPpv.t : 0;
    const msgsFaDesdePpv = doFa.filter((m) => m.t > desde).length;
    const ultFa = doFa.length ? doFa[doFa.length - 1] : null, ultConta = daConta.length ? daConta[daConta.length - 1] : null;
    const ultima = msgs.length ? msgs[msgs.length - 1] : null;
    // mensagens do fã "vivas": depois da última da conta, ou dos últimos 30 min
    const vivas = doFa.filter((m) => (!ultConta || m.t > ultConta.t) || agora - m.t < 30 * MIN).slice(-2);
    const textoVivo = vivas.map((m) => m.texto).join(" \n ");
    const ult10 = doFa.slice(-10).map((m) => m.texto).join(" \n ");
    const P = R.palavras, sinais = {};
    for (const [k, lista] of Object.entries(P.sinais)) {
      const base = k === "vulnerabilidade" || k === "menor" ? ult10 : textoVivo;
      const c = casa(base, lista); if (c.length) sinais[k] = c;
    }
    const objecoes = {};
    for (const k of R.objecoes_ordem) { const c = casa(textoVivo, P.objecoes[k]); if (c.length) objecoes[k] = c; }

    // compras
    const f = ctx.ficha || null;
    // v2.3.6: ficha ligada ao comprador SÓ PELO NOME (painel_extra.provavel): as compras podem ser de outra pessoa.
    // Dinheiro e compras passam a vir só da tela; notas e dados dele continuam valendo.
    const soNome = !!ctx.ligacaoSoNome, fd = soNome ? null : f;
    const total = fd ? Number(fd.total) || 0 : (ctx.conv && ctx.conv.total) || 0;
    const ultimas = fd && Array.isArray(fd.ultimas) ? fd.ultimas.slice() : [];
    // ultCompraEm = quando foi a última compra (qualquer tipo). ultCompraValor = âncora do preço do próximo PPV:
    // só conta compra de conteúdo. Mimo (gorjeta) e videochamada NÃO servem de base (visto no real: um mimo de R$ 10
    // derrubava a sugestão para R$ 19,90 num fã que pagava R$ 98 no chat; 12,5% das compras da base são mimos).
    let ultCompraEm = null, ultCompraValor = null, ultValEm = null;
    const servePreco = (x) => !/mimo|gorjeta|chamada/i.test(String((x && x.tipo) || ""));
    if (ppvs) ppvs.filter((p) => p.comprado).forEach((p) => { const t = p.compradoEm || p.t; if (!ultCompraEm || t > ultCompraEm) ultCompraEm = t; if (p.preco > 0 && (ultValEm == null || t > ultValEm)) { ultValEm = t; ultCompraValor = p.preco; } });
    ultimas.forEach((x) => {
      const comHora = /T|\d{2}:\d{2}/.test(String(x.data)), t = comHora ? dataMs(x.data) : null, v = Number(x.valor) || 0;
      if (t && (!ultCompraEm || t > ultCompraEm)) ultCompraEm = t;
      const tv = dataMs(x.data);
      if (v > 0 && servePreco(x) && (ultValEm == null || (tv != null && tv > ultValEm))) { ultValEm = tv != null ? tv : 0; ultCompraValor = v; }
    });
    if (ctx.compraTelaEm && (!ultCompraEm || ctx.compraTelaEm > ultCompraEm)) ultCompraEm = ctx.compraTelaEm;
    // gasto nos 7 primeiros dias (só quando a ficha traz todas as compras)
    let gasto7 = null, primeiraCompraEm = null;
    if (fd && Number(fd.n) > 0 && ultimas.length >= Number(fd.n)) {
      const ts = ultimas.map((c) => ({ t: dataMs(c.data), v: Number(c.valor) || 0 })).filter((x) => x.t).sort((a, b) => a.t - b.t);
      if (ts.length) { gasto7 = ts.filter((x) => x.t - ts[0].t < 7 * DIA).reduce((s, x) => s + x.v, 0); primeiraCompraEm = ts[0].t; }
    }
    const porConta = fd && Array.isArray(fd.por_conta) ? fd.por_conta : [];
    const notasTxt = f ? [].concat(f.notas || [], f.tags || []).map((n) => n.texto).join(" \n ") : "";
    const tudoFa = doFa.map((m) => m.texto).join(" \n ");
    const qual = {};
    for (const [k, lista] of Object.entries(P.qualificacao_campos)) qual[k] = casa(notasTxt + " \n " + tudoFa, lista).length > 0;
    // v2.3.5: compra vista na tela (PPV pago, total que subiu) também conta. Visto no real em 11/11/2026: o fã acabava
    // de comprar e continuava "Nunca pagou" porque o banco (ficha) ainda não tinha a venda.
    const comprouVisto = ultCompraValor > 0 || !!ctx.compraTelaEm || !!(ppvs && ppvs.some((p) => p.comprado));
    // só pelo nome: a ficha não vale, mas o total que a PRÓPRIA Privacy mostra em "Detalhes" vale (ele já pagou)
    const nuncaPagou = fd ? total <= 0 && !(Number(fd.n) > 0) && !comprouVisto : soNome && (total > 0 || comprouVisto) ? false : null;
    const recusas = ppvs ? ppvs.filter((p) => p.comprado === false && agora - p.t > 5 * MIN).length : 0;
    // follow-ups já enviados depois do último PPV não comprado
    let fu = null;
    if (ultPpv && ultPpv.comprado !== true && agora - ultPpv.t < 3 * DIA) {
      const depois = daConta.filter((m) => m.t > ultPpv.t && !m.ppv);
      const respondeu = doFa.some((m) => m.t > ultPpv.t);
      const intervalos = L(R, "followup_intervalos_min");
      const n = depois.length + 1;
      if (n <= L(R, "followup_max")) {
        const ref = depois.length ? depois[depois.length - 1].t : ultPpv.t;
        const vence = ref + intervalos[Math.min(n - 1, intervalos.length - 1)] * MIN;
        fu = { n, vence, falta_s: Math.round((vence - agora) / 1000), respondeu, estadoConhecido: ultPpv.comprado !== null };
      }
    }
    // PPV abandonado: banco diz "não comprou", já passou o tempo e ele voltou a falar (só Modo Dominante usa)
    const abMin = L(R, "ppv_abandonado_min");
    const ppvAband = !!(abMin && ultPpv && ultPpv.comprado === false && doFa.some((m) => m.t > ultPpv.t) && agora - ultPpv.t >= abMin * MIN && agora - ultPpv.t < 3 * DIA);
    // mensagens da conta sem resposta desde a última msg dele (tentativas de reengajamento)
    const tentativas = daConta.filter((m) => !ultFa || m.t > ultFa.t).length;
    const contaAtual = ctx.conta || "";
    // compras com hora (banco de PPVs + ficha + total que subiu na tela) para sessão e aftercare
    const comprasT = [];
    if (ppvs) ppvs.filter((p) => p.comprado).forEach((p) => comprasT.push({ t: p.compradoEm || p.t, v: p.preco || 0 }));
    ultimas.forEach((x) => { if (/T|\d{2}:\d{2}/.test(String(x.data))) { const t = dataMs(x.data); if (t && !comprasT.some((y) => Math.abs(y.t - t) < 2 * MIN)) comprasT.push({ t, v: Number(x.valor) || 0 }); } });
    if (ctx.compraTelaEm && !comprasT.some((y) => Math.abs(y.t - ctx.compraTelaEm) < 10 * MIN)) comprasT.push({ t: ctx.compraTelaEm, v: 0 });
    comprasT.sort((a, b) => a.t - b.t);
    // sinais sutis de compra e sinais ruins (Vendas)
    const compraSutil = P.sinais.compra_sutil ? casa(textoVivo, P.sinais.compra_sutil) : [];
    const ult3 = doFa.slice(-3);
    const rajada = ult3.length === 3 && ult3[2].t - ult3[0].t <= 60000 && !daConta.some((m) => m.t > ult3[0].t && m.t < ult3[2].t);
    const nPal = (t) => norm(t).split(" ").filter(Boolean).length;
    // atraso = quanto ele demora pra responder a conta (só a 1ª msg dele depois de cada msg da conta)
    const atrasos = []; for (let i = 1; i < msgs.length; i++) if (msgs[i].de_fa && !msgs[i - 1].de_fa) atrasos.push((msgs[i].t - msgs[i - 1].t) / 1000);
    const atr = atrasos.slice(-4).filter((x) => x < 6 * 3600);
    const atrasoMed = atr.length ? atr.reduce((a, b) => a + b, 0) / atr.length : null;
    const ruim = ult3.length >= 3 && ult3.every((m) => nPal(m.texto) <= 2) && atr.length >= 2 && atrasoMed > 180;
    const longo = ult3.length >= 2 && ult3.reduce((a, m) => a + nPal(m.texto), 0) / ult3.length >= 12;
    const compraNestaConta = porConta.some((x) => x.conta === contaAtual && Number(x.gasto) > 0);
    // v2.2 · palavra-chave do post fixado (config da conta) na última mensagem dele, ainda sem resposta nossa
    const cfg0 = ctx.config || {}, pfix = (Array.isArray(cfg0.palavra_fixado) ? cfg0.palavra_fixado : []).filter((x) => x && String(x).trim());
    const fixado = pfix.length && ultFa && (!ultConta || ultFa.t > ultConta.t) ? casa(ultFa.texto, pfix) : [];
    // v2.2 · fã novo que só recebeu a boas-vindas automática: nenhuma mensagem nossa cita o nome/username dele
    const nomeN = norm(((ctx.conv && ctx.conv.nome) || "").split(/\s+/)[0]), perfN = norm((ctx.conv && ctx.conv.perfil) || "");
    const citou = daConta.some((m) => { const t = norm(m.texto); return (nomeN.length >= 3 && t.includes(nomeN)) || (perfN.length >= 3 && t.includes(perfN)); });
    const soBoasVindas = daConta.length >= 1 && daConta.length <= 2 && doFa.length <= 1 && !citou && !(total > 0) && agora - daConta[0].t < 7 * DIA && !daConta.some((m) => m.ppv && m.comprado === true);
    return {
      fixado, soBoasVindas, cenaFixa: !!ctx.cenaFixa, convVar: Array.isArray(ctx.convVar) ? ctx.convVar : null,
      primeiraCompraEm, ppvAband, tentativas, compraNestaConta, modo: R._modo || "normal",
      comprasT, compraSutil, rajada, ruim, longo, atrasoMed, perfilManual: ctx.perfil || null, cenaId: ctx.cena || null, cenaAjuste: Number(ctx.cenaAjuste) || 0, copiado: ctx.copiado || "", hist: ctx.historico || null,
      agora, msgs, doFa, daConta, ppvs, fontePpv, ultPpv, msgsFaDesdePpv, ultFa, ultConta, ultima, sinais, objecoes,
      total, ultCompraEm, ultCompraValor, gasto7, porConta, qual, nuncaPagou, recusas, fu, ficha: f, soNome, notasTxt, padrao: typeof ctx.padrao === "string" ? ctx.padrao : null, roteiroOferta: typeof ctx.roteiroOferta === "string" ? ctx.roteiroOferta : null, momentoStats: Array.isArray(ctx.momentoStats) ? ctx.momentoStats : null,
      gapFa_s: ultFa ? Math.round((agora - ultFa.t) / 1000) : null,
      ultimaEhFa: !!(ultima && ultima.de_fa), msgsFaTotal: doFa.length, salaSemConta: daConta.length === 0,
      cfg: ctx.config || {}, nome: ((ctx.conv && ctx.conv.nome) || (f && f.fa && f.fa.nome) || "").split(/\s+/)[0] || ""
    };
  }

  // ---------- selos ----------
  function selos(c, R) {
    const s = [];
    if (c.gasto7 != null && c.gasto7 >= L(R, "vip_7d_brl")) s.push({ id: "vip", txt: "VIP", origem: "BASE", dica: "R$500+ nos 7 primeiros dias: 59,4% chegam a R$1.000" });
    else if (c.total >= 1000) s.push({ id: "vip", txt: "VIP", origem: "BASE", dica: "já passou de R$1.000 na empresa" });
    else if (c.gasto7 != null && c.gasto7 >= L(R, "potencial_7d_brl")) s.push({ id: "potencial", txt: "Potencial", origem: "BASE", dica: "R$200+ nos 7 primeiros dias: 24,7% chegam a R$1.000" });
    if (c.porConta.length >= 2) s.push({ id: "multi", txt: "Compra em outras contas", origem: "BASE", dica: "quem compra em 2+ contas: mediana R$229 x R$50" });
    if (c.nuncaPagou) s.push({ id: "nunca", txt: c.recusas >= L(R, "nunca_pagou_recusas_parar") ? "Nunca pagou · 2 recusas" : "Nunca pagou", origem: "OF" });
    if (c.ultPpv && c.ultPpv.comprado !== true && c.fu) s.push({ id: "ppv", txt: "PPV pendente", origem: c.fontePpv === "banco" ? "PRIVACY" : "HIPOTESE" });
    const esfriou = c.gapFa_s != null && c.gapFa_s > L(R, "esfriou_s") && c.gapFa_s < 7 * 86400;
    if (esfriou) s.push({ id: "esfriou", txt: "Esfriou", origem: "OF", dica: Math.round(L(R, "esfriou_s") / 60) + " min sem resposta: não mande PPV frio" });
    const tr = tier(c, R);
    if (tr && tr.id === "baleia") s.unshift({ id: "baleia", txt: "BALEIA", origem: tr.origem, dica: tr.doc || "" });
    return s;
  }
  const tem = (s, id) => s.some((x) => x.id === id);
  // ---------- tier do fã (Modo Dominante) ----------
  function tier(c, R) {
    const T = R._dom && R._dom.preco && R._dom.preco.tiers; if (!T) return null;
    const multi = c.porConta.length >= 2;
    for (const t of T) {
      if (t.id === "novo") return t;
      const ok = (t.total_min != null && c.total >= t.total_min) || (t.gasto7_min != null && c.gasto7 != null && c.gasto7 >= t.gasto7_min) || (t.multi_conta && multi);
      if (ok) return t;
    }
    return null;
  }
  // ---------- meta dos 7 primeiros dias (R$500 → 59,4% chegam a R$1.000, BASE) ----------
  function meta7(c, R) {
    if (!c.primeiraCompraEm || c.gasto7 == null) return null;
    const meta = (R._dom && R._dom.preco.meta_7d_brl && R._dom.preco.meta_7d_brl.v) || L(R, "vip_7d_brl");
    const fim = c.primeiraCompraEm + 7 * DIA, ativo = c.agora < fim;
    return { dia: Math.min(7, Math.floor((c.agora - c.primeiraCompraEm) / DIA) + 1), meta, gasto: r2(c.gasto7), falta: r2(Math.max(0, meta - c.gasto7)), batida: c.gasto7 >= meta, ativo, dias_restantes: ativo ? Math.ceil((fim - c.agora) / DIA) : 0, pct: Math.min(1, c.gasto7 / meta) };
  }

  // ---------- fase ----------
  function fase(c, R, sl) {
    const ativo = c.gapFa_s != null && c.gapFa_s <= L(R, "fa_ativo_s");
    if (c.sinais.vulnerabilidade || c.sinais.menor) return { id: "vulneravel", motivo: "sinal de " + (c.sinais.menor ? "menor de idade" : "vulnerabilidade") + ": “" + (c.sinais.menor || c.sinais.vulnerabilidade)[0] + "”" };
    // v2.2 · palavra do post fixado: prioridade máxima (só perde para a trava de vulnerável/menor)
    if (c.fixado.length) return { id: "hora_de_vender", fixado: c.fixado[0], motivo: "palavra do post fixado: “" + c.fixado[0] + "”" };
    // v2.2 · freio de gasto ("vai me deixar pobre") de quem já comprou: trava a subida e protege o fã
    if (c.sinais.freio_gasto && (c.total > 0 || (c.ultCompraEm && c.agora - c.ultCompraEm <= 6 * HORA))) return { id: "objecao", tipo: "freio_gasto", motivo: "ele pediu freio: “" + c.sinais.freio_gasto[0] + "”" };
    for (const k of R.objecoes_ordem) if (c.objecoes[k]) return { id: "objecao", tipo: k, motivo: "ele disse “" + c.objecoes[k][0] + "”" };
    if (ehDom(R)) {
      const ses = sessao(c, R);
      if (ses && ses.completa && ses.passo !== "fora") {
        if (ses.passo === "descanso" && !c.sinais.compra) return { id: "descanso", motivo: "sessão de " + brl(ses.valor) + " (" + ses.n + " compras) fechada: só conversa até " + fmtHora(ses.descansoAte) };
        if (ses.passo !== "descanso") return { id: "pos_compra", aftercare: ses.passo, motivo: "sessão completa (" + ses.n + " compras, " + brl(ses.valor) + "): " + ses.passo.replace("_", " ") };
      }
    }
    const sm = sumiuMeio(c, R);
    if (sm) return { id: "reengajamento", sumiuMeio: true, motivo: "sumiu no meio da " + (sm.cena ? "cena" : "sessão") + ": " + fmtSeg(sm.s) + " sem responder" };
    if (c.ultCompraEm && c.agora - c.ultCompraEm <= L(R, "pos_compra_janela_min") * MIN) return { id: "pos_compra", motivo: "comprou há " + Math.max(1, Math.round((c.agora - c.ultCompraEm) / MIN)) + " min" };
    if (c.fu && !c.fu.respondeu) return { id: "hora_de_vender", motivo: "PPV sem compra: follow-up " + c.fu.n + "/" + L(R, "followup_max") };
    if (ehDom(R) && c.ppvAband) return { id: "hora_de_vender", abandonado: true, motivo: "PPV" + (c.ultPpv.preco ? " de " + brl(c.ultPpv.preco) : "") + " sem compra há " + fmtSeg((c.agora - c.ultPpv.t) / 1000) + " e ele voltou" };
    const n = c.msgsFaDesdePpv;
    if (ehDom(R) && c.ruim && !c.sinais.compra && !c.compraSutil.length) return { id: "rapport", ruim: true, motivo: "sinal ruim: respostas de 1–2 palavras e lentas (" + Math.round(c.atrasoMed / 60) + " min)" };
    if (ehDom(R) && ativo && ((c.compraSutil.length && n >= 2) || (c.rajada && n >= 3))) return { id: "hora_de_vender", motivo: c.compraSutil.length ? "sinal sutil: “" + c.compraSutil[0] + "”" : "3 msgs dele em menos de 1 min" };
    // 1º PPV da conversa com quem nunca comprou pede mais conversa antes (BASE momoi: 75% dos primeiros PPVs vendidos
    // saíram depois de 11+ mensagens do fã). Se ele pedir, vende na hora.
    const primeiro = !c.ultPpv && !(c.total > 0) && L(R, "primeiro_ppv_min_msgs_fa");
    const minA = primeiro ? Math.max(L(R, "aquecimento_min_msgs_fa"), primeiro) : L(R, "aquecimento_min_msgs_fa");
    const maxA = primeiro ? Math.max(L(R, "aquecimento_max_msgs_fa"), L(R, "primeiro_ppv_max_msgs_fa") || 0) : L(R, "aquecimento_max_msgs_fa");
    if ((n >= minA && ativo) || c.sinais.compra || n > maxA)
      return { id: "hora_de_vender", motivo: c.sinais.compra ? "ele pediu: “" + c.sinais.compra[0] + "”" : n + " msgs dele desde o último PPV" + (ativo ? ", ativo há " + c.gapFa_s + " s" : "") };
    if (c.gapFa_s != null && c.gapFa_s >= L(R, "quieto_dias") * 86400 && !c.ultimaEhFa) return { id: "reengajamento", motivo: "sem responder há " + Math.floor(c.gapFa_s / 86400) + " dias" };
    if (tem(sl, "vip") && c.ultCompraEm && c.agora - c.ultCompraEm >= L(R, "whale_sumido_observar_h") * HORA && !c.ultimaEhFa && c.gapFa_s != null && c.gapFa_s > L(R, "whale_sumido_observar_h") * 3600) return { id: "reengajamento", motivo: "VIP sumido" };
    if (c.msgsFaTotal <= L(R, "abertura_ate_msgs_fa") && !(c.total > 0)) return { id: "abertura", motivo: c.msgsFaTotal + " msg(s) dele na conversa" };
    const faltam = Object.entries(c.qual).filter(([, v]) => !v).map(([k]) => k);
    if (n <= L(R, "qualificacao_ate_msgs_fa") && faltam.length) return { id: "qualificacao", faltam, motivo: "falta saber: " + faltam.join(", ") };
    return { id: "rapport", motivo: n + " msgs dele desde o último PPV" };
  }

  // v2.2 · fã sumido no meio da sessão de compras (ou da cena fixada): a última mensagem é nossa, ele não responde há
  // sumiu_meio_s (5 min) e não há PPV pendente. Depois de sumiu_meio_max_s (1 h) voltam as regras normais.
  function sumiuMeio(c, R) {
    const lim = L(R, "sumiu_meio_s"); if (!lim || c.ultimaEhFa || !c.ultConta || !c.ultFa) return null;
    if (c.ultPpv && c.ultPpv.comprado !== true && c.ultPpv.t > c.ultFa.t) return null; // PPV pendente: quem cuida é o follow-up
    const s = (c.agora - c.ultConta.t) / 1000; if (s < lim || s > (L(R, "sumiu_meio_max_s") || 3600)) return null;
    const ses = sessao(c, R), ativa = !!(ses && !ses.completa && c.agora - ses.fim <= (R.sessao ? R.sessao.gap_min : 90) * MIN);
    if (!ativa && !c.cenaFixa) return null;
    return { s, cena: !ativa };
  }
  // ---------- preço ----------
  // v2.2: por cima da faixa calculada entram o freio de gasto (segura o preço) e o piso por mídia da conta.
  function preco(c, R, sl, fz) {
    const out = ehDom(R) ? precoDom(c, R, sl, fz) : precoNormal(c, R, sl, fz), tx = L(R, "taxa_privacy");
    if (fz && fz.tipo === "freio_gasto") {
      if (out.ultima > 0) { out.min = r2(out.ultima); out.max = out.min; } else out.max = out.min;
      out.freio = true; out.nota = "FREIO: ele disse que gastou demais. Segura o preço, não sobe degrau e não manda PPV novo nesta sessão.";
    }
    const piso = Number(c.cfg && c.cfg.piso_midia_brl) || 0;
    if (piso > 0) {
      out.piso = piso;
      if (out.min < piso) { out.min = piso; if (out.max < piso) out.max = piso; out.nota += " Piso por mídia desta conta: " + brl(piso) + "."; }
    }
    out.pix = out.max > R.preco.pix.acima_brl;
    out.liquido = [r2(out.min * (1 - tx)), r2(out.max * (1 - tx))];
    return out;
  }
  function precoDom(c, R, sl, fz) {
    const P = R.preco, D = R._dom.preco, d = D.degrau, out = { origem: [], nota: "" };
    const ult = c.ultCompraValor, tr = tier(c, R) || {};
    const emSeq = c.ultCompraEm && c.agora - c.ultCompraEm <= 6 * HORA;
    const hesitou = c.objecoes.caro || (fz && (fz.tipo === "caro" || fz.tipo === "freio_gasto"));
    const teto = ult > 0 ? ult * d.max_multiplicador : Infinity;
    if (c.nuncaPagou !== false && !(ult > 0)) {
      const fx = P.entrada_nunca_pagou.entrada_override || (c.cfg && c.cfg.entrada_brl) || D.entrada_nunca_pagou.faixa;
      out.min = fx[0]; out.max = fx[1]; out.tipo = "entrada"; out.origem.push("BASE"); out.nota = "1º PPV: entrada calibrada pela base desta conta (abaixo de R$15 só 40% voltam). Teste A/B.";
    } else if (ult > 0 && emSeq) {
      out.tipo = "sequencia"; out.origem.push("CONSENSO", "BASE");
      if (hesitou) { out.min = ult; out.max = ult; out.nota = "Hesitou: MANTÉM o preço. Nunca desconto. Item menor só se for outro item."; }
      else {
        const alta = (tr.pula_degrau ? d.vip_pct : d.padrao_pct) / 100;
        out.min = ult * (1 + d.min_pct / 100); out.max = Math.min(teto, ult * (1 + alta));
        out.nota = tr.pula_degrau ? tr.rotulo + " sem hesitar: pula degrau (até 2x = " + brl(teto) + ")." : "Degrau dominante: +" + d.min_pct + "% a +" + d.padrao_pct + "%. Nunca mais que o dobro.";
      }
    } else if (ult > 0) {
      const piso = tr.piso_oferta || P.pagante_oferta_min_brl.v;
      out.min = Math.max(ult, Math.min(piso, teto)); out.max = Math.min(teto, Math.max(out.min, ult * (1 + d.padrao_pct / 100)));
      out.tipo = "pagante"; out.origem.push("OF", tr.origem || "OF"); out.nota = (tr.rotulo || "Pagante") + ": oferta a partir de " + brl(Math.min(piso, teto)) + ", nunca abaixo da última (" + brl(ult) + ") nem acima do dobro.";
    } else if (c.total > 0) {
      // v2.3.6: já pagou (total conhecido, ex.: o que a Privacy mostra em "Detalhes"), mas a última compra não foi lida:
      // oferta de pagante em vez de cair na entrada de quem nunca pagou
      const piso = tr.piso_oferta || P.pagante_oferta_min_brl.v;
      out.min = piso; out.max = piso * (1 + d.padrao_pct / 100);
      out.tipo = "pagante"; out.origem.push("BASE"); out.nota = "Já pagou " + brl(c.total) + ", mas a última compra não foi lida: oferta de " + (tr.rotulo || "pagante") + " a partir de " + brl(piso) + ".";
    } else { const fx = (c.cfg && c.cfg.entrada_brl) || D.entrada_nunca_pagou.faixa; out.min = fx[0]; out.max = fx[1]; out.tipo = "sem_dado"; out.origem.push("HIPOTESE"); out.nota = "Sem histórico de compra lido: entrada dominante."; }
    // piso = última compra (arredonda pra cima); teto = dobro (arredonda pra baixo)
    out.min = arredCima(out.min); out.max = arredBaixo(out.max);
    if (ult > 0 && out.min < ult) out.min = arredCima(ult);
    if (out.max < out.min) out.max = out.min;
    if (ult > 0 && out.min > teto) { const t = arredBaixo(teto); out.min = t >= ult ? t : r2(ult); }
    if (out.max < out.min) out.max = out.min;
    if (ult > 0 && out.max > teto) out.max = Math.max(out.min, arredBaixo(teto));
    if (out.max > P.teto_chat_brl.v) out.nota += " Teto do chat Privacy: " + brl(P.teto_chat_brl.v) + " (acima disso, chamada/custom aprovados).";
    out.max = Math.min(out.max, P.teto_chat_brl.v); out.min = Math.min(out.min, out.max);
    out.ultima = ult || null; out.tier = tr.id || null;
    out.pix = out.max > P.pix.acima_brl;
    out.liquido = [r2(out.min * (1 - L(R, "taxa_privacy"))), r2(out.max * (1 - L(R, "taxa_privacy")))];
    return out;
  }
  function precoNormal(c, R, sl, fz) {
    const P = R.preco, d = P.degrau, out = { origem: [], nota: "" };
    const ult = c.ultCompraValor;
    const emSeq = c.ultCompraEm && c.agora - c.ultCompraEm <= 6 * HORA;
    const hesitou = c.objecoes.caro || (fz && (fz.tipo === "caro" || fz.tipo === "freio_gasto"));
    if (c.nuncaPagou !== false && !(ult > 0)) {
      const fxc = c.cfg && c.cfg.entrada_brl;
      const fx = P.entrada_nunca_pagou.entrada_override || fxc || P.entrada_nunca_pagou.faixa;
      out.min = fx[0]; out.max = fx[1]; out.tipo = "entrada";
      if (!P.entrada_nunca_pagou.entrada_override && fxc) { out.origem.push("BASE"); out.nota = "1º PPV calibrado pela base desta conta (entrada R$25–40 → gasto mediano posterior R$59). Teste A/B."; }
      else { out.origem.push("OF", "HIPOTESE"); out.nota = "1º PPV: US$10–15 convertido. Calibrar com o extrato."; }
    } else if (ult > 0 && emSeq) {
      const alta = hesitou ? 1 : (tem(sl, "vip") ? d.sem_hesitacao_pct : d.padrao_pct) / 100 + 1;
      const lo = hesitou ? ult : ult * (1 + d.base_mediana_alta_pct / 100);
      out.min = lo; out.max = Math.min(ult * alta, ult * d.max_multiplicador); if (out.max < out.min) out.max = out.min;
      out.tipo = "sequencia"; out.origem.push("BASE", "CONSENSO"); out.nota = hesitou ? "Hesitou: mantém o preço ou item menor (nunca desconto)." : "Próximo degrau: +38% (base) a +" + Math.round((alta - 1) * 100) + "%. Nunca mais que o dobro.";
    } else if (ult > 0) {
      const alvo = P.pagante_oferta_min_brl.v, teto = ult * d.max_multiplicador;
      out.min = Math.max(ult, Math.min(alvo, teto)); out.max = Math.min(teto, Math.max(out.min, ult * (1 + d.padrao_pct / 100)));
      out.tipo = "pagante"; out.origem.push("OF"); out.nota = "Já pagou: ofertas de ≈R$166+ rendem mais (OF), sem passar do dobro da última.";
    } else if (c.total > 0) {
      // v2.3.6: mesmo caso no modo normal (já pagou, última compra não lida)
      const alvo = P.pagante_oferta_min_brl.v;
      out.min = alvo; out.max = alvo * (1 + d.padrao_pct / 100);
      out.tipo = "pagante"; out.origem.push("BASE"); out.nota = "Já pagou " + brl(c.total) + ", mas a última compra não foi lida: oferta de pagante.";
    } else { out.min = P.piso_chat_brl.v; out.max = P.entrada_nunca_pagou.faixa[1]; out.tipo = "sem_dado"; out.origem.push("HIPOTESE"); out.nota = "Sem histórico de compra lido."; }
    out.min = arred90(out.min); out.max = arred90(out.max); if (out.max < out.min) out.max = out.min;
    out.max = Math.min(out.max, P.teto_chat_brl.v);
    out.ultima = ult || null;
    out.pix = out.max > P.pix.acima_brl;
    out.liquido = [r2(out.min * (1 - L(R, "taxa_privacy"))), r2(out.max * (1 - L(R, "taxa_privacy")))];
    return out;
  }

  // ---------- recursos ----------
  function recursos(c, R, sl, fz, pr) {
    const cfg = c.cfg, out = [];
    const pediuMais = c.sinais.compra && c.sinais.compra.some((t) => /tem mais|o que voce tem/.test(t));
    if (cfg.oferece_chamada && ((fz.id === "objecao" && fz.tipo === "autenticidade") || c.sinais.interesse_chamada || tem(sl, "vip"))) out.push({ id: "chamada_video", txt: "Chamada de vídeo paga (R$39,90–5.000)", aviso: "Só a modelo atende. Nunca o chatter.", roteiro: "FT_CHAMADA" });
    if (c.sinais.interesse_mimo) out.push({ id: "mimo", txt: "Mimo (R$5–2.000)", aviso: "Ele ofereceu: diga que existe. Nunca peça.", roteiro: "FT_MIMO_EXISTE" });
    if (cfg.desafio_ativo && c.total > 0 && emNobre(new Date(c.agora), R)) out.push({ id: "desafio", txt: "Desafio ativo da conta", aviso: "Sem pressão.", roteiro: "FT_DESAFIO" });
    if (cfg.vitrine_ativa && (pediuMais || (fz.id === "objecao" && fz.tipo === "caro") || !emNobre(new Date(c.agora), R))) out.push({ id: "vitrine_packs", txt: "Vitrine de pacotes do chat", aviso: "Até 5 pacotes; vende com a modelo offline.", roteiro: "FT_VITRINE" });
    if (cfg.plano_trimestral_ativo && c.sinais.assinatura) out.push({ id: "plano_trimestral", txt: "Plano trimestral/semestral", aviso: "Desconto para ficar mais tempo.", roteiro: "FT_TRIMESTRAL" });
    if (pr && pr.pix) out.push({ id: "pix", txt: "Pix da Privacy", aviso: "Acima de R$200: no Pix da plataforma passa direto (67% das vendas >R$200 na base).", roteiro: "VD_PIX_ALTO" });
    return out;
  }

  // ---------- próxima jogada ----------
  function jogada(c, R, sl, fz, pr) {
    const cfg = c.cfg, J = (txt, rot) => ({ txt, roteiro: rot });
    const nunca2 = c.nuncaPagou && c.recusas >= L(R, "nunca_pagou_recusas_parar");
    if (fz.fixado) return J("Palavra do post fixado: entregue agora o que o post prometeu.", "VD_POST_FIXADO");
    if (fz.sumiuMeio) return J("Sumiu no meio: uma mensagem leve, sem cobrança e sem PPV.", "SS_SUMIU_MEIO");
    switch (fz.id) {
      case "vulneravel": return J("Pare de vender. Conversa leve e avise o gestor.", "PAUSA_VULNERAVEL");
      case "objecao":
        if (fz.tipo === "freio_gasto") return J("Freio: valide, dê carinho e segure o preço. Sem PPV novo agora.", "PC_FREIO_CARINHO");
        if (fz.tipo === "encontro") {
          // v2.2 · quem já paga (ou é VIP / perfil ego) e pede encontro: valida o status, 100% online e converte
          const pfE = perfil(c, R), rico = c.total > 0 || tem(sl, "vip") || tem(sl, "baleia") || !!(pfE && pfE.id === "ego");
          if (rico) return cfg.oferece_chamada ? J("Valide o status dele, 100% online, e converta em chamada de vídeo (a modelo atende).", "OB_ENCONTRO_VIP_CHAMADA")
            : J("Valide o status dele, 100% online, e leve para " + (cfg.aceita_custom ? "um custom do menu aprovado." : "a sequência premium."), "OB_ENCONTRO_VIP");
          return J("Só online, leve, sem prometer nada.", "OB_ENCONTRO");
        }
        if (fz.tipo === "contato_externo") return J("Tudo fica aqui dentro; volte ao desejo dele.", "OB_CONTATO_EXTERNO");
        if (fz.tipo === "autenticidade") return cfg.oferece_chamada ? J("Ofereça chamada de vídeo (a modelo atende).", "FT_CHAMADA") : J("Curto e natural. Sem prova falsa.", "OB_AUTENTICIDADE");
        if (fz.tipo === "sem_dinheiro") return J("Pergunte quando recebe, anote, pare de vender.", "OB_SEM_DINHEIRO");
        if (fz.tipo === "caro") return cfg.vitrine_ativa ? J("Mostre o pacote menor da vitrine.", "FT_VITRINE") : J("Item menor de verdade, nunca desconto.", "VD_ITEM_MENOR");
        if (fz.tipo === "previa") return J("A prévia é a borrada; descreva com honestidade.", "OB_PREVIA");
        return J("Libere ele; deixe a porta aberta.", "OB_DEPOIS");
      case "pos_compra": {
        const min = (c.agora - c.ultCompraEm) / MIN;
        if (c.sinais.interesse_mimo && /mandei|enviei/.test(norm(c.ultFa && c.ultFa.texto))) return J("Agradeça o mimo pessoalmente.", "FT_MIMO_RECEBIDO");
        if (c.sinais.pos_compra_positivo) return tem(sl, "vip") && cfg.aceita_custom ? J("Proponha custom do menu aprovado.", "VIP_CUSTOM") : J("Abra o próximo degrau (faixa abaixo).", "PC_PROXIMO");
        if (min <= 5) return J("Mensagem pessoal agora: o que ele mais gostou.", "PC_AGRADECER");
        if (tem(sl, "vip") && cfg.aceita_custom) return J("Proponha custom do menu aprovado.", "VIP_CUSTOM");
        return J("Pergunte o que ele achou e abra o próximo degrau.", "PC_PROXIMO");
      }
      case "hora_de_vender":
        if (c.fu && !c.fu.respondeu) {
          if (nunca2) return J("Nunca pagou e recusou 2: só conversa por enquanto.", "FU_NUNCA_PAGOU");
          return c.fu.falta_s > 0 ? J("Follow-up " + c.fu.n + "/5 em " + fmtSeg(c.fu.falta_s) + ". Ângulo novo.", "FU_" + Math.min(c.fu.n, 5)) : J("Follow-up " + c.fu.n + "/5 agora, com ângulo novo.", "FU_" + Math.min(c.fu.n, 5));
        }
        if (nunca2) return J("Nunca pagou e recusou 2: só conversa por enquanto.", "FU_NUNCA_PAGOU");
        if (tem(sl, "esfriou")) return J("Ele esfriou: reabra a conversa antes do PPV.", "RE_REABRIR");
        if (c.sinais.interesse_chamada && cfg.oferece_chamada) return J("Ofereça chamada de vídeo.", "FT_CHAMADA");
        if (c.sinais.compra) return J("Ele pediu: venda agora.", "VD_PEDIU_PRECO");
        if (c.ultCompraEm && c.agora - c.ultCompraEm <= 6 * HORA) return J("Suba o degrau (+38–50%).", "VD_SUBIR");
        if (pr && pr.pix) return J("Envie e lembre que no Pix passa direto.", "VD_PIX_ALTO");
        if (cfg.desafio_ativo && emNobre(new Date(c.agora), R)) return J("Mencione o desafio ativo.", "FT_DESAFIO");
        return J("Envie o PPV agora, legenda em 4 partes.", "VD_LEGENDA");
      case "reengajamento":
        if (tem(sl, "vip")) return J("Mensagem pessoal sem venda (máx. 3 tentativas).", "RE_WHALE");
        if (c.sinais.assinatura && cfg.plano_trimestral_ativo) return J("Sugira o plano trimestral.", "FT_TRIMESTRAL");
        if (/favorit/.test(norm(c.notasTxt))) return J("Cite a favorita dele.", "RE_FOTO_FAV");
        return J("Algo das notas, sem preço.", "RE_QUIETO");
      case "abertura":
        if (c.ultCompraEm) return J("Mensagem pessoal em até 1 h.", "AB_POS_BOASVINDAS");
        if (c.soBoasVindas) return J("Só foi a boas-vindas automática: mande a 1ª mensagem pessoal com o nome dele.", "AB_USERNAME");
        if (c.ultFa && norm(c.ultFa.texto).split(" ").length <= 2) return J("Espelhe curto + pergunta fácil.", "AB_RESPOSTA_SECA");
        return J("Brinque com o nome + pergunta de escolha.", c.msgsFaTotal === 0 ? "AB_USERNAME" : "AB_ESCOLHA");
      case "qualificacao":
        if (/\bdia \d{1,2}\b|quinto dia|salario/.test(norm(c.ultFa && c.ultFa.texto))) return J("Anote o dia do pagamento.", "QL_PAGAMENTO");
        if ((fz.faltam || []).includes("trabalho")) return J("Descubra trabalho e rotina.", "QL_TRABALHO");
        return J("Descubra o que ele curte.", "QL_GOSTO");
      default:
        if (tem(sl, "esfriou")) return J("Ele esfriou: reabra a conversa antes de vender.", "RE_REABRIR");
        if (c.sinais.interesse_mimo) return J("Diga que o mimo existe (sem pedir).", "FT_MIMO_EXISTE");
        if (c.msgsFaDesdePpv >= 5) return J("Pergunta de opinião para virar a conversa.", "RP_TRANSICAO");
        return J("Commonality ou provocação leve.", c.msgsFaDesdePpv % 2 ? "RP_QUEBRA" : "RP_COMMONALITY");
    }
  }

  // ---------- próxima jogada no Modo Dominante ----------
  // Rotas extras do Modo Dominante; o que não casar aqui cai na tabela normal. Texto da jogada vem de modos.dominante.jogadas.
  const PEDIU_DESCONTO = /desconto|faz por menos|mais barato|abaixa|baixa o preco|precinho/;
  function jogadaDomRota(c, R, sl, fz, pr) {
    const cfg = c.cfg, J = (txt, rot) => ({ txt, roteiro: rot }), tr = tier(c, R) || {};
    const nunca2 = c.nuncaPagou && c.recusas >= L(R, "nunca_pagou_recusas_parar");
    const nobre = emNobre(new Date(c.agora), R), pico = emPico(new Date(c.agora));
    const grande = tr.id === "vip" || tr.id === "baleia";
    if (fz.fixado || fz.sumiuMeio || fz.tipo === "freio_gasto" || fz.tipo === "encontro") return null; // v2.2: rotas iguais nos dois modos (só o texto muda)
    switch (fz.id) {
      case "descanso": return J("", "RP_DESCANSO");
      case "objecao":
        if (fz.tipo === "caro" && (c.objecoes.caro || []).some((t) => PEDIU_DESCONTO.test(norm(t)))) return J("", "OB_DESCONTO");
        return null;
      case "rapport": case "qualificacao": {
        if (fz.ruim) return J("", "RP_SINAL_RUIM");
        const pf = perfil(c, R);
        if (fz.id === "rapport" && pf && R.perfis_fa[pf.id] && !tem(sl, "esfriou")) return J("", R.perfis_fa[pf.id].roteiro);
        return null;
      }
      case "pos_compra": {
        if (fz.aftercare) {
          const mapa = { aftercare_1: "PC_AFTERCARE_1", esperar: "PC_AFTERCARE_1", aftercare_2: "PC_AFTERCARE_2", brinde: "PC_BRINDE", mimo: "FT_MIMO_AGRADECER" };
          if (fz.aftercare === "esperar") return J("ESPERE a resposta dele antes do aftercare 2.", "PC_AFTERCARE_1");
          return J("", mapa[fz.aftercare] || "PC_AFTERCARE_1");
        }
        const min = (c.agora - c.ultCompraEm) / MIN;
        if (c.sinais.interesse_mimo && /mandei|enviei/.test(norm(c.ultFa && c.ultFa.texto))) return null;
        if (min <= L(R, "pos_compra_upsell_apos_min")) return J("", "PC_AGRADECER");
        if (grande && cfg.aceita_custom && c.sinais.pos_compra_positivo) return J("", "VIP_CUSTOM");
        if (grande) return J("", "WH_PULO");
        if (nobre) return J("", "PC_SEQUENCIA_NOITE");
        return J("", "PC_PROXIMO");
      }
      case "hora_de_vender": {
        if (c.fu && !c.fu.respondeu) {
          if (nunca2) return J("", "FU_NUNCA_PAGOU");
          const desdePpv = (c.agora - c.ultPpv.t) / 1000;
          const rf = L(R, "reforco_ppv_s") || [20, 150]; // BASE momoi: em 74% dos PPVs vendidos a conta reforçou em segundos
          if (c.fu.n === 1 && desdePpv >= rf[0] && desdePpv <= rf[1]) return J("", "FU_REFORCO");
          const n = Math.min(c.fu.n, 5), tpl = (R._dom && R._dom.fu_texto) || "Follow-up {n}/5 {quando}.";
          return J(tpl.replace("{n}", n).replace("{quando}", c.fu.falta_s > 0 ? "em " + fmtSeg(c.fu.falta_s) : "AGORA"), "FU_" + n);
        }
        if (fz.abandonado || c.ppvAband) return J("", "PPV_ABANDONADO");
        if (nunca2) return J("", "FU_NUNCA_PAGOU");
        if (tem(sl, "esfriou")) return J("", "RE_REABRIR");
        if (c.sinais.interesse_chamada && cfg.oferece_chamada) return J("", "FT_CHAMADA");
        if (c.sinais.compra) return J("", "VD_PEDIU_PRECO");
        if (c.ultCompraEm && c.agora - c.ultCompraEm <= 6 * HORA) return J("", grande ? "WH_SEQUENCIA" : "VD_SUBIR");
        if (pr && (pr.tipo === "entrada" || pr.tipo === "sem_dado")) return J("", "VD_ENTRADA_DOM");
        if (c.porConta.length >= 2 && !c.compraNestaConta) return J("", "MC_FA_QUENTE");
        const m7 = meta7(c, R); if (m7 && m7.ativo && !m7.batida) return J("", "META7_SEQUENCIA");
        if (pr && pr.pix) return J("", "PX_NUDGE");
        if (pico) return J("", "NT_PICO");
        if (nobre) return J("", "NT_NOBRE");
        if (cfg.desafio_ativo) return J("", "FT_DESAFIO");
        return J("", pr && pr.tipo === "pagante" ? "VD_ANCORA" : "VD_LEGENDA");
      }
      case "reengajamento":
        if (calendario(c, R).some((e) => e.hoje)) return J("", "RE_DIA_PAGAMENTO");
        if (tem(sl, "vip") || grande) {
          const max = L(R, "whale_sumido_max_tentativas");
          return J("", c.tentativas >= max ? "RE_ENCERRAR" : c.tentativas >= 1 ? "RE_WHALE_2" : "RE_WHALE");
        }
        return null;
      default: return null;
    }
  }
  function jogadaDom(c, R, sl, fz, pr) {
    const j = jogadaDomRota(c, R, sl, fz, pr) || jogada(c, R, sl, fz, pr);
    const txt = (R._dom.jogadas || {})[j.roteiro];
    if (!j.txt || (txt && !/^FU_\d$/.test(j.roteiro))) j.txt = txt || j.txt;
    if (!j.txt) j.txt = "Siga o roteiro.";
    return j;
  }

  // ---------- alertas do campo de mensagem ----------
  function alertas(texto, c, R) {
    const out = []; if (!texto || !texto.trim()) return out;
    for (const a of R.alertas_composer.regras) {
      if (a.id === "preco_menor" || a.id === "pix_alto" || a.id === "piso_midia") continue;
      const hit = casa(texto, a.padroes);
      if (hit.length) out.push({ id: a.id, nivel: a.nivel, motivo: a.motivo, gatilho: hit.map((h) => (h.startsWith("re:") ? (texto.match(new RegExp(h.slice(3), "i")) || [h])[0] : h)).join(", ") });
    }
    for (const h of varrerRisco(texto, R.compliance_digitando)) out.push({ id: h.id, nivel: h.nivel === "bloqueio_visual" ? "aviso" : h.nivel, motivo: h.motivo, gatilho: h.termos.join(", "), digitando: true });
    const prot = c && c.cfg && Array.isArray(c.cfg.protecao_termos) ? c.cfg.protecao_termos.filter((x) => x && String(x).trim()) : [];
    if (prot.length) { const hit = casa(texto, prot); const regra = R.alertas_composer.regras.find((x) => x.id === "protecao_modelo"); if (hit.length) out.push({ id: "protecao_modelo", nivel: "bloqueio_visual", motivo: regra ? regra.motivo : "Dado real da modelo.", gatilho: hit.join(", ") }); }
    const vals = valoresReais(texto);
    const ult = c && c.ultCompraValor;
    const dom = ehDom(R);
    if (ult && vals.some((v) => v < ult)) out.push({ id: "preco_menor", nivel: dom ? (R._dom.preco.preco_menor_nivel || "aviso") : "aviso", motivo: (dom ? "Modo Dominante: preço NUNCA cai depois de compra. " : "") + "Valor menor que a última compra dele (" + brl(ult) + "). Preço menor depois de compra rende ~metade (OF).", gatilho: brl(Math.min(...vals)) });
    // v2.2 · piso por mídia da conta: digitar valor menor que ele é faixa vermelha
    const piso = c && c.cfg ? Number(c.cfg.piso_midia_brl) || 0 : 0;
    if (piso > 0 && vals.some((v) => v < piso)) { const rg = R.alertas_composer.regras.find((x) => x.id === "piso_midia"); out.push({ id: "piso_midia", nivel: "bloqueio_visual", motivo: (rg ? rg.motivo : "Valor abaixo do preço mínimo por mídia desta conta.") + " Piso: " + brl(piso) + ".", gatilho: brl(Math.min(...vals)) }); }
    if (vals.some((v) => v > R.preco.pix.acima_brl)) out.push({ id: "pix_alto", nivel: "info", motivo: "Acima de R$200: lembre do Pix da plataforma.", gatilho: brl(Math.max(...vals)) });
    const ordem = { bloqueio_visual: 0, aviso: 1, revisor: 2, info: 3 };
    return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  }

  // ---------- relógio ----------
  function relogio(c, R) {
    // meta_s vem do limiar do modo ativo (aplicarModo põe os limiares do Dominante por cima): o painel só mostra.
    const d = new Date(c.agora), meta = L(R, "resposta_meta_s"), out = { nobre: emNobre(d, R), pico: emPico(d), meta_s: meta };
    if (c.ultimaEhFa && c.ultFa) {
      const s = Math.max(0, Math.round((c.agora - c.ultFa.t) / 1000));
      const lim = c.salaSemConta ? L(R, "novo_assinante_limite_s") : L(R, "resposta_limite_s");
      out.espera_s = s; out.limite_s = lim; out.novo = c.salaSemConta && !(c.total > 0); // quem já gastou não é "assinante novo", mesmo sem mensagem nossa na tela
      out.cor = s <= meta ? "verde" : s <= lim ? "amarelo" : "vermelho";
    }
    if (c.fu && !c.fu.respondeu) out.fu = { n: c.fu.n, falta_s: c.fu.falta_s, max: L(R, "followup_max") };
    return out;
  }

  function fmtHora(t) { if (!t) return "—"; const d = new Date(t); return FMT_SP ? FMT_SP.format(d) : d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }
  // ---------- sessão, aftercare 2 tempos, brinde, mimo honesto e descanso ----------
  function sessao(c, R) {
    const S = R.sessao; if (!S || !c.comprasT || !c.comprasT.length) return null;
    const cs = c.comprasT; let i = cs.length - 1;
    while (i > 0 && cs[i].t - cs[i - 1].t <= S.gap_min * MIN) i--;
    const lista = cs.slice(i), fim = lista[lista.length - 1].t, valor = r2(lista.reduce((a, x) => a + (x.v || 0), 0));
    const completa = lista.length >= S.completa_n;
    const descansoAte = fim + S.descanso_h * HORA;
    const out = { n: lista.length, valor, inicio: lista[0].t, fim, completa, descansoAte, passo: "fora" };
    if (!completa || c.agora >= descansoAte) return out;
    if (c.agora - fim < 60000) { out.passo = "aftercare_1"; return out; }
    const depois = c.daConta.filter((m) => m.t > fim && !m.ppv);
    const respondeuAf1 = depois.length ? c.doFa.some((m) => m.t > depois[0].t) : false;
    const seq = ["aftercare_1", "aftercare_2"];
    if (valor >= S.brinde_acima_brl && c.cfg.brinde_pos_sessao) seq.push("brinde");
    if (c.cfg.mimo_ativo && !depois.some((m) => /mimo/.test(norm(m.texto)))) seq.push("mimo");
    if (depois.length === 1 && !respondeuAf1) out.passo = "esperar";
    else out.passo = depois.length < seq.length ? seq[depois.length] : "descanso";
    if (out.passo === "mimo" && depois.some((m) => /mimo/.test(norm(m.texto)))) out.passo = "descanso";
    return out;
  }
  // ---------- espelho e termômetro (Funil 1.4; Vendas) ----------
  const RE_EMOJI = /\p{Extended_Pictographic}/gu;
  function espelho(c) {
    const ms = c.doFa.slice(-8); if (ms.length < 2) return null;
    const pal = ms.map((m) => norm(m.texto).split(" ").filter(Boolean).length), emo = ms.map((m) => (String(m.texto).match(RE_EMOJI) || []).length);
    let blocos = 0, ant = null; c.msgs.slice(-30).forEach((m) => { if (m.de_fa && (ant === null || !ant)) blocos++; ant = m.de_fa; });
    const palMed = pal.reduce((a, b) => a + b, 0) / ms.length, emoMed = emo.reduce((a, b) => a + b, 0) / ms.length;
    const porVez = blocos ? ms.length / Math.min(blocos, ms.length) : 1;
    const dica = palMed <= 4 ? "Ele é seco: 1 msg curta, sem textão." : palMed >= 12 ? "Ele escreve bastante: acompanhe com mensagens mais longas." : "Ritmo médio: 1–2 frases.";
    return { palavras: Math.round(palMed * 10) / 10, emojis: Math.round(emoMed * 10) / 10, por_vez: Math.round(porVez * 10) / 10, resposta_s: c.atrasoMed != null ? Math.round(c.atrasoMed) : null,
      dica: dica + (emoMed >= 1 ? " Use emoji como ele." : " Pouco emoji.") + (porVez >= 2 ? " Ele manda várias de uma vez: pode mandar 2." : "") };
  }
  function termometro(c, R) {
    const ms = c.doFa.slice(-5); if (!ms.length) return null;
    const txt = ms.map((m) => m.texto).join(" \n "), quentes = casa(txt, (R.palavras.quentes || [])).length;
    let n = 1 + Math.min(4, quentes) + (c.gapFa_s != null && c.gapFa_s <= 60 ? 2 : c.gapFa_s != null && c.gapFa_s <= 180 ? 1 : 0) + (c.longo ? 1 : 0) + ((txt.match(RE_EMOJI) || []).length ? 1 : 0) + (c.sinais.compra ? 1 : 0) - (c.ruim ? 2 : 0);
    n = Math.max(1, Math.min(10, n));
    return { n, alvo: Math.min(10, n + 1), dica: "Entre no nível " + Math.min(10, n + 1) + "/10 (um acima dele)." + (n >= 8 ? " Pode usar o 'trem do sim'." : n <= 3 ? " Frio: crie desejo antes de vender." : "") };
  }
  // ---------- perfil do fã ----------
  function perfil(c, R) {
    const PF = R.perfis_fa, W = (R.palavras || {}).perfis; if (!PF || !W) return null;
    const mk = (id, fonte) => PF[id] ? { id, rotulo: PF[id].rotulo, dica: PF[id].dica, cenas: PF[id].cenas, fonte } : null;
    if (c.perfilManual && PF[c.perfilManual]) return mk(c.perfilManual, "você marcou");
    const tag = /perfil\s*[:=-]\s*([a-z ]+)/.exec(norm(c.notasTxt));
    if (tag) { const k = Object.keys(PF).find((x) => x !== "_doc" && (norm(tag[1]).startsWith(x) || norm(PF[x].rotulo || "") === norm(tag[1]).trim())); if (k) return mk(k, "nota do Aura"); }
    const base = c.notasTxt + " \n " + c.doFa.map((m) => m.texto).join(" \n ");
    let best = null, bn = 0;
    for (const [k, lista] of Object.entries(W)) { const n = casa(base, lista).length; if (n > bn) { best = k; bn = n; } }
    return best && bn >= 2 ? mk(best, "palavras dele (" + bn + ")") : null;
  }
  // ---------- calendário de pagamento BR (CLT, dia anotado, 13º) ----------
  const FMT_DIA = typeof Intl !== "undefined" ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }) : null;
  function diaSP(t) { const [y, m, d] = (FMT_DIA ? FMT_DIA.format(new Date(t)) : new Date(t).toISOString().slice(0, 10)).split("-").map(Number); return { y, m, d }; }
  function quintoDiaUtil(y, m, R) {
    const fer = (R.calendario_pag && R.calendario_pag.feriados_nacionais_mmdd) || []; let n = 0;
    for (let d = 1; d <= 31; d++) { const dt = new Date(Date.UTC(y, m - 1, d)); if (dt.getUTCMonth() !== m - 1) break; const wd = dt.getUTCDay(); const mmdd = String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      if (wd !== 0 && wd !== 6 && !fer.includes(mmdd)) { n++; if (n === 5) return d; } }
    return null;
  }
  function calendario(c, R) {
    const K = R.calendario_pag; if (!K) return [];
    const hoje = diaSP(c.agora), out = [], ms = Date.UTC(hoje.y, hoje.m - 1, hoje.d);
    const dif = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - ms) / DIA);
    const [a, b] = K.janela_dias || [-1, 2];
    const push = (tipo, rotulo, dd) => { if (dd >= a && dd <= b) out.push({ tipo, rotulo, dias: dd, hoje: dd >= -1 && dd <= 0, txt: rotulo + (dd === 0 ? " é hoje" : dd === -1 ? " foi ontem" : " em " + dd + "d") }); };
    if (K.quinto_dia_util) { const q = quintoDiaUtil(hoje.y, hoje.m, R); if (q) push("clt", "5º dia útil (CLT)", dif(hoje.y, hoje.m, q)); }
    const nota = /(?:recebe|pagamento|salario|paga)[^\n]{0,20}?dia (\d{1,2})|dia (\d{1,2})[^\n]{0,15}(?:recebe|pagamento|salario)/.exec(norm(c.notasTxt + " \n " + c.doFa.map((m) => m.texto).join(" \n ")));
    if (nota) { const d = Number(nota[1] || nota[2]); if (d >= 1 && d <= 31) push("anotado", "Dia de pagamento dele (" + d + ")", dif(hoje.y, hoje.m, d)); }
    for (const x of K.decimo_terceiro || []) { const dd = dif(hoje.y, x.mes, x.dia); if (dd >= 0 && dd <= (x.avisar_dias_antes || 10)) out.push({ tipo: "13", rotulo: x.rotulo, dias: dd, hoje: dd === 0, txt: x.rotulo + " até " + String(x.dia).padStart(2, "0") + "/" + String(x.mes).padStart(2, "0") + (dd ? " (faltam " + dd + "d)" : " (hoje)") }); }
    return out;
  }
  // ---------- revisor do campo de texto (só sugere) ----------
  function revisor(texto, c, fz, R) {
    const V = R.revisor, out = []; if (!V || !texto || !texto.trim()) return out;
    const t = texto.trim(), n = norm(t), pal = n.split(" ").filter(Boolean).length;
    const add = (id, motivo) => out.push({ id, nivel: "revisor", motivo, gatilho: "revisor" });
    if (casa(t, V.abertura_fraca).length) add("abertura_fraca", "Abertura genérica. Puxe com algo dele ou uma pergunta de escolha.");
    const pend = c && c.ultPpv && c.ultPpv.comprado !== true && c.agora - c.ultPpv.t < 3 * DIA;
    if (pend && casa(t, V.cobranca_seca).length) add("cobranca_seca", "“Vai abrir?” seco não vende. Follow-up acrescenta desejo (ângulo novo).");
    const fechada = (R.palavras.fechadas || []).some((f) => n.endsWith(norm(f)));
    if (fechada) add("pergunta_fechada", "Pergunta fechada (sim/não). Troque por aberta: “qual parte…”, “o que você…”.");
    else if (t.length >= V.min_chars_sem_pergunta && !/\?\s*[\p{Extended_Pictographic}\s]*$/u.test(t)) add("sem_pergunta", "Termine deixando uma pergunta (Funil 1.2).");
    if (c && c.copiado && norm(c.copiado) === n) add("copiado_igual", "Igual ao roteiro copiado. Personalize com algo que ele disse.");
    const legenda = fz && fz.id === "hora_de_vender" && casa(t, V.legenda_palavras).length;
    if (legenda) {
      const falt = []; if (t.length < V.legenda_min_chars) falt.push("curta (<" + V.legenda_min_chars + ")"); if (c && c.nome && !n.includes(norm(c.nome))) falt.push("sem o nome dele"); if (!/\?/.test(t)) falt.push("sem pergunta");
      if (falt.length) add("legenda_fraca", "Legenda de PPV " + falt.join(", ") + ". Use reação + história + pergunta + nome.");
    }
    if (pal <= V.seca_max_palavras && !out.length && fz && (fz.id === "rapport" || fz.id === "qualificacao" || fz.id === "abertura")) add("seca", "Seca demais. Dê um gancho.");
    return out;
  }
  // ---------- fila com prazo por estado ----------
  function fila(salas, R, agora, faseAtual) {
    const F = R.fila_sla; if (!F || !salas) return [];
    const W = R.palavras.sinais, h = horaSP(new Date(agora));
    return salas.filter((s) => s.naoLidas > 0 || s.aberta).map((s) => {
      let est;
      if (s.aberta && faseAtual) est = faseAtual === "pos_compra" || faseAtual === "descanso" ? "pos_venda" : faseAtual === "hora_de_vender" ? "ativa" : faseAtual === "abertura" ? "novo" : "transicao";
      else if (casa(s.ultima, W.compra).length || casa(s.ultima, W.compra_sutil || []).length) est = "transicao";
      else if (casa(s.ultima, W.pos_compra_positivo).length) est = "pos_venda";
      else if (s.online) est = "ativa";
      else if (/^(oi+|ola|boa (noite|tarde)|bom dia|eai|e ai)\b/.test(norm(s.ultima)) && norm(s.ultima).split(" ").length <= 3) est = "novo";
      else est = "ocasional";
      let espera = null; const hora = String(s.hora || "").trim(), m = /^(\d{1,2}):(\d{2})$/.exec(hora);
      if (m) { let d = h * 60 - (Number(m[1]) * 60 + Number(m[2])); if (d < 0) d += 1440; espera = Math.round(d * 60); }
      // Hora que não é HH:MM ("Ontem", "seg.", "10/11") com mensagem não lida = esperando há 1 dia ou mais: prazo estourado.
      else if (hora && !/^(agora|hoje|now)\b/.test(norm(hora)) && s.naoLidas > 0) espera = DIA / 1000;
      const sla = F[est].s, folga = espera != null ? sla - espera : null, gasto = Number(s.gasto) || 0;
      return { sala: s.sala, nome: s.nome, naoLidas: s.naoLidas, online: s.online, aberta: !!s.aberta, gasto, estado: est, rotulo: F[est].rotulo, sla_s: sla, espera_s: espera, folga_s: folga, estourou: folga != null && folga < 0 };
      // empate no prazo: primeiro quem já gastou mais (gasto lido na lista de salas)
    }).sort((a, b) => (a.folga_s == null) - (b.folga_s == null) || (a.folga_s - b.folga_s) || b.gasto - a.gasto || b.naoLidas - a.naoLidas);
  }
  // ---------- roteiro repetido (emp_jogadas) ----------
  function repetido(rotId, hist) {
    if (!rotId || !Array.isArray(hist)) return null;
    const u = hist.filter((h) => h.roteiro_id === rotId).sort((a, b) => Date.parse(b.em) - Date.parse(a.em));
    if (!u.length) return null;
    const d = diaSP(Date.parse(u[0].em));
    return { vezes: u.length, ultima: u[0].em, variantes: [...new Set(u.map((x) => x.variante).filter(Boolean))], txt: "Já usou " + rotId + " com ele em " + String(d.d).padStart(2, "0") + "/" + String(d.m).padStart(2, "0") + (u.length > 1 ? " (" + u.length + "x)" : "") + ". Troque a variante ou personalize." };
  }
  // ---------- conversão por roteiro na semana ----------
  function conversaoSemana(linhas) {
    return (linhas || []).map((l) => { const usos = Number(l.usos) || 0, vendas = Number(l.vendas) || 0; const conv = usos ? vendas / usos : 0;
      return { roteiro_id: l.roteiro_id, usos, vendas, receita: r2(Number(l.receita) || 0), conv, selo: usos >= 8 && conv < 0.05 ? "cortar" : usos >= 5 && conv >= 0.25 ? "manter" : "pouco dado" }; })
      .sort((a, b) => b.conv - a.conv || b.usos - a.usos);
  }
  // ---------- modo sequência (cena) ----------
  function cena(c, R, CN, pr, pf) {
    if (!CN || !CN.cenas || !CN.cenas.length) return null;
    const sug = pf && pf.cenas ? pf.cenas.find((id) => CN.cenas.some((x) => x.id === id)) : null;
    const ce = CN.cenas.find((x) => x.id === c.cenaId) || CN.cenas.find((x) => x.id === sug) || CN.cenas[0];
    const ses = sessao(c, R), total = ce.degraus.length;
    const emSes = ses && c.agora - ses.fim <= (R.sessao ? R.sessao.gap_min : 90) * MIN;
    let n = (emSes ? ses.n : 0) + 1 + c.cenaAjuste; n = Math.max(1, n);
    const fim = n > total, d = fim ? null : ce.degraus[n - 1];
    const esperar = !c.ultimaEhFa && c.ultConta && (!c.ultFa || c.ultConta.t > c.ultFa.t) && c.daConta.length > 0;
    return { id: ce.id, titulo: ce.titulo, origem: ce.origem, sugerida: ce.id === sug, n: Math.min(n, total), total, fim, rotulo: d ? d.rotulo : "Aftercare", legenda: d ? d.legenda : null, abertura: ce.abertura,
      esperar: !!esperar, pix: !!(pr && (pr.pix || n >= ((R.preco.escada_cena_brl || {}).pix_a_partir_degrau || 4))), aftercare: fim ? (CN.aftercare || []) : null, lista: CN.cenas.map((x) => ({ id: x.id, titulo: x.titulo })) };
  }

  // ---------- HUD de tempo (Modo Dominante): alertas de relógio, não de termos ----------
  function hud(c, R, sl, rl, m7, fz) {
    const out = [];
    // v2.2 · avisos que valem nos dois modos
    if (fz && fz.fixado) out.push({ nivel: "aviso", txt: "Ele mandou a palavra do post fixado (“" + fz.fixado + "”): atenda primeiro e entregue o que o post promete." });
    if (fz && fz.tipo === "freio_gasto") out.push({ nivel: "aviso", txt: "Freio de gasto: ele disse que gastou demais. Nada de PPV novo nem degrau acima nesta sessão; carinho e aftercare." + (tem(sl, "baleia") || tem(sl, "vip") ? " Proteja este fã: ele vale mais voltando do que estourando hoje." : "") });
    if (fz && fz.sumiuMeio) out.push({ nivel: "aviso", txt: "Ele sumiu no meio da sessão: uma mensagem leve só. Sem cobrança." });
    if (c.soBoasVindas) out.push({ nivel: "aviso", txt: "Só a boas-vindas automática foi enviada: falta a 1ª mensagem pessoal com o nome dele" + (c.nome ? " (" + c.nome + ")" : "") + "." });
    if (!ehDom(R)) return out;
    const tr = tier(c, R) || {}, grande = tr.id === "vip" || tr.id === "baleia", h = horaSP(new Date(c.agora));
    if (rl.espera_s != null && grande && rl.espera_s > L(R, "vip_esperando_alerta_s")) out.push({ nivel: "aviso", txt: tr.rotulo + " esperando há " + fmtSeg(rl.espera_s) + ": responda ele primeiro." });
    else if (rl.espera_s != null && rl.espera_s > rl.limite_s) out.push({ nivel: "aviso", txt: "Ele espera há " + fmtSeg(rl.espera_s) + ". Cada minuto parado esfria a venda." });
    if (rl.fu && rl.fu.falta_s <= 0) out.push({ nivel: "aviso", txt: "Follow-up " + rl.fu.n + "/" + rl.fu.max + " vencido: mande agora." });
    else if (rl.fu && rl.fu.falta_s <= 60) out.push({ nivel: "info", txt: "Follow-up " + rl.fu.n + "/" + rl.fu.max + " em " + fmtSeg(rl.fu.falta_s) + ": deixe pronto." });
    if (rl.pico) out.push({ nivel: "info", txt: "PICO das 23h: é agora." });
    else if (h >= 22 && h < 22.5) out.push({ nivel: "info", txt: "Pico em " + Math.round((22.5 - h) * 60) + " min: deixe o PPV pronto." });
    else if (rl.nobre && c.total > 0) out.push({ nivel: "info", txt: "Janela nobre 20h–3h: 43,4% da receita sai aqui." });
    if (m7 && m7.ativo) out.push({ nivel: "info", tipo: "meta7", pct: m7.pct, batida: m7.batida, txt: "Dia " + m7.dia + " de 7 · " + brl(m7.gasto) + " gasto" + (!m7.batida ? " · Meta 7 dias: faltam " + brl(m7.falta) + " em " + m7.dias_restantes + "d" : "") + (m7.dia === 1 ? " · D0: mensagem pessoal em até 1 h" : m7.dia >= 3 && m7.dia <= 4 && c.comprasT.length < 2 ? " · sem 2ª compra: rapport + oferta" : "") });
    calendario(c, R).forEach((e) => out.push({ nivel: e.hoje ? "aviso" : "info", txt: "💸 " + e.txt + (e.tipo === "13" ? " · volte a ofertar sem pressão" : "") }));
    const pede = c.ultFa && /de onde (voce|vc|ce) e|onde (voce|vc|ce) mora|qual (a )?(sua )?cidade|voce e de onde/.test(norm(c.ultFa.texto));
    if (pede) out.push({ nivel: "aviso", txt: "Ele perguntou da cidade: NÃO diga a sua (sobe o pedido de encontro). Pergunte a dele." });
    if (m7 && m7.batida && m7.ativo) out.push({ nivel: "info", txt: "Bateu " + brl(m7.meta) + " nos 7 primeiros dias: trate como VIP (59,4% chegam a R$1.000)." });
    return out;
  }
  // ---------- placar do dia por conta (só números agregados, nenhum dado de fã) ----------
  const MEDALHA = ["🥇", "🥈", "🥉"];
  function placar(linhas, R, contaAtual) {
    const cfg = R.config_por_conta || {};
    const ls = (linhas || []).map((l) => {
      const receita = Number(l.receita) || 0, vendas = Number(l.vendas) || 0, ppvs = Number(l.ppvs) || 0, meta = (cfg[l.conta] || {}).meta_dia_brl || null;
      return { conta: l.conta, receita: r2(receita), vendas, ppvs, jogadas: Number(l.jogadas) || 0, meta, pct: meta ? receita / meta : null, ticket: vendas ? r2(receita / vendas) : null, conversao: ppvs ? Math.min(1, vendas / ppvs) : null };
    }).sort((a, b) => b.receita - a.receita || b.vendas - a.vendas);
    ls.forEach((l, i) => { l.pos = i + 1; l.medalha = MEDALHA[i] || String(i + 1); });
    const atual = ls.find((l) => l.conta === contaAtual) || null;
    const lider = ls[0] || null;
    const atras = atual && lider && atual !== lider ? r2(lider.receita - atual.receita) : 0;
    return { linhas: ls, atual, atras_do_lider: atras };
  }

  function fmtSeg(s) { s = Math.max(0, Math.round(s)); if (s >= 86400) return Math.floor(s / 86400) + "d"; if (s >= 3600) return Math.floor(s / 3600) + "h" + String(Math.floor((s % 3600) / 60)).padStart(2, "0"); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function brl(n) { return "R$ " + Number(n || 0).toFixed(2).replace(".", ","); }

  // ---------- roteiro com placeholders ----------
  // Cada parte que veio de um {campo} leva o nome do campo: o painel deixa clicar nela para preencher/editar.
  function preencher(txt, dados) {
    const faltam = []; let ant = "";
    const partes = String(txt).split(/(\{[a-z_]+\})/g).map((p) => {
      const m = /^\{([a-z_]+)\}$/.exec(p); if (!m) { ant = p; return { t: p }; }
      let v = dados && dados[m[1]];
      if (v) { v = String(v); if (/\bdia\s$/i.test(ant) && /^dia\s/i.test(v)) v = v.replace(/^dia\s+/i, ""); /* "Dia {dia_pagamento}" + "dia 5" */ ant = v; return { t: v, campo: m[1], posto: true }; }
      if (!faltam.includes(m[1])) faltam.push(m[1]);
      ant = p; return { t: p, falta: true, campo: m[1] };
    });
    return { partes, faltam, texto: partes.map((p) => p.t).join("") };
  }
  // ---------- dados do fã para os {placeholders} (lidos das notas/tags do Aura e do que ele escreveu) ----------
  // Notas no formato "chave: valor" (profissao: engenheiro · time: flamengo · hobby: academia · detalhe: viagem)
  // viram dados[chave]. {dia_pagamento} sai do dia anotado ("recebe dia 5", "5º dia útil").
  const APELIDOS = { trabalho: "profissao", profissao: "profissao", emprego: "profissao", detalhe: "detalhe", detalhe_dele: "detalhe_dele", pagamento: "dia_pagamento", dia_de_pagamento: "dia_pagamento" };
  function dadosFa(notasTxt, textoFa) {
    const d = {};
    String(notasTxt || "").split(/\n/).forEach((linha) => {
      const m = /^\s*#?([A-Za-zÀ-ÿ_ ]{2,24}?)\s*[:=]\s*(\S.*)$/.exec(linha); if (!m) return;
      let k = norm(m[1]).replace(/\s+/g, "_"); k = APELIDOS[k] || k;
      const v = m[2].trim().replace(/\s+/g, " ").slice(0, 80);
      if (/^[a-z_]+$/.test(k) && k !== "perfil" && k !== "nome" && v && !d[k]) d[k] = v;
    });
    if (d.detalhe && !d.detalhe_dele) d.detalhe_dele = d.detalhe; else if (d.detalhe_dele && !d.detalhe) d.detalhe = d.detalhe_dele;
    if (d.dia_pagamento) { if (/^\d{1,2}$/.test(d.dia_pagamento)) d.dia_pagamento = "dia " + Number(d.dia_pagamento); }
    else {
      const t = norm(String(notasTxt || "") + " \n " + String(textoFa || ""));
      const dia = /(?:recebe|recebo|pagamento|salario|paga|cai)[^\n]{0,20}?dia (\d{1,2})\b|\bdia (\d{1,2})\b[^\n]{0,15}(?:recebe|recebo|pagamento|salario|cai)/.exec(t);
      const n = dia ? Number(dia[1] || dia[2]) : 0;
      if (n >= 1 && n <= 31) d.dia_pagamento = "dia " + n;
      else if (/\b(5o?|quinto) dia util\b/.test(t.replace(/º/g, "o"))) d.dia_pagamento = "5º dia útil";
    }
    return d;
  }
  // ---------- projeção da escada de preço: os 3 próximos degraus ----------
  // 1º = piso da faixa de agora; cada degrau sobe o % padrão do modo (VIP/Baleia pulam degrau), nunca mais que o
  // dobro do anterior nem acima do teto do chat. Só para o atendente enxergar a escada inteira.
  function escada(pr, c, R, n) {
    if (!pr || !(pr.min > 0)) return null;
    const dom = ehDom(R), d = dom ? R._dom.preco.degrau : R.preco.degrau, tr = (dom && tier(c, R)) || {}, teto = R.preco.teto_chat_brl.v;
    const pct = dom && tr.pula_degrau ? d.vip_pct : d.padrao_pct, arred = dom ? arredBaixo : arred90;
    const out = [r2(Math.min(pr.min, teto))];
    while (out.length < (n || 3)) {
      const ant = out[out.length - 1];
      let v = Math.min(arred(ant * (1 + pct / 100)), ant * d.max_multiplicador, teto); if (v < ant) v = ant;
      out.push(r2(v));
    }
    return { degraus: out, pct, teto: out[out.length - 1] >= teto };
  }

  // ---------- v2.2 · previsão de gasto em 30 dias e "Cara de Baleia" ----------
  // previsao = gasto dos 7 primeiros dias × fator medido na base (regras.previsao_30d). "Cara de Baleia" = chance alta
  // de passar do corte de Baleia, avisada ANTES de bater o corte. Só vale nos 30 primeiros dias do fã.
  function previsao(c, R) {
    const P = R.previsao_30d; if (!P || c.gasto7 == null || !(c.gasto7 > 0) || !c.primeiraCompraEm) return null;
    const multi = c.porConta.length >= 2, ticket = c.ficha && !c.soNome && Number(c.ficha.n) > 0 ? c.gasto7 / Math.max(1, Number(c.ficha.n)) : null;
    const fator = multi ? P.fator_multi_conta : c.gasto7 >= 200 ? P.fator_g7_200 : ticket != null && ticket < (P.ticket_baixo_brl || 0) ? P.fator_ticket_baixo : P.fator_base;
    const tb = (((R.modos || {}).dominante || {}).preco || {}).tiers, corte = ((tb || []).find((t) => t.id === "baleia") || {}).total_min || Infinity;
    const regra = (P.cara_de_baleia || []).find((x) => c.gasto7 >= x.gasto7_min && (!x.multi_conta || multi)) || null;
    const dias = Math.floor((c.agora - c.primeiraCompraEm) / DIA) + 1, proj = Math.max(r2(c.gasto7 * fator), r2(c.total || 0));
    return { gasto7: r2(c.gasto7), fator, previsao_30d_brl: proj, dia: dias, ativo: dias <= 30, cara: !!regra && c.total < corte && dias <= 30, pct: regra ? regra.pct : null, motivo: regra ? regra.motivo : "", corte };
  }
  // ---------- v2.3.15 · Momento de ofertar ----------
  // Sim quando: o padrão do fã (leitor.js) está em momento_ofertar.padroes, ele já gastou o mínimo desse padrão (ou já comprou
  // algo), a fase não está em fases_barram e não há PPV pendente (aí a jogada é cobrar o que já foi enviado). Só dá prioridade e
  // destaque: o motor nunca envia nem troca o roteiro por causa disto.
  function momentoOfertar(c, R, fz) {
    const MO = R && R.momento_ofertar; if (!MO || MO.ativo === false || !c) return null;
    if (fz && (MO.fases_barram || []).includes(fz.id)) return null;
    if (fz && MO.barrar_aftercare !== false && fz.aftercare) return null; // fim de sessão: quem manda é o aftercare
    if (MO.ppv_pendente !== "ofertar" && c.ultPpv && c.ultPpv.comprado !== true && c.fu) return null;
    const G = MO.gatilhos || {}, MOT = MO.motivos || {}, texto = (k, v) => String(MOT[k] || "Bom momento para ofertar.").replace("{n}", v.n).replace("{min}", v.min);
    // o clima esfriou: ele demorou muito para responder a ÚLTIMA fala da conta (medido: ~7% de chance de compra na hora seguinte)
    if (Number(G.resposta_lenta_min) > 0 && c.ultFa && Array.isArray(c.daConta)) {
      const antes = c.daConta.filter((m) => m.t < c.ultFa.t);
      if (antes.length && (c.ultFa.t - antes[antes.length - 1].t) / MIN > Number(G.resposta_lenta_min)) return null;
    }
    // 1) sequência quente: n compras (PPVs comprados) na janela
    const S = G.sequencia;
    if (S && Number(S.n) > 0 && Array.isArray(c.ppvs)) {
      const lim = c.agora - (Number(S.janela_min) || 60) * MIN, n = c.ppvs.filter((p) => p.comprado === true && (p.compradoEm || p.t) > lim).length;
      if (n >= Number(S.n)) return { gatilho: "sequencia", padrao: c.padrao || null, motivo: texto("sequencia", { n, min: "" }) };
    }
    // 2) comprou há pouco
    if (Number(G.compra_recente_min) > 0 && c.ultCompraEm && c.agora >= c.ultCompraEm && c.agora - c.ultCompraEm <= Number(G.compra_recente_min) * MIN)
      return { gatilho: "compra_recente", padrao: c.padrao || null, motivo: texto("compra_recente", { n: "", min: Math.max(1, Math.round((c.agora - c.ultCompraEm) / MIN)) }) };
    // 3) padrão do fã (só se listado em 'padroes'; vazio por padrão: não mostrou ganho nos dados)
    if (c.padrao && (MO.padroes || []).includes(c.padrao)) {
      const min = Number((MO.gasto_min_brl || {})[c.padrao]) || 0;
      if (min > 0 && !((Number(c.total) || 0) >= min || (Number(c.ultCompraValor) || 0) > 0)) return null;
      return { gatilho: c.padrao, padrao: c.padrao, motivo: texto(c.padrao, { n: "", min: "" }) };
    }
    return null;
  }
  // v2.3.17: roteiro de oferta que combina com o padrão do fã, quando o roteiro atual não é de oferta (só sugere; quem decide é o painel/operador)
  function sugestaoOferta(mo, rotAtual, R, ROT, fz) {
    const MO = R && R.momento_ofertar, SG = MO && MO.sugestao; if (!mo || !SG || SG.ativo === false || !fz || !ROT) return null;
    if (!(SG.fases || []).includes(fz.id)) return null;
    const ofertas = MO.roteiros_oferta || [];
    if (rotAtual && ofertas.includes(rotAtual.id)) return null; // o atual já é de oferta
    const id = (SG.por_gatilho || {})[mo.gatilho] || (SG.por_padrao || {})[mo.padrao]; if (!id || !ofertas.includes(id)) return null;
    const r = (ROT.roteiros || []).find((x) => x.id === id); if (!r) return null;
    return { id, situacao: r.situacao || "", atual: rotAtual ? rotAtual.id : null };
  }
  // peso do boost: o do JSON, ou (com dados) a razão entre as taxas de venda de "usou oferta no momento" e "usou outra coisa no momento"
  function pesoOferta(R, stats) {
    const MO = R && R.momento_ofertar, base = Number(MO && MO.peso_thompson) || 1, AP = MO && MO.aprender_peso;
    const fonte = { peso: base, aprendido: false };
    if (!AP || AP.ativo === false || !Array.isArray(stats)) return fonte;
    const g = (n) => { const x = stats.find((y) => y.grupo === n); return x ? { u: Number(x.usos) || 0, v: Math.min(Number(x.usos) || 0, Number(x.vendas) || 0) } : { u: 0, v: 0 }; };
    const A = g("oferta_no_momento"), B = g("outra_no_momento"), min = Number(AP.min_usos_grupo) || 15;
    if (A.u < min || B.u < min) return fonte;
    const razao = ((A.v + 1) / (A.u + 2)) / ((B.v + 1) / (B.u + 2));
    return { peso: Math.min(Number(AP.max_peso) || 6, Math.max(Number(AP.min_peso) || 1, razao)), aprendido: true, oferta: A, outra: B };
  }
  // índices (a partir de 0) das variantes de OFERTA de um roteiro de venda
  function variantesOferta(rot, lista, R) {
    const MO = R && R.momento_ofertar, out = new Set(); if (!MO || !rot || !Array.isArray(lista)) return out;
    if ((MO.roteiros_oferta || []).includes(rot.id) && !Array.isArray((MO.variantes_oferta || {})[rot.id])) { lista.forEach((_, i) => out.add(i)); return out; } // roteiro 100% de oferta
    if (!((MO.fases_roteiro || []).includes(rot.fase) || (MO.roteiros_ids || []).includes(rot.id))) return out;
    const exp = (MO.variantes_oferta || {})[rot.id], marcas = (MO.marcas_oferta || []).map(norm).filter(Boolean);
    lista.forEach((tx, i) => { if (Array.isArray(exp) ? exp.includes(i + 1) : marcas.some((m) => norm(tx).includes(m))) out.add(i); });
    return out;
  }
  // ---------- v2.3.12 · Thompson Sampling (sorteio Beta, JS puro) ----------
  // Cada variante é um "braço": vendas = acertos, usos - vendas = erros. Sorteia-se uma taxa de cada Beta(vendas+a0, falhas+b0)
  // e a maior sorteada vai na frente. Quem tem pouco dado ainda aparece de vez em quando (explora); quem prova que vende
  // passa a vir quase sempre primeiro. O sorteio usa semente (sala + roteiro + dia): a ordem NÃO muda a cada redesenho.
  function semente(txt) { let h = 2166136261 >>> 0; for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function aleatorio(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function normal(rnd) { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); }
  // Gamma(forma, 1) pelo método de Marsaglia-Tsang
  function gama(forma, rnd) {
    if (forma < 1) return gama(forma + 1, rnd) * Math.pow(1 - rnd(), 1 / forma);
    const d = forma - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v; do { x = normal(rnd); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; const u = 1 - rnd();
      if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  function amostrarBeta(alfa, beta, rnd) { const x = gama(alfa, rnd), y = gama(beta, rnd); return x / (x + y); }
  // ---------- v2.2 · ordem automática das variantes ----------
  // 1) Com min_usos do roteiro na conta em 7 dias, a variante que mais converteu vira a 1ª.
  // 2) Variante já usada com ESTE fã (coach_historico) sai do carrossel; se todas já foram usadas, voltam todas.
  // Devolve os índices originais (é o índice original + 1 que vai para p_variante).
  function ordenarVariantes(n, rotId, convVar, hist, R, seedTxt, oferta) {
    let ordem = Array.from({ length: n }, (_, i) => i), melhor = null, ocultas = [], sorteou = false;
    const A = R.variantes_auto;
    if (A && Array.isArray(convVar) && rotId) {
      const ls = convVar.filter((x) => x.roteiro_id === rotId && (!x.modo || x.modo === (R._modo || "normal")) && x.variante >= 1 && x.variante <= n);
      if (ls.reduce((a, x) => a + (Number(x.usos) || 0), 0) >= A.min_usos) {
        const cand = ls.filter((x) => Number(x.usos) >= (A.min_usos_variante || 1)).map((x) => ({ i: x.variante - 1, usos: Number(x.usos), vendas: Number(x.vendas) || 0, conv: (Number(x.vendas) || 0) / Number(x.usos) })).sort((a, b) => b.conv - a.conv || b.usos - a.usos);
        if (cand.length && cand[0].vendas > 0) { melhor = cand[0]; ordem = [melhor.i].concat(ordem.filter((i) => i !== melhor.i)); }
        if (A.algoritmo === "thompson") {
          // Thompson Sampling: TODAS as variantes entram (as sem dado são Beta(1,1) e ainda podem ser sorteadas na frente)
          // a "crença inicial" de cada variante é a taxa média do roteiro inteiro (peso forca_prior): quem não tem dado
          // parte da média do roteiro em vez de um chute de 50%, e não passa na frente de quem já provou que vende
          const rnd = aleatorio(semente(String(seedTxt || rotId))), por = new Map(ls.map((x) => [x.variante - 1, x]));
          const totU = ls.reduce((a, x) => a + (Number(x.usos) || 0), 0), totV = ls.reduce((a, x) => a + Math.min(Number(x.usos) || 0, Number(x.vendas) || 0), 0);
          const k = Number.isFinite(A.forca_prior) ? A.forca_prior : 4, p0 = (totV + 1) / (totU + 2), a0 = Math.max(0.05, k * p0), b0 = Math.max(0.05, k * (1 - p0));
          const sorteio = Array.from({ length: n }, (_, i) => { const x = por.get(i), us = x ? Number(x.usos) || 0 : 0, ve = x ? Math.min(us, Number(x.vendas) || 0) : 0; return { i, v: amostrarBeta(ve + a0, us - ve + b0, rnd) }; });
          // momento de ofertar: as variantes de oferta ganham peso na taxa sorteada (boost forte, mas ainda sorteado)
          const peso = oferta && oferta.marcadas && oferta.marcadas.size ? Number(oferta.peso) || 1 : 1;
          sorteio.forEach((x) => { if (peso !== 1 && oferta.marcadas.has(x.i)) x.v *= peso; });
          ordem = sorteio.sort((a, b) => b.v - a.v || a.i - b.i).map((x) => x.i); sorteou = true;
        }
      }
    }
    // sem dados para sortear (menos de min_usos): no momento de ofertar as variantes de oferta só sobem na ordem, mantendo a ordem original entre elas
    if (!sorteou && oferta && oferta.marcadas && oferta.marcadas.size) ordem = ordem.filter((i) => oferta.marcadas.has(i)).concat(ordem.filter((i) => !oferta.marcadas.has(i)));
    if (Array.isArray(hist) && rotId) {
      const usadas = new Set(hist.filter((h) => h.roteiro_id === rotId && !h.local && h.variante >= 1).map((h) => h.variante - 1));
      const livres = ordem.filter((i) => !usadas.has(i));
      if (livres.length && livres.length < ordem.length) { ocultas = ordem.filter((i) => usadas.has(i)); ordem = livres; }
    }
    return { ordem, melhor, ocultas };
  }
  // ---------- v2.2 · mensagem em massa do dia (muda todo dia, cada conta com uma diferente, sem repetir até usar todas) ----------
  function massaDoDia(ROT, agora, conta, contas) {
    const B = ROT && ROT.massa_dia, ms = B && Array.isArray(B.mensagens) ? B.mensagens : []; if (!ms.length) return null;
    const d = diaSP(agora || Date.now()), nDia = Math.floor(Date.UTC(d.y, d.m - 1, d.d) / DIA);
    const pos = Math.max(0, (contas || []).indexOf(conta)), salto = Math.floor(ms.length / Math.max(1, (contas || []).length || 1));
    const i = (nDia + pos * salto) % ms.length;
    return { n: i + 1, total: ms.length, texto: ms[i] };
  }

  function calcular(ctx, R0, ROT, CN) {
    const R = aplicarModo(R0, ctx.modo), dom = ehDom(R);
    const c = contexto(ctx, R), sl = selos(c, R), fz = fase(c, R, sl), pr = preco(c, R, sl, fz);
    let jg = dom ? jogadaDom(c, R, sl, fz, pr) : jogada(c, R, sl, fz, pr), rc = recursos(c, R, sl, fz, pr), rl = relogio(c, R);
    const al = alertas(ctx.texto || "", c, R).concat(revisor(ctx.texto || "", c, fz, R)).sort((a, b) => ({ bloqueio_visual: 0, aviso: 1, revisor: 2, info: 3 })[a.nivel] - ({ bloqueio_visual: 0, aviso: 1, revisor: 2, info: 3 })[b.nivel]);
    const pf = dom ? perfil(c, R) : null, ses = sessao(c, R);
    if (dom && ses && ses.completa && fz.id === "pos_compra" && (fz.aftercare === "brinde" || (ses.valor >= R.sessao.brinde_acima_brl && c.cfg.brinde_pos_sessao))) rc.push({ id: "brinde", txt: "Brinde grátis pós-sessão (R$500+)", aviso: "Só depois do aftercare, nunca no meio da sequência.", roteiro: "PC_BRINDE" });
    if (dom && c.cfg.mimo_ativo && fz.aftercare === "mimo") rc.push({ id: "mimo_ativo", txt: "Mimo (pedido honesto)", aviso: "Uma vez, como agradecimento. Nada de emergência ou culpa.", roteiro: "FT_MIMO_AGRADECER" });
    let rot = ROT ? (ROT.roteiros || []).find((r) => r.id === jg.roteiro) || null : null;
    const mo = momentoOfertar(c, R, fz), sug = sugestaoOferta(mo, rot, R, ROT, fz);
    // o operador clicou em "Ver roteiro de oferta" (painel): mostra esse roteiro no lugar do atual; some sozinho quando o momento passa
    const verOferta = !!(sug && c.roteiroOferta === sug.id);
    if (verOferta) { jg = Object.assign({}, jg, { roteiro: sug.id, txt: jg.txt + " · roteiro de oferta (" + sug.id + ")" }); rot = (ROT.roteiros || []).find((r) => r.id === sug.id) || rot; }
    const todas = rot ? (dom && rot.dominante && rot.dominante.length ? rot.dominante : rot.variantes) : [];
    const dSP = diaSP(c.agora), marcOf = mo && rot ? variantesOferta(rot, todas, R) : new Set();
    const po = mo ? pesoOferta(R, c.momentoStats) : null;
    const ov = ordenarVariantes(todas.length, rot ? rot.id : null, c.convVar, c.hist, R, [c.conv && c.conv.sala, rot && rot.id, dSP.y, dSP.m, dSP.d, R._modo].join("|"), marcOf.size ? { marcadas: marcOf, peso: po.peso } : null), variantes = ov.ordem.map((i) => todas[i]);
    const m7 = meta7(c, R), tr = tier(c, R), pv = previsao(c, R);
    if (pv && pv.cara && !tem(sl, "baleia")) sl.unshift({ id: "cara_baleia", txt: "🐋 Cara de Baleia · proj. R$ " + Math.round(pv.previsao_30d_brl).toLocaleString("pt-BR") + "/mês", origem: "BASE", dica: pv.motivo + " (gasto dos 7 primeiros dias × " + String(pv.fator).replace(".", ",") + ")" });
    if (fz.tipo === "freio_gasto") sl.push({ id: "freio", txt: "Freio", origem: "CONSENSO", dica: "ele disse que gastou demais: segura o preço" });
    const rotuloFase = (dom && R._dom.rotulos_fase && R._dom.rotulos_fase[fz.id]) || null;
    if (sl && dom) { if (pf) sl.push({ id: "perfil", txt: pf.rotulo, origem: "CONSENSO", dica: pf.dica + " · " + pf.fonte }); if (fz.id === "descanso") sl.push({ id: "descanso", txt: "Descanso", origem: "CONSENSO" }); if (fz.ruim) sl.push({ id: "ruim", txt: "Sinal ruim", origem: "CONSENSO" }); if (c.compraSutil.length) sl.push({ id: "sutil", txt: "Sinal sutil", origem: "CONSENSO", dica: c.compraSutil.join(", ") }); }
    const extras = dom ? { espelho: espelho(c), termometro: termometro(c, R), perfil: pf, calendario: calendario(c, R), sessao: ses, cena: cena(c, R, CN, pr, pf), repetido: repetido(jg.roteiro, c.hist) } : { sessao: ses, repetido: repetido(jg.roteiro, c.hist) };
    const comprando = fz.id === "pos_compra" || pr.tipo === "sequencia" || !!(c.ultCompraEm && c.agora - c.ultCompraEm <= 6 * HORA);
    extras.dados = dadosFa(c.notasTxt, c.doFa.map((m) => m.texto).join(" \n "));
    extras.escada = fz.id !== "vulneravel" && fz.tipo !== "freio_gasto" && (dom || comprando) ? escada(pr, c, R, 3) : null;
    extras.momentoOfertar = mo ? Object.assign({}, mo, { variantes: [...marcOf], peso: po.peso, pesoAprendido: po.aprendido }) : null; extras.sugestaoOferta = sug ? Object.assign({}, sug, { aplicada: verOferta }) : null; extras.previsao = pv; extras.variantesIdx = ov.ordem; extras.variantesInfo = { melhor: ov.melhor, ocultas: ov.ocultas, total: todas.length }; extras.boasVindas = c.soBoasVindas;
    extras.ppvEstadoTela = c.fontePpv === "tela" && !!c.ppvs && c.ppvs.some((p) => p.comprado !== null);
    return Object.assign(extras, { modo: R._modo, fase: fz, rotuloFase, selos: sl, jogada: jg, roteiro: rot, variantes, preco: pr, recursos: rc, alertas: al, relogio: rl, hud: hud(c, R, sl, rl, m7, fz), meta7: m7, tier: tr ? { id: tr.id, rotulo: tr.rotulo } : null, ppvFonte: c.fontePpv, nome: c.nome, ctx: { msgsFaDesdePpv: c.msgsFaDesdePpv, gapFa_s: c.gapFa_s, total: c.total, gasto7: c.gasto7, ultCompraValor: c.ultCompraValor } });
  }

  // ---------- v2.7.0 · saudação rápida de quem acabou de chegar ----------
  // "Só a mensagem automática da modelo na conversa" = o fã entrou, recebeu o automático e ainda não falou.
  // Vale para 1 mensagem (ou poucas, R.saudacao.ate_n) e NENHUMA delas do fã.
  function chegouAgora(msgs, R) {
    const S = (R && R.saudacao) || {};
    if (S.ativo === false) return false;
    const ms = Array.isArray(msgs) ? msgs : [];
    if (!ms.length || ms.length > (S.ate_n || 1)) return false;
    return !ms.some((m) => m && m.de_fa);
  }
  // Primeiro nome limpo para o {nome}: tira emoji, número, pontuação e sobrenome. Sem nome usável, devolve "".
  function primeiroNome(nome) {
    const limpo = String(nome || "")
      .replace(/[\p{Extended_Pictographic}️‍]/gu, " ")      // emoji
      .replace(/[^\p{L}\s'-]/gu, " ")                                   // número, pontuação, símbolo
      .replace(/\s+/g, " ").trim();
    const p = limpo.split(" ").find((x) => x.replace(/[^\p{L}]/gu, "").length >= 2) || "";
    if (!p) return "";
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }
  // Textos da saudação, com o {nome} já preenchido (vêm do coach_regras.json, não chumbados aqui).
  function saudacoes(nome, R) {
    const S = (R && R.saudacao) || {}, pn = primeiroNome(nome);
    return (S.textos || []).map((t) => String(t).replace(/\{nome\}/g, pn).replace(/\s{2,}/g, " ").trim())
      .map((t) => t.replace(/\s+([!?,.])/g, "$1")).filter(Boolean);
  }

  const API = { chegouAgora, primeiroNome, saudacoes, momentoOfertar, sugestaoOferta, variantesOferta, pesoOferta, construirAC, buscarAC, varrerRisco, previsao, ordenarVariantes, amostrarBeta, aleatorio, semente, massaDoDia, sumiuMeio, dadosFa, escada, sessao, espelho, termometro, perfil, calendario, quintoDiaUtil, revisor, fila, repetido, conversaoSemana, cena, aplicarModo, nomeModo, tier, meta7, hud, placar, arredCima, arredBaixo, norm, casa, arred90, valoresReais, contexto, selos, fase, preco, recursos, jogada, alertas, relogio, calcular, preencher, fmtSeg, brl, emNobre };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else raiz.CoachMotor = API;
})(typeof self !== "undefined" ? self : this);
