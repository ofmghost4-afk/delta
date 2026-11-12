// Janela do Coach. Lê o estado que o leitor mandou, busca a ficha no seu banco (igual ao Aura)
// e mostra fase, próxima jogada, roteiro, preço, recursos, alertas e relógio.
// Nunca fala com a Privacy e nunca envia mensagem. Só grava, se você clicar, a jogada usada.
const $ = (id) => document.getElementById(id);
const M = self.CoachMotor;
// v2.3.13: o el() monta o elemento pelo VanJS (van.tags). Mesmo uso de antes: el("div", { class: "x", onclick: fn }, filhos).
// Regras iguais às antigas: atributo null/false some, true vira atributo vazio, on* vira ouvinte, filhos aceitam nó, texto e listas.
// O el() guarda os ouvintes em e.__on: o remendar() (abaixo) usa isso para saber se o elemento tem clique/tecla própria.
function el(tag, attrs, ...filhos) {
  const props = {}, vazios = [], ouvintes = {};
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) ouvintes[k.slice(2)] = v;
    else if (v === true) vazios.push(k);
    else props[k] = v;
  }
  const kids = filhos.flat(Infinity).filter((f) => f != null && f !== false).map((f) => (f.nodeType ? f : String(f)));
  const e = van.tags[tag](props, ...kids);
  vazios.forEach((k) => e.setAttribute(k, ""));
  for (const [ev, fn] of Object.entries(ouvintes)) e.addEventListener(ev, fn);
  e.__on = ouvintes;
  return e;
}
// ---------- v2.3.13 · remendo cirúrgico do DOM ----------
// A cada segundo o painel monta a tela nova FORA da tela (um <div> solto) e o remendar() copia só o que mudou para a
// tela de verdade: texto que mudou, atributo que mudou, bloco que entrou ou saiu. O que não mudou nem é tocado.
// Regras de segurança (por isso nunca perde o foco nem o que você está digitando):
//  - o campo em foco (e tudo em volta dele) nunca é trocado nem apagado: se o remendo precisasse fazer isso, pula só esse trecho;
//  - elemento com clique/tecla próprio (e todo campo de digitação) é trocado inteiro pelo novo, para o ouvinte novo valer;
//  - elemento só de exibição (div, span, texto...) é atualizado no lugar.
const CAMPOS = /^(INPUT|TEXTAREA|SELECT|OPTION)$/;
function remendar(vivo, novo) {
  const vs = [...vivo.childNodes], ns = [...novo.childNodes], ativo = document.activeElement, comum = Math.min(vs.length, ns.length);
  const protegido = (n) => !!ativo && ativo !== document.body && n.nodeType === 1 && n.contains(ativo);
  for (let i = 0; i < comum; i++) igualar(vs[i], ns[i], ativo, protegido);
  for (let i = comum; i < vs.length; i++) if (!protegido(vs[i])) vs[i].remove();
  for (let i = comum; i < ns.length; i++) vivo.append(ns[i]);
}
function igualar(v, n, ativo, protegido) {
  if (v.nodeType === 3 && n.nodeType === 3) { if (v.data !== n.data) v.data = n.data; return; }
  const trocar = () => { if (!protegido(v)) v.replaceWith(n); };
  if (v.nodeType !== 1 || n.nodeType !== 1 || v.nodeName !== n.nodeName) return trocar();
  if (v === ativo && CAMPOS.test(v.nodeName)) return; // campo em foco: intocado
  const comOuvinte = n.__on && Object.keys(n.__on).length > 0;
  if (comOuvinte || CAMPOS.test(v.nodeName) || v.nodeName === "BUTTON") return trocar();
  for (const at of [...n.attributes]) if (v.getAttribute(at.name) !== at.value) v.setAttribute(at.name, at.value);
  for (const at of [...v.attributes]) if (!n.hasAttribute(at.name)) v.removeAttribute(at.name);
  remendar(v, n);
}
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ORIG = { OF: "OF", BASE: "base", PRIVACY: "Privacy", LEI: "lei", CONSENSO: "consenso", HIPOTESE: "calibrar" };
const NOMES_FASE = { vulneravel: "Vulnerável", objecao: "Objeção", pos_compra: "Pós-compra", hora_de_vender: "Hora de vender", reengajamento: "Reengajamento", abertura: "Abertura", qualificacao: "Qualificação", rapport: "Rapport" };
const NOMES_OBJ = { encontro: "encontro", contato_externo: "contato por fora", autenticidade: "é você mesma?", freio_gasto: "freio de gasto", sem_dinheiro: "sem dinheiro", caro: "achou caro", previa: "prévia grátis", depois: "depois" };

