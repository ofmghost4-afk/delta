// Delta · simulação de chat com as conversas da momoi (central.delta_msgs, uso autorizado pelo usuário em 12/11/2026).
// Repete cada conversa mensagem por mensagem no motor e imprime SÓ números. Dados fora do git (teste/simulacao/dados*.json).
// Limites da base: só existem os PPVs que VENDERAM (todos destravados); não há PPV não vendido nem hora da compra.
// Por isso o resultado medido é "depois deste ponto, a modelo mandou (e vendeu) um PPV em até 60 min?", sem negativos de oferta.
// Uso: node teste/simulacao/replay_momoi.mjs <parte1> <parte2> ... [--ext=coach-ext]
//   cada parte: saída do execute_sql (envelope do Supabase) ou JSON puro [[sala, de_fa, epoch_s, tipo, preco, texto], ...]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const args = process.argv.slice(2), arqs = args.filter((a) => !a.startsWith("--")), extArg = (args.find((a) => a.startsWith("--ext=")) || "").slice(6);
if (!arqs.length) { console.error("uso: node teste/simulacao/replay_momoi.mjs <parte1> [parte2 ...] [--ext=coach-ext]"); process.exit(1); }
const EXT = path.resolve(extArg || "coach-ext");
const M = require(path.join(EXT, "motor.js"));
const lerJ = (f) => JSON.parse(fs.readFileSync(path.join(EXT, "data", f), "utf8"));
const R = lerJ("coach_regras.json"), ROT = lerJ("coach_roteiros.json"), CN = lerJ("coach_cenas.json");
const fonteLeitor = fs.readFileSync(path.join(EXT, "leitor.js"), "utf8");
const trecho = fonteLeitor.match(/function classificarPadrao\(msgs\) \{[\s\S]*?\n  \}\n/);
const classificar = new Function(trecho[0] + "; return classificarPadrao;")();
const classificarAntigo = new Function(trecho[0].replace(/const mencionouPreco = [^\n]*\n/, "const mencionouPreco = /preço|preco|valor|quanto|pix|pago|pagar|compra|compro|r\\$/.test(texto);\n") + "; return classificarPadrao;")();

let linhas = [];
for (const a of arqs) {
  const bruto = fs.readFileSync(a, "utf8");
  if (bruto.trimStart().startsWith("[[")) linhas = linhas.concat(JSON.parse(bruto));
  else { const s = JSON.parse(bruto).result, ini = s.indexOf('[{"msgs"'), fim = s.indexOf("\n</untrusted-data", ini); linhas = linhas.concat(JSON.parse(s.slice(ini, fim))[0].msgs); }
}
const porSala = new Map();
for (const [sala, deFa, ep, tp, preco, texto] of linhas) {
  if (!porSala.has(sala)) porSala.set(sala, []);
  porSala.get(sala).push({ de_fa: deFa === 1, em: ep * 1000, tipo: tp === "m" ? "midia" : "texto", preco: preco == null ? null : Number(preco), texto: texto || "" });
}
const iso = (ms) => new Date(ms).toISOString(), conta = "arrudafree", cfg = R.config_por_conta[conta];

