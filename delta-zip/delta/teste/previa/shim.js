// "chrome" de mentira para a prévia local (teste/previa/servidor.mjs). Só existe na prévia: a extensão não usa este arquivo.
// Simula: storage, mensagens do leitor (uma conversa de mentira por cenário), janelas e as respostas do banco e da IA.
(() => {
  const q = new URLSearchParams(location.search), conta = q.get("conta") || "arrudafree", cena = q.get("c") || "vip";
  const palco = q.get("palco") === "1"; // v2.3: Privacy 1030 px + Delta 410 px (teste/previa/palco.html)
  const store = { sessao: { acesso: "token-de-mentira", renova: "r", expira: Date.now() + 3600e3, email: "teste@exemplo.test" }, origem: 1, mini: !palco && q.get("mini") === "1", acoplado: true, som: false, palco, contaDoPerfil: conta };
  if (q.get("modo")) store.modo = q.get("modo");
  const ouvintes = [], t0 = Math.floor(Date.now() / 1000);
  const id = (seg, n) => (t0 - seg).toString(16).padStart(8, "0") + String(n).padStart(16, "0");
  const hhmm = (seg) => new Date(Date.now() - seg * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const SALA = "65f0a1b2c3d4e5f601020304";
  const msg = (seg, fa, texto, extra) => Object.assign({ id: id(seg, Math.round(seg) % 9973), de_fa: fa, em: (t0 - seg) * 1000, tipo: "texto", texto }, extra || {});

  const CENAS = {
    vip: { nome: "Carlos Mendes", total: 1840.5, n: 14,
      notas: ["profissao: engenheiro", "recebe dia 5", "gosta de conversar antes de comprar"], tags: ["pede desconto"],
      ultimas: [{ data: new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10), valor: 10, tipo: "Mimo - Chat" }, { data: new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 10), valor: 189.9, tipo: "Chat" }, { data: new Date(Date.now() - 9 * 86400e3).toISOString().slice(0, 10), valor: 120, tipo: "Chat" }],
      dias_sem: 2, por: 2,
      msgs: [msg(9000, false, "senti sua falta, Carlos 😘"), msg(8800, true, "tava viajando a trabalho"), msg(8700, true, "obra nova em Recife"), msg(3000, false, "e deu tudo certo lá?"), msg(1500, true, "deu sim, cheguei hoje"), msg(1400, true, "queria ver aquele que você falou")] },
    novo: { nome: "João Teste", total: 0, n: 0, notas: [], tags: [], ultimas: [], dias_sem: null, por: 0,
      msgs: Array.from({ length: 20 }, (_, i) => msg(3000 - i * 120, true, ["dia cheio hoje", "muito serviço", "cheguei tarde", "tô cansado", "semana longa"][i % 5])).concat([msg(500, false, "oi amor, tudo bem? 😘"), msg(300, true, "oi linda"), msg(200, false, "que bom te ver aqui"), msg(160, true, "cheguei do trabalho agora"), msg(120, true, "hoje foi puxado"), msg(80, true, "queria relaxar um pouco"), msg(60, true, "bem que eu merecia"), msg(40, true, "conversar contigo ajuda"), msg(25, true, "você é diferente")]) },
    ppv: { nome: "Rafa Moreira", total: 320, n: 5, notas: ["time: flamengo"], tags: [],
      ultimas: [{ data: new Date(Date.now() - 86400e3).toISOString().slice(0, 10), valor: 79.9, tipo: "Chat" }], dias_sem: 1, por: 1,
      msgs: [msg(4000, true, "oi"), msg(3900, false, "oi Rafa 😏"), msg(3000, true, "tem novidade?"), msg(2400, true, "tô curioso"), msg(1000, true, "manda"), msg(700, false, "olha o que eu separei pra você", { ppv: true, comprado: false, preco: 129.9, tipo: "ppv" })],
      ppvs: [{ id: id(700, 700), preco: "129.90", em: new Date((t0 - 700) * 1000).toISOString(), pago: false, pago_em: "" }] },
    vazio: null
  };
  const c = CENAS[cena];
  const salas = [
    c ? { sala: SALA, perfil: "fa_aberto", nome: c.nome, ultima: (c.msgs[c.msgs.length - 1] || {}).texto || "", hora: hhmm(60), naoLidas: 0, nossa: false, gasto: c.total || null, online: true, aberta: true } : null,
    { sala: "65f0a1b2c3d4e5f601020311", perfil: "dante", nome: "Dante", ultima: "Vida? Rs", hora: hhmm(760), naoLidas: 4, nossa: false, gasto: 210.4, online: true, aberta: false },
    { sala: "65f0a1b2c3d4e5f601020312", perfil: "socram", nome: "Socram", ultima: "Boa noite, aprontando o quê?", hora: hhmm(1900), naoLidas: 3, nossa: false, gasto: null, online: false, aberta: false },
    { sala: "65f0a1b2c3d4e5f601020313", perfil: "piter", nome: "Piter", ultima: "Bom dia meu amor", hora: "Ontem", naoLidas: 1, nossa: false, gasto: 1320, online: false, aberta: false },
    { sala: "65f0a1b2c3d4e5f601020314", perfil: "santos", nome: "Santos", ultima: "te mandei", hora: hhmm(300), naoLidas: 0, nossa: true, gasto: 45, online: true, aberta: false }
  ].filter(Boolean);
  const estado = () => ({ t: "coach_estado", conta, conv: c ? { cid: 123456, perfil: "fa_aberto", nome: c.nome, sala: SALA, total: c.total || null } : null, salas,
    msgs: c ? c.msgs : [], ppvs: c && c.ppvs ? c.ppvs : [], diag: { vistas: c ? c.msgs.length : 0, lidas: c ? c.msgs.length : 0, avisos: 0, sem_id: 0, sala: !!c }, texto: q.get("texto") || "", visivel: true });

  const pega = async (k) => { const ks = k == null ? Object.keys(store) : Array.isArray(k) ? k : [k]; const o = {}; ks.forEach((x) => { if (x in store) o[x] = store[x]; }); return o; };
  const entrega = () => ouvintes.forEach((f) => { try { f(estado(), { tab: { windowId: 1, active: true } }, () => {}); } catch (e) { console.error(e); } });
  window.chrome = {
    storage: { local: { get: pega, set: async (o) => { Object.assign(store, o); }, remove: async (k) => { (Array.isArray(k) ? k : [k]).forEach((x) => delete store[x]); } }, onChanged: { addListener() {} } },
    runtime: { onMessage: { addListener: (f) => ouvintes.push(f) }, sendMessage: async () => ({}), getURL: (p) => "/coach-ext/" + p, lastError: null },
    tabs: { query: (_q, cb) => cb([{ id: 1, windowId: 1, active: true }]), sendMessage: (_i, _m, cb) => { setTimeout(() => { entrega(); if (cb) cb({ ok: true }); }, 60); }, onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
    windows: palco
      ? { getCurrent: async () => ({ id: 9, left: 1030, top: 0, width: 410, height: 860 }), get: async () => ({ id: 1, left: 0, top: 0, width: 1030, height: 860, type: "app" }), update: async () => ({}), onBoundsChanged: { addListener() {} } }
      : { getCurrent: async () => ({ id: 9, left: 0, top: 665, width: innerWidth, height: innerHeight + 38 }), get: async () => ({ id: 1, left: 0, top: 0, width: 480, height: 665, type: "app" }), update: async () => ({}), onBoundsChanged: { addListener() {} } }
  };
  window.__previa = { store, entrega, estado };

  // banco e IA de mentira
  const notas = c ? c.notas.map((t, i) => ({ id: i + 1, texto: t, em: new Date().toISOString() })) : [];
  const RPC = {
    painel_abrir: (a) => c ? { fa: { id: 777, cid: a.p_cid, nome: c.nome }, conta, total: c.total, n: c.n, dias_sem: c.dias_sem, mediana: 120, maior: 189.9, por_conta: Array.from({ length: c.por }, (_, i) => ({ conta: i ? "louisefree" : conta, gasto: i ? 300 : c.total - (c.por > 1 ? 300 : 0), n: i ? 2 : c.n })), notas, tags: c.tags.map((t, i) => ({ id: 90 + i, texto: t })), ultimas: c.ultimas.map((x) => Object.assign({ conta }, x)), msgs: { guardadas: 0 } } : { erro: "sem_codigo" },
    painel_nota: (a) => { notas.unshift({ id: notas.length + 1, texto: a.p_texto, em: new Date().toISOString() }); return { notas, tags: c ? c.tags.map((t, i) => ({ id: 90 + i, texto: t })) : [] }; },
    painel_fila: () => [{ perfil: "dante", total: 210.4, n: 3, msgs_nossas: 9 }, { perfil: "piter", total: 1320, n: 12, msgs_nossas: 40, selo: "VIP rápido" }],
    painel_sumidos: () => [{ nome: "Sumido Um", dias: 45, na_conta: 200, total: 1200, perfil: "s1" }],
    painel_ppvs: () => 1,
    // v2.3.6 (funções do Aura): ?sonome=1 simula ficha ligada ao comprador só pelo nome
    painel_extra: () => ({ provavel: q.get("sonome") === "1", comprou: !!(c && c.total) }),
    painel_dia: () => ({ media_seg: 154, n: 12 }),
    painel_msgs: (a) => (Array.isArray(a.p_msgs) ? a.p_msgs.length : 0),
    // histórico salvo de mentira: 2 mensagens antigas que já não estão na tela
    coach_conversa: () => c ? [{ msg_id: id(90000, 1), de_fa: true, em: new Date((t0 - 90000) * 1000).toISOString(), tipo: "texto", texto: "semana passada falei que torço pro Sport" }, { msg_id: id(89000, 2), de_fa: false, em: new Date((t0 - 89000) * 1000).toISOString(), tipo: "texto", texto: "Sport? então você aguenta sofrer kkk" }] : [],
    coach_ppvs: () => [], coach_historico: () => [], coach_conversao_semana: () => [], coach_conversao_variantes: () => [],
    coach_placar: () => ["arrudafree", "xlunavitaligratis", "louisefree"].map((x, i) => ({ conta: x, receita: [310, 420, 95][i], vendas: [6, 7, 2][i], ppvs: [15, 14, 9][i], jogadas: [22, 18, 7][i] })),
    coach_placar_chatter: () => [{ eu: true, chatter: "você", jogadas: 22, salas: 9, vendas: 6, receita: 310 }],
    coach_radar: (a) => ["arrudafree", "xlunavitaligratis", "louisefree"].map((x, i) => x === a.p_conta ? { conta: x, estado: a.p_estado || {}, atualizado_em: new Date().toISOString(), offline: false }
      : !palco && i === 2 ? { conta: x, estado: {}, atualizado_em: null, offline: true }
      : { conta: x, estado: [{ vips_esperando: 0, maior_espera_s: 95, baleias_online: 0, fu_vencidos: 0, nao_lidas: 3, chats_h: 9 }, { vips_esperando: 2, maior_espera_s: 250, baleias_online: 1, fu_vencidos: 0, nao_lidas: 7, chats_h: 12 }, { vips_esperando: 0, maior_espera_s: 40, baleias_online: 0, fu_vencidos: 0, nao_lidas: 4, chats_h: 5 }][i], atualizado_em: new Date().toISOString(), offline: false }),
    coach_registrar_jogada: () => 4242, coach_memoria: () => 2, coach_ex_assinantes: () => [{ fa_id: 1, nome: "Ex Baleia", perfil: "ex1", total: 3000, na_conta: 900, compras: 7, ultima: "2026-08-01", dias: 101 }],
    coach_relatorio_turno: (a) => ({ horas: a.p_horas, inicio: new Date(Date.now() - 8 * 3600e3).toISOString(), fim: new Date().toISOString(), jogadas: 22, salas: 9, vendas: 6, receita: 310, ppvs: 15, top_roteiros: [{ roteiro_id: "VD_ENTRADA_DOM", usos: 6, vendas: 3, receita: 180 }], grandes: [{ nome: "Carlos", total: 1840.5, baleia: false }] })
  };
  const fetch0 = window.fetch.bind(window);
  window.fetch = async (url, opt) => {
    const u = String(url);
    if (!/supabase\.co/.test(u)) return fetch0(url, opt);
    let a = {}; try { a = JSON.parse((opt && opt.body) || "{}"); } catch (_) {}
    const ok = (corpo, st) => new Response(JSON.stringify(corpo), { status: st || 200, headers: { "content-type": "application/json" } });
    if (/\/functions\/v1\/coach-ia/.test(u)) { await new Promise((r) => setTimeout(r, 700)); return ok({ leitura: "Disse que chegou hoje de uma obra em Recife e quer ver o conteúdo que você comentou.", versoes: ["Depois de um dia puxado você merece relaxar comigo 😏 esse eu separei pra você começar ({qtd_conteudo})", "Me chama no whatsapp que eu te mando por lá", "Dia cheio pede coisa boa. Abre esse e me diz se relaxou 😈 ({qtd_conteudo})", "Você trabalhou demais hoje. Deixa que agora eu cuido de você 😏 ({qtd_conteudo})"], memoria: { nome: c ? c.nome.split(" ")[0] : "", trabalho: "obra / engenharia", horarios: "à noite, depois do trabalho", fetiches: "", dia_pagamento: "", recusas: "" } }); }
    const m = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(u);
    if (m && RPC[m[1]]) return ok(RPC[m[1]](a));
    return ok(m ? [] : { message: "rota não simulada" }, m ? 200 : 400);
  };
})();
