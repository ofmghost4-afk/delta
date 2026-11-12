// Delta · visão de gestor: painel.html?gestor=1 aberto numa aba cheia do Chrome.
// SÓ LEITURA: chama as funções coach_* que já existem no banco, não grava nada, não publica radar e
// não fala com a Privacy. Carrega ANTES do painel.js (usa rpc/el/brl dele em tempo de execução).
const GESTOR = new URLSearchParams(location.search).get("gestor") === "1";
const G = { carregando: false, erro: "", em: null, horas: 8, hoje: null, chatters: null, turno: null, semana: null, variantes: null };

async function carregarGestor(forcado) {
  if (G.carregando || !sessao) return;
  G.carregando = true; if (forcado) G.erro = ""; desenhar();
  const pede = (nome, args) => rpc(nome, args).catch((e) => ({ __erro: e.message || String(e) }));
  const [hoje, chatters, turno, semana, variantes] = await Promise.all([
    pede("coach_placar", {}), pede("coach_placar_chatter", {}), pede("coach_relatorio_turno", { p_horas: G.horas }),
    pede("coach_conversao_semana", { p_conta: null }), pede("coach_conversao_variantes", { p_conta: null })
  ]);
  const falhou = [hoje, chatters, turno, semana, variantes].find((x) => x && x.__erro);
  G.erro = falhou ? "Não consegui ler o banco: " + falhou.__erro : "";
  const lista = (x) => (Array.isArray(x) ? x : []);
  G.hoje = lista(hoje); G.chatters = lista(chatters); G.semana = lista(semana); G.variantes = lista(variantes);
  G.turno = turno && !turno.__erro && typeof turno === "object" ? turno : null;
  G.em = Date.now(); G.carregando = false; desenhar();
}

const horaBR = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const pct = (parte, todo) => (Number(todo) > 0 ? Math.round((Number(parte) / Number(todo)) * 100) + "%" : "—");
// tabela simples: cabeçalhos + linhas já prontas (cada linha é um array de nós ou textos)
function tabela(cabs, linhas, vazio) {
  if (!linhas.length) return el("p", { class: "vazio" }, vazio);
  return el("table", { class: "g-tab" },
    el("thead", {}, el("tr", {}, cabs.map((c) => el("th", { class: c && c.num ? "num" : "" }, c && c.num ? c.v : c)))),
    el("tbody", {}, linhas.map((l) => el("tr", {}, l.map((v) => el("td", { class: v && v.num ? "num" : "" }, v && v.num != null ? v.v : v))))));
}
const num = (v) => ({ num: true, v });

function cartaoConta(r) {
  return el("div", { class: "g-cartao" },
    el("div", { class: "g-rot" }, r.conta),
    el("div", { class: "g-num" }, brl(Number(r.receita) || 0)),
    el("div", { class: "g-sub" }, (r.vendas || 0) + " venda" + (Number(r.vendas) === 1 ? "" : "s") + " · " + (r.ppvs || 0) + " PPV · " + (r.jogadas || 0) + " jogada" + (Number(r.jogadas) === 1 ? "" : "s")));
}

