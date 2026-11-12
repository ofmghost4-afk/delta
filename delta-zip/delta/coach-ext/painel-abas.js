// Delta · abas do Painel Único (Delta · Ficha · Fila · Sumidos · Mais).
// Recortado do painel.js sem nenhuma mudança de lógica. Carrega ANTES do painel.js.
// Só leitura do banco (funções painel_* do Aura) + notas/tags. Nada é enviado à Privacy.

// ---------- v2.2 · Painel Único: abas do Aura dentro do Delta ----------
// Delta (o de sempre) · Ficha · Fila · Sumidos · Mais. Usa o mesmo leitor e as MESMAS funções painel_* que o Aura já
// usa no banco (só leitura + notas/tags). No mini/doca as abas ficam escondidas: só aparecem no painel inteiro.
const ABAS = [["delta", "Delta"], ["ficha", "Ficha"], ["fila", "Fila"], ["sumidos", "Sumidos"], ["mais", "Mais"]];
const diaBR = (iso) => { if (!iso) return ""; const [a, m, d] = String(iso).slice(0, 10).split("-"); return d + "/" + m + (a ? "/" + a.slice(2) : ""); };
const diaHoraBR = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
function desenharAbas(a, res) {
  const nEsp = est && est.salas ? est.salas.filter((s) => s.naoLidas > 0 && !s.nossa).length : 0;
  a.append(el("nav", { class: "abas", role: "tablist" }, ABAS.map(([id, rot]) => el("button", { type: "button", role: "tab", "data-aba": id, "aria-selected": aba === id ? "true" : "false", class: aba === id ? "ativa" : "",
    onclick: () => { aba = id; if (id === "fila") buscarLista(true); desenhar(); } }, rot, id === "fila" && nEsp ? el("span", { class: "abas-n" }, String(nEsp)) : null))));
  if (aba === "delta") return;
  const p = el("section", { class: "card pane pane-" + aba }); a.append(p);
  if (aba === "ficha") paneFicha(p, res); else if (aba === "fila") paneFila(p); else if (aba === "sumidos") paneSumidos(p); else paneMais(p);
}
function nivelFa(total) {
  if (total >= 2300) return ["Baleia", "Baleia: " + brl(total) + " na empresa"];
  if (total >= 1000) return ["Fã\ngrande", "Fã grande"];
  if (total >= 250) return ["Bom", "Bom comprador"];
  if (total > 0) return ["Já\ncomprou", "Comprador"];
  return ["Sem\ncompra", "Sem compra na base"];
}
function dicasFicha(f) {
  const d = [], total = Number(f.total), conta = f.conta || (est && est.conta), por = f.por_conta || [];
  const aqui = por.find((p) => p.conta === conta), fora = por.filter((p) => p.conta !== conta);
  if (total >= 1000) d.push("Fã grande: já gastou " + brl(total) + " com a empresa. Prioridade.");
  if (!aqui && fora.length) d.push("Nunca comprou nesta conta, mas gastou " + fora.map((p) => brl(p.gasto) + " com " + p.conta).join(" e ") + ".");
  if (f.n > 0) {
    if (f.dias_sem != null && f.dias_sem <= 3) d.push("Comprou há " + (f.dias_sem === 0 ? "menos de um dia" : f.dias_sem + (f.dias_sem === 1 ? " dia" : " dias")) + ". Está quente.");
    else if (f.dias_sem >= 30) d.push("Está há " + f.dias_sem + " dias sem comprar. Vale retomar.");
    if (f.n >= 2 && f.mediana != null) d.push("Costuma pagar perto de " + brl(f.mediana) + " por compra e já pagou " + brl(f.maior) + " de uma vez.");
    else if (f.maior != null) d.push("Fez uma compra só, de " + brl(f.maior) + ".");
    if (Array.isArray(f.horas) && f.horas.length && f.n >= 3) d.push("Compra mais por volta das " + f.horas[0].h + "h.");
    if (Array.isArray(f.tipos) && f.tipos.length) d.push("Gasta mais com: " + f.tipos[0].tipo + " (" + brl(f.tipos[0].gasto) + ").");
  }
  if (f.msgs && f.msgs.desconto >= 2) d.push("Já falou em desconto ou preço " + f.msgs.desconto + " vezes nas conversas guardadas.");
  if (f.msgs && f.msgs.personalizado >= 1) d.push("Já falou em conteúdo personalizado.");
  if (f.momoi && f.momoi.ultima_em) d.push("Era fã da Momoi. Última atividade lá: " + diaBR(f.momoi.ultima_em) + ".");
  return d;
}
function formNota(dica, tipo) {
  const inp = el("input", { class: "nota-inp", placeholder: dica, maxlength: tipo === "tag" ? 40 : 2000, "aria-label": dica });
  const salvar = async () => {
    const t = inp.value.trim(); if (!t || !ficha || !ficha.fa) return;
    inp.disabled = true;
    try { const r = await rpc("painel_nota", { p_fa: ficha.fa.id, p_tipo: tipo, p_texto: t }); ficha = Object.assign({}, ficha, { notas: r.notas, tags: r.tags }); } catch (e) { avisoPane = "Não salvou: " + e.message; }
    inp.blur(); desenhar();
  };
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") salvar(); else if (e.key === "Escape") { inp.value = ""; inp.blur(); desenhar(); } });
  return el("div", { class: "linha-form" }, inp, el("button", { class: "btn mini", type: "button", onclick: salvar }, "Salvar"));
}
let avisoPane = "";
async function apagarNota(id) {
  try { const r = await rpc("painel_nota_apagar", { p_id: id }); if (r && ficha) ficha = Object.assign({}, ficha, { notas: r.notas, tags: r.tags }); } catch (e) { avisoPane = "Não apagou: " + e.message; }
  desenhar();
}
function paneFicha(a, res) {
  if (!est || !est.conv) { a.append(el("p", { class: "vazio" }, "Clique numa conversa para ver a ficha do fã.")); return; }
  if (!ficha) { a.append(el("p", { class: "vazio" }, fichaErro ? "Ficha indisponível (" + fichaErro + ")." : "Procurando " + (est.conv.nome || "o fã") + "…")); return; }
  const f = ficha, total = Number(f.total) || 0, por = f.por_conta || [], [curto, longo] = nivelFa(total);
  a.append(el("div", { class: "quem" }, el("div", { class: "nota-g", title: longo }, curto),
    el("div", {}, el("div", { class: "nome" }, (f.fa && f.fa.nome) || est.conv.nome || "(sem nome)"),
      el("div", { class: "sub" }, f.novo ? "Primeira vez que o painel vê este fã" : por.length > 1 ? "Comprou em " + por.length + " contas" : por.length === 1 ? "Comprou em " + por[0].conta : f.momoi ? "Está na lista da Momoi" : "Sem compras na base"),
      f.fa && f.fa.outros_nomes ? el("div", { class: "fraco pequeno" }, "Também usou: " + f.fa.outros_nomes) : null,
      res && res.previsao ? el("div", { class: "fraco pequeno" }, brl(res.previsao.gasto7) + " nos 7 primeiros dias" + (res.previsao.ativo ? " · projeção de 30 dias: " + brl(res.previsao.previsao_30d_brl) : "")) : null)));
  a.append(el("div", { class: "cartoes" }, el("div", { class: "cartao escuro" }, el("div", { class: "r" }, "Total gasto na empresa"), el("div", { class: "v" }, brl(total))),
    por.map((p) => el("div", { class: "cartao" }, el("div", { class: "r" }, p.conta + (p.conta === f.conta ? " (aqui)" : "")), el("div", { class: "v" }, brl(p.gasto)), el("div", { class: "r" }, p.n + (p.n === 1 ? " compra" : " compras"))))));
  if (Array.isArray(f.candidatos) && f.candidatos.length) {
    a.append(el("h3", {}, "Pode ser este comprador"));
    f.candidatos.slice(0, 5).forEach((c) => a.append(el("div", { class: "nota-l" }, el("div", {}, el("b", {}, c.nome), el("small", {}, brl(c.na_conta) + " nesta conta · " + brl(c.total) + " no total · última " + diaBR(c.ultima))),
      el("button", { class: "btn mini", type: "button", onclick: async (ev) => { ev.target.disabled = true; try { const r = await rpc("painel_ligar", { p_fa: f.fa.id, p_comprador: c.comprador }); ficha = Object.assign({}, f, r, { candidatos: [] }); } catch (e) { avisoPane = "Não ligou: " + e.message; } desenhar(); } }, "É este"))));
  }
  const ds = dicasFicha(f);
  if (ds.length) { a.append(el("h3", {}, "Dicas para este atendimento")); a.append(el("ul", { class: "dicas" }, ds.map((t) => el("li", {}, t)))); }
  a.append(el("h3", {}, "O que você já sabe dele"));
  if (avisoPane) a.append(el("div", { class: "nota falhou" }, avisoPane));
  a.append(el("div", { class: "tags" }, (f.tags || []).map((t) => el("span", { class: "tag" }, t.texto, el("button", { type: "button", title: "apagar", "aria-label": "apagar tag", onclick: () => apagarNota(t.id) }, "×")))), formNota("Nova tag (ex.: pede desconto)", "tag"));
  (f.notas || []).forEach((n) => a.append(el("div", { class: "nota-l" }, el("div", {}, n.texto, el("small", {}, diaHoraBR(n.em))), el("button", { class: "x", type: "button", title: "apagar", "aria-label": "apagar nota", onclick: () => apagarNota(n.id) }, "×"))));
  a.append(formNota("Nova nota (ex.: profissao: engenheiro · recebe dia 5)", "nota"));
  a.append(el("p", { class: "fraco pequeno" }, "Notas no formato “chave: valor” (profissao, time, hobby, detalhe, dia de pagamento) preenchem os {campos} dos roteiros sozinhas."));
  if (f.momoi) {
    a.append(el("h3", {}, "Na Momoi"));
    const cx = el("div", { class: "caixa" }, el("div", { class: "pequeno fraco" }, "Última atividade: " + (diaBR(f.momoi.ultima_em) || "sem data") + (f.momoi.msgs_lidas ? " · " + f.momoi.msgs_lidas + " mensagens lidas" : " · conversa não lida")));
    (f.momoi.ultimas || []).slice().reverse().forEach((m) => cx.append(el("div", { class: "msg" + (/^f/i.test(m.de || "") ? " fa" : "") }, m.texto)));
    a.append(cx);
  }
  if (Array.isArray(f.ultimas) && f.ultimas.length) {
    a.append(el("h3", {}, "Últimas compras"));
    a.append(el("ul", { class: "lista" }, f.ultimas.map((c) => el("li", {}, el("span", {}, diaBR(c.data) + " · " + (c.tipo || "compra") + " · " + c.conta), el("b", {}, brl(c.valor))))));
  }
}
// Fila do Aura: dados do banco por fã (selo, total, PPV pendente) + relógio de espera. Vermelho, amarelo, verde.
async function buscarLista(todos) {
  if (buscandoLista || !est || !sessao || !est.conta || !R.contas_atendidas.includes(est.conta)) return;
  const perfisL = [...new Set((est.salas || []).map((s) => s.perfil && s.perfil.toLowerCase()).filter(Boolean))];
  const pedir = todos ? perfisL : perfisL.filter((p) => !infoLista.has(p));
  if (!pedir.length) return;
  buscandoLista = true;
  try { const r = await rpc("painel_fila", { p_conta: est.conta, p_perfis: pedir }); pedir.forEach((p) => infoLista.set(p, null)); (r || []).forEach((x) => infoLista.set(x.perfil, x)); listaEm = Date.now(); }
  catch (_) { listaEm = Date.now() - 60000; /* tenta de novo em 30 s */ }
  buscandoLista = false; desenhar();
}
const relogioFila = (seg) => (seg < 3600 ? Math.floor(seg / 60) + ":" + String(Math.floor(seg % 60)).padStart(2, "0") : seg < 86400 ? Math.floor(seg / 3600) + " h " + Math.floor((seg % 3600) / 60) + " min" : Math.floor(seg / 86400) + " d");
function paneFila(a) {
  a.append(el("p", { class: "fraco pequeno" }, "Quem está esperando resposta, entre as conversas carregadas na sua lista. Vermelho primeiro, depois amarelo e verde; dentro da cor, quem mais gastou."));
  if (!est || !est.salas || !est.salas.length) { a.append(el("p", { class: "vazio" }, "A lista de conversas ainda não apareceu.")); return; }
  if (Date.now() - listaEm > 90000) buscarLista(listaEm > 0);
  const agora = Date.now(), meta = M.aplicarModo(R, modo).limiares, verde = (meta.resposta_limite_s && meta.resposta_limite_s.v) || 300, amarelo = verde * 3;
  const linhas = est.salas.filter((s) => s.perfil).map((s) => {
    const i = infoLista.get(s.perfil.toLowerCase()) || null, e = esperaSala.get(s.sala);
    const novo = !i || (Number(i.n || 0) === 0 && !i.msgs_nossas);
    const seg = e && !e.nossa && e.desde != null ? Math.max(0, (agora - e.desde) / 1000) : null;
    const cor = s.nossa ? -1 : seg == null ? 2 : seg <= verde ? 0 : seg <= amarelo && !novo ? 1 : 2;
    return { s, i, e, novo, seg, cor, total: Number((i && i.total) || s.gasto || 0) };
  }).sort((x, y) => y.cor - x.cor || y.total - x.total || (y.seg || 0) - (x.seg || 0));
  a.append(el("ul", { class: "lista fila-aura" }, linhas.map(({ s, i, e, novo, seg, cor, total }) => {
    const pd = i && i.pendente, sl = [];
    if (total >= 2300) sl.push(el("span", { class: "chip baleia" }, "BALEIA")); else if (total >= 1000) sl.push(el("span", { class: "chip vip" }, "VIP"));
    if (i && i.selo) sl.push(el("span", { class: "chip nobre" }, i.selo));
    if (i && i.so_conversa) sl.push(el("span", { class: "chip" }, "só conversa"));
    if (novo) sl.push(el("span", { class: "chip" }, i ? "fã novo" : "sem ficha"));
    const tempo = cor === -1 ? "aguardando o fã" : seg == null ? "outro dia" : relogioFila(seg) + (e && !e.exato ? " ±1 min" : "");
    return el("li", { class: "cor" + cor }, el("span", { class: "d" }, el("b", {}, s.nome || "(sem nome)"), " ", sl,
      el("small", { class: "fraco" }, (s.naoLidas ? s.naoLidas + " não lida" + (s.naoLidas > 1 ? "s" : "") + " · " : "") + (s.online ? "online · " : "") + (s.ultima || "")),
      pd ? el("small", {}, "PPV " + brl(pd.preco) + " não pago · follow-up " + Math.min(Number(pd.follow), 5) + " de 5") : null),
      el("span", { class: "v" }, el("span", { class: "tempo" }, tempo), el("small", { class: "fraco" }, total > 0 ? brl(total) : i ? "sem compra" : "")));
  })));
}
async function carregarSumidos() {
  if (!est || !est.conta) return;
  sumidosConta = est.conta; sumidos = "carregando"; desenhar();
  try { sumidos = await rpc("painel_sumidos", { p_conta: est.conta }); } catch (e) { sumidos = "erro: " + e.message; }
  desenhar();
}
async function carregarExAss() {
  if (!est || !est.conta || !exAssDisp) return;
  exAssConta = est.conta; exAss = "carregando"; desenhar();
  try { exAss = await rpc("coach_ex_assinantes", { p_conta: est.conta }); } catch (e) { if (faltaFuncao(e)) { exAssDisp = false; exAss = null; } else exAss = "erro: " + e.message; }
  desenhar();
}
function paneSumidos(a) {
  if (!est || !est.conta) { a.append(el("p", { class: "vazio" }, "Abra a Privacy para eu saber qual é a conta.")); return; }
  a.append(el("h3", {}, "Sumidos"), el("p", { class: "fraco pequeno" }, "Compradores desta conta que gastaram R$ 150 ou mais na empresa e estão há 30 dias ou mais sem comprar."));
  if (sumidos == null || sumidosConta !== est.conta) a.append(el("button", { class: "btn mini", type: "button", onclick: carregarSumidos }, "Carregar lista da " + est.conta));
  else if (typeof sumidos === "string") a.append(el("p", { class: "vazio" }, sumidos));
  else if (!sumidos.length) a.append(el("p", { class: "vazio" }, "Ninguém nesta situação."));
  else a.append(el("ul", { class: "lista" }, sumidos.map((x) => el("li", { class: Number(x.total) >= 1000 ? "forte" : "" }, el("span", {}, el("b", {}, x.nome || "(sem nome)"), el("small", { class: "fraco" }, x.dias + " dias sem comprar · " + brl(x.na_conta) + " aqui" + (x.perfil ? "" : " · sem endereço ainda"))), el("b", {}, brl(x.total))))),
    el("button", { class: "btn mini", type: "button", onclick: carregarSumidos }, "Atualizar"));
  // v2.2 · ex-assinantes pelo maior LTV, para chamar quando sair conteúdo novo
  a.append(el("h3", {}, "Ex-assinantes para reengajar (maior LTV primeiro)"), el("p", { class: "fraco pequeno" }, "Quem já comprou nesta conta e está há 30+ dias sem comprar, pelo total gasto na empresa. Use quando sair conteúdo novo, com a mensagem em massa do dia (aba Mais)."));
  if (!exAssDisp) a.append(el("p", { class: "vazio" }, "Rode o coach_sql.sql v2.2 no Supabase para ligar esta lista."));
  else if (exAss == null || exAssConta !== est.conta) a.append(el("button", { class: "btn mini", type: "button", onclick: carregarExAss }, "Carregar ex-assinantes da " + est.conta));
  else if (typeof exAss === "string") a.append(el("p", { class: "vazio" }, exAss));
  else if (!exAss.length) a.append(el("p", { class: "vazio" }, "Ninguém nesta situação."));
  else a.append(el("ul", { class: "lista" }, exAss.map((x) => el("li", { class: Number(x.total) >= 1000 ? "forte" : "" }, el("span", {}, el("b", {}, (Number(x.total) >= 2300 ? "🐋 " : "") + (x.nome || "(sem nome)")), el("small", { class: "fraco" }, x.dias + " dias sem comprar · " + x.compras + (Number(x.compras) === 1 ? " compra" : " compras") + " aqui (" + brl(x.na_conta) + ")" + (x.perfil ? " · @" + x.perfil : ""))), el("b", {}, brl(x.total))))));
}
function paneMais(a) {
  // mensagem em massa do dia
  const md = est && est.conta ? M.massaDoDia(ROT, Date.now(), est.conta, R.contas_atendidas) : null;
  a.append(el("h3", {}, "Mensagem em massa de hoje"));
  if (md) a.append(el("div", { class: "roteiro massa" }, el("div", { class: "txt" }, md.texto), el("div", { class: "barra" }, el("span", { class: "pequeno fraco" }, md.n + " de " + md.total + " · muda amanhã"), el("span", { class: "esp" }), el("button", { class: "btn mini rosa", type: "button", onclick: (ev) => copiar(md.texto, ev) }, rotuloCopiar(md.texto))),
    el("div", { class: "nota" }, "Só curiosidade, sem preço. Envie pelo recurso de mensagem em massa da própria Privacy: o Delta só copia.")));
  else a.append(el("p", { class: "vazio" }, "Abra a Privacy para eu saber qual é a conta."));
  a.append(el("h3", {}, "Fim de turno"), el("div", {}, botaoTurno())); blocoTurno(a);
  a.append(el("h3", {}, "Sessão"), el("p", { class: "pequeno" }, "Login: " + ((sessao && sessao.email) || ""), el("br"), "Conta da Privacy nesta janela: " + ((est && est.conta) || "nenhuma")));
  a.append(el("h3", {}, "Subir extrato novo"), el("p", { class: "fraco pequeno" }, "Baixe o extrato de vendas na Privacy (arquivo .xlsx) e escolha aqui. Vendas que já estão na base não entram de novo."));
  a.append(el("input", { type: "file", accept: ".xlsx", class: "arq", onchange: escolherExtrato }));
  if (extrato.aviso) a.append(el("p", { class: extrato.erro ? "nota falhou" : "pequeno" }, extrato.aviso));
  if (extrato.linhas) a.append(el("button", { class: "btn mini rosa", type: "button", disabled: extrato.subindo, onclick: subirExtrato }, extrato.subindo ? "Subindo…" : "Subir " + extrato.linhas.length + " vendas para a base"));
  // Como usar (resumo de 1 tela, sempre à mão)
  a.append(el("h3", {}, "Como usar o Delta"));
  a.append(el("ul", { class: "ajuda" }, [
    ["Doca (tecla M)", "é a faixa embaixo da Privacy. Linha 1: fã, selos e relógio. Linha 2: dinheiro e o que você sabe dele. Depois a fase, o preço e o texto pronto. No rodapé: quem é o próximo da fila."],
    ["Copiar (C ou Enter)", "copia o texto e já marca ✓ Usei. Cole na Privacy com Ctrl+V. O Delta nunca envia nada."],
    ["‹ › ou 1 2 3", "troca a variante do texto. ⚡ (tecla A) pede 3 versões à IA para este fã; clique de novo para voltar."],
    ["Campo amarelo {…}", "falta preencher. Clique num chip amarelo do rodapé ou em cima do campo e digite."],
    ["Preço", "clique na faixa de preço para copiar o valor (cole no campo de preço do PPV)."],
    ["＋ (tecla N)", "anota algo do fã sem sair da doca. Notas “chave: valor” (profissao: engenheiro) entram sozinhas nos textos."],
    ["⏰ (tecla L)", "lembrete para voltar a este fã: 10 min, 30 min, 1 h. Quando vence, a borda pulsa em ouro e ele aparece no rodapé."],
    ["Borda pulsando", "vermelho = ele passou do prazo ou o follow-up venceu. Ouro = VIP/Baleia esperando ou lembrete vencido."],
    ["Faixa vermelha", "PARE ou NÃO ENVIE: o que você está digitando quebra uma regra (encontro, contato por fora, preço abaixo do piso…)."],
    ["Abas (painel inteiro)", "Delta = preço, avisos, cena e placar · Ficha = compras e notas · Fila = quem espera · Sumidos = quem reengajar · Mais = mensagem em massa, turno, extrato."]
  ].map(([t, d]) => el("li", {}, el("b", {}, t + ": "), d))));
  a.append(el("h3", {}, "O que este painel faz"), el("p", { class: "fraco pequeno" }, "Lê o endereço da conversa aberta, o nome, o total gasto, a lista de conversas que está na tela e as mensagens da conversa aberta. Fala só com o seu banco. Não envia mensagens, não abre conversas, não rola a lista e não faz pedidos à Privacy."));
}
// Extrato de vendas (.xlsx) → painel_extrato (a mesma função do Aura). O arquivo é lido aqui, no seu computador.
const COLUNAS = { data: "Data", hora: "Hora", valor: "Valor da venda", comissao: "Sua comissão", tipo_entrada: "Tipo de entrada", forma_pagamento: "Forma de pagamento", codigo: "ID usuário comprador", comprador: "Comprador", tipo_venda: "Tipo Venda", vendedor: "Vendedor", situacao: "Situação" };
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
  const xml = alvo.metodo === 0 ? new TextDecoder().decode(dados) : await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Não consegui ler a planilha.");
  const col = (ref) => { let c = 0; for (const ch of ref.replace(/\d+/g, "")) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
  return [...doc.getElementsByTagNameNS("*", "row")].map((r) => {
    const linha = []; let prox = 0;
    for (const c of r.children) {
      if (c.localName !== "c") continue;
      if (c.getAttribute("t") === "s") throw new Error("O formato deste extrato é diferente do esperado.");
      const idx = c.getAttribute("r") ? col(c.getAttribute("r")) : prox, v = [...c.children].find((x) => x.localName === "v" || x.localName === "is");
      linha[idx] = v ? v.textContent.trim() : ""; prox = idx + 1;
    }
    return linha;
  });
}
async function escolherExtrato(ev) {
  const arq = ev.target.files && ev.target.files[0]; if (!arq) return;
  Object.assign(extrato, { linhas: null, aviso: "Lendo…", erro: false }); ev.target.blur(); desenhar();
  try {
    const tab = await lerPlanilha(arq), cab = (tab[0] || []).map((x) => (x || "").trim()), pos = {};
    for (const [k, nome] of Object.entries(COLUNAS)) { pos[k] = cab.indexOf(nome); if (pos[k] < 0) throw new Error("Falta a coluna “" + nome + "”. Este é mesmo o extrato de vendas?"); }
    const linhas = tab.slice(1).filter((l) => l && l[pos.data]).map((l) => Object.fromEntries(Object.keys(COLUNAS).map((k) => [k, l[pos[k]] || ""])));
    if (!linhas.length) throw new Error("O extrato está vazio.");
    const contas = [...new Set(linhas.map((l) => l.vendedor))], ord = linhas.map((l) => l.data.split("/").reverse().join("-")).sort(), br = (d) => d.split("-").reverse().join("/");
    Object.assign(extrato, { linhas, aviso: linhas.length + " vendas de " + contas.join(", ") + ", de " + br(ord[0]) + " a " + br(ord[ord.length - 1]) + "." });
  } catch (e) { Object.assign(extrato, { linhas: null, aviso: e.message, erro: true }); }
  desenhar();
}
async function subirExtrato() {
  if (!extrato.linhas || extrato.subindo) return;
  extrato.subindo = true; desenhar();
  try {
    const r = await rpc("painel_extrato", { p_linhas: extrato.linhas });
    Object.assign(extrato, { linhas: null, erro: false, aviso: "Pronto: " + r.novas + " vendas novas, " + r.repetidas + " já estavam na base, " + r.compradores_novos + " compradores novos." + (r.recusadas ? " " + r.recusadas + " linhas ficaram de fora (conta que não é atendida ou linha incompleta)." : "") });
    try { const c = await rpc("painel_casar_ppvs", {}); if (c) extrato.aviso += " " + c + (c === 1 ? " PPV foi marcado" : " PPVs foram marcados") + " como comprado pelo extrato."; } catch (_) {}
    infoLista.clear(); fichaChave = ""; sumidos = null; exAss = null;
  } catch (e) { Object.assign(extrato, { aviso: "Não subiu: " + e.message, erro: true }); }
  extrato.subindo = false; desenhar();
}
