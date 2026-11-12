// Delta · relatório de fim de turno (📊 Fechar Turno): resumo das últimas 8 h, copiado para a área de transferência.
// Recortado do painel.js sem nenhuma mudança de lógica. Carrega ANTES do painel.js.

// ---------- v2.2 · relatório de fim de turno ----------
function botaoTurno() { return el("button", { class: "btn mini turno", type: "button", title: "Gera e copia o resumo do turno (últimas 8 h): faturamento, conversão, top 3 roteiros, baleias atendidas e quem ficou esperando", onclick: fecharTurno }, turno && turno.carregando ? "Gerando…" : "📊 Fechar Turno"); }
function blocoTurno(a) {
  if (!turno || turno.carregando) return;
  a.append(el("div", { class: "turno-box" }, el("div", { class: "pequeno " + (turno.copiou ? "ok" : "fraco") }, turno.copiou ? "Resumo copiado. Cole onde quiser." : "Não consegui copiar: selecione o texto abaixo."),
    el("pre", { class: "turno-txt" }, turno.txt), el("button", { class: "btn mini", type: "button", onclick: () => { turno = null; desenhar(); } }, "Fechar")));
}
async function fecharTurno() {
  if (turno && turno.carregando) return;
  turno = { carregando: true }; desenhar();
  let d = null, semBanco = false;
  try { d = await rpc("coach_relatorio_turno", { p_horas: 8 }); } catch (e) { semBanco = true; }
  const L = [], conta = (est && est.conta) || "", rot = ((R.config_por_conta || {})[conta] || {}).rotulo || conta;
  const hm = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  L.push("📊 FIM DE TURNO · " + rot + " (@" + conta + ") · " + new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }));
  if (d && typeof d === "object") {
    const conv = Number(d.ppvs) > 0 ? Math.round((100 * Number(d.vendas)) / Number(d.ppvs)) + "%" : "—";
    L.push("Período: " + hm(d.inicio) + " às " + hm(d.fim) + " (" + d.horas + " h)");
    L.push("Faturamento: " + brl(d.receita) + " em " + d.vendas + (Number(d.vendas) === 1 ? " venda" : " vendas"));
    L.push("Conversão: " + conv + " (" + d.vendas + " de " + d.ppvs + " PPVs enviados nas salas atendidas)");
    L.push("Jogadas marcadas: " + d.jogadas + " em " + d.salas + (Number(d.salas) === 1 ? " conversa" : " conversas"));
    const top = Array.isArray(d.top_roteiros) ? d.top_roteiros : [];
    L.push("Top 3 roteiros: " + (top.length ? top.map((t, i) => i + 1 + ") " + t.roteiro_id + " · " + t.usos + " usos · " + t.vendas + " vendas · " + brl(t.receita)).join("  ") : "nenhum roteiro marcado"));
    const gr = Array.isArray(d.grandes) ? d.grandes : [];
    L.push("Baleias / VIPs atendidos: " + (gr.length ? gr.map((g) => (g.baleia ? "🐋 " : "⭐ ") + (g.nome || "(sem nome)") + " (" + brl(g.total) + ")").join(", ") : "nenhum"));
  } else {
    const pl = placarLocal && placarLocal.data === hojeSP() ? (placarLocal.contas[conta] || {}) : {};
    L.push("Faturamento visto na tela hoje: " + brl(pl.receita || 0) + " em " + (pl.vendas || 0) + " vendas");
    L.push("(resumo completo indisponível: " + (semBanco ? "rode o coach_sql.sql v2.2 no Supabase" : "sem dados") + ")");
  }
  const rt = ritmo(); if (rt != null) L.push("Ritmo de chegada agora: ⚡ " + rt + " chats/h");
  const esp = est && est.salas ? M.fila(est.salas, R, Date.now(), null).filter((s) => s.naoLidas > 0) : [];
  L.push("Ficou esperando (" + esp.length + "): " + (esp.length ? esp.slice(0, 12).map((s) => (s.nome || "(sem nome)") + (s.espera_s != null ? " · " + (s.espera_s >= 86400 ? "desde ontem" : M.fmtSeg(s.espera_s)) : "") + (s.gasto ? " · " + brl(s.gasto) : "")).join("; ") + (esp.length > 12 ? "; e mais " + (esp.length - 12) : "") : "ninguém na lista carregada"));
  const txt = L.join("\n"), copiou = await escrever(txt);
  turno = { txt, copiou, em: Date.now() }; desenhar();
}