// ---------- login e banco (mesmo jeito do Aura) ----------
let sessao = null;
async function guardarSessao(s) { sessao = s; await chrome.storage.local.set({ sessao: s }); }
async function pedirAuth(tipo, corpo) {
  const r = await fetch(CFG.url + "/auth/v1/token?grant_type=" + tipo, { method: "POST", headers: { apikey: CFG.chave, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
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
  const r = await fetch(CFG.url + "/rest/v1/rpc/" + nome, { method: "POST", headers: { apikey: CFG.chave, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error((j && (j.message || j.hint)) || "erro " + r.status); e.status = r.status; e.codigo = j && j.code; throw e; }
  return j;
}
const faltaFuncao = (e) => e && (e.status === 404 || e.codigo === "PGRST202" || e.codigo === "42883" || /could not find the function|does not exist/i.test(e.message || ""));
async function sair() { sessao = null; await chrome.storage.local.remove("sessao"); if (mini) await definirMini(false); mostrarTela(); }

// ---------- estado ----------
let CN = null; // biblioteca de cenas (modo sequência)
let EX = null; // v2.3.4: exemplos reais que funcionaram (data/coach_exemplos.json), mandados ao ⚡ da IA
let historico = null, historicoChave = "", conversao = null, conversaoEm = 0, conversaoDisponivel = true;
let perfis = {}; // perfil do fã marcado à mão: { faId: "casado" } (só neste Chrome)
const cenaSala = new Map(); // sala -> { id, ajuste }
let copiado = "", contaDoPerfil = null;
let R = null, ROT = null, origem = null, est = null, texto = "", ficha = null, fichaChave = "", fichaErro = "";
let ppvs = null, ppvsDisponivel = true, ppvsChave = "", ppvsEm = 0;
const totais = new Map(); // perfil -> { total, compraTelaEm }
let variante = 0, roteiroAtual = "", avisoRodape = "", avisoSala = "", registrando = false;
// sala|roteiro|variante já gravadas HOJE: uma gravação por combinação. Fica salvo neste Chrome com a data do dia,
// então fechar e reabrir a janelinha continua mostrando "✓ Feito" (v2.1).
const registradas = new Set();
function salvarRegistradas() { chrome.storage.local.set({ registradas: { data: hojeSP(), chaves: [...registradas].slice(-500) } }); }
let copiadoEm = 0, naoCopiouEm = 0; // para o botão mostrar "Copiado" por 2,5 s mesmo com o painel redesenhando a cada segundo
// v2.1: {placeholders} preenchidos à mão (chip de 1 clique ou digitando em cima do campo), por sala. Só na memória desta janela.
const varsSala = new Map(); // sala -> { campo: valor }
// v2.3.9: cena fixada/ajuste (cenaSala) e {placeholders} preenchidos (varsSala) ficam salvos neste Chrome com a data do dia,
// igual a "registradas": fechar ou recarregar a janelinha não perde nada (amanhã começa limpo).
function salvarEstadoSalas() { chrome.storage.local.set({ estadoSalas: { data: hojeSP(), cena: Object.fromEntries(cenaSala), vars: Object.fromEntries(varsSala) } }); }
let editando = null; // campo em edição inline: enquanto isso o painel não redesenha
let acaoTopo = null; // o que o "Copiar" do topo (e as teclas C / Enter) copia agora: { texto, res, n, cena }
// ---------- v2.2 ----------
// Conversão por variante (ordem automática), radar global das 3 contas, placar por chatter, ritmo de chegada,
// abas do Aura dentro do Delta (Ficha / Fila / Sumidos / Mais) e botão ⚡ Adaptar. Cada bloco some sozinho se a
// função dele ainda não existe no banco (coach_sql.sql v2.2 não rodado).
let convVar = null, convVarEm = 0, convVarDisp = true;
let momentoStats = null, momentoStatsEm = 0, momentoStatsDisp = true;
const roteiroOfertaSala = new Map(); // sala -> id do roteiro de oferta que o operador pediu para VER (v2.3.17; só na memória desta janela) // v2.3.16: coach_momento_stats
let radarG = null, radarDisp = true, radarEm = 0, radarOcupado = false, radarConta = null;
let chatter = null, chatterDisp = true, chatterEm = 0;
let aba = "delta"; // delta | ficha | fila | sumidos | mais
const infoLista = new Map(), esperaSala = new Map(); // dados da fila (painel_fila) e desde quando cada sala espera
let listaEm = 0, buscandoLista = false, sumidos = null, sumidosConta = "", exAss = null, exAssConta = "", exAssDisp = true;
let turno = null; // { txt, em, erro }
const ultimaVista = new Map(), chegadas = []; let obsDesde = 0; // ritmo de chegada de conversas
let ia = null; // { chave, carregando, versoes, memoria, erro, salvou }
const extrato = { linhas: null, aviso: "", erro: false, subindo: false };
// Radar de urgência (v2.1): som opcional, desligado por padrão.
let som = false, audio = null;
const somVisto = new Map(), fuVisto = new Map();
// Modo mini: janelinha de 195 px de altura TOTAL (com a moldura): cabe na faixa livre do Cockpit 3x2 e mostra
// fã + relógio + fase + preço + jogada + 2 linhas do roteiro. Fica salvo neste Chrome.
const ALT_MINI = 195;
let mini = false, alturaCheia = null;
// Modo Dominante x Normal (botão no topo). Fica salvo neste Chrome. Padrão = coach_regras.json → modos.padrao.
let modo = null;
// Placar do dia: do banco (coach_placar) ou, sem ele, só as vendas que o Coach viu na tela nesta máquina (somas, sem dado de fã).
let placarBanco = null, placarDisponivel = true, placarEm = 0, placarLocal = null;
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function selo(t, cor) { const s = $("selo"); s.textContent = t; s.className = "selo " + (cor || "cinza"); }
function mostrarTela() {
  $("telaLogin").hidden = !!sessao; $("telaApp").hidden = !sessao; $("btnSair").hidden = !sessao;
  mostrarMini();
  if (!sessao) selo("sem login"); else desenhar();
}

chrome.runtime.onMessage.addListener((m, quem, responder) => {
  if (!m) return;
  if (m.t === "coach_origem") { origem = m.origem; pedirEstado(); return; }
  if (!quem.tab || (m.t !== "coach_estado" && m.t !== "coach_texto")) return;
  if (origem != null && quem.tab.windowId !== origem) return;
  if (!quem.tab.active) return;
  if (origem == null) origem = quem.tab.windowId;
  if (m.t === "coach_texto") { texto = m.texto || ""; desenhar(); return; }
  receber(m); responder && responder({ ok: true });
});

// Ritmo de chegada: conta as conversas diferentes que receberam mensagem nova do fã (vista na lista da tela).
function medirChegadas(m) {
  const agora = Date.now(); if (!obsDesde) obsDesde = agora;
  for (const s of m.salas || []) {
    const chave = s.ultima + "|" + s.hora, ant = ultimaVista.get(s.sala);
    if (ant !== undefined && ant !== chave && s.naoLidas > 0 && !s.nossa) chegadas.push({ sala: s.sala, t: agora });
    ultimaVista.set(s.sala, chave);
  }
  const jan = ((R && R.ritmo && R.ritmo.janela_min) || 60) * 60000;
  while (chegadas.length && agora - chegadas[0].t > jan) chegadas.shift();
}
function ritmo() {
  const cfg = (R && R.ritmo) || {}, min = (Date.now() - obsDesde) / 60000;
  if (!obsDesde || min < (cfg.minimo_min || 5)) return null;
  const n = new Set(chegadas.map((c) => c.sala)).size, jan = cfg.janela_min || 60;
  return Math.round(min >= jan ? n : (n * jan) / min);
}
// Desde quando cada sala espera resposta (igual ao Aura): na conversa aberta é exato; na lista vale a hora mostrada.
function horaDaLista(h) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h || ""); if (!m) return null;
  const d = new Date(); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);
  return d.getTime();
}
function atualizarEspera(m, primeiraVez) {
  const vivas = new Set();
  for (const s of m.salas || []) {
    vivas.add(s.sala);
    if (s.nossa) { esperaSala.set(s.sala, { chave: "nossa", desde: null, nossa: true }); continue; }
    const chave = s.ultima + "|" + s.hora, ant = esperaSala.get(s.sala);
    if (ant && ant.chave === chave) continue;
    if (ant && !primeiraVez) esperaSala.set(s.sala, { chave, desde: Date.now(), exato: true });
    else esperaSala.set(s.sala, { chave, desde: horaDaLista(s.hora), exato: false });
  }
  const ult = (m.msgs || []).slice(-1)[0];
  if (m.conv && m.conv.sala && ult && ult.de_fa) { const e = esperaSala.get(m.conv.sala); if (e && !e.nossa) { e.desde = ult.em; e.exato = true; } }
  for (const k of [...esperaSala.keys()]) if (!vivas.has(k)) esperaSala.delete(k);
}
function receber(m) {
  const primeiraVez = !est || est.conta !== m.conta;
  medirChegadas(m); atualizarEspera(m, primeiraVez);
  est = m; texto = m.texto || "";
  if (m.conv && m.conv.perfil && m.conv.total != null) {
    const k = m.conv.perfil.toLowerCase(), ant = totais.get(k);
    if (ant && m.conv.total > ant.total + 0.009) { somarLocal(m.conta, m.conv.total - ant.total); totais.set(k, { total: m.conv.total, compraTelaEm: Date.now() }); }
    else if (!ant) totais.set(k, { total: m.conv.total, compraTelaEm: null });
  }
  if (!sessao) return;
  if (m.conv) {
    const chave = [m.conta, m.conv.cid, m.conv.perfil, m.conv.sala, m.conv.total].join("|");
    if (chave !== fichaChave) { fichaChave = chave; abrirFicha(chave); }
    if (!contaDoPerfil && m.conta && R && R.contas_atendidas.includes(m.conta)) { contaDoPerfil = m.conta; chrome.storage.local.set({ contaDoPerfil }); }
    carregarPpvs(false); enviarPpvs(); enviarMsgs();
  } else { fichaChave = ""; ficha = null; fichaErro = ""; }
  desenhar();
  if (m.conta !== radarConta) radarTick();
}

async function abrirFicha(chave) {
  const c = est.conv;
  if (!ficha || !ficha.fa || ficha.fa.cid !== c.cid) { ficha = null; variante = 0; }
  fichaErro = "";
  if (R && !R.contas_atendidas.includes(est.conta)) { fichaErro = "conta_fora"; desenhar(); return; }
  try {
    // Mesma chamada que o Aura faz ao abrir a conversa (a ficha é a mesma).
    const r = await rpc("painel_abrir", { p_conta: est.conta, p_cid: c.cid, p_perfil: c.perfil, p_nome: c.nome, p_sala: c.sala, p_total: c.total });
    if (chave !== fichaChave) return;
    if (r && r.erro) { ficha = null; fichaErro = r.erro; } else { ficha = r; extraFa = null; carregarHistorico(); enviarPpvs(); enviarMsgs(); carregarExtra(chave); }
  } catch (e) { if (chave !== fichaChave) return; ficha = null; fichaErro = "falha: " + e.message; fichaChave = ""; }
  desenhar();
}

// Guarda no banco os PPVs que estão na tela da conversa aberta (preço, hora, pago ou não), pela MESMA função que o
// Aura usa (painel_ppvs). Sem isso, sem o Aura instalado, o placar, a conversão por roteiro, o relatório de turno e a
// ordem das variantes ficam sempre zerados (emp_ppvs vazia). Só números do PPV: nenhum texto de conversa é gravado.
// Só chama o banco quando algo mudou. Desliga em coach_regras.json > gravar_ppvs.
const ppvsEnviados = new Map(); // sala -> JSON já gravado
async function enviarPpvs() {
  if (!R || !R.gravar_ppvs || !sessao || !est || !est.conv || !est.conv.sala || !Array.isArray(est.ppvs) || !est.ppvs.length) return;
  if (!ficha || !ficha.fa || ficha.fa.cid !== est.conv.cid || !R.contas_atendidas.includes(est.conta)) return;
  const sala = est.conv.sala, json = JSON.stringify(est.ppvs);
  if (ppvsEnviados.get(sala) === json) return;
  ppvsEnviados.set(sala, json);
  try { await rpc("painel_ppvs", { p_conta: est.conta, p_sala: sala, p_fa: ficha.fa.id, p_ppvs: est.ppvs }); carregarPpvs(true); carregarPlacar(true); }
  catch (_) { ppvsEnviados.delete(sala); }
}
// v2.3.6 · trazido do Aura (painel_extra, função dele, sem mudança): a ligação fã ↔ comprador foi feita SÓ PELO NOME?
// Então as compras da ficha podem ser de outra pessoa com o mesmo nome. O Delta avisa e passa a usar só o que está na
// tela para preço, selos e IA (o Aura desligava selo, dicas e preço). Confirma-se abrindo "Detalhes" dele na Privacy.
let extraFa = null, extraChave = "";
async function carregarExtra(chave) {
  if (!ficha || !ficha.fa || !est || !est.conv) return;
  try { const r = await rpc("painel_extra", { p_fa: ficha.fa.id, p_conta: est.conta, p_sala: est.conv.sala || null }); if (chave === fichaChave) { extraFa = r; extraChave = chave; desenhar(); } }
  catch (_) { /* sem a função: segue como antes */ }
}
const ligacaoProvavel = () => !!(ficha && extraFa && extraChave === fichaChave && extraFa.provavel);
// v2.3.6 · trazido do Aura (painel_dia, função dele): tempo médio de resposta HOJE nesta conta, medido nas conversas
// salvas (fã escreve → a conta responde). Atualiza a cada 1 min.
let medDia = null, medDiaEm = 0, medDiaConta = "";
async function carregarDia(forcar) {
  if (!sessao || !est || !est.conta || !R || !R.contas_atendidas.includes(est.conta)) return;
  if (!forcar && est.conta === medDiaConta && Date.now() - medDiaEm < 60000) return;
  medDiaEm = Date.now(); medDiaConta = est.conta;
  try { const r = await rpc("painel_dia", { p_conta: est.conta }); medDia = r && Number(r.n) > 0 ? { seg: Number(r.media_seg), n: Number(r.n) } : null; } catch (_) { medDia = null; }
}
const textoMedDia = () => (medDia && medDiaConta === (est && est.conta) ? "resposta média hoje " + M.fmtSeg(medDia.seg) + " (" + medDia.n + (medDia.n === 1 ? " resposta)" : " respostas)") : "");
// v2.3.3 · GRAVAR AS CONVERSAS: manda para o banco as mensagens da conversa aberta que ainda não foram gravadas, pela
// MESMA função que o Aura usa (painel_msgs → central.emp_mensagens; mensagem repetida é ignorada lá). É o histórico
// que o ⚡ da IA lê depois (coach_conversa), inclusive o que já saiu da tela. Só a partir de quando foi ligado.
// Desliga em coach_regras.json > gravar_msgs.
const msgsEnviadas = new Map(); // sala -> Set de ids já gravados nesta janela
let gravandoMsgs = false;
async function enviarMsgs() {
  if (!R || !R.gravar_msgs || gravandoMsgs || !sessao || !est || !est.conv || !est.conv.sala || !Array.isArray(est.msgs) || !est.msgs.length) return;
  if (!ficha || !ficha.fa || ficha.fa.cid !== est.conv.cid || !R.contas_atendidas.includes(est.conta)) return;
  const sala = est.conv.sala, feitas = msgsEnviadas.get(sala) || new Set();
  const novas = est.msgs.filter((m) => /^[0-9a-f]{24}$/.test(m.id || "") && !feitas.has(m.id)).map((m) => ({ id: m.id, de_fa: !!m.de_fa, em: new Date(m.em).toISOString(), tipo: m.tipo || "texto", texto: String(m.texto || "").slice(0, 4000) }));
  if (!novas.length) return;
  gravandoMsgs = true; msgsEnviadas.set(sala, feitas);
  try { for (let i = 0; i < novas.length; i += 200) { await rpc("painel_msgs", { p_conta: est.conta, p_sala: sala, p_fa: ficha.fa.id, p_msgs: novas.slice(i, i + 200) }); novas.slice(i, i + 200).forEach((m) => feitas.add(m.id)); } }
  catch (_) { /* tenta de novo na próxima leitura */ }
  gravandoMsgs = false;
}
// histórico salvo da sala (coach_conversa). Sem a função no banco: usa só a tela.
let conversaDisp = true;
async function conversaSalva(limite) {
  if (!conversaDisp || !R || (R.ia && R.ia.usar_historico === false) || !est || !est.conv || !est.conv.sala || !ficha || !ficha.fa) return [];
  try { const r = await rpc("coach_conversa", { p_fa: ficha.fa.id, p_sala: est.conv.sala, p_conta: est.conta, p_limite: limite }); return Array.isArray(r) ? r : []; }
  catch (e) { if (faltaFuncao(e)) conversaDisp = false; return []; }
}
async function carregarPpvs(forcar) {
  if (!ppvsDisponivel || !est || !est.conv || !est.conv.sala || !sessao) return;
  const nPpvTela = (est.msgs || []).filter((m) => m.ppv).length, nConta = (est.msgs || []).filter((m) => !m.de_fa).length;
  const chave = est.conta + "|" + est.conv.sala + "|" + nPpvTela + "|" + nConta;
  if (!forcar && chave === ppvsChave && Date.now() - ppvsEm < 60000) return;
  ppvsChave = chave; ppvsEm = Date.now();
  try { const r = await rpc("coach_ppvs", { p_sala: est.conv.sala, p_conta: est.conta }); ppvs = Array.isArray(r) ? r : []; }
  catch (e) { if (faltaFuncao(e)) { ppvsDisponivel = false; ppvs = null; } }
  desenhar();
}

function somarLocal(conta, valor) {
  if (!conta || !(valor > 0)) return;
  const d = hojeSP(); if (!placarLocal || placarLocal.data !== d) placarLocal = { data: d, contas: {} };
  const x = placarLocal.contas[conta] || (placarLocal.contas[conta] = { receita: 0, vendas: 0 });
  x.receita = Math.round((x.receita + valor) * 100) / 100; x.vendas += 1;
  chrome.storage.local.set({ placarLocal });
}
const faId = () => (ficha && ficha.fa ? String(ficha.fa.id) : est && est.conv ? est.conv.perfil : "");
async function carregarHistorico() {
  const id = faId(); if (!id || !sessao) return;
  if (historicoChave === id) return; historicoChave = id; historico = null;
  try { const r = await rpc("coach_historico", { p_fa_id: id }); if (historicoChave === id) historico = Array.isArray(r) ? r : []; }
  catch (e) { historico = null; }
  desenhar();
}
async function carregarConversao(forcar) {
  if (!sessao || !conversaoDisponivel || !est || !est.conta) return;
  if (!forcar && Date.now() - conversaoEm < 10 * 60000) return;
  conversaoEm = Date.now();
  try { const r = await rpc("coach_conversao_semana", { p_conta: est.conta }); conversao = Array.isArray(r) ? r : null; }
  catch (e) { if (faltaFuncao(e)) { conversaoDisponivel = false; conversao = null; } }
  desenhar();
}
async function carregarPlacar(forcar) {
  if (!sessao || !placarDisponivel) return;
  if (!forcar && Date.now() - placarEm < 60000) return;
  placarEm = Date.now();
  try { const r = await rpc("coach_placar", {}); placarBanco = Array.isArray(r) ? r : null; }
  catch (e) { if (faltaFuncao(e)) { placarDisponivel = false; placarBanco = null; } }
  desenhar();
}
// v2.2 · conversão por variante na semana (para a ordem automática das variantes)
async function carregarMomentoStats(forcar) {
  if (!sessao || !momentoStatsDisp || !est || !est.conta || !(R && R.momento_ofertar && R.momento_ofertar.ativo !== false)) return;
  if (!forcar && Date.now() - momentoStatsEm < 15 * 60000) return;
  momentoStatsEm = Date.now();
  try { const r = await rpc("coach_momento_stats", { p_conta: null }); momentoStats = Array.isArray(r) ? r : null; }
  catch (e) { if (faltaFuncao(e)) { momentoStatsDisp = false; momentoStats = null; } }
  desenhar();
}
async function carregarConvVar(forcar) {
  if (!sessao || !convVarDisp || !est || !est.conta) return;
  if (!forcar && Date.now() - convVarEm < 10 * 60000) return;
  convVarEm = Date.now();
  try { const r = await rpc("coach_conversao_variantes", { p_conta: est.conta }); convVar = Array.isArray(r) ? r : null; }
  catch (e) { if (faltaFuncao(e)) { convVarDisp = false; convVar = null; } }
  desenhar();
}
// v2.2 · placar individual do chatter (login) no dia
async function carregarChatter(forcar) {
  if (!sessao || !chatterDisp) return;
  if (!forcar && Date.now() - chatterEm < 60000) return;
  chatterEm = Date.now();
  try { const r = await rpc("coach_placar_chatter", {}); chatter = Array.isArray(r) ? r : null; }
  catch (e) { if (faltaFuncao(e)) { chatterDisp = false; chatter = null; } }
  desenhar();
}
// v2.2 · radar global: publica só NÚMEROS desta conta (nenhum nome de fã) e lê os das 3 contas.
function estadoRadar() {
  const cfg = R.radar || {}, salas = (est && est.salas) || [], res = est && est.conv ? window.__coachUltimo : null;
  const fl = M.fila(salas, R, Date.now(), null).filter((s) => s.naoLidas > 0);
  let vips = salas.filter((s) => s.naoLidas > 0 && !s.nossa && Number(s.gasto) >= (cfg.vip_gasto_min_brl || 1000)).length;
  // maior espera = só quem tem hora de hoje na lista. Conversa com data "Ontem" entra como 1 dia e deixaria as 3
  // contas sempre em "1d" (visto no teste real): essas contam nas não lidas, não no relógio do radar.
  let maior = fl.reduce((a, s) => (s.espera_s != null && s.espera_s < 86400 ? Math.max(a, s.espera_s) : a), 0), fu = 0;
  if (res) {
    const rl = res.relogio, grande = res.selos.some((s) => s.id === "vip" || s.id === "baleia");
    if (rl.espera_s != null) { maior = Math.max(maior, rl.espera_s); if (grande && !salas.some((s) => s.aberta && s.naoLidas > 0 && Number(s.gasto) >= (cfg.vip_gasto_min_brl || 1000))) vips++; }
    if (rl.fu && rl.fu.falta_s <= 0) fu = 1;
  }
  return { vips_esperando: vips, maior_espera_s: Math.min(maior, 86400), baleias_online: salas.filter((s) => s.online && Number(s.gasto) >= (cfg.baleia_gasto_min_brl || 2300)).length, fu_vencidos: fu, nao_lidas: fl.length, chats_h: ritmo() || 0 };
}
async function radarTick() {
  if (!sessao || !R || !radarDisp || radarOcupado) return;
  const minha = est && est.conta && R.contas_atendidas.includes(est.conta) ? est.conta : null;
  // publica a cada ~20 s; na hora, quando a conta desta janela acabou de ser reconhecida
  if (Date.now() - radarEm < ((R.radar && R.radar.publicar_s) || 20) * 1000 && minha === radarConta) return;
  radarEm = Date.now(); radarOcupado = true; radarConta = minha;
  try { const r = await rpc("coach_radar", { p_conta: minha, p_estado: minha ? estadoRadar() : null }); radarG = Array.isArray(r) && r.length ? r : null; }
  catch (e) { if (faltaFuncao(e)) { radarDisp = false; radarG = null; } }
  radarOcupado = false; desenharRadar();
}
// v2.3 · SELETOR DE MODELO: a barra do radar vira 3 abas (Arruda / Luna / Louise). A desta janela fica acesa na cor
// da conta; as outras mostram ★ VIPs esperando · ⏱ maior espera · 💬 não lidas e pulsam quando há VIP esperando,
// follow-up vencido ou espera acima de radar.sla_s. Clicar numa outra (ou Alt+1/2/3) pede a troca.
// Como cada modelo é um perfil do Chrome e uma extensão não enxerga a janela de outro perfil, o pedido sai no TÍTULO
// desta janelinha ("Delta · Arruda » Luna #123"). Quem troca as janelas é o ajudante trocar_modelo.ps1 (Windows),
// que lê os títulos e traz para a frente a Privacy + o Delta da modelo pedida. O Delta não mexe em janela nenhuma da Privacy.
const contaJanela = () => (est && est.conta && R && (R.contas_atendidas || []).includes(est.conta) ? est.conta : contaDoPerfil);
const rotuloDe = (c) => (((R && R.config_por_conta) || {})[c] || {}).rotulo || c;
const teclasPalco = () => (R && R.palco && Array.isArray(R.palco.teclas) && R.palco.teclas.length ? R.palco.teclas : (R && R.contas_atendidas) || []);
function teclaDe(c) { const i = teclasPalco().indexOf(c); return i >= 0 && i < 9 ? i + 1 : null; }
let palco = false, trocaN = 0, trocaAte = 0, trocaPara = "", trocaParaConta = "", trocaAviso = "", trocaAvisoAte = 0, tituloAtual = "";
function tituloJanela() {
  const c = R ? contaJanela() : null, rot = c ? rotuloDe(c) : "";
  const t = !rot ? "Delta" : "Delta · " + rot + (trocaAte > Date.now() && trocaPara ? " » " + trocaPara + " #" + trocaN : "");
  if (t !== tituloAtual) { tituloAtual = t; document.title = t; }
}
function pedirTroca(conta) {
  if (!R || !sessao || !conta || conta === contaJanela() || !(R.contas_atendidas || []).includes(conta)) return;
  const ms = (R.palco && R.palco.troca_espera_ms) || 2500;
  trocaN = Date.now() % 1000000; trocaPara = rotuloDe(conta); trocaParaConta = conta; trocaAte = Date.now() + ms; trocaAviso = "";
  let saiu = false; const marca = () => { saiu = true; };
  window.addEventListener("blur", marca);
  tituloJanela(); desenharRadar();
  setTimeout(() => {
    window.removeEventListener("blur", marca);
    trocaAte = 0; trocaParaConta = ""; tituloJanela();
    // a troca deu certo = esta janelinha perdeu o foco (a da outra modelo veio para a frente)
    if (!saiu && document.hasFocus()) { trocaAviso = "Não trocou para " + trocaPara + ": deixe aberta a janela preta do arrumar_cockpit (é ela que troca as janelas; também com Alt+1/2/3)."; trocaAvisoAte = Date.now() + 10000; }
    desenharRadar();
  }, ms);
}
function desenharRadar() {
  const b = $("radarGlobal"); if (!b) return;
  tituloJanela();
  b.hidden = !sessao || !R; if (b.hidden) { b.replaceChildren(); return; }
  const cfg = R.config_por_conta || {}, minha = contaJanela(), sla = (R.radar && R.radar.sla_s) || 180, offMin = (R.radar || {}).offline_min || 3;
  const abas = (R.contas_atendidas || []).map((c) => {
    const x = radarG ? radarG.find((r) => r.conta === c) || { offline: true, estado: {} } : null, e = (x && x.estado) || {}, rot = rotuloDe(c), k = teclaDe(c);
    const eu = c === minha, off = !!(x && x.offline) && !eu, semDado = !x;
    const tarde = e.maior_espera_s > sla, urg = !eu && !off && !semDado && (e.vips_esperando > 0 || e.fu_vencidos > 0 || tarde);
    const det = semDado ? "radar ainda sem dados" : off ? "sem sinal há mais de " + offMin + " min (Delta fechado nesse perfil?)"
      : (e.vips_esperando || 0) + " VIP esperando · maior espera " + M.fmtSeg(e.maior_espera_s || 0) + " · " + (e.nao_lidas || 0) + " não lidas · " + (e.baleias_online || 0) + " baleia online · " + (e.fu_vencidos || 0) + " follow-up vencido";
    const n = (v, cls, sim, txt) => el("span", { class: "rg-x " + cls + (v > 0 ? " " + sim : " zero") }, txt);
    const l2 = off ? [el("span", { class: "rg-x" }, "off")] : semDado ? [el("span", { class: "rg-x zero" }, "…")] : [
      n(e.vips_esperando, "vipx", "vip", "★" + (e.vips_esperando || 0)),
      n(e.maior_espera_s, "esp", tarde ? "tarde" : "", "⏱" + (e.maior_espera_s > 0 ? M.fmtSeg(e.maior_espera_s) : "—")),
      n(e.nao_lidas, "msgs", "", "💬" + (e.nao_lidas || 0)),
      e.fu_vencidos > 0 ? el("span", { class: "rg-x tarde" }, "⏰" + e.fu_vencidos) : null];
    return el("button", { type: "button", class: "rg" + (eu ? " eu" : "") + (off ? " off" : "") + (urg ? " urg" : "") + (tarde ? " sla" : "") + (trocaParaConta === c ? " pedindo" : ""),
      style: "--c:" + ((cfg[c] || {}).cor || "#8b1e3f"), "aria-current": eu ? "true" : null, "aria-label": (eu ? rot + ", modelo desta janela" : "Trocar para " + rot) + ". " + det,
      title: (eu ? rot + " (esta janela)" : "Trocar para " + rot + (k ? " · Alt+" + k : "")) + "\n" + det, onclick: eu ? null : () => pedirTroca(c) },
      el("span", { class: "rg-l1" }, el("i", { class: "pt" }), el("b", { class: "rg-n" }, rot), urg ? el("i", { class: "rg-pulso", "aria-hidden": "true" }) : null,
        eu ? el("small", { class: "rg-ativa" }, "ativa") : trocaParaConta === c ? el("small", { class: "rg-k" }, "trocando…") : k ? el("small", { class: "rg-k" }, "Alt+" + k) : null),
      el("span", { class: "rg-l2" }, l2));
  });
  if (trocaAviso && Date.now() < trocaAvisoAte) abas.push(el("div", { class: "rg-aviso", role: "alert" }, trocaAviso)); else trocaAviso = "";
  b.replaceChildren(...abas);
}
async function trocarModo() {
  modo = modo === "dominante" ? "normal" : "dominante";
  await chrome.storage.local.set({ modo }); variante = 0; roteiroAtual = ""; mostrarModo(); desenhar();
}
function mostrarModo() {
  const b = $("btnModo"); if (!b || !R) return;
  const dom = modo === "dominante";
  document.body.classList.toggle("dom", dom);
  b.textContent = dom ? "MODO DOMINANTE" : "Modo normal"; b.title = dom ? "Clique para voltar ao modo normal" : "Clique para ligar o Modo Dominante";
  b.className = "btn mini " + (dom ? "dom-on" : "");
}

// Cena fixada no topo desta sala (v2.1): devolve a cena ativa ou null. Só existe no Modo Dominante.
const salaK = () => (est && est.conv ? est.conv.sala || "cid:" + est.conv.cid : "");
function cenaFixa(res) {
  const c = res && res.cena; if (!c || c.fim || res.fase.id === "vulneravel" || !est || !est.conv) return null;
  return (cenaSala.get(est.conv.sala) || {}).fixa ? c : null;
}
// A jogada que "Usei" grava agora: o roteiro na variante atual ou, com a cena fixada, o degrau da cena.
function jogadaAtual(res) {
  const c = cenaFixa(res);
  if (c) return { roteiro: "CENA_" + c.id + "_D" + c.n, variante: 1, txt: "Cena " + c.id + " · degrau " + c.n + "/" + c.total + " · " + c.rotulo };
  // versão da IA em uso: grava o roteiro base com variante 0 (= adaptada pela IA)
  if (iaAtiva(res)) return { roteiro: res.jogada.roteiro, variante: 0, txt: res.jogada.txt + " (adaptada pela IA)" };
  // v2.2: o carrossel pode estar reordenado/filtrado; o que vai para o banco é o número ORIGINAL da variante
  const ix = res.variantesIdx && res.variantesIdx.length ? res.variantesIdx[variante % res.variantesIdx.length] : variante;
  return { roteiro: res.jogada.roteiro, variante: ix + 1, txt: res.jogada.txt };
}
async function registrar(res) {
  if (!est || !est.conv) return;
  const chave = chaveJogada(res), j = jogadaAtual(res);
  avisoSala = est.conv.sala || "";
  if (registradas.has(chave)) { avisoRodape = "Já registrado."; desenhar(); return; }
  if (registrando) return;
  registrando = true;
  try {
    await rpc("coach_registrar_jogada", { p_sala: est.conv.sala || String(est.conv.cid), p_fa_id: ficha && ficha.fa ? String(ficha.fa.id) : est.conv.perfil, p_conta: est.conta, p_fase: res.fase.id + (res.fase.tipo ? ":" + res.fase.tipo : ""), p_jogada: j.txt, p_roteiro_id: j.roteiro, p_variante: j.variante, p_preco: res.preco ? res.preco.max : null, p_modo: res.modo,
      // v2.3.16: o Delta guarda se o banner "Ofertar agora" estava ligado e se a variante usada era de oferta (mede o que vende)
      p_momento: res.momentoOfertar ? res.momentoOfertar.gatilho : null, p_oferta: res.momentoOfertar ? (j.variante >= 1 && !String(j.roteiro).startsWith("CENA_") ? res.momentoOfertar.variantes.includes(j.variante - 1) : j.variante === 0 ? res.momentoOfertar.variantes.length > 0 : false) : null });
    registradas.add(chave); salvarRegistradas(); avisoRodape = "Jogada registrada.";
    if (Array.isArray(historico)) historico.unshift({ roteiro_id: j.roteiro, variante: j.variante, em: new Date().toISOString(), local: true }); // local: não some do carrossel nesta janela
  } catch (e) { avisoRodape = faltaFuncao(e) ? "Rode o coach_sql.sql no Supabase para registrar jogadas." : "Não registrou: " + e.message; }
  registrando = false;
  desenhar();
}
const chaveJogada = (res) => { const j = jogadaAtual(res); return [salaK(), j.roteiro, j.variante - 1].join("|"); }; // salaK: sem sala identificada usa o cid (não mistura fãs)
// Botão "Usei esta jogada": fica na barra do roteiro, ao lado do Copiar (e no fim do painel só se não houver roteiro).
function botaoUsei(res, curto) {
  const feito = registradas.has(chaveJogada(res));
  return el("button", { class: "btn mini usei" + (feito ? " feito" : ""), type: "button", disabled: registrando, "aria-label": "Usei esta jogada",
    title: feito ? "Jogada já registrada nesta conversa" : "Usei esta jogada: registra no seu banco (não envia nada à Privacy)", onclick: () => registrar(res) },
    feito ? "✓ Feito" : curto ? "✓ Usei" : "Usei esta jogada");
}
// O mesmo botão, fixo no topo (ao lado do ▴): não some ao rolar nem no mini. Mostra também quando não gravou.
let resTopo = null;
function useiTopo(res) {
  const b = $("btnUseiTopo"); if (!b) return;
  resTopo = res || null; b.hidden = !res || !sessao;
  if (b.hidden) return;
  const feito = registradas.has(chaveJogada(res)), falhou = !feito && /^(Não registrou|Rode o)/.test(avisoJogada());
  b.textContent = feito ? "✓ Feito" : falhou ? "Não gravou" : "✓ Usei";
  b.className = "btn mini usei" + (feito ? " feito" : falhou ? " falhou" : "");
  b.title = feito ? "Jogada já registrada nesta conversa" : falhou ? avisoJogada() + " Clique para tentar de novo." : "Usei esta jogada: registra no seu banco (não envia nada à Privacy)";
}
const avisoJogada = () => (avisoRodape && est && est.conv && avisoSala === (est.conv.sala || "") ? avisoRodape : "");

// ---------- copiar (+ "Usei" automático) ----------
async function escrever(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch (_) { /* janela sem foco: tenta do jeito antigo */ }
  try { const t = el("textarea", { style: "position:fixed;left:-999px;top:0", "aria-hidden": "true" }); t.value = txt; document.body.append(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return !!ok; } catch (_) { return false; }
}
async function copiar(txt, ev) {
  const ok = await escrever(txt);
  if (ok) { copiado = txt; copiadoEm = Date.now(); naoCopiouEm = 0; } else naoCopiouEm = Date.now();
  if (ev && ev.target && ev.target.isConnected) ev.target.textContent = ok ? "Copiado" : "Não copiou";
  return ok;
}
const rotuloCopiar = (txt) => (naoCopiouEm && Date.now() - naoCopiouEm < 2500 ? "Não copiou" : copiado === txt && Date.now() - copiadoEm < 2500 ? "Copiado" : "Copiar");
// 1 clique resolve tudo: copia o roteiro atual (ou o degrau da cena fixada) e já grava "Usei", se ainda não gravou.
// O botão "✓ Usei" continua existindo para marcar sem copiar.
async function copiarAtual(ev) {
  const a = acaoTopo; if (!a || !est || !est.conv) return;
  const ok = await copiar(a.texto, ev);
  if (ok && !registradas.has(chaveJogada(a.res))) await registrar(a.res); else desenhar();
}
function copiarTopo(a) {
  acaoTopo = a || null;
  const b = $("btnCopiarTopo"); if (!b) return;
  b.hidden = !a || !sessao; if (b.hidden) return;
  b.textContent = rotuloCopiar(a.texto);
}
// ---------- {placeholders}: dados automáticos + chips de 1 clique + edição em cima do campo ----------
const dadosDe = (res) => Object.assign({ nome: res.nome }, res.dados || {}, varsSala.get(salaK()) || {});
function definirVar(campo, valor) {
  const k = salaK(), v = Object.assign({}, varsSala.get(k) || {});
  if (valor) v[campo] = valor; else delete v[campo];
  varsSala.set(k, v); salvarEstadoSalas(); desenhar();
}
function editarCampo(span, campo, atual) {
  if (editando) return;
  editando = campo;
  const inp = el("input", { class: "campo", type: "text", maxlength: "80", placeholder: campo.replace(/_/g, " "), "aria-label": "Preencher " + campo });
  inp.value = atual || "";
  let fim = false;
  const fechar = (gravar) => { if (fim) return; fim = true; editando = null; inp.blur(); /* solta o foco: com o campo em foco o painel não redesenha */ if (gravar) definirVar(campo, inp.value.trim().replace(/\s+/g, " ")); else desenhar(); };
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); fechar(true); } else if (e.key === "Escape") { e.preventDefault(); fechar(false); } });
  inp.addEventListener("blur", () => fechar(true));
  span.replaceWith(inp); inp.focus(); inp.select();
}
// Texto do roteiro: campo que falta fica amarelo; campo preenchido fica sublinhado. Clicar em qualquer um edita ali mesmo.
function textoRoteiro(p, dados) {
  return el("div", { class: "txt" }, p.partes.map((x) => {
    if (!x.campo) return x.t;
    return el("span", { class: x.falta ? "falta" : "posto", "data-campo": x.campo, role: "button", title: x.falta ? "Clique para preencher {" + x.campo + "}" : "{" + x.campo + "} · clique para trocar",
      onclick: (ev) => editarCampo(ev.currentTarget, x.campo, x.falta ? "" : dados[x.campo] || x.t) }, x.t);
  }));
}
function chipsFaltam(p) {
  const C = R.chips_placeholders || {}, campos = p.faltam.filter((f) => Array.isArray(C[f]) && C[f].length);
  if (!campos.length) return null;
  return el("div", { class: "chips" }, campos.map((f) => el("div", { class: "chips-l", "data-campo": f }, el("span", { class: "chips-t" }, f.replace(/_/g, " ")),
    C[f].map((v) => el("button", { class: "chipb", type: "button", title: "Preencher {" + f + "} com “" + v + "”", onclick: () => definirVar(f, v) }, v)))));
}
const faixaCurta = (pr) => brl(pr.min) + (pr.min === pr.max ? "" : "–" + brl(pr.max).replace(/^R\$\s*/, ""));
// Faixa de preço. Clicar copia o valor de cima da faixa (ex.: 165,90) para colar no campo de preço do PPV.
let precoCopiadoEm = 0;
function chipPreco(res) {
  if (res.fase.id === "vulneravel" || !res.preco) return null;
  const valor = Number(res.preco.max).toFixed(2).replace(".", ","), agora = Date.now() - precoCopiadoEm < 1500;
  return el("button", { class: "chip preco-chip" + (agora ? " ok" : ""), type: "button", title: "Faixa de preço para este fã" + (res.preco.pix ? " · Pix" : "") + ". Clique para copiar " + valor + ".",
    onclick: async () => { if (await escrever(valor)) { precoCopiadoEm = Date.now(); desenhar(); } } }, agora ? valor + " copiado" : faixaCurta(res.preco));
}

