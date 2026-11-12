// Delta · simulação de chat: repete, mensagem por mensagem, as conversas SALVAS no banco (emp_mensagens) dentro do motor
// e mede o que o painel teria mostrado em cada ponto de decisão (depois de cada fala do fã). Não abre Chrome, não usa rede.
// Os dados dos fãs ficam FORA do git (teste/simulacao/dados*.json está no .gitignore); este script só imprime números.
// Uso: node teste/simulacao/replay.mjs <arquivo-com-mensagens> <aux.json> [coach-ext]
//   mensagens: resultado do execute_sql (envelope do Supabase) OU um JSON puro [[sala, de_fa, epoch_s, tipo, fa_id, texto], ...]
//   aux.json:  { ppvs: [[sala, enviado_s, preco, comprado, comprado_s, conta]], compras: { fa_id: [[data, valor, conta]] }, salas: [[sala, conta, fa_id]] }
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const [, , arqMsgs, arqAux, extArg] = process.argv;
if (!arqMsgs || !arqAux) { console.error("uso: node teste/simulacao/replay.mjs <mensagens> <aux.json> [coach-ext]"); process.exit(1); }
const EXT = path.resolve(extArg || "coach-ext");
const M = require(path.join(EXT, "motor.js"));
const lerJ = (f) => JSON.parse(fs.readFileSync(path.join(EXT, "data", f), "utf8"));
const R = lerJ("coach_regras.json"), ROT = lerJ("coach_roteiros.json"), CN = lerJ("coach_cenas.json");

// o classificador de padrão é o MESMO código do leitor.js (extraído do arquivo, não copiado); o "antigo" usa a regex da 2.3.14
const fonteLeitor = fs.readFileSync(path.join(EXT, "leitor.js"), "utf8");
const trecho = fonteLeitor.match(/function classificarPadrao\(msgs\) \{[\s\S]*?\n  \}\n/);
if (!trecho) { console.error("não achei classificarPadrao no leitor.js"); process.exit(1); }
const classificar = new Function(trecho[0] + "; return classificarPadrao;")();
const classificarAntigo = new Function(trecho[0].replace(/const mencionouPreco = [^\n]*\n/, "const mencionouPreco = /preço|preco|valor|quanto|pix|pago|pagar|compra|compro|r\\$/.test(texto);\n") + "; return classificarPadrao;")();

// ---------- dados ----------
let bruto = fs.readFileSync(arqMsgs, "utf8"), linhas;
if (bruto.trimStart().startsWith("[[")) linhas = JSON.parse(bruto);
else { const s = JSON.parse(bruto).result, ini = s.indexOf('[{"msgs"'), fim = s.indexOf("\n</untrusted-data", ini); linhas = JSON.parse(s.slice(ini, fim))[0].msgs; }
const aux = JSON.parse(fs.readFileSync(arqAux, "utf8"));
const salaInfo = new Map(aux.salas.map((x) => [x[0], { conta: x[1] === "Luna" ? "xlunavitaligratis" : x[1], contaBanco: x[1], fa: String(x[2]).split(",")[0] }]));
const porSala = new Map();
for (const [sala, deFa, ep, tp, fa, texto] of linhas) {
  if (!porSala.has(sala)) porSala.set(sala, []);
  porSala.get(sala).push({ de_fa: deFa === 1, em: ep * 1000, tipo: tp === "t" ? "texto" : tp === "a" ? "audio" : "midia", fa: fa, texto: texto || "" });
}
const iso = (ms) => new Date(ms).toISOString();

