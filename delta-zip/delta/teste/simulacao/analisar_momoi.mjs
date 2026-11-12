// Delta · quais sinais da conversa antecedem uma venda? (conversas da momoi, só números; dados fora do git)
// Divide as conversas em TREINO (índice par) e TESTE (índice ímpar) para não aprender o acaso: um sinal só vale se aparecer nos dois.
// Uso: node teste/simulacao/analisar_momoi.mjs <parte1> [parte2 ...]
import fs from "node:fs";
import path from "node:path";
const arqs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
let linhas = [];
for (const a of arqs) { const b = fs.readFileSync(a, "utf8"); if (b.trimStart().startsWith("[[")) linhas = linhas.concat(JSON.parse(b)); else { const s = JSON.parse(b).result, i = s.indexOf('[{"msgs"'), f = s.indexOf("\n</untrusted-data", i); linhas = linhas.concat(JSON.parse(s.slice(i, f))[0].msgs); } }
const porSala = new Map();
for (const [sala, deFa, ep, tp, preco, texto] of linhas) { if (!porSala.has(sala)) porSala.set(sala, []); porSala.get(sala).push({ de_fa: deFa === 1, ep, preco: preco == null ? null : Number(preco), texto: texto || "" }); }
const pts = [];
for (const [sala, todas] of porSala) {
  todas.sort((a, b) => a.ep - b.ep);
  const vendas = todas.filter((m) => !m.de_fa && m.preco > 0).map((m) => ({ ep: m.ep, preco: m.preco }));
  todas.forEach((m, k) => {
    if (!m.de_fa) return;
    const t = m.ep + 5, antes = vendas.filter((v) => v.ep <= t), depois = vendas.some((v) => v.ep > t && v.ep <= t + 3600);
    const ult = antes.length ? antes[antes.length - 1] : null, minDesde = ult ? (t - ult.ep) / 60 : null;
    const n60 = antes.filter((v) => v.ep > t - 3600).length, n180 = antes.filter((v) => v.ep > t - 10800).length;
    const ultFa = todas.slice(0, k + 1).filter((x) => x.de_fa).slice(-1)[0], ultModelo = [...todas.slice(0, k)].reverse().find((x) => !x.de_fa);
    const gapModelo = ultModelo ? (m.ep - ultModelo.ep) / 60 : null; // minutos entre a última fala da modelo e esta fala do fã
    const dt = new Date(t * 1000), hora = (dt.getUTCHours() + 21) % 24;
    pts.push({ sala, treino: sala % 2 === 0, venda: depois, minDesde, n60, n180, gapModelo, hora, totalAntes: antes.reduce((a, v) => a + v.preco, 0), nVendasAntes: antes.length });
  });
}
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "n/d");
function tabela(titulo, chave, rotulos) {
  console.log("\n" + titulo);
  for (const [nome, f] of rotulos) {
    const linha = ["treino", "teste"].map((g) => { const sel = pts.filter((p) => (g === "treino") === p.treino && f(p)), base = pts.filter((p) => (g === "treino") === p.treino), r = sel.filter((p) => p.venda).length / Math.max(1, sel.length), b = base.filter((p) => p.venda).length / base.length; return g + ": " + sel.filter((p) => p.venda).length + "/" + sel.length + " (" + pct(sel.filter((p) => p.venda).length, sel.length) + ", lift " + (sel.length ? (r / b).toFixed(2) : "n/d") + "×)"; });
    console.log("  " + nome.padEnd(34) + linha.join("  |  "));
  }
}
const tr = pts.filter((p) => p.treino), te = pts.filter((p) => !p.treino);
console.log("pontos: " + pts.length + " (treino " + tr.length + " em " + new Set(tr.map((p) => p.sala)).size + " conversas · teste " + te.length + " em " + new Set(te.map((p) => p.sala)).size + ") · taxa base treino " + pct(tr.filter((p) => p.venda).length, tr.length) + ", teste " + pct(te.filter((p) => p.venda).length, te.length));
tabela("A) Há quanto tempo ele comprou o último PPV", "minDesde", [
  ["nunca comprou nesta conversa", (p) => p.minDesde == null], ["até 10 min", (p) => p.minDesde != null && p.minDesde <= 10], ["10 a 30 min", (p) => p.minDesde > 10 && p.minDesde <= 30],
  ["30 a 60 min", (p) => p.minDesde > 30 && p.minDesde <= 60], ["1 a 3 h", (p) => p.minDesde > 60 && p.minDesde <= 180], ["mais de 3 h", (p) => p.minDesde > 180]]);
tabela("B) Quantos PPVs ele comprou na última hora", "n60", [["0", (p) => p.n60 === 0], ["1", (p) => p.n60 === 1], ["2", (p) => p.n60 === 2], ["3 ou mais", (p) => p.n60 >= 3]]);
tabela("C) Quanto ele já gastou nesta conversa (só PPVs)", "totalAntes", [["R$ 0", (p) => p.totalAntes === 0], ["até R$ 100", (p) => p.totalAntes > 0 && p.totalAntes <= 100], ["R$ 100 a 300", (p) => p.totalAntes > 100 && p.totalAntes <= 300], ["mais de R$ 300", (p) => p.totalAntes > 300]]);
tabela("D) Hora do dia (Brasília)", "hora", [["madrugada 0h-6h", (p) => p.hora < 6], ["manhã 6h-12h", (p) => p.hora >= 6 && p.hora < 12], ["tarde 12h-18h", (p) => p.hora >= 12 && p.hora < 18], ["noite 18h-24h", (p) => p.hora >= 18]]);
tabela("E) Quanto ele demorou para responder a modelo", "gapModelo", [["até 1 min", (p) => p.gapModelo != null && p.gapModelo <= 1], ["1 a 5 min", (p) => p.gapModelo > 1 && p.gapModelo <= 5], ["5 a 30 min", (p) => p.gapModelo > 5 && p.gapModelo <= 30], ["mais de 30 min", (p) => p.gapModelo > 30]]);
tabela("F) Combinações candidatas", "x", [
  ["comprou há ≤ 30 min", (p) => p.minDesde != null && p.minDesde <= 30], ["comprou há ≤ 30 min e já comprou 2+ na hora", (p) => p.minDesde != null && p.minDesde <= 30 && p.n60 >= 2],
  ["comprou há ≤ 60 min", (p) => p.minDesde != null && p.minDesde <= 60], ["comprou há ≤ 60 min, respondeu em ≤ 5 min", (p) => p.minDesde != null && p.minDesde <= 60 && p.gapModelo != null && p.gapModelo <= 5],
  ["já comprou nesta conversa e respondeu ≤ 5 min", (p) => p.nVendasAntes > 0 && p.gapModelo != null && p.gapModelo <= 5]]);