// ---------- 11/11/2026 · próximo da fila, lembretes e nota rápida ----------
// PRÓXIMO DA FILA: o Delta não abre conversa (é passivo), mas diz qual abrir. Ordem (coach_regras.json > proximo):
// 1) lembrete vencido; 2) fã grande esperando; 3) quem escreveu hoje, mais atrasado primeiro (online na frente);
// 4) sem hora conhecida; 5) mensagens de outro dia, por quem gastou mais. A conversa aberta não entra.
function proximos() {
  if (!est || !Array.isArray(est.salas) || !R) return [];
  const agora = Date.now(), grande = (R.proximo && R.proximo.grande_brl) || 1000;
  const fl = M.fila(est.salas, R, agora, null).filter((s) => s.naoLidas > 0 && !s.aberta);
  const grupo = (s) => (s.gasto >= grande ? 0 : s.espera_s == null ? 2 : s.espera_s < 86400 ? 1 : 3);
  const folga = (s) => (s.folga_s == null ? 1e9 : s.folga_s);
  fl.sort((a, b) => grupo(a) - grupo(b) || (grupo(a) === 3 ? b.gasto - a.gasto : folga(a) - folga(b) || Number(b.online) - Number(a.online)) || b.gasto - a.gasto || b.naoLidas - a.naoLidas);
  const lem = lembretes.filter((l) => l.conta === est.conta && l.em <= agora && l.k !== salaK()).map((l) => ({ lembrete: true, nome: l.nome, atraso_s: (agora - l.em) / 1000 }));
  return lem.concat(fl.map((s) => ({ nome: s.nome, espera_s: s.espera_s, naoLidas: s.naoLidas, gasto: s.gasto, online: s.online, grande: s.gasto >= grande })));
}
function linhaProximo() {
  const ps = proximos(), p = ps[0];
  if (!p) return el("span", { class: "bd-prox ok" }, est && est.salas && est.salas.length ? "✓ Fila em dia" : "");
  if (p.lembrete) return el("span", { class: "bd-prox lem", title: "Lembrete que você marcou com o ⏰" }, "⏰ Voltar agora: ", el("b", {}, p.nome || "(sem nome)"), p.atraso_s > 90 ? " · há " + M.fmtSeg(p.atraso_s) : "", ps.length > 1 ? el("small", {}, " +" + (ps.length - 1)) : null);
  return el("span", { class: "bd-prox" + (p.grande ? " grande" : ""), title: "Próxima conversa para abrir nesta conta" + (ps.length > 1 ? " · mais " + (ps.length - 1) + " na fila" : "") },
    (p.grande ? "★ " : "▶ ") + "Próximo: ", el("b", {}, p.nome || "(sem nome)"),
    p.espera_s != null ? " · " + (p.espera_s >= 86400 ? "desde ontem" : M.fmtSeg(p.espera_s)) : "", " · " + p.naoLidas + (p.naoLidas === 1 ? " msg" : " msgs"), p.gasto ? " · " + brl(p.gasto) : "", p.online ? " · online" : "",
    ps.length > 1 ? el("small", {}, " +" + (ps.length - 1)) : null);
}
// LEMBRETE por fã (botão ⏰ ou tecla L): 10 min → 30 min → 1 h → desliga. Fica salvo neste Chrome. Quando vence, toca o
// bipe (se o som estiver ligado), a borda pulsa em ouro e o fã aparece em "Voltar agora" no rodapé da doca.
let lembretes = []; // [{ k, conta, nome, min, em, avisado }]
const salvarLembretes = () => chrome.storage.local.set({ lembretes });
const lembreteAtual = () => (est && est.conv ? lembretes.find((l) => l.k === salaK() && l.conta === est.conta) || null : null);
function ciclarLembrete() {
  if (!est || !est.conv) return;
  const mins = (R.lembretes && R.lembretes.minutos) || [10, 30, 60], at = lembreteAtual(), i = at ? mins.indexOf(at.min) : -1;
  lembretes = lembretes.filter((l) => l !== at);
  if (i + 1 < mins.length) lembretes.push({ k: salaK(), conta: est.conta, nome: est.conv.nome || est.conv.perfil || "", min: mins[i + 1], em: Date.now() + mins[i + 1] * 60000, avisado: false });
  salvarLembretes(); desenhar();
}
function botaoLembrete() {
  const at = lembreteAtual(), falta = at ? Math.max(0, at.em - Date.now()) : 0;
  return el("button", { class: "btn mini lead-bt" + (at ? " on" : ""), type: "button", "aria-label": "Lembrete para voltar a este fã", title: at ? "Lembrete em " + Math.ceil(falta / 60000) + " min. Clique para trocar o tempo ou desligar (tecla L)." : "Lembrar de voltar a este fã: 10 min, 30 min, 1 h (tecla L)",
    onclick: ciclarLembrete }, at ? "⏰ " + (falta < 60000 ? "<1m" : Math.ceil(falta / 60000) + "m") : "⏰");
}
// chamado a cada redesenho: avisa uma vez o que venceu e tira o lembrete do fã cuja conversa já está aberta
function conferirLembretes() {
  if (!lembretes.length) return false;
  const agora = Date.now(), k = est && est.conv ? salaK() : null; let mudou = false, vencido = false;
  lembretes = lembretes.filter((l) => {
    if (l.em > agora) return true;
    if (est && l.conta === est.conta && l.k === k) { mudou = true; return false; } // você já voltou a ele
    if (!l.avisado) { l.avisado = true; mudou = true; bipe("fu"); }
    if (!est || l.conta === est.conta) vencido = true;
    return agora - l.em < 6 * 3600e3; // some sozinho depois de 6 h
  });
  if (mudou) salvarLembretes();
  return vencido;
}
// NOTA RÁPIDA (botão ＋ ou tecla N): anota algo do lead sem sair da doca. Vai para as notas da ficha (as mesmas do Aura).
let notaAberta = false;
function abrirNota() { if (ficha && ficha.fa && est && est.conv) { notaAberta = true; desenhar(); } }
function campoNota() {
  const inp = el("input", { class: "nota-inp rapida", maxlength: "200", placeholder: "anote algo dele · ex.: profissao: engenheiro · recebe dia 5", "aria-label": "Nota rápida sobre o fã" });
  let fim = false;
  const fechar = async (gravar) => {
    if (fim) return; fim = true; notaAberta = false;
    const t = inp.value.trim(); inp.blur();
    if (gravar && t && ficha && ficha.fa) { try { const r = await rpc("painel_nota", { p_fa: ficha.fa.id, p_tipo: "nota", p_texto: t }); ficha = Object.assign({}, ficha, { notas: r.notas, tags: r.tags }); } catch (e) { avisoPane = "Não salvou a nota: " + e.message; } }
    desenhar();
  };
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); fechar(true); } else if (e.key === "Escape") { e.preventDefault(); fechar(false); } });
  inp.addEventListener("blur", () => fechar(true));
  setTimeout(() => { if (inp.isConnected) inp.focus(); }, 0);
  return inp;
}
// Topo da doca: nome do fã + selos principais + relógio (espera, follow-up do PPV ou "em dia"). Só aparece no mini.
const SELO_CURTO = { cara_baleia: "🐋 cara de baleia", multi: "2+ contas", nunca: "nunca pagou", ppv: "PPV pendente" };
function faTopo(res) {
  const t = $("faTopo"); if (!t) return;
  t.hidden = !res || !est || !est.conv; if (t.hidden) { t.replaceChildren(); return; }
  const rl = res.relogio, ordem = ["baleia", "cara_baleia", "vip", "freio", "esfriou", "potencial", "ppv", "nunca", "multi"];
  const sl = res.selos.filter((s) => ordem.includes(s.id)).sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id)).slice(0, 2);
  let rel;
  if (rl.espera_s != null) rel = [el("small", {}, rl.novo ? "novo · esperando" : "esperando"), el("b", { class: rl.cor }, M.fmtSeg(rl.espera_s))];
  else if (rl.fu) rel = [el("small", {}, "follow-up " + rl.fu.n + "/" + rl.fu.max), el("b", { class: rl.fu.falta_s > 0 ? "amarelo" : "vermelho" }, rl.fu.falta_s > 0 ? M.fmtSeg(rl.fu.falta_s) : "agora")];
  else rel = [el("small", {}, "em dia"), el("b", { class: "verde" }, "✓")];
  t.replaceChildren(el("b", { class: "ft-nome", title: est.conv.nome || "" }, est.conv.nome || est.conv.perfil || "(sem nome)"),
    el("span", { class: "ft-selos" }, sl.map((s) => el("span", { class: "chip " + s.id, title: s.dica || "" }, SELO_CURTO[s.id] || s.txt))),
    el("span", { class: "ft-rel", title: rl.espera_s != null ? "Ele espera resposta. Meta " + rl.meta_s + " s, limite " + rotuloLimite(rl.limite_s) + "." : rl.fu ? "PPV sem compra: próximo follow-up." : "Ninguém esperando nesta conversa." }, rel));
}
// Rodapé da doca: campos que faltam (chips de 1 clique) ou o próximo da fila, e à direita ✓ Usei + Copiar.
function linhaFila() {
  const fl = est && est.salas ? M.fila(est.salas, R, Date.now(), null).filter((s) => s.naoLidas > 0) : [];
  if (!fl.length) return el("span", { class: "bd-prox ok" }, "✓ Fila em dia");
  const maior = fl.reduce((m, s) => (s.espera_s != null && s.espera_s < 86400 ? Math.max(m, s.espera_s) : m), 0), antigas = fl.filter((s) => s.espera_s != null && s.espera_s >= 86400).length;
  return el("span", { class: "bd-prox" }, el("b", {}, String(fl.length)), fl.length === 1 ? " conversa esperando" : " conversas esperando", maior ? " · maior espera de hoje " + M.fmtSeg(maior) : "", antigas ? " · " + antigas + " de outro dia" : "");
}
function barraDoca(a, res, acao, semConversa) {
  const C = (R && R.chips_placeholders) || {}, falta = acao && Array.isArray(acao.faltam) ? acao.faltam.find((f) => Array.isArray(C[f]) && C[f].length) : null;
  const esq = falta ? el("span", { class: "bd-chips", "data-campo": falta }, el("span", { class: "chips-t" }, falta.replace(/_/g, " ")), C[falta].map((v) => el("button", { class: "chipb", type: "button", title: "Preencher {" + falta + "} com “" + v + "”", onclick: () => definirVar(falta, v) }, v))) : semConversa ? linhaFila() : linhaProximo();
  a.append(el("div", { class: "barra-doca" }, el("div", { class: "bd-esq" }, esq),
    res ? botaoUsei(res, true) : null,
    acao ? el("button", { class: "btn mini rosa copiar", type: "button", title: "Copiar e já marcar como usado (tecla C ou Enter)", onclick: (ev) => copiarAtual(ev) }, rotuloCopiar(acao.texto)) : null));
}