// ---------- replay ----------
const pontos = [], erros = [], tempos = [];
for (const [sala, todas] of porSala) {
  const info = salaInfo.get(sala); if (!info || !R.config_por_conta[info.conta]) continue;
  todas.sort((a, b) => a.em - b.em);
  const ppvsSala = aux.ppvs.filter((p) => p[0] === sala), compras = (aux.compras[info.fa] || []);
  todas.forEach((m, k) => {
    if (!m.de_fa) return;                                       // ponto de decisão: logo depois de uma fala do fã
    const agora = m.em + 5000, agoraS = agora / 1000;
    const msgs = todas.slice(0, k + 1).map((x, i) => ({ id: "m" + i, em: x.em, de_fa: x.de_fa, tipo: x.tipo, texto: x.texto }));
    const ppvs = ppvsSala.filter((p) => p[1] <= agoraS).map((p, i) => ({ msg_id: "p" + i, preco: p[2], enviado_em: iso(p[1] * 1000), comprado: p[3] === 1 && p[4] != null && p[4] <= agoraS, comprado_em: p[4] != null && p[4] <= agoraS ? iso(p[4] * 1000) : null }));
    const dia = iso(agora).slice(0, 10), cs = compras.filter((c) => c[0] <= dia);
    const porConta = {}; cs.forEach((c) => { porConta[c[2]] = porConta[c[2]] || { conta: c[2], gasto: 0, n: 0 }; porConta[c[2]].gasto += c[1]; porConta[c[2]].n++; });
    const ficha = { fa: { id: Number(info.fa) }, total: cs.reduce((a, c) => a + c[1], 0), n: cs.length, ultimas: cs.slice(-10).reverse().map((c) => ({ data: c[0] + "T12:00:00Z", valor: c[1], conta: c[2] })), por_conta: Object.values(porConta), notas: [], tags: [] };
    const padrao = classificar(msgs), padraoAntigo = classificarAntigo(msgs);
    const ctx = { agora, conta: info.conta, conv: { nome: "Fã", perfil: "fa" + info.fa, sala: "s" + sala, total: null }, msgs, ppvs: ppvs.length ? ppvs : null, ficha, compraTelaEm: null, config: R.config_por_conta[info.conta], texto: "", historico: null, convVar: null, cenaFixa: false, ligacaoSoNome: false, padrao, momentoStats: null, roteiroOferta: null };
    const t0 = process.hrtime.bigint(); let r = null;
    try { r = M.calcular(ctx, R, ROT, CN); } catch (e) { erros.push(String(e && e.message || e).slice(0, 120)); }
    tempos.push(Number(process.hrtime.bigint() - t0) / 1e6);
    const venda60 = aux.ppvs.some((p) => p[0] === sala && p[3] === 1 && p[4] != null && p[4] > agoraS && p[4] <= agoraS + 3600);
    pontos.push({ sala, conta: info.conta, padrao, padraoAntigo, r, venda60, total: ficha.total, ppvPendente: !!(r && r.selos.some((s) => s.id === "ppv")) });
  });
}