function desenharGestor(a) {
  document.body.dataset.gestor = "1";
  if (!G.em && !G.carregando) { carregarGestor(); }
  a.append(el("div", { class: "g-topo" },
    el("h2", {}, "Visão de gestor"),
    el("span", { class: "esp" }),
    el("span", { class: "pequeno fraco" }, G.carregando ? "lendo o banco…" : G.em ? "atualizado às " + horaBR(G.em) : ""),
    el("button", { class: "btn mini", type: "button", disabled: G.carregando, onclick: () => carregarGestor(true) }, "Atualizar")));
  if (G.erro) a.append(el("div", { class: "nota falhou" }, G.erro));
  if (!G.em) { a.append(el("p", { class: "vazio" }, "Lendo o banco…")); return; }

  // 1) hoje, por conta (coach_placar)
  const totR = G.hoje.reduce((s, r) => s + (Number(r.receita) || 0), 0), totV = G.hoje.reduce((s, r) => s + (Number(r.vendas) || 0), 0);
  a.append(el("h3", {}, "Hoje, por conta"),
    el("div", { class: "g-grade" }, G.hoje.map(cartaoConta)),
    el("p", { class: "pequeno fraco" }, "Total do dia: ", el("b", {}, brl(totR)), " em " + totV + " venda" + (totV === 1 ? "" : "s") + "."));

  // 2) turno (coach_relatorio_turno)
  const t = G.turno;
  a.append(el("h3", {}, "Últimas " + G.horas + " horas"));
  if (!t) a.append(el("p", { class: "vazio" }, "Sem relatório de turno."));
  else {
    a.append(el("div", { class: "g-grade" },
      el("div", { class: "g-cartao" }, el("div", { class: "g-rot" }, "receita"), el("div", { class: "g-num" }, brl(Number(t.receita) || 0))),
      el("div", { class: "g-cartao" }, el("div", { class: "g-rot" }, "vendas"), el("div", { class: "g-num" }, String(t.vendas || 0)), el("div", { class: "g-sub" }, (t.ppvs || 0) + " PPV enviados · " + pct(t.vendas, t.ppvs) + " pagos")),
      el("div", { class: "g-cartao" }, el("div", { class: "g-rot" }, "jogadas"), el("div", { class: "g-num" }, String(t.jogadas || 0)), el("div", { class: "g-sub" }, (t.salas || 0) + " conversa" + (Number(t.salas) === 1 ? "" : "s")))));
    const top = Array.isArray(t.top_roteiros) ? t.top_roteiros : [];
    if (top.length) a.append(el("h4", {}, "Roteiros mais usados no turno"),
      tabela(["roteiro", num("usos"), num("vendas"), num("receita")],
        top.slice(0, 10).map((r) => [r.roteiro_id || r.roteiro || "—", num(r.usos || 0), num(r.vendas || 0), num(brl(Number(r.receita) || 0))]), "Nenhum."));
    // "grandes" = VIPs (R$ 1.000+) e baleias (R$ 2.300+) ATENDIDOS no turno; o valor é o total na empresa, não do turno
    const gr = Array.isArray(t.grandes) ? t.grandes : [];
    if (gr.length) a.append(el("h4", {}, "VIPs e baleias atendidos no turno"),
      tabela(["fã", "tier", num("já gastou (total)")],
        gr.slice(0, 10).map((f) => [f.nome || "(sem nome)", f.baleia ? "baleia" : "VIP", num(brl(Number(f.total) || 0))]), "Nenhum."));
  }

  // 3) operadores (coach_placar_chatter)
  a.append(el("h3", {}, "Operadores"),
    tabela(["operador", num("jogadas"), num("conversas"), num("vendas"), num("receita")],
      G.chatters.map((c) => [(c.chatter || "—") + (c.eu && !/voc[êe]/i.test(c.chatter || "") ? " (você)" : ""), num(c.jogadas || 0), num(c.salas || 0), num(c.vendas || 0), num(brl(Number(c.receita) || 0))]),
      "Ninguém registrou jogada ainda."));

  // 4) roteiros da semana (coach_conversao_semana)
  const sem = G.semana.slice().sort((x, y) => (Number(y.receita) || 0) - (Number(x.receita) || 0)).slice(0, 15);
  a.append(el("h3", {}, "Roteiros da semana"),
    tabela(["roteiro", "modo", num("usos"), num("vendas"), num("conversão"), num("receita")],
      sem.map((r) => [r.roteiro_id, r.modo || "—", num(r.usos || 0), num(r.vendas || 0), num(pct(r.vendas, r.usos)), num(brl(Number(r.receita) || 0))]),
      "Sem jogadas na semana."));

  // 5) variantes (coach_conversao_variantes)
  const vr = G.variantes.slice().sort((x, y) => (Number(y.vendas) || 0) - (Number(x.vendas) || 0)).slice(0, 15);
  a.append(el("h3", {}, "Variantes que mais venderam"),
    tabela(["roteiro", num("variante"), num("usos"), num("vendas"), num("conversão")],
      vr.map((r) => [r.roteiro_id, num(r.variante), num(r.usos || 0), num(r.vendas || 0), num(pct(r.vendas, r.usos))]),
      "Sem variantes registradas."),
    el("p", { class: "nota" }, "Tudo aqui é só leitura: esta tela não grava nada e não fala com a Privacy."));
}