// ---------- radar periférico de urgência (borda pulsando + bipe opcional) ----------
// Com 3 janelas lado a lado, a borda de cima pulsa em OURO quando um VIP/Baleia espera resposta e em VERMELHO
// quando o relógio passou do limite ou um follow-up venceu. Só visual/som na janelinha do Delta.
// v2.3.14: termo de risco digitado (compliance_digitando): bipe grave UMA vez por termo novo na sala; só aviso, nunca bloqueia.
const riscoVisto = new Map(); // sala -> Set("grupo|termos")
function avisarRisco(res) {
  const sala = est && est.conv ? est.conv.sala : null, CD = R && R.compliance_digitando; if (!sala || !CD) return;
  const hits = ((res && res.alertas) || []).filter((x) => x.digitando), vistos = riscoVisto.get(sala) || new Set();
  if (!hits.length) { riscoVisto.delete(sala); return; }
  let novo = false;
  hits.forEach((x) => { const k = x.id + "|" + x.gatilho; if (!vistos.has(k)) { vistos.add(k); novo = true; } });
  riscoVisto.set(sala, vistos);
  if (novo && CD.som !== false) bipe("risco");
}
function bipe(tipo) {
  if (!som) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t0 = audio.currentTime + 0.01;
    (tipo === "vip" ? [880, 1320] : tipo === "risco" ? [440, 330] : [660, 660]).forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = t0 + i * 0.16;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.16);
    });
  } catch (_) { /* sem saída de áudio: fica só a borda */ }
}
function mostrarSom() {
  const b = $("btnSom"); if (!b) return;
  b.textContent = som ? "🔔" : "🔕"; b.setAttribute("aria-pressed", som ? "true" : "false");
  b.title = som ? "Som ligado: bipe quando entra mensagem de VIP/Baleia ou vence um follow-up. Clique para desligar." : "Som desligado. Clique para tocar um bipe quando entrar mensagem de VIP/Baleia ou vencer um follow-up.";
}
function radar(res) {
  const b = document.body.classList;
  if (!res || !est || !est.conv) { b.remove("urgente-vip", "urgente-sla"); return; }
  const rl = res.relogio, grande = res.selos.some((s) => s.id === "vip" || s.id === "baleia") || !!(res.tier && (res.tier.id === "vip" || res.tier.id === "baleia"));
  const vip = grande && rl.espera_s != null, fuVenceu = !!(rl.fu && rl.fu.falta_s <= 0), sla = rl.cor === "vermelho" || fuVenceu;
  b.toggle("urgente-vip", vip); b.toggle("urgente-sla", sla);
  // bipe só na virada (mensagem nova do VIP nesta sala; follow-up que acabou de vencer), nunca ao abrir a conversa
  const k = salaK(), ult = (est.msgs || []).filter((m) => m.de_fa).slice(-1)[0], idUlt = ult ? ult.id : "";
  if (somVisto.has(k) && somVisto.get(k) !== idUlt && vip) bipe("vip");
  somVisto.set(k, idUlt);
  if (rl.fu) { const kf = k + "|" + rl.fu.n; if (fuVisto.get(kf) === false && fuVenceu) bipe("fu"); fuVisto.set(kf, fuVenceu); }
}