// ---------- relatório (só números) ----------
const ok = pontos.filter((p) => p.r), pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "n/d");
const cont = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
const ord = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(" · ");
console.log("== SIMULAÇÃO DE CHAT (motor " + require(path.join(EXT, "manifest.json")).version + ") ==");
console.log("conversas: " + porSala.size + " · mensagens: " + linhas.length + " (do fã: " + linhas.filter((l) => l[1] === 1).length + ") · pontos de decisão: " + pontos.length);
console.log("erros do motor: " + erros.length + (erros.length ? " → " + [...new Set(erros)].join(" | ") : "") + " · tempo por cálculo: média " + (tempos.reduce((a, b) => a + b, 0) / tempos.length).toFixed(2) + " ms, máx " + Math.max(...tempos).toFixed(1) + " ms");
console.log("\n-- fases e roteiros --");
console.log("fase: " + ord(cont(ok, (p) => p.r.fase.id)));
console.log("venda em 60 min por fase: " + Object.entries(cont(ok, (p) => p.r.fase.id)).map(([k, n]) => k + " " + ok.filter((p) => p.r.fase.id === k && p.venda60).length + "/" + n + " (" + pct(ok.filter((p) => p.r.fase.id === k && p.venda60).length, n) + ")").join(" · "));
console.log("roteiro (top 8): " + Object.entries(cont(ok, (p) => p.r.jogada.roteiro || "(nenhum)")).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + " " + v).join(" · "));
console.log("\n-- padrão do fã (leitor.js) --");
console.log("padrão: " + ord(cont(pontos, (p) => p.padrao)));
const dif = pontos.filter((p) => p.padrao !== p.padraoAntigo);
console.log("regex antiga x nova de preço: " + dif.length + " pontos mudaram (antiga marcava 'mencionou_preco' a mais em " + dif.filter((p) => p.padraoAntigo === "mencionou_preco").length + "; dessas " + dif.filter((p) => p.padraoAntigo === "mencionou_preco" && p.venda60).length + " tiveram venda em 60 min)");
console.log("venda em 60 min após o ponto, por padrão: " + Object.entries(cont(pontos, (p) => p.padrao)).map(([k, n]) => k + " " + pontos.filter((p) => p.padrao === k && p.venda60).length + "/" + n + " (" + pct(pontos.filter((p) => p.padrao === k && p.venda60).length, n) + ")").join(" · "));
console.log("\n-- Momento de ofertar --");
const mo = ok.filter((p) => p.r.momentoOfertar), sem = ok.filter((p) => !p.r.momentoOfertar);
console.log("banner ligado em " + mo.length + " de " + ok.length + " pontos (" + pct(mo.length, ok.length) + ") · por padrão: " + ord(cont(mo, (p) => p.padrao)));
console.log("venda em 60 min COM banner: " + mo.filter((p) => p.venda60).length + "/" + mo.length + " (" + pct(mo.filter((p) => p.venda60).length, mo.length) + ") · SEM banner: " + sem.filter((p) => p.venda60).length + "/" + sem.length + " (" + pct(sem.filter((p) => p.venda60).length, sem.length) + ")");
const gat = ok.filter((p) => R.momento_ofertar.padroes.includes(p.padrao) && !p.r.momentoOfertar);
const motivo = (p) => (R.momento_ofertar.fases_barram.includes(p.r.fase.id) ? "fase barrada (" + p.r.fase.id + ")" : p.ppvPendente ? "PPV pendente" : "gasto abaixo do mínimo");
console.log("padrão de gatilho mas SEM banner: " + gat.length + " · por quê: " + ord(cont(gat, motivo)));
const su = ok.filter((p) => p.r.sugestaoOferta);
console.log("sugestão de roteiro de oferta: " + su.length + " pontos" + (su.length ? " · trocaria " + ord(cont(su, (p) => p.r.sugestaoOferta.atual + "→" + p.r.sugestaoOferta.id)) : ""));
console.log("variantes de oferta marcadas no roteiro do banner: " + mo.filter((p) => p.r.momentoOfertar.variantes.length).length + "/" + mo.length + " (nos roteiros 100% de oferta o boost não muda a ordem)");

console.log("\n-- compliance: o que o operador REALMENTE escreveu nessas conversas --");
const conta = []; for (const [sala, todas] of porSala) todas.filter((m) => !m.de_fa && m.tipo === "texto" && m.texto.trim()).forEach((m) => conta.push({ sala, texto: m.texto }));
const al = conta.map((m) => M.alertas(m.texto, {}, R)), dig = al.map((a) => a.filter((x) => x.digitando)), outros = al.map((a) => a.filter((x) => !x.digitando));
console.log("mensagens da conta analisadas: " + conta.length);
console.log("com aviso do compliance novo (garantia/preço final/desconto agressivo): " + dig.filter((a) => a.length).length + " (" + pct(dig.filter((a) => a.length).length, conta.length) + ") · por grupo: " + (ord(cont(dig.flat(), (x) => x.id)) || "nenhum"));
console.log("com alerta antigo (vermelho/amarelo/info): " + outros.filter((a) => a.length).length + " (" + pct(outros.filter((a) => a.length).length, conta.length) + ") · por regra: " + (ord(cont(outros.flat(), (x) => x.id + ":" + x.nivel)) || "nenhum"));
