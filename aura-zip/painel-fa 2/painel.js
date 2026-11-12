// Painel lateral. Mostra a ficha do fã da conversa aberta e guarda o que você anota.
// Fala apenas com o seu banco. Nunca fala com a Privacy e nunca envia mensagem a fã.

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : document.createTextNode(String(f)));
  return e;
}
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (iso) => { if (!iso) return ""; const [a, m, d] = String(iso).slice(0, 10).split("-"); return d + "/" + m + (a ? "/" + a.slice(2) : ""); };
const diaHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

// ---------- login e banco ----------
let sessao = null;
async function guardarSessao(s) { sessao = s; await chrome.storage.local.set({ sessao: s }); }
async function pedirAuth(tipo, corpo) {
  const r = await fetch(CFG.url + "/auth/v1/token?grant_type=" + tipo, {
    method: "POST", headers: { apikey: CFG.chave, "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || "não foi possível entrar");
  await guardarSessao({ acesso: j.access_token, renova: j.refresh_token, expira: Date.now() + j.expires_in * 1000, email: j.user && j.user.email });
}
let renovando = null;
async function acesso() {
  if (!sessao) throw new Error("sem login");
  if (Date.now() > sessao.expira - 60000) {
    renovando = renovando || pedirAuth("refresh_token", { refresh_token: sessao.renova }).finally(() => { renovando = null; });
    try { await renovando; } catch (e) { await sair(); throw e; }
  }
  return sessao.acesso;
}
async function rpc(nome, args) {
  const t = await acesso();
  const r = await fetch(CFG.url + "/rest/v1/rpc/" + nome, {
    method: "POST", headers: { apikey: CFG.chave, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify(args || {})
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && (j.message || j.hint)) || "erro " + r.status);
  return j;
}
async function sair() { sessao = null; await chrome.storage.local.remove("sessao"); mostrarTela(); }

// ---------- estado ----------
let est = null, ficha = null, fichaChave = "", fichaErro = "", minhaJanela = null, abaAtual = "ficha";
const infoLista = new Map();   // perfil -> dados do banco (ou null se desconhecido)
const pendentes = new Map();   // sala -> { conta, msgs[] } esperando a ficha para gravar
const salaFa = new Map();      // sala -> id do fã
let sumidos = null, sumidosConta = "";
let extra = null, extraChave = "", medDia = null, diaConta = "";
const espera = new Map();      // sala -> { chave, desde (ms ou null), exato }
const ppvsEnviados = new Map(); // sala -> JSON dos PPVs já gravados
// Regras do cronômetro e do preço (mude aqui se quiser outros números)
const VERDE_ATE = 5 * 60, AMARELO_ATE = 15 * 60;          // segundos de espera do fã
const FAIXA_MIN = 1.38, FAIXA_MAX = 1.70, TETO = 2, TIPICO = 1.17; // sobre o último valor pago
const FOLLOW_MAX = 5;

function selo(texto, cor) { const s = $("selo"); s.textContent = texto; s.className = "selo " + (cor || "cinza"); }
function mostrarTela() {
  $("telaLogin").hidden = !!sessao; $("telaApp").hidden = !sessao;
  if (!sessao) selo("sem login"); else desenhar();
}

chrome.runtime.onMessage.addListener((m, quem, responder) => {
  if (!m || m.t !== "estado" || !quem.tab) return;
  if (!sessao || !quem.tab.active || !m.visivel || (minhaJanela != null && quem.tab.windowId !== minhaJanela)) { responder({ ok: false }); return; }
  if (m.novas && m.novas.length && m.conv && m.conv.sala) {
    const p = pendentes.get(m.conv.sala) || { conta: m.conta, msgs: [] };
    p.msgs.push(...m.novas); pendentes.set(m.conv.sala, p);
  }
  responder({ ok: true, msgs: true });
  receber(m);
});

function horaDaLista(h) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h || "");
  if (!m) return null; // a lista mostra data em vez de hora: mensagem de outro dia
  const d = new Date(); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);
  return d.getTime();
}
function atualizarEspera(m, primeiraVez) {
  const vivas = new Set();
  for (const s of m.salas) {
    vivas.add(s.sala);
    if (s.nossa) { espera.set(s.sala, { chave: "nossa", desde: null, nossa: true }); continue; }
    const chave = s.ultima + "|" + s.hora, ant = espera.get(s.sala);
    if (ant && ant.chave === chave) continue;
    // Se o painel já estava olhando esta conversa e a última mensagem mudou, a mensagem chegou agora.
    if (ant && !primeiraVez) espera.set(s.sala, { chave, desde: Date.now(), exato: true });
    else espera.set(s.sala, { chave, desde: horaDaLista(s.hora), exato: false });
  }
  // Na conversa aberta o horário da última mensagem é exato.
  if (m.conv && m.conv.sala && m.conv.ultima && m.conv.ultima.de_fa) {
    const e = espera.get(m.conv.sala);
    if (e && !e.nossa) { e.desde = new Date(m.conv.ultima.em).getTime(); e.exato = true; }
  }
  for (const k of [...espera.keys()]) if (!vivas.has(k)) espera.delete(k);
}

function receber(m) {
  const primeiraVez = !est || est.conta !== m.conta;
  est = m;
  atualizarEspera(m, primeiraVez);
  if (m.saude === "cega") { fichaChave = ""; ficha = null; extra = null; fichaErro = ""; selo("leitura falhou", "laranja"); desenhar(); return; }
  if (m.conv) {
    const chave = [m.conta, m.conv.cid, m.conv.perfil, m.conv.sala, m.conv.total].join("|");
    if (chave !== fichaChave) { fichaChave = chave; abrir(chave); }
    else if (m.conv.sala) { descarregar(m.conv.sala); enviarPpvs(); }
  } else { fichaChave = ""; ficha = null; extra = null; fichaErro = ""; selo("nenhuma conversa aberta"); }
  buscarLista();
  buscarDia();
  desenhar();
}

async function abrir(chave) {
  const c = est.conv;
  if (!ficha || !ficha.fa || ficha.fa.cid !== c.cid) { ficha = null; extra = null; selo("procurando…"); }
  fichaErro = "";
  try {
    const r = await rpc("painel_abrir", { p_conta: est.conta, p_cid: c.cid, p_perfil: c.perfil, p_nome: c.nome, p_sala: c.sala, p_total: c.total });
    if (chave !== fichaChave) return;
    if (r.erro) { ficha = null; fichaErro = r.erro; selo(r.erro === "conta_fora" ? "conta fora do painel" : "não reconhecido", "laranja"); }
    else {
      ficha = r;
      selo(r.novo ? "fã novo, gravado" : r.ligou_agora ? "comprador ligado agora" : "fã encontrado", r.novo ? "laranja" : "verde");
      if (c.sala) { salaFa.set(c.sala, r.fa.id); await descarregar(c.sala, true); await enviarPpvs(true); }
      buscarExtra();
      if (c.perfil) infoLista.delete(c.perfil.toLowerCase());
    }
  } catch (e) { if (chave !== fichaChave) return; ficha = null; fichaErro = "falha: " + e.message; selo("sem conexão", "laranja"); fichaChave = ""; }
  desenhar();
}

async function descarregar(sala, semExtra) {
  const p = pendentes.get(sala), fa = salaFa.get(sala);
  if (!p || !p.msgs.length || !fa) return;
  pendentes.delete(sala);
  try {
    for (let i = 0; i < p.msgs.length; i += 200) await rpc("painel_msgs", { p_conta: p.conta, p_sala: sala, p_fa: fa, p_msgs: p.msgs.slice(i, i + 200) });
    if (!semExtra) { buscarExtra(); buscarDia(true); }
  } catch (_) { const q = pendentes.get(sala) || { conta: p.conta, msgs: [] }; q.msgs.unshift(...p.msgs); pendentes.set(sala, q); }
}

// Grava os PPVs que estão na tela da conversa aberta. Só chama o banco quando algo mudou.
async function enviarPpvs(semExtra) {
  if (!est || !est.conv || !est.conv.sala || !est.ppvs) return;
  const sala = est.conv.sala, fa = salaFa.get(sala), json = JSON.stringify(est.ppvs);
  if (!fa || !est.ppvs.length || ppvsEnviados.get(sala) === json) return;
  ppvsEnviados.set(sala, json);
  try {
    await rpc("painel_ppvs", { p_conta: est.conta, p_sala: sala, p_fa: fa, p_ppvs: est.ppvs });
    if (!semExtra) buscarExtra();
  } catch (_) { ppvsEnviados.delete(sala); }
}

// Preço, selo, follow-up e PPVs do fã da conversa aberta.
async function buscarExtra() {
  if (!ficha || !ficha.fa || !est || !est.conv) return;
  const chave = fichaChave, fa = ficha.fa.id;
  try {
    const r = await rpc("painel_extra", { p_fa: fa, p_conta: est.conta, p_sala: est.conv.sala });
    if (chave !== fichaChave || !ficha || ficha.fa.id !== fa) return;
    extra = r; extraChave = chave; desenhar();
  } catch (_) { /* a ficha continua valendo sem o bloco extra */ }
}

let diaEm = 0;
async function buscarDia(forcar) {
  if (!est || !est.conta || !sessao) return;
  if (!forcar && diaConta === est.conta && Date.now() - diaEm < 120000) return;
  diaConta = est.conta; diaEm = Date.now();
  try { medDia = await rpc("painel_dia", { p_conta: est.conta }); desenharFila(); } catch (_) {}
}

let buscandoLista = false, listaEm = 0;
async function buscarLista(todos) {
  if (buscandoLista || !est || !sessao || !est.conta) return;
  const perfis = [...new Set(est.salas.map((s) => s.perfil && s.perfil.toLowerCase()).filter(Boolean))];
  const pedir = todos ? perfis : perfis.filter((p) => !infoLista.has(p));
  if (!pedir.length) return;
  buscandoLista = true;
  try {
    const r = await rpc("painel_fila", { p_conta: est.conta, p_perfis: pedir });
    pedir.forEach((p) => infoLista.set(p, null));
    (r || []).forEach((x) => infoLista.set(x.perfil, x));
    listaEm = Date.now();
    desenharFila();
  } catch (_) { /* tenta de novo na próxima mudança da lista */ }
  buscandoLista = false;
}
// A cada 90 s atualiza os dados da fila (follow-up e selos mudam). A cada segundo, só o relógio.
setInterval(() => { if (sessao && est && Date.now() - listaEm > 90000) buscarLista(true); }, 15000);
setInterval(() => { if (sessao && abaAtual === "fila") desenharFila(); }, 1000);

// ---------- desenho ----------
function desenhar() {
  if (!sessao) return;
  desenharFicha(); desenharFila(); desenharSumidos(); desenharMais();
}

function nivel(total) {
  if (total >= 1000) return ["Fã\ngrande", "Fã grande"];
  if (total >= 250) return ["Bom", "Bom comprador"];
  if (total > 0) return ["Já\ncomprou", "Comprador"];
  return ["Sem\ncompra", "Sem compra na base"];
}

function dicas(f) {
  const d = [], total = Number(f.total), conta = f.conta;
  const aqui = f.por_conta.find((p) => p.conta === conta), fora = f.por_conta.filter((p) => p.conta !== conta);
  if (total >= 1000) d.push(["Fã grande: já gastou " + brl(total) + " com a empresa. Prioridade."]);
  if (!aqui && fora.length) d.push(["Nunca comprou nesta conta, mas gastou " + fora.map((p) => brl(p.gasto) + " com " + p.conta).join(" e ") + "."]);
  if (f.n > 0) {
    if (f.dias_sem != null && f.dias_sem <= 3) d.push(["Comprou há " + (f.dias_sem === 0 ? "menos de um dia" : f.dias_sem + (f.dias_sem === 1 ? " dia" : " dias")) + ". Está quente."]);
    else if (f.dias_sem >= 30) d.push(["Está há " + f.dias_sem + " dias sem comprar. Vale retomar."]);
    if (f.n >= 2) d.push(["Costuma pagar perto de " + brl(f.mediana) + " por compra e já pagou " + brl(f.maior) + " de uma vez."]);
    else d.push(["Fez uma compra só, de " + brl(f.maior) + "."]);
    if (f.horas.length && f.n >= 3) {
      const h = f.horas[0].h, agora = new Date().getHours(), dist = Math.min(Math.abs(agora - h), 24 - Math.abs(agora - h));
      d.push(["Compra mais por volta das " + h + "h." + (dist <= 1 ? " Agora é um bom horário." : "")]);
    }
    if (f.tipos.length) d.push(["Gasta mais com: " + f.tipos[0].tipo + " (" + brl(f.tipos[0].gasto) + ").", true]);
  } else if (f.fa.comprador === false && !(temExtra() && extra.comprou)) d.push(["Sem compra identificada nos extratos que estão na base.", true]);
  if (f.msgs.desconto >= 2) d.push(["Já falou em desconto ou preço " + f.msgs.desconto + " vezes nas conversas guardadas."]);
  if (f.msgs.personalizado >= 1) d.push(["Já falou em conteúdo personalizado."]);
  if (f.momoi && f.momoi.ultima_em) d.push(["Era fã da Momoi. Última atividade lá: " + dia(f.momoi.ultima_em) + ".", true]);
  return d;
}

const temExtra = () => !!(extra && extraChave === fichaChave && !extra.provavel);
function haQuanto(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "há " + Math.round(s) + " s";
  if (s < 5400) return "há " + Math.round(s / 60) + " min";
  if (s < 172800) return "há " + Math.round(s / 3600) + " h";
  return "há " + Math.round(s / 86400) + " dias";
}
function dicasExtra() {
  if (!temExtra()) return [];
  const d = [], x = extra;
  const comprado = (x.ppvs || []).find((p) => p.comprado && p.comprado_em && Date.now() - new Date(p.comprado_em).getTime() < 60 * 60000);
  if (comprado) d.push(["Recompra quente: comprou um PPV " + haQuanto(comprado.comprado_em) + ". Na base, metade das segundas compras sai em até 49 minutos. É a hora de oferecer o próximo."]);
  if (x.so_conversa) d.push(["Já deixou " + x.recusados + " PPVs sem comprar e nunca comprou. Tende a ser só conversa."]);
  if (!x.comprou && !x.msgs_nossas) d.push(["Fã novo: sem compra na base e sem mensagem nossa guardada.", true]);
  return d;
}
function blocosExtra(a) {
  if (!temExtra()) return;
  const x = extra, u = x.ultimo_pago, p = x.pendente;
  a.append(el("h3", {}, "Preço do próximo PPV"));
  if (u) {
    const v = Number(u.valor), cx = el("div", { class: "caixa cinza" });
    cx.append(el("div", {}, "Último valor pago no chat: ", el("b", {}, brl(v)), el("span", { class: "fraco pequeno" }, " · " + dia(u.em) + (u.fonte === "tela" ? " · visto na tela" : " · do extrato"))));
    cx.append(el("div", { style: "margin-top:6px" }, "Faixa sugerida: ", el("b", {}, brl(v * FAIXA_MIN) + " a " + brl(v * FAIXA_MAX))));
    cx.append(el("div", { class: "fraco pequeno" }, "Nunca acima de " + brl(v * TETO) + " (o dobro). Aumento típico entre duas compras na base: 17%, o que daria " + brl(v * TIPICO) + "."));
    if (x.maior_chat && Number(x.maior_chat) > v) cx.append(el("div", { class: "fraco pequeno" }, "Maior valor que já pagou no chat: " + brl(x.maior_chat) + "."));
    a.append(cx);
    if (p && Number(p.preco) > v * TETO) a.append(el("div", { class: "alerta vermelho" }, "O PPV enviado (" + brl(p.preco) + ") passa do dobro do último valor pago."));
    else if (p && Number(p.preco) > v * FAIXA_MAX) a.append(el("div", { class: "alerta amarelo" }, "O PPV enviado (" + brl(p.preco) + ") está acima da faixa sugerida."));
  } else a.append(el("p", { class: "fraco pequeno", style: "margin:0" }, "Ainda não há compra no chat para servir de base."));

  if (p) {
    const n = Number(p.follow), cheio = n >= FOLLOW_MAX;
    a.append(el("h3", {}, "Follow-up"));
    a.append(el("div", { class: "alerta " + (cheio ? "vermelho" : "amarelo") },
      el("b", {}, "PPV de " + brl(p.preco) + " ainda não pago"), " · enviado " + haQuanto(p.enviado_em), el("br"),
      "Follow-up " + Math.min(n, FOLLOW_MAX) + " de " + FOLLOW_MAX + (cheio ? ". Limite atingido: pare de insistir neste PPV." : "."),
      p.fa_respondeu ? " O fã respondeu depois do PPV." : " O fã ainda não respondeu depois do PPV."));
  }
  if (x.ppvs && x.ppvs.length) {
    a.append(el("h3", {}, "PPVs vistos nesta ficha"));
    a.append(el("ul", { class: "lista" }, x.ppvs.map((q) => el("li", {},
      el("span", { class: "d" }, diaHora(q.enviado_em) + " · " + q.conta + " · ", el("span", { class: q.comprado ? "ok" : "fraco" }, q.comprado ? "pago" : "não pago")),
      el("span", { class: "v" }, brl(q.preco))))));
  }
}

function desenharFicha() {
  const a = $("aba-ficha"); a.replaceChildren();
  if (est && est.saude === "cega") {
    a.append(el("div", { class: "alerta vermelho" }, el("b", {}, "Não estou conseguindo ler a página da Privacy."), el("br"),
      "Há uma conversa aberta, mas não achei o cabeçalho nem a lista. Atualize a aba com F5. Se continuar, a Privacy pode ter mudado a página: me avise."));
    return;
  }
  if (!est) { a.append(el("p", { class: "vazio" }, "Abra a Privacy em privacy.com.br/chat nesta janela e clique numa conversa.")); return; }
  if (!est.conv) { a.append(el("p", { class: "vazio" }, "Clique numa conversa para ver a ficha do fã.")); return; }
  if (fichaErro) {
    const t = fichaErro === "conta_fora" ? "A conta " + (est.conta || "desta aba") + " não faz parte do painel. Nada foi lido nem gravado."
      : fichaErro === "conflito" ? "Os códigos desta conversa não batem com o que está na base. Nada foi gravado. Feche e abra a conversa de novo; se continuar, me avise."
      : fichaErro === "sem_codigo" ? "Não achei o número do chat nem o perfil nesta tela."
      : "Não consegui falar com o banco (" + fichaErro + ").";
    a.append(el("p", { class: "vazio" }, t)); return;
  }
  if (!ficha) { a.append(el("p", { class: "vazio" }, "Procurando " + (est.conv.nome || "o fã") + "…")); return; }
  const f = ficha, total = Number(f.total), naTela = temExtra() && extra.comprou && !f.n, [curto, longo] = nivel(total || (naTela ? 0.01 : 0));

  a.append(el("div", { class: "quem" },
    el("div", { class: "nota-g", title: longo, style: "white-space:pre-line" }, curto),
    el("div", {}, el("div", { class: "nome" }, f.fa.nome || est.conv.nome || "(sem nome)"),
      el("div", { class: "sub" }, f.novo ? "Primeira vez que o painel vê este fã" : f.por_conta.length > 1 ? "Comprou em " + f.por_conta.length + " contas" : f.por_conta.length === 1 ? "Comprou em " + f.por_conta[0].conta : naTela ? "Comprou no chat; ainda não está no extrato" : f.momoi ? "Está na lista da Momoi" : "Sem compras na base"),
      f.fa.outros_nomes ? el("div", { class: "fraco pequeno" }, "Também usou: " + f.fa.outros_nomes) : null,
      temExtra() && extra.selo ? el("div", { style: "margin-top:4px" }, el("span", { class: "selinho " + (extra.selo === "VIP rápido" ? "vip" : "prom") }, extra.selo),
        el("span", { class: "fraco pequeno" }, " " + brl(extra.gasto7) + " nos primeiros 7 dias")) : null)));
  if (extra && extra.provavel) a.append(el("div", { class: "alerta amarelo" }, el("b", {}, "Ligação só por nome."), " As compras desta ficha podem ser de outra pessoa com o mesmo nome. Confirme pelos detalhes antes de confiar. Selo, dicas e faixa de preço ficam desligados."));

  a.append(el("div", { class: "cartoes" },
    el("div", { class: "cartao escuro" }, el("div", { class: "r" }, "Total gasto na empresa"), el("div", { class: "v" }, brl(total))),
    f.por_conta.map((p) => el("div", { class: "cartao" }, el("div", { class: "r" }, p.conta + (p.conta === f.conta ? " (aqui)" : "")), el("div", { class: "v" }, brl(p.gasto)), el("div", { class: "r" }, p.n + (p.n === 1 ? " compra" : " compras"))))));

  blocosExtra(a);
  if (f.total_tela != null && f.fa.comprador && f.por_conta.length) {
    const aqui = f.por_conta.find((p) => p.conta === f.conta), base = aqui ? Number(aqui.gasto) : 0;
    if (Math.abs(base - Number(f.total_tela)) > 0.009) a.append(el("p", { class: "fraco pequeno" }, "A Privacy mostra " + brl(f.total_tela) + " nesta conta; a base tem " + brl(base) + ". A diferença costuma ser compra fora do período do extrato."));
  }

  if (f.candidatos && f.candidatos.length) {
    a.append(el("h3", {}, "Pode ser este comprador"));
    const cx = el("div", { class: "caixa" });
    cx.append(el("p", { class: "pequeno", style: "margin:0 0 6px" }, f.total_tela == null
      ? "Achei comprador com o mesmo nome. Abra “Detalhes” na Privacy: se o total gasto bater, eu ligo sozinho."
      : "O nome bate, mas o total gasto não é igual ao do extrato. Se você tem certeza, confirme."));
    f.candidatos.slice(0, 5).forEach((c) => cx.append(el("div", { class: "nota" },
      el("div", {}, el("b", {}, c.nome), el("small", {}, brl(c.na_conta) + " nesta conta · " + brl(c.total) + " no total · última " + dia(c.ultima))),
      el("button", { class: "btn mini", onclick: async (ev) => { ev.target.disabled = true; try { const r = await rpc("painel_ligar", { p_fa: f.fa.id, p_comprador: c.comprador }); ficha = Object.assign({}, f, r, { candidatos: [], ligou_agora: true }); selo("comprador ligado agora", "verde"); } catch (e) { fichaErro = ""; alertar(e.message); } desenhar(); } }, "É este"))));
    a.append(cx);
  }

  const ds = extra && extra.provavel ? [] : dicasExtra().concat(dicas(f));
  if (ds.length) { a.append(el("h3", {}, "Dicas para este atendimento")); a.append(el("ul", { class: "dicas" }, ds.map(([t, neutra]) => el("li", { class: neutra ? "neutra" : "" }, t)))); }

  a.append(el("h3", {}, "O que você já sabe dele"));
  const tags = el("div", { class: "tags" }, f.tags.map((t) => el("span", { class: "tag" }, t.texto, el("button", { title: "apagar", onclick: () => apagarNota(t.id) }, "×"))));
  a.append(tags, formulario("Nova tag (ex.: pede desconto)", "tag"));
  f.notas.forEach((n) => a.append(el("div", { class: "nota" }, el("div", {}, n.texto, el("small", {}, diaHora(n.em))), el("button", { title: "apagar", onclick: () => apagarNota(n.id) }, "×"))));
  a.append(formulario("Nova nota", "nota"));

  if (f.momoi) {
    a.append(el("h3", {}, "Na Momoi"));
    const cx = el("div", { class: "caixa cinza" });
    cx.append(el("div", { class: "pequeno fraco" }, "Última atividade: " + (dia(f.momoi.ultima_em) || "sem data") + (f.momoi.msgs_lidas ? " · " + f.momoi.msgs_lidas + " mensagens lidas" : " · conversa não lida")));
    (f.momoi.ultimas || []).slice().reverse().forEach((m) => cx.append(el("div", { class: "msg" + (/^f/i.test(m.de || "") ? " fa" : "") }, m.texto)));
    a.append(cx);
  }

  if (f.ultimas.length) {
    a.append(el("h3", {}, "Últimas compras"));
    a.append(el("ul", { class: "lista" }, f.ultimas.map((c) => el("li", {}, el("span", { class: "d" }, dia(c.data) + " · " + (c.tipo || "compra") + " · " + c.conta), el("span", { class: "v" }, brl(c.valor))))));
  }

  a.append(el("h3", {}, "Sugestão de resposta"));
  a.append(el("div", { class: "caixa cinza" }, el("p", { class: "pequeno fraco", style: "margin:0 0 8px" }, "A sugestão por IA está desligada. Ela só entra quando você tiver uma conta de IA e pedir para ligar."), el("button", { class: "btn", disabled: true }, "Pedir sugestão")));

  a.append(el("p", { class: "fraco pequeno", style: "margin-top:16px" }, f.msgs.guardadas ? "Conversa guardada: " + f.msgs.guardadas + " mensagens, até " + diaHora(f.msgs.ate) + "." : "Esta conversa começa a ser guardada agora."));
}

function formulario(dica, tipo) {
  const inp = el("input", { placeholder: dica, maxlength: tipo === "tag" ? 40 : 2000 });
  const salvar = async () => {
    const t = inp.value.trim(); if (!t || !ficha) return;
    inp.disabled = true;
    try { const r = await rpc("painel_nota", { p_fa: ficha.fa.id, p_tipo: tipo, p_texto: t }); ficha = Object.assign({}, ficha, { notas: r.notas, tags: r.tags }); } catch (e) { alertar(e.message); }
    desenhar();
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") salvar(); });
  return el("div", { class: "linha-form" }, inp, el("button", { class: "btn mini", onclick: salvar }, "Salvar"));
}
async function apagarNota(id) {
  try { const r = await rpc("painel_nota_apagar", { p_id: id }); if (r && ficha) ficha = Object.assign({}, ficha, { notas: r.notas, tags: r.tags }); } catch (e) { alertar(e.message); }
  desenhar();
}
function alertar(t) { selo(String(t).slice(0, 40), "laranja"); }

function relogio(seg) {
  if (seg < 3600) return Math.floor(seg / 60) + ":" + String(Math.floor(seg % 60)).padStart(2, "0");
  if (seg < 86400) return Math.floor(seg / 3600) + " h " + Math.floor((seg % 3600) / 60) + " min";
  return Math.floor(seg / 86400) + " d";
}
// Cor da espera: 2 = vermelho, 1 = amarelo, 0 = verde, -1 = a conta falou por último.
function corDaEspera(seg, novo) {
  if (seg == null) return 2;                       // mensagem de outro dia
  if (novo) return seg <= VERDE_ATE ? 0 : 2;       // fã novo: verde até 5 min, depois vermelho
  return seg <= VERDE_ATE ? 0 : seg <= AMARELO_ATE ? 1 : 2;
}
function desenharFila() {
  const a = $("aba-fila"); if (!a || !sessao) return;
  a.replaceChildren();
  if (medDia && medDia.n) a.append(el("div", { class: "cartao", style: "margin-bottom:10px" }, el("div", { class: "r" }, "Tempo médio de resposta hoje, nas conversas que você abriu"),
    el("div", { class: "v" }, relogio(Number(medDia.media_seg)) + (Number(medDia.media_seg) < 3600 ? " min" : "")), el("div", { class: "r" }, medDia.n + (medDia.n === 1 ? " resposta medida" : " respostas medidas"))));
  a.append(el("p", { class: "fraco pequeno", style: "margin-top:0" }, "Quem está esperando resposta, entre as conversas carregadas na sua lista. Vermelho primeiro, depois amarelo e verde; dentro da cor, quem mais gastou."));
  if (!est || !est.salas.length) { a.append(el("p", { class: "vazio" }, "A lista de conversas ainda não apareceu.")); return; }
  const agora = Date.now();
  const linhas = est.salas.filter((s) => s.perfil).map((s) => {
    const i = infoLista.get(s.perfil.toLowerCase()) || null, e = espera.get(s.sala);
    const novo = !i || (Number(i.n || 0) === 0 && !i.msgs_nossas);
    const seg = e && !e.nossa && e.desde != null ? Math.max(0, (agora - e.desde) / 1000) : null;
    const cor = s.nossa ? -1 : corDaEspera(seg, novo);
    return { s, i, e, novo, seg, cor, total: Number((i && i.total) || 0) };
  });
  linhas.sort((x, y) => y.cor - x.cor || y.total - x.total || (y.seg || 0) - (x.seg || 0));
  a.append(el("ul", { class: "lista fila" }, linhas.map(({ s, i, e, novo, seg, cor, total }) => {
    const p = i && i.pendente;
    const selos = [];
    if (i && i.selo) selos.push(el("span", { class: "selinho " + (i.selo === "VIP rápido" ? "vip" : "prom") }, i.selo));
    if (i && i.provavel) selos.push(el("span", { class: "selinho cinza" }, "só por nome"));
    if (i && i.so_conversa) selos.push(el("span", { class: "selinho cinza" }, "só conversa"));
    if (novo) selos.push(el("span", { class: "selinho cinza" }, i ? "fã novo" : "sem ficha"));
    const tempo = cor === -1 ? "aguardando o fã" : seg == null ? "outro dia" : relogio(seg) + (e && !e.exato ? " ±1 min" : "");
    return el("li", { class: "cor" + cor },
      el("span", { class: "d" }, el("b", {}, s.nome || "(sem nome)"), " ", selos,
        el("small", { class: "fraco", style: "display:block" }, (s.naoLidas ? s.naoLidas + " não lida" + (s.naoLidas > 1 ? "s" : "") + " · " : "") + (s.online ? "online · " : "") + (s.ultima || "")),
        p ? el("small", { style: "display:block" }, "PPV " + brl(p.preco) + " não pago · follow-up " + Math.min(Number(p.follow), FOLLOW_MAX) + " de " + FOLLOW_MAX) : null),
      el("span", { class: "v" }, el("span", { class: "tempo" }, tempo), el("small", { class: "fraco", style: "display:block;font-weight:400" }, total > 0 ? brl(total) : i ? "sem compra" : "")));
  })));
}

async function carregarSumidos() {
  if (!est || !est.conta) return;
  sumidosConta = est.conta; sumidos = "carregando"; desenharSumidos();
  try { sumidos = await rpc("painel_sumidos", { p_conta: est.conta }); } catch (e) { sumidos = "erro: " + e.message; }
  desenharSumidos();
}
function desenharSumidos() {
  const a = $("aba-sumidos"); a.replaceChildren();
  a.append(el("p", { class: "fraco pequeno", style: "margin-top:0" }, "Compradores desta conta que gastaram R$ 150 ou mais na empresa e estão há 30 dias ou mais sem comprar."));
  if (!est || !est.conta) { a.append(el("p", { class: "vazio" }, "Abra a Privacy para eu saber qual é a conta.")); return; }
  if (sumidos == null || sumidosConta !== est.conta) { a.append(el("button", { class: "btn", onclick: carregarSumidos }, "Carregar lista da " + est.conta)); return; }
  if (typeof sumidos === "string") { a.append(el("p", { class: "vazio" }, sumidos)); return; }
  if (!sumidos.length) { a.append(el("p", { class: "vazio" }, "Ninguém nesta situação.")); return; }
  a.append(el("ul", { class: "lista" }, sumidos.map((x) => el("li", { class: Number(x.total) >= 1000 ? "forte" : "" },
    el("span", { class: "d" }, el("b", {}, x.nome || "(sem nome)"), el("small", { class: "fraco", style: "display:block" }, x.dias + " dias sem comprar · " + brl(x.na_conta) + " aqui" + (x.perfil ? "" : " · sem endereço ainda"))),
    el("span", { class: "v" }, brl(x.total))))));
  a.append(el("button", { class: "btn mini", style: "margin-top:10px", onclick: carregarSumidos }, "Atualizar"));
}

function desenharMais() {
  const a = $("aba-mais"); a.replaceChildren();
  a.append(el("h3", { style: "margin-top:0" }, "Sessão"));
  a.append(el("p", {}, "Login: " + (sessao.email || ""), el("br"), "Conta da Privacy nesta aba: " + ((est && est.conta) || "nenhuma")));
  a.append(el("button", { class: "btn", onclick: sair }, "Sair"));
  a.append(el("h3", {}, "Subir extrato novo"));
  a.append(el("p", { class: "fraco pequeno" }, "Baixe o extrato de vendas na Privacy (arquivo .xlsx) e escolha aqui. Vendas que já estão na base não entram de novo."));
  a.append(el("input", { type: "file", accept: ".xlsx", onchange: escolherExtrato }));
  if (extrato.aviso) a.append(el("p", { class: extrato.erro ? "erro" : "pequeno" }, extrato.aviso));
  if (extrato.linhas) a.append(el("button", { class: "btn laranja", style: "margin-top:8px", disabled: extrato.subindo, onclick: subirExtrato }, extrato.subindo ? "Subindo…" : "Subir " + extrato.linhas.length + " vendas para a base"));
  a.append(el("h3", {}, "O que este painel faz"));
  a.append(el("p", { class: "fraco" }, "Lê o endereço da conversa aberta, o nome, o total gasto da tela de detalhes, a lista de conversas que está na tela e as mensagens da conversa aberta. Grava no seu banco. Não envia mensagens, não abre conversas, não rola a lista e não faz pedidos à Privacy."));
}

// ---------- extrato ----------
const extrato = { linhas: null, aviso: "", erro: false, subindo: false };
const COLUNAS = { data: "Data", hora: "Hora", valor: "Valor da venda", comissao: "Sua comissão", tipo_entrada: "Tipo de entrada", forma_pagamento: "Forma de pagamento",
  codigo: "ID usuário comprador", comprador: "Comprador", tipo_venda: "Tipo Venda", vendedor: "Vendedor", situacao: "Situação" };

async function lerPlanilha(arquivo) {
  const buf = new Uint8Array(await arquivo.arrayBuffer()), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = buf.length - 22;
  while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
  if (i < 0) throw new Error("Este arquivo não é um .xlsx.");
  const n = dv.getUint16(i + 10, true); let p = dv.getUint32(i + 16, true), alvo = null;
  for (let k = 0; k < n && dv.getUint32(p, true) === 0x02014b50; k++) {
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const nome = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl));
    if (/^xl\/worksheets\/sheet1\.xml$/i.test(nome)) alvo = { metodo: dv.getUint16(p + 10, true), tam: dv.getUint32(p + 20, true), pos: dv.getUint32(p + 42, true) };
    p += 46 + nl + xl + cl;
  }
  if (!alvo) throw new Error("Não achei a planilha dentro do arquivo.");
  const ini = alvo.pos + 30 + dv.getUint16(alvo.pos + 26, true) + dv.getUint16(alvo.pos + 28, true), dados = buf.subarray(ini, ini + alvo.tam);
  const xml = alvo.metodo === 0 ? new TextDecoder().decode(dados)
    : await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Não consegui ler a planilha.");
  const col = (ref) => { let c = 0; for (const ch of ref.replace(/\d+/g, "")) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
  return [...doc.getElementsByTagNameNS("*", "row")].map((r) => {
    const linha = []; let prox = 0;
    for (const c of r.children) {
      if (c.localName !== "c") continue;
      if (c.getAttribute("t") === "s") throw new Error("O formato deste extrato é diferente do esperado. Me mande o arquivo.");
      const idx = c.getAttribute("r") ? col(c.getAttribute("r")) : prox, v = [...c.children].find((x) => x.localName === "v" || x.localName === "is");
      linha[idx] = v ? v.textContent.trim() : ""; prox = idx + 1;
    }
    return linha;
  });
}

async function escolherExtrato(ev) {
  const arq = ev.target.files && ev.target.files[0]; if (!arq) return;
  Object.assign(extrato, { linhas: null, aviso: "Lendo…", erro: false }); desenharMais();
  try {
    const tab = await lerPlanilha(arq), cab = (tab[0] || []).map((x) => (x || "").trim()), pos = {};
    for (const [k, nome] of Object.entries(COLUNAS)) { pos[k] = cab.indexOf(nome); if (pos[k] < 0) throw new Error("Falta a coluna “" + nome + "”. Este é mesmo o extrato de vendas?"); }
    const linhas = tab.slice(1).filter((l) => l && l[pos.data]).map((l) => Object.fromEntries(Object.keys(COLUNAS).map((k) => [k, l[pos[k]] || ""])));
    if (!linhas.length) throw new Error("O extrato está vazio.");
    const contas = [...new Set(linhas.map((l) => l.vendedor))], ord = linhas.map((l) => l.data.split("/").reverse().join("-")).sort();
    const br = (d) => d.split("-").reverse().join("/");
    Object.assign(extrato, { linhas, aviso: linhas.length + " vendas de " + contas.join(", ") + ", de " + br(ord[0]) + " a " + br(ord[ord.length - 1]) + "." });
  } catch (e) { Object.assign(extrato, { linhas: null, aviso: e.message, erro: true }); }
  desenharMais();
}

async function subirExtrato() {
  if (!extrato.linhas || extrato.subindo) return;
  extrato.subindo = true; desenharMais();
  try {
    const r = await rpc("painel_extrato", { p_linhas: extrato.linhas });
    Object.assign(extrato, { linhas: null, erro: false, aviso: "Pronto: " + r.novas + " vendas novas, " + r.repetidas + " já estavam na base, " + r.compradores_novos + " compradores novos."
      + (r.recusadas ? " " + r.recusadas + " linhas ficaram de fora (conta que não é atendida ou linha incompleta)." : "") });
    try { const c = await rpc("painel_casar_ppvs", {}); if (c) extrato.aviso += " " + c + (c === 1 ? " PPV foi marcado" : " PPVs foram marcados") + " como comprado pelo extrato."; } catch (_) {}
    infoLista.clear(); fichaChave = ""; sumidos = null;
  } catch (e) { Object.assign(extrato, { aviso: "Não subiu: " + e.message, erro: true }); }
  extrato.subindo = false; desenharMais();
}

// ---------- início ----------
document.querySelectorAll(".abas button").forEach((b) => b.addEventListener("click", () => {
  abaAtual = b.dataset.aba;
  document.querySelectorAll(".abas button").forEach((x) => x.classList.toggle("ativa", x === b));
  ["ficha", "fila", "sumidos", "mais"].forEach((n) => { $("aba-" + n).hidden = n !== abaAtual; });
}));
$("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault(); $("erroLogin").textContent = "";
  try { await pedirAuth("password", { email: $("email").value.trim(), password: $("senha").value }); $("senha").value = ""; mostrarTela(); pedirEstado(); }
  catch (err) { $("erroLogin").textContent = /invalid/i.test(err.message) ? "E-mail ou senha incorretos." : err.message; }
});
function pedirEstado() {
  if (!sessao) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (abas) => {
    const aba = abas && abas[0]; if (!aba) return;
    chrome.tabs.sendMessage(aba.id, { t: "pedir" }, () => {
      if (chrome.runtime.lastError) { est = null; ficha = null; fichaChave = ""; fichaErro = ""; selo("fora da Privacy"); desenhar(); }
    });
  });
}
chrome.tabs.onActivated.addListener(pedirEstado);
(async () => {
  sessao = (await chrome.storage.local.get("sessao")).sessao || null;
  try { minhaJanela = (await chrome.windows.getCurrent()).id; } catch (_) {}
  mostrarTela(); pedirEstado();
})();