// ---------- desenho ----------
function desenharLeitura(a, res) {
  // perfil do fã
  const PF = R.perfis_fa || {}, ids = Object.keys(PF).filter((k) => k !== "_doc");
  const sel = el("select", { class: "mini-sel", onchange: async (e) => { const v = e.target.value; if (v) perfis[faId()] = v; else delete perfis[faId()]; await chrome.storage.local.set({ perfis }); desenhar(); } },
    el("option", { value: "" }, res.perfil ? "auto: " + res.perfil.rotulo : "perfil: automático"), ids.map((k) => { const o = el("option", { value: k }, PF[k].rotulo); if (perfis[faId()] === k) o.selected = true; return o; }));
  const linha = el("div", { class: "leitura" }, el("span", { class: "pequeno" }, "Perfil "), sel, res.perfil ? el("span", { class: "pequeno fraco" }, " " + res.perfil.dica) : null);
  a.append(linha);
  // espelho + termômetro
  const e = res.espelho, t = res.termometro;
  if (e || t) a.append(el("div", { class: "leitura" },
    t ? el("div", { class: "termo" }, el("b", {}, t.n + "/10"), el("div", { class: "barra-meta" }, el("i", { style: "width:" + t.n * 10 + "%" })), el("span", { class: "pequeno fraco" }, t.dica)) : null,
    e ? el("div", { class: "pequeno" }, "Espelho: " + e.palavras + " palavras/msg · " + e.emojis + " emoji · " + e.por_vez + " msg por vez" + (e.resposta_s != null ? " · responde em " + M.fmtSeg(e.resposta_s) : "") + ". ", el("span", { class: "fraco" }, e.dica)) : null));
  // modo sequência (cena)
  const c = res.cena; if (!c || res.fase.id === "vulneravel") return;
  const k = est.conv.sala, cur = cenaSala.get(k) || { id: null, ajuste: 0 }, fixa = !!cenaFixa(res);
  const selC = el("select", { class: "mini-sel", onchange: (ev) => { cenaSala.set(k, Object.assign({}, cur, { id: ev.target.value, ajuste: 0 })); salvarEstadoSalas(); desenhar(); } }, c.lista.map((x) => { const o = el("option", { value: x.id }, x.id + " · " + x.titulo); if (x.id === c.id) o.selected = true; return o; }));
  const det = el("details", { class: "cena", ontoggle: (ev) => { cenaAberta = ev.target.open; } },
    el("summary", {}, "Cena · " + (c.fim ? "aftercare" : "degrau " + c.n + "/" + c.total) + " · " + c.titulo + (c.sugerida ? " (sugerida p/ o perfil)" : "") + (fixa ? " · fixada no topo" : "")));
  if (cenaAberta) det.open = true;
  // v2.1: fixa a cena no cartão principal (degrau, espera e legenda no topo, também no mini). Desafixa sozinha no fim.
  // (fica FORA do bloco recolhível, para estar sempre à vista)
  if (!c.fim) a.append(el("button", { class: "btn mini fixar" + (fixa ? " on" : ""), type: "button", "aria-pressed": fixa ? "true" : "false", title: fixa ? "Voltar a mostrar o roteiro normal no cartão principal" : "Mostrar o degrau desta cena no cartão principal (e no mini), pronto para copiar",
    onclick: () => { cenaSala.set(k, Object.assign({}, cur, { id: c.id, fixa: !fixa })); salvarEstadoSalas(); desenhar(); } }, fixa ? "🎬 Cena fixada no topo · desafixar" : "🎬 Fixar Cena no Topo"));
  det.append(el("div", { class: "barra" }, selC,
    el("button", { class: "btn mini", title: "degrau anterior", onclick: () => passoCena(res, -1) }, "−"),
    el("button", { class: "btn mini", title: "próximo degrau", onclick: () => passoCena(res, 1) }, "+")),
    barraDegraus(c));
  if (c.esperar) det.append(el("div", { class: "esperar" }, "Espere a resposta dele antes do próximo degrau."));
  if (c.n === 1 && !c.fim) det.append(el("div", { class: "pequeno" }, el("b", {}, "Abertura: "), c.abertura, " ", el("button", { class: "btn mini", onclick: (ev) => copiar(c.abertura, ev) }, "Copiar")));
  if (!c.fim) { const leg = M.preencher(c.legenda, dadosDe(res)); det.append(el("div", { class: "roteiro" }, el("div", { class: "pequeno fraco" }, "Degrau " + c.n + " · " + c.rotulo + " · preço " + faixaCurta(res.preco) + (c.pix ? " · Pix" : "")),
    el("div", { class: "txt" }, leg.texto), el("div", { class: "barra" }, el("span", { class: "esp" }), el("button", { class: "btn mini rosa", onclick: (ev) => copiar(leg.texto, ev) }, "Copiar legenda")))); }
  else det.append(el("div", { class: "pequeno" }, "Cena completa: aftercare 1 → espere → aftercare 2 → descanso. Anote no Aura a cena " + c.id + "."));
  det.append(el("div", { class: "pequeno fraco" }, c.origem + ". Só use se a conta tem esse conteúdo, na ordem."));
  a.append(det);
}
const barraDegraus = (c) => el("div", { class: "degraus" }, Array.from({ length: c.total }, (_, i) => el("i", { class: i + 1 < c.n || c.fim ? "feito" : i + 1 === c.n ? "agora" : "" })));
function passoCena(res, d) {
  const c = res && res.cena; if (!c || !est || !est.conv) return;
  const k = est.conv.sala, cur = cenaSala.get(k) || {};
  cenaSala.set(k, Object.assign({}, cur, { id: c.id, ajuste: (cur.ajuste || 0) + d })); salvarEstadoSalas(); desenhar();
}
// Cena fixada: o cartão principal mostra o degrau N/total, a barrinha de degraus, − / +, o aviso de espera e a legenda
// pronta (o "Copiar" do topo copia a legenda e já marca o degrau como usado).
function desenharCenaTopo(a, res, c) {
  const k = est.conv.sala, cur = cenaSala.get(k) || {}, dados = dadosDe(res), leg = M.preencher(c.legenda, dados);
  const nav = () => [el("button", { class: "btn mini nav", type: "button", title: "degrau anterior (←)", onclick: () => passoCena(res, -1) }, "−"),
    el("span", { class: "pequeno fraco" }, c.n + "/" + c.total),
    el("button", { class: "btn mini nav", type: "button", title: "próximo degrau (→)", onclick: () => passoCena(res, 1) }, "+")];
  a.classList.add("cena-topo");
  a.append(el("div", { class: "fase" }, el("span", { class: "chip" }, "Cena · degrau " + c.n + "/" + c.total), chipPreco(res), c.pix ? el("span", { class: "chip nobre" }, "Pix") : null,
    el("span", { class: "motivo" }, c.id + " · " + c.titulo),
    el("span", { class: "jog-inline" + (c.esperar ? " espere" : "") }, c.esperar ? "ESPERE a resposta dele" : c.rotulo + " · " + c.titulo),
    el("span", { class: "nav-mini" }, nav())));
  a.append(barraDegraus(c));
  a.append(c.esperar ? el("div", { class: "jogada espere" }, "ESPERE a resposta dele antes do próximo degrau.") : el("div", { class: "jogada" }, "Degrau " + c.n + ": " + c.rotulo));
  if (c.n === 1) a.append(el("div", { class: "pequeno abertura" }, el("b", {}, "Abertura: "), c.abertura, " ", el("button", { class: "btn mini", onclick: (ev) => copiar(c.abertura, ev) }, "Copiar")));
  a.append(el("div", { class: "roteiro" },
    textoRoteiro(leg, dados), chipsFaltam(leg),
    el("div", { class: "barra" }, nav(), el("span", { class: "esp" }),
      el("button", { class: "btn mini", type: "button", title: "Voltar ao roteiro normal", onclick: () => { cenaSala.set(k, Object.assign({}, cur, { id: c.id, fixa: false })); salvarEstadoSalas(); desenhar(); } }, "Desafixar"),
      botaoUsei(res, true),
      el("button", { class: "btn mini rosa copiar", type: "button", onclick: (ev) => copiarAtual(ev) }, rotuloCopiar(leg.texto))),
    avisoJogada() ? el("div", { class: "nota reg" + (/^(Jogada registrada|Já registrado)/.test(avisoJogada()) ? " ok" : " falhou") }, avisoJogada()) : null,
    leg.faltam.length ? el("div", { class: "nota" }, "Preencha antes de enviar: " + leg.faltam.map((f) => "{" + f + "}").join(", ")) : null,
    el("div", { class: "nota" }, c.origem + ". Só use se a conta tem esse conteúdo, na ordem.")));
  return { texto: leg.texto, res, n: c.total, cena: true, faltam: leg.faltam };
}
let cenaAberta = false, convAberta = false;
function desenharConversao(a) {
  if (!conversao || !conversao.length) return;
  const L = M.conversaoSemana(conversao);
  const d = el("details", { ontoggle: (e) => { convAberta = e.target.open; } }, el("summary", {}, "Roteiros da semana · conversão em 60 min"));
  if (convAberta) d.open = true;
  d.append(el("ul", { class: "lista" }, L.slice(0, 25).map((x) => el("li", {}, el("span", {}, el("b", {}, x.roteiro_id), el("small", { class: "fraco", style: "display:block" }, x.usos + " usos · " + x.vendas + " vendas · " + brl(x.receita))), el("span", { class: "chip " + (x.selo === "cortar" ? "esfriou" : x.selo === "manter" ? "nobre" : "") }, Math.round(x.conv * 100) + "% " + x.selo)))));
  a.append(d);
}
function desenharPlacar(a) {
  if (modo !== "dominante" || !est || !est.conta) return;
  const contas = R.contas_atendidas || [];
  let linhas, fonte;
  if (placarBanco) { linhas = placarBanco; fonte = "banco · PPVs de hoje"; }
  else {
    const d = hojeSP(), pl = placarLocal && placarLocal.data === d ? placarLocal.contas : {};
    linhas = contas.map((c) => ({ conta: c, receita: (pl[c] || {}).receita || 0, vendas: (pl[c] || {}).vendas || 0, ppvs: 0 }));
    fonte = "vendas vistas na tela hoje (rode o coach_sql.sql para o placar do banco)";
  }
  const P = M.placar(linhas, R, est.conta), at = P.atual;
  const box = el("div", { class: "placar" });
  if (at) {
    const pct = at.pct != null ? Math.round(at.pct * 100) : null;
    box.append(el("div", { class: "placar-top" },
      el("div", {}, el("div", { class: "placar-t" }, "Meta do dia"), el("div", { class: "placar-v" }, brl(at.receita) + (at.meta ? " / " + brl(at.meta) : ""))),
      el("div", { class: "placar-pos" }, el("span", { class: "pos-n" }, at.pos + "º"), el("small", {}, at.pos === 1 ? "na frente" : "atrás " + brl(P.atras_do_lider)))),
      at.meta ? el("div", { class: "barra-meta" }, el("i", { style: "width:" + Math.min(100, pct) + "%" })) : null,
      el("div", { class: "placar-k" },
        el("span", {}, el("b", {}, at.ticket != null ? brl(at.ticket) : "—"), " ticket"),
        el("span", {}, el("b", {}, at.conversao != null ? Math.round(at.conversao * 100) + "%" : "—"), " conversão"),
        el("span", {}, el("b", {}, String(at.vendas)), " vendas"),
        pct != null ? el("span", {}, el("b", {}, pct + "%"), " da meta") : null));
  }
  box.append(el("div", { class: "podio" }, P.linhas.map((l) => el("span", { class: l.conta === est.conta ? "eu" : "" }, el("i", {}, l.pos + "º"), " " + (((R.config_por_conta || {})[l.conta] || {}).rotulo || l.conta) + " ", el("b", {}, brl(l.receita))))));
  // v2.2 · ritmo de chegada + placar do chatter (login) + fechar turno
  const rt = ritmo(), eu = Array.isArray(chatter) ? chatter.find((x) => x.eu) : null;
  box.append(el("div", { class: "placar-eu" },
    el("span", { class: "ritmo", title: "Conversas diferentes que receberam mensagem nova do fã na última hora (visto na lista da tela)" }, "⚡ " + (rt == null ? "medindo…" : rt + " chats/h")),
    textoMedDia() ? el("span", { class: "ritmo", title: "Tempo médio entre a mensagem do fã e a resposta da conta, hoje, nas conversas salvas (mesma conta do Aura)" }, "⏱ " + textoMedDia()) : null,
    eu ? el("span", { class: "eu-hoje", title: "Suas jogadas marcadas hoje e as vendas das salas que você atendeu" + (chatter.length > 1 ? " · " + chatter.length + " chatters hoje" : "") }, "Você hoje: ", el("b", {}, brl(eu.receita)), " · " + eu.vendas + (Number(eu.vendas) === 1 ? " venda" : " vendas") + " · " + eu.jogadas + (Number(eu.jogadas) === 1 ? " jogada" : " jogadas") + (chatter.length > 1 ? " · " + (chatter.findIndex((x) => x.eu) + 1) + "º de " + chatter.length : "")) : null,
    botaoTurno()));
  blocoTurno(box);
  box.append(el("div", { class: "placar-f" }, "Fonte: " + fonte));
  a.append(box);
}

