// Abre o Coach numa janelinha (popup) acoplada à janela do Chrome da Privacy.
// Motivo: o Chrome só mostra um painel lateral por vez, e o lateral fica com o Aura.
// v2: cada perfil do Chrome tem o seu Coach (a extensão roda separada em cada perfil). A janelinha
// gruda na SUA janela e acompanha quando ela mexe: janela larga → do lado direito (410 px);
// janela estreita (layout de 3 em terços) → compacta (300 px) por dentro da borda direita dela.
// Só mexe na janelinha do Coach: nunca move, redimensiona, recarrega ou navega a janela/aba da Privacy.
const LARG_COMPACTA = 300, LARG_NORMAL = 410, BARRA_CHROME = 80, BARRA_APP = 34, ALT_MINI = 195, LARG_DOCA_MAX = 480;
// Modo mini (botão ▴ no topo do painel): a janelinha fica com 195 px de altura.
// v2.1 (Cockpit 3x2): se sobra espaço na tela ABAIXO da janela da Privacy, o mini vira uma Doca Inferior
// exatamente embaixo dela (mesma largura, até 480 px). Assim clicar na Privacy nunca esconde o Delta.
// Sem espaço embaixo (Privacy na altura toda da tela), o mini fica preso no alto, como antes.
// Web App da Privacy (janela type "app") tem só ~34 px de barra de título, não os 80 px de abas+endereço.
async function posAcoplada(janelaOrigem) {
  const w = await chrome.windows.get(janelaOrigem);
  const { mini, miniAltura, tela } = await chrome.storage.local.get(["mini", "miniAltura", "tela"]);
  const janela = { left: w.left, top: w.top, width: w.width, height: w.height };
  const barra = w.type === "app" ? BARRA_APP : BARRA_CHROME;
  // tela = área útil do monitor onde o Delta está (o painel grava; o fundo não enxerga a tela).
  // Só vale se a janela de origem está nesse monitor; sem ela, vale a regra antiga (só a largura da origem).
  const meio = w.left + w.width / 2;
  const t = tela && tela.larg > 0 && meio >= tela.esq && meio <= tela.esq + tela.larg ? tela : null;
  const dir = t ? t.esq + t.larg : null;
  const cabeAoLado = !t || w.left + w.width + LARG_NORMAL <= dir + 8;
  // v2.3 · Modo Palco: Privacy larga (≥1000 px, ex.: 1030 em tela de 1440) com 410 px livres à direita.
  // O Delta ocupa essa coluna inteira (410 × altura da Privacy) e nunca fica em mini.
  const palco = w.width >= 1000 && cabeAoLado;
  let p;
  if (w.width < 1000 || !cabeAoLado) {
    // Janela estreita (1/3 da tela) ou larga sem espaço ao lado (maximizada): o Coach compacto entra por DENTRO
    // da borda direita da própria janela, abaixo da barra de abas/endereço, para não cobrir a janela vizinha
    // (outro perfil/conta) nem ficar cortado para fora da tela.
    p = { left: w.left + w.width - LARG_COMPACTA, top: w.top + barra, width: LARG_COMPACTA, height: Math.max(500, w.height - barra), janela, dentro: true };
    if (t) {
      p.left = Math.max(t.esq, Math.min(p.left, dir - LARG_COMPACTA));
      p.top = Math.max(t.topo, p.top);
      p.height = Math.max(500, Math.min(p.height, t.topo + t.alt - p.top));
    }
  } else p = { left: w.left + w.width, top: w.top, width: LARG_NORMAL, height: Math.max(500, w.height), janela, palco };
  if (mini === true && !palco) {
    const alt = miniAltura || ALT_MINI;
    if (t && w.top + w.height + alt <= t.topo + t.alt + 8) {
      // Doca Inferior: embaixo da janela da Privacy, alinhada à esquerda dela, sem sair da tela.
      const larg = Math.max(LARG_COMPACTA, Math.min(w.width, LARG_DOCA_MAX));
      p = { left: Math.max(t.esq, Math.min(w.left, dir - larg)), top: w.top + w.height, width: larg, height: alt, janela, doca: true };
    } else p.height = alt;
    p.mini = true;
  }
  return p;
}
// Guarda se o layout é Palco (o painel esconde o ▴) e, no Palco, desliga o mini: o painel inteiro cobre a coluna.
async function marcarPalco(p) {
  const { palco, mini } = await chrome.storage.local.get(["palco", "mini"]);
  const novo = !!(p && p.palco), muda = {};
  if (palco !== novo) muda.palco = novo;
  if (novo && mini === true) muda.mini = false;
  if (Object.keys(muda).length) await chrome.storage.local.set(muda);
}
async function abrirCoach(janelaOrigem) {
  const { coachJanela, coachPos, acoplado, mini, miniAltura } = await chrome.storage.local.get(["coachJanela", "coachPos", "acoplado", "mini", "miniAltura"]);
  const grudar = acoplado !== false;
  await chrome.storage.local.set({ origem: janelaOrigem });
  if (coachJanela) {
    try { await chrome.windows.update(coachJanela, { focused: true }); chrome.runtime.sendMessage({ t: "coach_origem", origem: janelaOrigem }).catch(() => {}); if (grudar) acoplar(); return; } catch (_) { /* fechada */ }
  }
  let pos = null;
  try { pos = grudar ? await posAcoplada(janelaOrigem) : coachPos; } catch (_) { pos = null; }
  if (!pos) pos = { width: LARG_NORMAL, height: 860 };
  if (grudar) await marcarPalco(pos);
  const opc = { url: "painel.html", type: "popup", focused: true, width: Math.max(260, Math.min(pos.width || LARG_NORMAL, 700)), height: mini === true && !pos.palco ? pos.height || miniAltura || ALT_MINI : Math.max(500, pos.height || 860) };
  let w;
  try { w = await chrome.windows.create(Object.assign({}, opc, { left: pos.left, top: pos.top })); }
  catch (_) { await chrome.storage.local.remove("coachPos"); w = await chrome.windows.create(opc); } // posição fora da tela
  await chrome.storage.local.set({ coachJanela: w.id });
}
// Reposiciona SÓ a janelinha do Coach ao lado da janela de origem.
let acoplando = null;
async function acoplar() {
  if (acoplando) return acoplando;
  acoplando = (async () => {
    const { coachJanela, origem, acoplado } = await chrome.storage.local.get(["coachJanela", "origem", "acoplado"]);
    if (!coachJanela || origem == null || acoplado === false) return;
    try { const p = await posAcoplada(origem); await marcarPalco(p); await chrome.windows.update(coachJanela, { left: p.left, top: p.top, width: p.width, height: p.height }); } catch (_) {}
  })().finally(() => { acoplando = null; });
  return acoplando;
}
chrome.action.onClicked.addListener((aba) => { abrirCoach(aba.windowId); });
chrome.windows.onRemoved.addListener(async (id) => {
  const { coachJanela } = await chrome.storage.local.get("coachJanela");
  if (id === coachJanela) await chrome.storage.local.remove("coachJanela");
});
// A janela da Privacy mudou de lugar/tamanho: a janelinha acompanha (se estiver acoplada).
if (chrome.windows.onBoundsChanged) chrome.windows.onBoundsChanged.addListener(async (w) => {
  const { origem } = await chrome.storage.local.get("origem");
  if (w.id === origem) acoplar();
});
// v2.3.1 · ABRIR SOZINHO: quando o leitor da Privacy (chat) manda o 1º estado de uma aba e o Delta deste perfil está
// fechado, abre a janelinha acoplada àquela janela. Uma vez por aba: se você fechar o Delta, ele não volta sozinho
// naquela aba (só pelo ícone). Liga/desliga em coach_regras.json > palco.abrir_sozinho. Não mexe na Privacy.
let regrasP = null, abrindoSozinho = null;
const regras = () => (regrasP = regrasP || fetch(chrome.runtime.getURL("data/coach_regras.json")).then((r) => r.json()).catch(() => null));
async function abrirSozinho(aba) {
  const R = await regras(); if (R && R.palco && R.palco.abrir_sozinho === false) return;
  const chave = "auto_" + aba.id, ja = await chrome.storage.session.get(chave);
  if (ja[chave]) return;
  await chrome.storage.session.set({ [chave]: true });
  const { coachJanela } = await chrome.storage.local.get("coachJanela");
  if (coachJanela) { try { await chrome.windows.get(coachJanela); return; } catch (_) { /* fechada */ } }
  await abrirCoach(aba.windowId);
}
// ---------- v2.5.0 · ponte das duas ações de acessibilidade (painel → leitor da janela certa) ----------
// Uma porta por janela da Privacy. Não usa a API de abas: o leitor é quem abre a porta, o fundo só responde
// nela. O fundo não cria ação nenhuma: ele repassa o que o painel pediu depois de um clique seu.
const portas = new Map();   // windowId -> porta do leitor
const esperando = new Map(); // id do pedido -> responder() do painel
let proximoId = 1;
chrome.runtime.onConnect.addListener((p) => {
  if (!p || p.name !== "delta-leitor" || !p.sender || !p.sender.tab) return;
  const w = p.sender.tab.windowId;
  portas.set(w, p);
  p.onDisconnect.addListener(() => { if (portas.get(w) === p) portas.delete(w); });
  p.onMessage.addListener((m) => {
    if (!m || m.t !== "coach_acao_fim") return;
    const r = esperando.get(m.id); if (!r) return;
    esperando.delete(m.id); r({ ok: !!m.ok, erro: m.erro || "" });
  });
});
chrome.runtime.onMessage.addListener((m, quem, responder) => {
  if (m && m.t === "coach_acoplar") acoplar();
  else if (m && m.t === "coach_acao") {
    const p = portas.get(m.origem);
    if (!p) { responder({ ok: false, erro: "a Privacy desta janela não está aberta (dê F5 nela)" }); return; }
    const id = proximoId++;
    esperando.set(id, responder);
    setTimeout(() => { if (esperando.has(id)) { esperando.delete(id); try { responder({ ok: false, erro: "a Privacy não respondeu" }); } catch (_) {} } }, 4000);
    try { p.postMessage(Object.assign({}, m.acao, { id })); } catch (e) { esperando.delete(id); responder({ ok: false, erro: String(e.message || e) }); }
    return true; // resposta assíncrona
  }
  else if (m && m.t === "coach_estado" && quem && quem.tab && quem.tab.id != null && !abrindoSozinho)
    abrindoSozinho = abrirSozinho(quem.tab).catch(() => {}).finally(() => { abrindoSozinho = null; });
});
// Se você focar outra janela com a Privacy (normal ou Web App, no MESMO perfil), o Coach passa a acompanhar ela.
chrome.windows.onFocusChanged.addListener(async (id) => {
  if (id === chrome.windows.WINDOW_ID_NONE) return;
  const { coachJanela } = await chrome.storage.local.get("coachJanela");
  if (!coachJanela || id === coachJanela) return;
  try { const w = await chrome.windows.get(id); if (w.type !== "normal" && w.type !== "app") return; } catch (_) { return; }
  await chrome.storage.local.set({ origem: id });
  chrome.runtime.sendMessage({ t: "coach_origem", origem: id }).catch(() => {});
  acoplar();
});