const pontos = [], erros = [], tempos = [];
for (const [sala, todas] of porSala) {
  todas.sort((a, b) => a.em - b.em);
  const vendidos = todas.filter((m) => !m.de_fa && m.preco != null && m.preco > 0).map((m, i) => ({ i, ep: m.em / 1000, preco: m.preco }));
  todas.forEach((m, k) => {
    if (!m.de_fa) return;
    const agora = m.em + 5000, agoraS = agora / 1000;
    const msgs = todas.slice(Math.max(0, k - 199), k + 1).map((x, i) => ({ id: "m" + i, em: x.em, de_fa: x.de_fa, tipo: x.tipo, texto: x.texto, ppv: !x.de_fa && x.preco != null ? true : undefined, preco: x.preco != null ? x.preco : undefined, comprado: !x.de_fa && x.preco != null ? true : undefined }));
    const antes = vendidos.filter((v) => v.ep <= agoraS);
    const ppvs = antes.map((v) => ({ msg_id: "p" + v.i, preco: v.preco, enviado_em: iso(v.ep * 1000), comprado: true, comprado_em: iso(v.ep * 1000) }));
    const ficha = { fa: { id: sala }, total: antes.reduce((a, v) => a + v.preco, 0), n: antes.length, ultimas: antes.slice(-10).reverse().map((v) => ({ data: iso(v.ep * 1000), valor: v.preco, conta })), por_conta: antes.length ? [{ conta, gasto: antes.reduce((a, v) => a + v.preco, 0), n: antes.length }] : [], notas: [], tags: [] };
    const padrao = classificar(msgs), padraoAntigo = classificarAntigo(msgs);
    const ctx = { agora, conta, conv: { nome: "Fã", perfil: "fa" + sala, sala: "s" + sala, total: null }, msgs, ppvs: ppvs.length ? ppvs : null, ficha, compraTelaEm: null, config: cfg, texto: "", historico: null, convVar: null, cenaFixa: false, ligacaoSoNome: false, padrao, momentoStats: null, roteiroOferta: null };
    const t0 = process.hrtime.bigint(); let r = null;
    try { r = M.calcular(ctx, R, ROT, CN); } catch (e) { erros.push(String(e && e.message || e).slice(0, 120)); }
    tempos.push(Number(process.hrtime.bigint() - t0) / 1e6);
    pontos.push({ sala, padrao, padraoAntigo, r, venda60: vendidos.some((v) => v.ep > agoraS && v.ep <= agoraS + 3600), total: ficha.total, ppvPendente: !!(r && r.selos.some((s) => s.id === "ppv")) });
  });
}