function desenharConta(a) {
  const c = (R.config_por_conta || {})[est.conta] || {};
  document.documentElement.style.setProperty("--conta", c.cor || "#8b1e3f");
  const b = $("contaBadge"); if (b) { b.replaceChildren(el("i", { class: "ponto" }), el("b", {}, c.rotulo || est.conta || "?"), el("span", {}, "@" + (est.conta || ""))); b.hidden = false; mostrarMini(); }
  if (contaDoPerfil && est.conta && est.conta !== contaDoPerfil) a.append(el("div", { class: "alerta aviso" }, el("b", {}, "Conta diferente neste perfil do Chrome"), "Este perfil é da " + contaDoPerfil + " e você abriu " + est.conta + ". Um leitor por conta: use o perfil certo. ", el("button", { class: "btn mini", onclick: async () => { contaDoPerfil = est.conta; await chrome.storage.local.set({ contaDoPerfil }); desenhar(); } }, "Este perfil agora é " + est.conta)));
}
function desenharHud(a, res) {
  const itens = (res.hud || []).slice();
  // próximo da fila também no painel inteiro (na doca ele fica no rodapé)
  const px = proximos()[0];
  if (px) itens.unshift({ nivel: px.lembrete || px.grande ? "aviso" : "info", txt: px.lembrete ? "Lembrete vencido: volte para " + (px.nome || "(sem nome)") + "." : "Próximo da fila: " + (px.nome || "(sem nome)") + (px.espera_s != null ? " · esperando " + (px.espera_s >= 86400 ? "desde ontem" : M.fmtSeg(px.espera_s)) : "") + " · " + px.naoLidas + " não lida" + (px.naoLidas === 1 ? "" : "s") + (px.gasto ? " · já gastou " + brl(px.gasto) : "") + "." });
  if (modo === "dominante" && est && est.salas) {
    const n = est.salas.filter((s) => s.naoLidas > 0).length;
    if (n >= ((R.modos.dominante.limiares.fila_alerta_n || {}).v || 3)) itens.push({ nivel: "aviso", txt: n + " conversas com mensagem não lida na fila. Ritmo!" });
  }
  if (!itens.length) return;
  a.append(el("div", { class: "hud" }, itens.map((x) => el("div", { class: "hud-i " + x.nivel + (x.tipo ? " " + x.tipo : "") }, String(x.txt).replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, ""),
    x.tipo === "meta7" ? el("div", { class: "barra-meta hud-barra" + (x.batida ? " ok" : "") }, el("i", { style: "width:" + Math.round((x.pct || 0) * 100) + "%" })) : null))));
}
// Dados do lead, sempre ACIMA da sugestão de conversa (pedido do usuário em 11/11/2026), também na doca:
// linha 1 = dinheiro (total, nº de compras, última compra de conteúdo, há quantos dias, contas, selos);
// linha 2 = o que se sabe dele (dados das notas "chave: valor", perfil, tags e a nota mais recente).
function dadosLead(res, total) {
  // f = ficha (notas e dados dele); fd = ficha para dinheiro/compras (nula se a ligação ao comprador for só pelo nome)
  const f = ficha, fd = ligacaoProvavel() ? null : ficha, l1 = [], l2 = [];
  if (!fd && f) l1.push(el("span", { class: "chip so-nome", title: "As compras desta ficha foram ligadas só pelo nome e podem ser de outra pessoa. Abra “Detalhes” dele na Privacy para confirmar." }, "⚠ só por nome"));
  // v2.3.5: o banco ainda não tem a venda, mas ela apareceu na tela (PPV pago): mostra a compra vista em vez de "sem compra"
  const vista = !(total > 0) && Number(res.ctx.ultCompraValor) > 0 ? Number(res.ctx.ultCompraValor) : 0;
  if (vista) l1.push(el("b", { class: "din" }, brl(vista)), el("span", { title: "Compra vista na tela da Privacy; o banco ainda não tem esta venda." }, "comprou agora (vista na tela)"));
  else l1.push(el("b", { class: total > 0 ? "din" : "din zero" }, total > 0 ? brl(total) : "sem compra"));
  if (fd && Number(fd.n) > 0) l1.push(fd.n + (Number(fd.n) === 1 ? " compra" : " compras"));
  if (res.ctx.ultCompraValor && !vista) l1.push("últ. " + brl(res.ctx.ultCompraValor).replace(/^R\$\s*/, ""));
  if (fd && fd.dias_sem != null) l1.push(fd.dias_sem === 0 ? "comprou hoje" : "há " + fd.dias_sem + " d");
  const selosLead = res.selos.filter((s) => s.id !== "perfil").slice(0, 3).map((s) => el("span", { class: "chip " + s.id }, s.txt));
  const d = res.dados || {}, ordem = ["profissao", "dia_pagamento", "time", "hobby", "detalhe"];
  ordem.forEach((k) => { if (d[k]) l2.push(d[k]); });
  if (res.perfil) l2.push("perfil " + res.perfil.rotulo.toLowerCase());
  if (f) {
    (f.tags || []).slice(0, 3).forEach((t) => { if (t.texto && !/^\s*[a-zà-ÿ_ ]{2,24}\s*[:=]/i.test(t.texto)) l2.push("#" + t.texto); });
    // a nota livre mais recente, menos a que já virou dado (ex.: "recebe dia 5" já aparece como "dia 5")
    const nota = (f.notas || []).find((n) => n.texto && !/^\s*[a-zà-ÿ_ ]{2,24}\s*[:=]/i.test(n.texto) && !(d.dia_pagamento && /\bdia \d{1,2}\b|dia [uú]til/i.test(n.texto)));
    if (nota) l2.push("“" + String(nota.texto).slice(0, 70) + "”");
  }
  // menos importantes por último (na doca a linha corta no fim)
  if (fd && Array.isArray(fd.por_conta) && fd.por_conta.length > 1) l2.push("compra em " + fd.por_conta.length + " contas");
  if (res.previsao && res.previsao.ativo && res.previsao.gasto7 > 0) l2.push("7 primeiros dias: " + brl(res.previsao.gasto7));
  const junta = (xs) => xs.flatMap((x, i) => (i ? [" · ", x] : [x]));
  const podeNota = !!(f && f.fa);
  if (notaAberta && podeNota) return el("div", { class: "lead editando" }, campoNota());
  return el("div", { class: "lead" },
    el("div", { class: "lead-t" }, el("div", { class: "lead1" }, junta(l1), selosLead.length ? el("span", { class: "lead-selos" }, selosLead) : null), l2.length ? el("div", { class: "lead2" }, junta(l2)) : null),
    el("span", { class: "lead-b" },
      podeNota ? el("button", { class: "btn mini lead-bt", type: "button", "aria-label": "Anotar algo sobre este fã", title: "Anotar algo sobre ele sem sair daqui (tecla N). Ex.: profissao: engenheiro", onclick: abrirNota }, "＋") : null,
      botaoLembrete()));
}
const rotuloLimite = (s) => (s % 60 === 0 ? s / 60 + " min" : s + " s");
function origemTag(o) { return el("span", { class: "orig", title: (R && R.origens[o]) || "" }, ORIG[o] || o); }

function desenharAlertas(res) {
  const a = $("alertas"); a.replaceChildren();
  // v2.3.6 (do Aura): ficha ligada ao comprador só pelo nome
  if (res && est && est.conv && ligacaoProvavel()) a.append(el("div", { class: "alerta aviso" }, el("b", {}, "Ligação só por nome: "), "as compras desta ficha podem ser de outra pessoa com o mesmo nome. Abra “Detalhes” dele na Privacy para confirmar. Até lá, preço, selos e IA usam só o que está na tela."));
  if (res && res.fase.id === "vulneravel") a.append(el("div", { class: "alerta pare" }, "PARE DE VENDER – avise o gestor. " + res.fase.motivo));
  // Leitura falhou: há conversa aberta mas nenhuma mensagem foi lida. Sem isso o Delta sugeriria no escuro.
  const dg = est && est.conv ? est.diag : null;
  if (dg && dg.lidas === 0) a.append(el("div", { class: "alerta pare leitura-falhou" }, dg.vistas > 0 ? "Não li as mensagens desta conversa (" + dg.vistas + " na tela" + (dg.avisos ? ", " + dg.avisos + " tratadas como aviso" : "") + (dg.sem_id ? ", " + dg.sem_id + " sem código" : "") + "). As sugestões abaixo não valem: dê F5 na Privacy." : "Conversa aberta, mas não achei as mensagens na tela. Role a conversa ou dê F5 na Privacy."));
  (res ? res.alertas : []).forEach((x) => a.append(el("div", { class: "alerta " + x.nivel },
    el("b", {}, x.nivel === "revisor" ? "Revisor: " : (x.nivel === "bloqueio_visual" ? "NÃO ENVIE assim: " : x.nivel === "aviso" ? "Atenção: " : "Dica: ") + x.gatilho), x.motivo)));
}

function contexto() {
  const conv = est.conv, k = conv.perfil ? conv.perfil.toLowerCase() : "";
  return { agora: Date.now(), conta: est.conta, conv, msgs: est.msgs || [], ppvs, ficha, ligacaoSoNome: ligacaoProvavel(), compraTelaEm: (totais.get(k) || {}).compraTelaEm || null, config: (R.config_por_conta || {})[est.conta] || {}, texto, modo,
    perfil: perfis[faId()] || null, cena: (cenaSala.get(conv.sala) || {}).id || null, cenaAjuste: (cenaSala.get(conv.sala) || {}).ajuste || 0, copiado, historico,
    convVar, cenaFixa: !!(cenaSala.get(conv.sala) || {}).fixa, padrao: est.padrao || null, momentoStats, roteiroOferta: roteiroOfertaSala.get(conv.sala) || null };
}

function desenhar() {
  // Digitando um {campo} em cima do roteiro: não redesenha (o campo sumiria). Volta ao normal ao confirmar/sair.
  if (editando) { if (document.querySelector("#conteudo input.campo")) return; editando = null; }
  // v2.3.13: digitando uma nota/tag numa aba o painel CONTINUA atualizando; o remendar() não mexe no campo em foco
  if (!sessao || !R) { useiTopo(null); copiarTopo(null); faTopo(null); radar(null); desenharRadar(); return; }
  const lembreteVencido = conferirLembretes();
  document.body.classList.toggle("urgente-lembrete", lembreteVencido);
  const vivo = $("conteudo"), a = document.createElement("div"); useiTopo(null); copiarTopo(null);
  try { desenharCorpo(a); } finally { remendar(vivo, a); } // v2.3.13: monta fora da tela e remenda só o que mudou
}
function desenharCorpo(a) {
  document.body.dataset.aba = aba; desenharRadar();
  if (!est || !est.conv || fichaErro === "conta_fora") radar(null);
  if (!est || !est.conv) faTopo(null);
  if (!est) { desenharAlertas(null); selo("fora da Privacy"); a.append(el("p", { class: "vazio" }, "Abra privacy.com.br/chat na janela do Chrome e clique numa conversa. Se a aba já estava aberta, atualize com F5.")); return; }
  if (!est.conv) {
    desenharAlertas(null); selo("nenhuma conversa");
    // sem conversa aberta: o Delta diz quais abrir, em ordem (ele não abre sozinho: é passivo)
    if (R.contas_atendidas.includes(est.conta)) desenharConta(a);
    const ps = proximos().slice(0, 3);
    a.append(el("div", { class: "vazio prox-lista" }, ps.length ? [el("div", { class: "pl-t" }, "Abra na Privacy, nesta ordem:"),
      ps.map((p, i) => el("div", { class: "pl-i" + (p.lembrete || p.grande ? " grande" : "") }, el("b", {}, i + 1 + ". " + (p.lembrete ? "⏰ " : p.grande ? "★ " : "") + (p.nome || "(sem nome)")),
        p.lembrete ? " · lembrete vencido" : (p.espera_s != null ? " · " + (p.espera_s >= 86400 ? "desde ontem" : "esperando " + M.fmtSeg(p.espera_s)) : "") + " · " + p.naoLidas + (p.naoLidas === 1 ? " msg" : " msgs") + (p.gasto ? " · já gastou " + brl(p.gasto) : "") + (p.online ? " · online" : "")))]
      : "Clique numa conversa na Privacy. Ninguém esperando na lista carregada."));
    if (R.contas_atendidas.includes(est.conta)) desenharAbas(a, null); if (aba === "delta") desenharFila(a);
    barraDoca(a, null, null, true); return;
  }
  if (fichaErro === "conta_fora") { desenharAlertas(null); selo("conta fora", "rosa"); a.append(el("p", { class: "vazio" }, "A conta " + (est.conta || "desta aba") + " não é atendida pelo Delta. Nada é lido nem gravado.")); return; }

  const res = M.calcular(contexto(), R, ROT, CN);
  window.__coachUltimo = res; // para teste
  // cena fixada que chegou ao fim (passou do último degrau): desafixa sozinha e volta ao roteiro normal
  if (res.cena && res.cena.fim && (cenaSala.get(est.conv.sala) || {}).fixa) { cenaSala.set(est.conv.sala, Object.assign({}, cenaSala.get(est.conv.sala), { fixa: false })); salvarEstadoSalas(); }
  radar(res);
  if (!res.sugestaoOferta && roteiroOfertaSala.has(est.conv.sala)) roteiroOfertaSala.delete(est.conv.sala); // o momento passou: o "ver roteiro de oferta" não volta sozinho
  avisarRisco(res);
  desenharAlertas(res);
  desenharConta(a);
  carregarPlacar(false); carregarConversao(false); carregarConvVar(false); carregarMomentoStats(false); carregarChatter(false); carregarDia(false);
  desenharPlacar(a);
  selo(ficha ? "ficha carregada" : fichaErro ? "sem ficha" : "procurando ficha…", ficha ? "verde" : "rosa");

  // cabeçalho
  const rl = res.relogio;
  const rel = el("div", { class: "relogio" });
  if (rl.espera_s != null) rel.append(el("div", { class: "grande " + rl.cor }, M.fmtSeg(rl.espera_s)), el("div", { class: "r" }, rl.novo ? "assinante novo · limite " + rotuloLimite(rl.limite_s) : "esperando · meta " + rl.meta_s + " s"));
  else rel.append(el("div", { class: "grande verde" }, "—"), el("div", { class: "r" }, "ninguém esperando"));
  if (rl.fu) rel.append(el("div", { class: "r" }, "FU " + rl.fu.n + "/" + rl.fu.max + (rl.fu.falta_s > 0 ? " em " + M.fmtSeg(rl.fu.falta_s) : " agora")));
  const selos = el("div", { class: "selos" }, res.selos.map((s) => el("span", { class: "chip " + s.id, title: (s.dica || "") + " · origem: " + (R.origens[s.origem] || s.origem) }, s.txt)),
    rl.nobre ? el("span", { class: "chip nobre", title: "20h–3h = 41,3% da receita (base)" }, rl.pico ? "PICO" : "Horário nobre") : null);
  const fichaDin = ficha && !ligacaoProvavel(), total = fichaDin ? Number(ficha.total) : est.conv.total;
  // === Padrão detectado pelo leitor ===
  const rotulosPadrao = {
    mencionou_preco: "💰 Mencionou preço",
    rapido_positivo: "🔥 Rápido positivo",
    lento_curto: "🐢 Respostas curtas",
    mandou_audio: "🎤 Mandou áudio"
  };
  const chipPadrao = (est.padrao && est.padrao !== "neutro")
    ? el("span", { class: "chip", style: "margin-left:8px; font-size:11px; opacity:0.9; vertical-align:middle" }, rotulosPadrao[est.padrao] || est.padrao)
    : null;

  a.append(el("div", { class: "cab" },
    el("div", {}, 
      el("div", { class: "nome" }, est.conv.nome || est.conv.perfil || "(sem nome)", chipPadrao),
      el("div", { class: "sub" }, est.conta + (total != null ? " · gastou " + brl(total) + (fichaDin ? " na empresa" : " nesta conta") : "") + (res.ctx.gasto7 != null ? " · " + brl(res.ctx.gasto7) + " nos 7 primeiros dias" : "")),
      selos), rel, dadosLead(res, total)));
  // v2.3.15: Momento de ofertar (coach_regras.json > momento_ofertar). Só destaca e prioriza; não envia nem troca o roteiro.
  if (res.momentoOfertar) a.append(el("div", { class: "ofertar-agora", role: "status", title: "Gatilho: " + res.momentoOfertar.gatilho + (res.momentoOfertar.padrao ? " · padrão lido: " + res.momentoOfertar.padrao : "") + " · peso do boost: " + String(Math.round(res.momentoOfertar.peso * 10) / 10).replace(".", ",") + (res.momentoOfertar.pesoAprendido ? " (aprendido com as vendas)" : " (padrão do JSON)") },
    el("b", {}, "🎯 Ofertar agora"), " · " + res.momentoOfertar.motivo + (res.momentoOfertar.variantes.length ? " As variantes de oferta vêm primeiro." : ""),
    // v2.3.17: o roteiro atual não é de oferta: oferece VER o roteiro de oferta (só troca o que aparece aqui; não envia nada)
    res.sugestaoOferta ? el("div", { class: "ofertar-sug" },
      res.sugestaoOferta.aplicada
        ? [el("span", {}, "Mostrando o roteiro de oferta " + res.sugestaoOferta.id + " (" + res.sugestaoOferta.situacao + "). "),
           el("button", { class: "btn mini", type: "button", onclick: () => { roteiroOfertaSala.delete(est.conv.sala); desenhar(); } }, "Voltar ao " + (res.sugestaoOferta.atual || "anterior"))]
        : [el("span", {}, "O roteiro atual (" + (res.sugestaoOferta.atual || "?") + ") não é de oferta. Sugestão: " + res.sugestaoOferta.situacao + ". "),
           el("button", { class: "btn mini rosa", type: "button", onclick: () => { roteiroOfertaSala.set(est.conv.sala, res.sugestaoOferta.id); variante = 0; desenhar(); } }, "Ver " + res.sugestaoOferta.id)]) : null));
  if (fichaErro && fichaErro !== "conta_fora") a.append(el("p", { class: "pequeno fraco" }, "Ficha indisponível (" + fichaErro + "). As regras usam só o que está na tela."));

  desenharHud(a, res);
  // fase
  const fora = a; a = el("section", { class: "card jogo" }); fora.append(a);
  let acao = null; // o que o "Copiar" do topo copia
  const cFixa = cenaFixa(res);
  if (cFixa) acao = desenharCenaTopo(a, res, cFixa);
  else {
  if (res.roteiro && roteiroAtual !== res.roteiro.id) { roteiroAtual = res.roteiro.id; variante = 0; }
  const vsRot = res.roteiro ? (res.variantes && res.variantes.length ? res.variantes : res.roteiro.variantes) : [];
  // ⚡ Adaptar: quando a IA devolveu versões para este roteiro, elas entram NO LUGAR das variantes (‹ 1/3 › passa por
  // elas), também na doca. "voltar" (ou trocar de roteiro) devolve as variantes normais.
  const iaV = iaAtiva(res), vs = iaV ? iaV.map((x) => x.texto) : vsRot;
  let baseIA = "";
  const nav = () => [res.roteiro ? botaoAdaptar(res, () => baseIA) : null,
    el("button", { class: "btn mini nav", type: "button", title: "variante anterior", onclick: () => passoVariante(-1) }, "‹"),
    el("span", { class: "pequeno fraco" }, (variante % vs.length) + 1 + "/" + vs.length),
    el("button", { class: "btn mini nav", type: "button", title: "próxima variante", onclick: () => passoVariante(1) }, "›")];
  // fase + faixa de preço ao lado (no mini é onde o preço aparece) + setinhas ‹ 1/3 › (só no mini; no inteiro ficam na barra do roteiro)
  a.append(el("div", { class: "fase" }, el("span", { class: "chip" }, (res.rotuloFase || NOMES_FASE[res.fase.id]) + (res.fase.tipo ? " · " + NOMES_OBJ[res.fase.tipo] : "")), res.tier && res.modo === "dominante" ? el("span", { class: "chip tier " + res.tier.id }, res.tier.rotulo) : null, chipPreco(res), el("span", { class: "motivo" }, res.fase.motivo),
    el("span", { class: "jog-inline", title: res.jogada.txt + " · " + res.fase.motivo }, res.jogada.txt), // só na doca: a instrução na mesma linha da fase
    vs.length ? el("span", { class: "nav-mini" }, nav()) : null));

  // jogada + roteiro
  a.append(el("div", { class: "jogada" }, res.jogada.txt));
  if (res.roteiro) {
    const v = vs[variante % vs.length], dados = dadosDe(res);
    const p = M.preencher(v, dados);
    baseIA = iaV ? M.preencher(vsRot[0], dados).texto : p.texto;
    acao = { texto: p.texto, res, n: vs.length, faltam: p.faltam, base: baseIA };
    const caixa = el("div", { class: "roteiro" + (iaV ? " da-ia" : "") },
      ia && ia.chave === chaveIA(res) && ia.erro ? el("div", { class: "ia-erro" }, "⚡ " + ia.erro) : null,
      textoRoteiro(p, dados),
      chipsFaltam(p),
      el("div", { class: "barra" },
        nav(),
        el("span", { class: "esp" }), origemTag(res.roteiro.origem),
        botaoUsei(res, true),
        el("button", { class: "btn mini rosa copiar", type: "button", title: "Copiar e já marcar como usado (tecla C ou Enter)", onclick: (ev) => copiarAtual(ev) }, rotuloCopiar(p.texto))),
      blocoIA(res),
      !iaV && res.variantesInfo && res.variantesInfo.melhor && res.variantesIdx[variante % vs.length] === res.variantesInfo.melhor.i ? el("div", { class: "nota melhor" }, "★ Esta é a variante que mais converteu na semana (" + Math.round(res.variantesInfo.melhor.conv * 100) + "% em " + res.variantesInfo.melhor.usos + " usos): por isso vem primeiro.") : null,
      res.momentoOfertar && res.momentoOfertar.variantes.includes(res.variantesIdx[variante % vs.length]) ? el("div", { class: "nota oferta" }, "🎯 Variante de oferta: sobe agora porque é o momento de ofertar.") : null,
      res.variantesInfo && res.variantesInfo.ocultas.length ? el("div", { class: "nota" }, res.variantesInfo.ocultas.length + (res.variantesInfo.ocultas.length === 1 ? " variante já usada com ele ficou escondida." : " variantes já usadas com ele ficaram escondidas.")) : null,
      avisoJogada() ? el("div", { class: "nota reg" + (/^(Jogada registrada|Já registrado)/.test(avisoJogada()) ? " ok" : " falhou") }, avisoJogada()) : null,
      p.faltam.length ? el("div", { class: "nota" }, "Preencha antes de enviar: " + p.faltam.map((f) => "{" + f + "}").join(", ")) : null,
      res.roteiro.nota ? el("div", { class: "nota" }, res.roteiro.nota) : null,
      el("div", { class: "nota" }, res.roteiro.id + " · " + res.roteiro.situacao + (res.modo === "dominante" ? " · tom dominante" : "")));
    if (res.repetido) caixa.prepend(el("div", { class: "repetido" }, res.repetido.txt));
    a.append(caixa);
  }
  }
  a = fora;
  desenharAbas(a, res); // v2.2: abas do Aura logo abaixo do comando principal
  if (res.modo === "dominante") { const lt = el("section", { class: "card leit" }); desenharLeitura(lt, res); a.append(lt); }

  // preço
  const pr = res.preco;
  if (res.fase.id !== "vulneravel") {
    a = el("section", { class: "card precos" }); fora.append(a);
    a.append(el("h3", {}, "Preço para este fã"));
    a.append(el("div", { class: "preco" },
      el("div", {}, el("div", { class: "faixa" }, pr.min === pr.max ? brl(pr.min) : brl(pr.min) + " – " + brl(pr.max)),
        el("div", { class: "liq" }, "você recebe ≈ " + brl(pr.liquido[0]) + (pr.min === pr.max ? "" : " – " + brl(pr.liquido[1])) + " (taxa Privacy 20%)" + (pr.ultima ? " · última compra " + brl(pr.ultima) : ""))),
      el("div", { style: "display:flex;gap:4px;flex-direction:column;align-items:flex-end" }, pr.origem.map(origemTag), pr.pix ? el("span", { class: "chip nobre" }, "Pix") : null)));
    a.append(el("p", { class: "pequeno fraco", style: "margin:4px 0 0" }, pr.nota));
    // v2.1: projeção da escada (fã comprando ou Modo Dominante): os 3 próximos degraus de preço
    if (res.escada) a.append(el("div", { class: "escada", title: "+" + res.escada.pct + "% por degrau, nunca mais que o dobro do anterior" + (res.escada.teto ? " · limitado ao teto do chat" : "") },
      el("span", { class: "escada-t" }, "Próximos degraus:"), res.escada.degraus.flatMap((v, i) => [i ? el("span", { class: "seta" }, "→") : null, el("span", { class: "degrau" }, i + 1 + "º ", el("b", {}, brl(v)))])));
    const m7 = res.meta7;
    // No compacto (<360 px) a meta de 7 dias aparece só no HUD de cima (linha + barrinha): aqui seria repetição.
    if (res.modo === "dominante" && !document.body.classList.contains("compacto")) {
      const b7 = el("div", { class: "meta7-bloco" }); a.append(b7);
      b7.append(el("h3", { title: "R$500 nos 7 primeiros dias → 59,4% chegam a R$1.000 (base)" }, "Meta dos 7 primeiros dias"));
      if (!m7) b7.append(el("p", { class: "pequeno fraco" }, "sem dado (a ficha não trouxe todas as compras)"));
      else b7.append(el("div", { class: "meta7" },
        el("div", { class: "barra-meta" + (m7.batida ? " ok" : "") }, el("i", { style: "width:" + Math.round(m7.pct * 100) + "%" })),
        el("div", { class: "pequeno" }, brl(m7.gasto) + " de " + brl(m7.meta) + (m7.batida ? " · BATEU" : m7.ativo ? " · faltam " + brl(m7.falta) + " em " + m7.dias_restantes + "d" : " · janela fechada"))));
    }
  }

  a = fora;
  // recursos
  if (res.recursos.length && res.fase.id !== "vulneravel") {
    a.append(el("h3", {}, "Recurso da Privacy agora"));
    res.recursos.forEach((x) => a.append(el("div", { class: "recurso" }, el("b", {}, x.txt), el("span", { class: "pequeno fraco" }, x.aviso))));
  }

  // estado do PPV
  a.append(el("p", { class: "pequeno fraco", style: "margin-top:12px" },
    res.ppvFonte === "banco" ? "PPVs lidos do banco (emp_ppvs)."
      : (!ppvsDisponivel ? "Estado do PPV indisponível (coach_ppvs não existe no banco)." : "Sem PPV no banco para esta sala.")
        + (res.ppvFonte === "tela" ? (res.ppvEstadoTela ? " Usando o PPV visto na tela (pago / não pago lido na tela da Privacy)." : " Usando o PPV visto na tela (palpite: não sei se ele comprou).") : " Nenhum PPV visto na tela.")));

  if (est.diag) a.append(el("p", { class: "pequeno fraco leitura-diag" }, "Leitura da tela: " + est.diag.lidas + " de " + est.diag.vistas + " mensagens lidas" + (est.diag.avisos ? " · " + est.diag.avisos + " aviso(s) de venda ignorado(s)" : "") + (est.diag.sem_id ? " · " + est.diag.sem_id + " sem código" : "") + (est.diag.sala ? "" : " · sala não identificada (uso o número do chat)") + " · " + (est.salas || []).length + " conversas na lista."));
  if (!res.roteiro && !cFixa) a.append(el("div", { class: "usei-fim" }, botaoUsei(res, false), el("span", { class: "pequeno fraco" }, avisoJogada())));
  useiTopo(res); copiarTopo(acao); faTopo(res);
  barraDoca(a, res, acao);

  desenharFila(a);
}