const ok = pontos.filter((p) => p.r), pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "n/d");
const cont = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
const ord = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(" · ");
const taxa = (arr) => arr.filter((p) => p.venda60).length + "/" + arr.length + " (" + pct(arr.filter((p) => p.venda60).length, arr.length) + ")";
const base = ok.filter((p) => p.venda60).length / ok.length;
const lift = (arr) => (arr.length ? (arr.filter((p) => p.venda60).length / arr.length / base).toFixed(2) + "×" : "n/d");
console.log("== SIMULAÇÃO COM AS CONVERSAS DA MOMOI (motor " + require(path.join(EXT, "manifest.json")).version + ", conta usada como molde: " + conta + ") ==");
console.log("conversas: " + porSala.size + " · mensagens: " + linhas.length + " (do fã: " + linhas.filter((l) => l[1] === 1).length + ") · PPVs vendidos: " + linhas.filter((l) => l[1] === 0 && l[4] != null && l[4] > 0).length + " · pontos de decisão: " + pontos.length);
console.log("erros do motor: " + erros.length + (erros.length ? " → " + [...new Set(erros)].slice(0, 4).join(" | ") : "") + " · tempo por cálculo: média " + (tempos.reduce((a, b) => a + b, 0) / tempos.length).toFixed(2) + " ms, máx " + Math.max(...tempos).toFixed(1) + " ms");
console.log("taxa base: " + taxa(ok) + " dos pontos têm um PPV vendido nos 60 min seguintes");
console.log("\n-- fases (e quanto cada uma antecede uma venda) --");
console.log("fase: " + Object.entries(cont(ok, (p) => p.r.fase.id)).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + " " + n + " → " + taxa(ok.filter((p) => p.r.fase.id === k)) + " lift " + lift(ok.filter((p) => p.r.fase.id === k))).join("\n      "));
console.log("\n-- padrão do fã --");
console.log("padrão: " + Object.entries(cont(pontos, (p) => p.padrao)).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + " " + n + " → " + taxa(pontos.filter((p) => p.padrao === k)) + " lift " + lift(pontos.filter((p) => p.padrao === k))).join("\n        "));
const dif = pontos.filter((p) => p.padrao !== p.padraoAntigo);
console.log("regex antiga x nova de preço: " + dif.length + " pontos mudaram (a antiga marcava 'mencionou_preco' a mais; esses " + dif.filter((p) => p.padraoAntigo === "mencionou_preco").length + " pontos tiveram venda em " + pct(dif.filter((p) => p.venda60).length, dif.length) + " dos casos)");
console.log("\n-- Momento de ofertar --");
const mo = ok.filter((p) => p.r.momentoOfertar), sem = ok.filter((p) => !p.r.momentoOfertar);
const splits = [["treino (conversas pares)", (p) => p.sala % 2 === 0], ["teste (conversas ímpares)", (p) => p.sala % 2 === 1]];
for (const [nome, f] of splits) {
  const tot = ok.filter(f), com = mo.filter(f), baseS = tot.filter((p) => p.venda60).length / tot.length;
  console.log("   " + nome + ": base " + pct(tot.filter((p) => p.venda60).length, tot.length) + " · COM banner " + taxa(com) + " lift " + (com.length ? (com.filter((p) => p.venda60).length / com.length / baseS).toFixed(2) + "×" : "n/d") + " · SEM banner " + taxa(tot.filter((p) => !p.r.momentoOfertar)));
}
console.log("   por gatilho: " + Object.entries(cont(mo, (p) => p.r.momentoOfertar.gatilho)).map(([k, n]) => k + " " + taxa(mo.filter((p) => p.r.momentoOfertar.gatilho === k)) + " lift " + lift(mo.filter((p) => p.r.momentoOfertar.gatilho === k))).join(" · "));
console.log("banner ligado em " + mo.length + " de " + ok.length + " pontos (" + pct(mo.length, ok.length) + ") · por padrão: " + ord(cont(mo, (p) => p.padrao)));
console.log("venda em 60 min COM banner: " + taxa(mo) + " lift " + lift(mo) + " · SEM banner: " + taxa(sem) + " lift " + lift(sem));
for (const pd of R.momento_ofertar.padroes) { const g = mo.filter((p) => p.padrao === pd); console.log("   " + pd + " com banner: " + taxa(g) + " lift " + lift(g)); }
const gat = ok.filter((p) => R.momento_ofertar.padroes.includes(p.padrao));
console.log("padrão de gatilho (com ou sem banner): " + taxa(gat) + " lift " + lift(gat));
const barrados = gat.filter((p) => !p.r.momentoOfertar), motivo = (p) => (R.momento_ofertar.fases_barram.includes(p.r.fase.id) ? "fase barrada (" + p.r.fase.id + ")" : p.ppvPendente ? "PPV pendente" : "gasto abaixo do mínimo");
console.log("gatilho SEM banner: " + barrados.length + " · por quê: " + ord(cont(barrados, motivo)) + " · venda: " + taxa(barrados));
const su = ok.filter((p) => p.r.sugestaoOferta);
console.log("sugestão de roteiro de oferta: " + su.length + " pontos" + (su.length ? " · " + ord(cont(su, (p) => p.r.sugestaoOferta.atual + "→" + p.r.sugestaoOferta.id)) + " · venda: " + taxa(su) : ""));

console.log("\n-- compliance: o que a momoi REALMENTE escreveu --");
const modelo = []; for (const [, todas] of porSala) todas.filter((m) => !m.de_fa && m.tipo === "texto" && m.texto.trim()).forEach((m) => modelo.push(m.texto));
const al = modelo.map((t) => M.alertas(t, {}, R)), dig = al.map((a) => a.filter((x) => x.digitando)), outros = al.map((a) => a.filter((x) => !x.digitando));
console.log("mensagens da modelo analisadas: " + modelo.length);
console.log("com aviso do compliance novo: " + dig.filter((a) => a.length).length + " (" + pct(dig.filter((a) => a.length).length, modelo.length) + ") · por grupo: " + (ord(cont(dig.flat(), (x) => x.id)) || "nenhum"));
console.log("termos que mais dispararam: " + (ord(cont(dig.flat().flatMap((x) => x.gatilho.split(", ")), (t) => t)) || "nenhum"));
console.log("com alerta antigo: " + outros.filter((a) => a.length).length + " (" + pct(outros.filter((a) => a.length).length, modelo.length) + ") · por regra: " + (ord(cont(outros.flat(), (x) => x.id + ":" + x.nivel)) || "nenhum"));