// ---------- variantes e atalhos de teclado ----------
function passoVariante(d) {
  const n = acaoTopo && !acaoTopo.cena ? acaoTopo.n : 0; if (!n) return;
  variante = (((variante % n) + d) % n + n) % n; desenhar();
}
// Com o foco fora de campos de texto: C ou Enter = copiar + Usei · 1/2/3 ou ← → = variante (ou degrau da cena) · M = mini.
document.addEventListener("keydown", (e) => {
  // v2.3: Alt+1/2/3 = trocar de modelo (com o ajudante aberto ele pega a tecla antes; sem ele, avisa)
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat && /^[1-9]$/.test(e.key) && sessao && R) {
    const c = teclasPalco()[Number(e.key) - 1]; if (c) { e.preventDefault(); pedirTroca(c); } return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !sessao || $("telaApp").hidden) return;
  const t = e.target, tag = t && t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "m") { e.preventDefault(); if (!palco) definirMini(!mini); return; } // no Palco o painel fica sempre inteiro
  if (k === "n") { e.preventDefault(); abrirNota(); return; }          // nota rápida do lead
  if (k === "l") { e.preventDefault(); ciclarLembrete(); return; }     // lembrete 10 min → 30 min → 1 h → desliga
  if (k === "a" && acaoTopo && !acaoTopo.cena && acaoTopo.res.roteiro) { // ⚡ adaptar com a IA / voltar ao roteiro
    e.preventDefault();
    if (iaAtiva(acaoTopo.res)) { ia = null; variante = 0; desenhar(); } else adaptar(acaoTopo.res, acaoTopo.base || acaoTopo.texto);
    return;
  }
  const a = acaoTopo; if (!a) return;
  if (k === "c" || (k === "Enter" && tag !== "BUTTON" && tag !== "SUMMARY" && tag !== "A")) { e.preventDefault(); copiarAtual(); }
  else if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); const d = k === "ArrowLeft" ? -1 : 1; if (a.cena) passoCena(a.res, d); else passoVariante(d); }
  else if ((k === "1" || k === "2" || k === "3") && !a.cena && Number(k) <= a.n) { e.preventDefault(); variante = Number(k) - 1; desenhar(); }
});

let filaAberta = false;
function desenharFila(a) {
  if (!est || !est.salas || !est.salas.length) return;
  const res = window.__coachUltimo;
  const esperando = M.fila(est.salas, R, Date.now(), res && est.conv ? res.fase.id : null).filter((s) => s.naoLidas > 0);
  const estour = esperando.filter((s) => s.estourou).length;
  const d = el("details", { ontoggle: (e) => { filaAberta = e.target.open; } }, el("summary", {}, "Fila · " + esperando.length + " com mensagem não lida" + (estour ? " · " + estour + " passou do prazo" : "") + (textoMedDia() ? " · " + textoMedDia() : "")));
  if (filaAberta || estour) d.open = true;
  d.append(el("ul", { class: "lista" }, esperando.length ? esperando.map((s) => el("li", { class: s.estourou ? "estourou" : "" }, el("span", {}, el("b", {}, s.nome || "(sem nome)"), s.online ? " · online" : "", el("small", { class: "fraco", style: "display:block" }, s.rotulo + " · prazo " + M.fmtSeg(s.sla_s) + (s.espera_s != null ? " · esperando " + (s.espera_s >= 86400 ? "desde ontem ou antes" : M.fmtSeg(s.espera_s)) : "") + (s.gasto ? " · gastou " + brl(s.gasto) : ""))), el("span", {}, s.estourou ? "⏰ " + s.naoLidas : s.naoLidas))) : el("li", { class: "fraco" }, "Ninguém esperando na lista carregada.")));
  a.append(d);
  if (est.conv) desenharConversao(a);
}

// ---------- início ----------
$("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault(); $("erroLogin").textContent = "";
  try { await pedirAuth("password", { email: $("email").value.trim(), password: $("senha").value }); $("senha").value = ""; mostrarTela(); pedirEstado(); }
  catch (err) { $("erroLogin").textContent = /invalid/i.test(err.message) ? "E-mail ou senha incorretos." : err.message; }
});
$("btnSair").addEventListener("click", sair);

function pedirEstado() {
  if (origem == null) return;
  chrome.tabs.query({ active: true, windowId: origem }, (abas) => {
    const aba = abas && abas[0]; if (!aba) return;
    chrome.tabs.sendMessage(aba.id, { t: "coach_pedir" }, () => {
      if (chrome.runtime.lastError) { est = null; ficha = null; fichaChave = ""; fichaErro = ""; desenhar(); }
    });
  });
}
chrome.tabs.onActivated.addListener((i) => { if (i.windowId === origem) pedirEstado(); });
chrome.tabs.onUpdated.addListener((id, mud, aba) => { if (aba.windowId === origem && aba.active && mud.status === "complete") setTimeout(pedirEstado, 1500); });
// guarda onde você deixou a janela do Coach
window.addEventListener("beforeunload", () => { chrome.storage.local.set({ coachPos: { left: window.screenX, top: window.screenY, width: window.outerWidth, height: mini ? alturaCheia || 860 : window.outerHeight } }); });
let apertando = false;
document.addEventListener("pointerdown", () => { apertando = true; }, true);
["pointerup", "pointercancel"].forEach((t) => document.addEventListener(t, () => { apertando = false; }, true));
window.addEventListener("blur", () => { apertando = false; });
setInterval(() => { if (est && est.conv && !apertando) desenhar(); }, 1000);
// modo compacto (layout de 3 janelas lado a lado)
// Se a janelinha acoplada saiu da tela (janela da Privacy encostada na borda direita), ela entra por
// cima da borda direita da PRÓPRIA janela de origem. Só mexe na janelinha do Coach.
async function cabeNaTela() {
  const { acoplado, origem: o } = await chrome.storage.local.get(["acoplado", "origem"]);
  if (acoplado === false || o == null) return;
  const dir = (screen.availLeft || 0) + screen.availWidth;
  if (window.screenX + window.outerWidth <= dir + 2) return;
  try { const w = await chrome.windows.get(o); const eu = await chrome.windows.getCurrent(); const larg = Math.min(eu.width, 300);
    await chrome.windows.update(eu.id, Object.assign({ left: Math.max(w.left, w.left + w.width - larg), top: w.top, width: larg }, mini ? {} : { height: w.height })); } catch (_) {}
}
async function alternarAcoplar() {
  const { acoplado } = await chrome.storage.local.get("acoplado");
  const novo = acoplado === false; await chrome.storage.local.set({ acoplado: novo });
  $("btnAcoplar").textContent = novo ? "acoplado" : "solto";
  if (novo) chrome.runtime.sendMessage({ t: "coach_acoplar" }).then(() => setTimeout(cabeNaTela, 400)).catch(() => {});
}
function compacto() { document.body.classList.toggle("compacto", window.innerWidth < 360); }
// Área útil do monitor onde o Delta está. O fundo.js (que não enxerga a tela) usa isto para nunca acoplar a
// janelinha cortada para fora da tela. Devolve true quando mudou.
let telaJson = "";
async function salvarTela() {
  const tela = { esq: screen.availLeft || 0, topo: screen.availTop || 0, larg: screen.availWidth, alt: screen.availHeight };
  const j = JSON.stringify(tela); if (j === telaJson) return false;
  telaJson = j; await chrome.storage.local.set({ tela }); return true;
}
async function reacoplarSeTelaMudou() {
  if (!(await salvarTela())) return;
  const { acoplado } = await chrome.storage.local.get("acoplado");
  if (acoplado !== false) chrome.runtime.sendMessage({ t: "coach_acoplar" }).catch(() => {});
}
// A janelinha voltou de minimizada/escondida: enquanto estava minimizada o Chrome não deixa reposicionar,
// então ela pode ter ficado para trás se a janela da Privacy mudou de lugar. Pede para acoplar de novo.
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) return;
  const { acoplado } = await chrome.storage.local.get("acoplado");
  if (acoplado !== false) chrome.runtime.sendMessage({ t: "coach_acoplar" }).catch(() => {});
});
// A janelinha do Delta foi parar em outro monitor: atualiza a área útil (só lê a própria janela).
if (chrome.windows.onBoundsChanged) chrome.windows.onBoundsChanged.addListener(async (w) => {
  try { const eu = await chrome.windows.getCurrent(); if (w.id === eu.id) reacoplarSeTelaMudou(); } catch (_) {}
});
// Modo mini: encolhe SÓ a janelinha do Delta para 195 px (fã + relógio + fase + preço + jogada + roteiro) e volta ao tamanho cheio.
// No Cockpit 3x2 ela vira a doca embaixo da janela da Privacy (quem posiciona é o fundo.js). Nunca mexe na janela da Privacy.
function mostrarMini() {
  document.body.classList.toggle("mini", mini && !!sessao);
  const b = $("btnMini"); if (!b) return;
  document.body.classList.toggle("palco", palco && !!sessao);
  b.hidden = !sessao || (palco && !mini) || (!mini && $("contaBadge").hidden); // aparece junto com o selo da conta; no mini fica sempre (para poder expandir); no Palco não existe mini
  b.textContent = mini ? "▾" : "▴"; b.setAttribute("aria-pressed", mini ? "true" : "false");
  b.title = mini ? "Expandir o Delta: voltar ao painel inteiro (tecla M)" : "Minimizar o Delta: fã, relógio, fase, preço e roteiro (tecla M)";
  b.setAttribute("aria-label", b.title);
}
let mudandoMini = false;
async function definirMini(v) {
  if (mudandoMini) return; mudandoMini = true;
  mini = !!v;
  try {
    const eu = await chrome.windows.getCurrent();
    if (mini) {
      if (eu.height > ALT_MINI + 100) alturaCheia = eu.height;
      await chrome.storage.local.set({ mini: true, miniAltura: ALT_MINI, alturaCheia });
      mostrarMini();
      await chrome.windows.update(eu.id, { height: ALT_MINI });
    } else {
      await chrome.storage.local.set({ mini: false });
      mostrarMini();
    }
    // acoplado: o fundo.js põe a janelinha no lugar de uma vez (mini = doca embaixo da Privacy se couber; inteiro =
    // por dentro/ao lado da janela da Privacy). Solto: cresce onde está, subindo o que for preciso para caber na tela
    // (saindo da doca, crescer para baixo jogaria a janelinha para fora da tela e o Chrome recusa).
    const { acoplado } = await chrome.storage.local.get("acoplado");
    if (acoplado !== false) chrome.runtime.sendMessage({ t: "coach_acoplar" }).catch(() => {});
    else if (!mini) {
      const topoTela = screen.availTop || 0, h = Math.min(Math.max(500, alturaCheia || 860), screen.availHeight);
      await chrome.windows.update(eu.id, { top: Math.max(topoTela, Math.min(eu.top, topoTela + screen.availHeight - h)), height: h });
    }
  } catch (_) { mostrarMini(); }
  mudandoMini = false;
  desenhar();
}
window.addEventListener("resize", compacto); compacto();
// v2.3: o fundo.js marca o Modo Palco (Privacy ≥1000 px com 410 px livres à direita) e, nele, desliga o mini.
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== "local") return;
  if (ch.palco) { palco = ch.palco.newValue === true; mostrarMini(); }
  if (ch.mini && !mudandoMini) { const v = ch.mini.newValue === true; if (v !== mini) { mini = v; mostrarMini(); desenhar(); } }
});

(async () => {
  const [r, rot, cn, ex] = await Promise.all([fetch(chrome.runtime.getURL("data/coach_regras.json")).then((x) => x.json()), fetch(chrome.runtime.getURL("data/coach_roteiros.json")).then((x) => x.json()), fetch(chrome.runtime.getURL("data/coach_cenas.json")).then((x) => x.json()).catch(() => null), fetch(chrome.runtime.getURL("data/coach_exemplos.json")).then((x) => x.json()).catch(() => null)]);
  R = r; ROT = rot; CN = cn; EX = ex;
  const s = await chrome.storage.local.get(["sessao", "origem", "modo", "placarLocal", "perfis", "contaDoPerfil", "mini", "alturaCheia", "registradas", "estadoSalas", "som", "lembretes", "palco"]);
  palco = s.palco === true;
  if (palco && s.mini === true) { s.mini = false; await chrome.storage.local.set({ mini: false }); }
  lembretes = Array.isArray(s.lembretes) ? s.lembretes.filter((l) => l && l.k && l.em) : [];
  if (s.registradas && s.registradas.data === hojeSP() && Array.isArray(s.registradas.chaves)) s.registradas.chaves.forEach((k) => registradas.add(k));
  if (s.estadoSalas && s.estadoSalas.data === hojeSP()) {
    Object.entries(s.estadoSalas.cena || {}).forEach(([k, v]) => cenaSala.set(k, v));
    Object.entries(s.estadoSalas.vars || {}).forEach(([k, v]) => varsSala.set(k, v));
  }
  som = s.som === true; mostrarSom();
  $("btnSom").addEventListener("click", async () => { som = !som; await chrome.storage.local.set({ som }); mostrarSom(); bipe("vip"); });
  // o Chrome só libera áudio depois de um clique na janelinha: aproveita o primeiro para destravar o bipe
  document.addEventListener("pointerdown", () => { if (som && audio && audio.state === "suspended") audio.resume(); else if (som && !audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} } }, { capture: true });
  $("btnCopiarTopo").addEventListener("click", (ev) => copiarAtual(ev));
  setInterval(radarTick, 5000); setTimeout(radarTick, 1500); // v2.2: radar das 3 contas (publica e lê a cada ~20 s)
  await chrome.storage.local.set({ miniAltura: ALT_MINI }); // versões antigas guardavam 180 + moldura
  perfis = s.perfis || {}; contaDoPerfil = s.contaDoPerfil || null;
  sessao = s.sessao || null; origem = s.origem != null ? s.origem : null;
  modo = s.modo === "normal" || s.modo === "dominante" ? s.modo : M.nomeModo(R, null);
  placarLocal = s.placarLocal || null;
  $("btnModo").addEventListener("click", trocarModo); mostrarModo();
  mini = s.mini === true; alturaCheia = s.alturaCheia || null;
  $("btnMini").addEventListener("click", () => definirMini(!mini));
  $("btnUseiTopo").addEventListener("click", () => { if (resTopo && est && est.conv) registrar(resTopo); });
  if (mini && !sessao) await definirMini(false); else mostrarMini();
  const ac = await chrome.storage.local.get("acoplado"); $("btnAcoplar").textContent = ac.acoplado === false ? "solto" : "acoplado";
  $("btnAcoplar").addEventListener("click", alternarAcoplar);
  await reacoplarSeTelaMudou(); setTimeout(cabeNaTela, 800);
  mostrarTela(); pedirEstado();
})();
