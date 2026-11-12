// Testes das regras novas da v2.2 no motor (Node puro, sem navegador e sem rede).
// Uso: node teste/unit_v22.mjs coach-ext
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const EXT = path.resolve(process.argv[2] || "coach-ext");
const M = require(path.join(EXT, "motor.js"));
const lerJ = (f) => JSON.parse(fs.readFileSync(path.join(EXT, "data", f), "utf8"));
const R = lerJ("coach_regras.json"), ROT = lerJ("coach_roteiros.json"), CN = lerJ("coach_cenas.json");
let falhas = 0, n = 0;
function confere(nome, cond, detalhe) { n++; if (!cond) falhas++; console.log((cond ? "  ok   " : "  FALHA ") + nome + (cond ? "" : "  → " + JSON.stringify(detalhe))); }

const AG = Date.parse("2026-11-10T18:00:00-03:00"); // fora do horário nobre
const msgs = (a) => a.map((m, i) => ({ id: "m" + i, em: AG - m[0] * 1000, de_fa: m[1], texto: m[2], ppv: !!m[3], comprado: m[3] ? m[3].comprado : undefined, preco: m[3] ? m[3].preco : undefined }));
function calc(o) {
  const conta = o.conta || "arrudafree", cfg = Object.assign({}, R.config_por_conta[conta], o.cfg || {});
  return M.calcular({ agora: AG, conta, conv: { nome: o.nome === undefined ? "João Teste" : o.nome, perfil: "joao_teste", sala: "s1", total: null }, msgs: msgs(o.msgs || []), ppvs: o.ppvs || null,
    ficha: o.ficha === undefined ? { fa: { id: 1 }, total: 0, n: 0, ultimas: [], por_conta: [], notas: [], tags: [] } : o.ficha, compraTelaEm: o.compraTelaEm || null, config: cfg, texto: o.texto || "", modo: o.modo || "dominante",
    historico: o.historico || null, convVar: o.convVar || null, cenaFixa: !!o.cenaFixa, ligacaoSoNome: !!o.soNome, padrao: o.padrao || null, roteiroOferta: o.roteiroOferta || null }, o.R || R, ROT, CN);
}
const compra = (min, valor) => ({ data: new Date(AG - min * 60000).toISOString(), valor, conta: "arrudafree" });
const fichaPag = (total, ultimas, por) => ({ fa: { id: 1 }, total, n: ultimas.length, ultimas, por_conta: por || [{ conta: "arrudafree", gasto: total, n: ultimas.length }], notas: [], tags: [] });
const papo = [[900, false, "oi amor 😘"], [880, true, "oi linda"], [600, false, "como foi teu dia?"], [580, true, "foi puxado"]];
const rot = (id) => ROT.roteiros.find((x) => x.id === id);

console.log("== calibragem (item 1) ==");
const tiers = R.modos.dominante.preco.tiers;
confere("corte de Baleia = R$ 2.300, origem BASE", tiers.find((t) => t.id === "baleia").total_min === 2300 && tiers.find((t) => t.id === "baleia").origem === "BASE", tiers[0]);
confere("meta do dia por conta = 530 / 490 / 230", R.config_por_conta.arrudafree.meta_dia_brl === 530 && R.config_por_conta.xlunavitaligratis.meta_dia_brl === 490 && R.config_por_conta.louisefree.meta_dia_brl === 230, null);
confere("degrau Dominante = +38% a +70% (BASE)", R.modos.dominante.preco.degrau.min_pct === 38 && R.modos.dominante.preco.degrau.padrao_pct === 70 && R.modos.dominante.preco.degrau.origem === "BASE", R.modos.dominante.preco.degrau);
confere("bloco calibragem com a data e as fontes", !!R.calibragem && R.calibragem.compradores === 3891, null);

console.log("== freio de gasto (item 3) ==");
let r = calc({ ficha: fichaPag(300, [compra(20, 80), compra(50, 50)]), msgs: papo.concat([[30, true, "nossa, assim você vai me deixar pobre kkk"]]) });
confere("pagante que diz 'vai me deixar pobre' → PC_FREIO_CARINHO", r.fase.tipo === "freio_gasto" && r.jogada.roteiro === "PC_FREIO_CARINHO" && !!r.roteiro, { fase: r.fase, jog: r.jogada });
confere("freio trava o preço na última compra e some a escada", r.preco.min === 80 && r.preco.max === 80 && r.preco.freio === true && r.escada === null, { preco: r.preco, escada: r.escada });
confere("freio avisa no HUD e ganha selo", r.hud.some((h) => /Freio de gasto/.test(h.txt)) && r.selos.some((s) => s.id === "freio"), r.hud);
r = calc({ msgs: papo.concat([[30, true, "assim você vai me deixar pobre"]]) });
confere("quem nunca comprou e diz o mesmo NÃO dispara o freio", r.fase.tipo !== "freio_gasto", r.fase);
r = calc({ modo: "normal", ficha: fichaPag(300, [compra(20, 80)]), msgs: papo.concat([[30, true, "já gastei demais hoje"]]) });
confere("freio também vale no modo normal", r.jogada.roteiro === "PC_FREIO_CARINHO" && r.preco.max === 80, { jog: r.jogada, preco: r.preco });

console.log("== boas-vindas (item 4) ==");
r = calc({ msgs: [[3600, false, "Seja bem-vindo ao meu cantinho! 💕 fica à vontade"]] });
confere("só a boas-vindas automática → aviso no HUD + AB_USERNAME", r.boasVindas === true && r.hud.some((h) => /boas-vindas automática/.test(h.txt)) && r.jogada.roteiro === "AB_USERNAME", { hud: r.hud, jog: r.jogada });
r = calc({ msgs: [[3600, false, "Seja bem-vindo! 💕"], [3000, false, "Oi João, que nome bonito 😏"]] });
confere("mensagem nossa com o nome dele desliga o aviso", r.boasVindas === false && !r.hud.some((h) => /boas-vindas/.test(h.txt)), r.hud);

console.log("== piso por mídia (item 5) ==");
r = calc({ cfg: { piso_midia_brl: 45, entrada_brl: [29.9, 49.9] }, msgs: papo });
confere("sugestão nunca abaixo do piso da conta", r.preco.min === 45 && r.preco.max >= 45 && r.preco.piso === 45, r.preco);
r = calc({ msgs: papo, texto: "te faço por R$ 9,90 amor" });
confere("digitar valor abaixo do piso → bloqueio_visual", r.alertas.some((a) => a.id === "piso_midia" && a.nivel === "bloqueio_visual"), r.alertas);
r = calc({ msgs: papo, texto: "esse sai por R$ 49,90" });
confere("valor acima do piso não alerta", !r.alertas.some((a) => a.id === "piso_midia"), r.alertas);
confere("as 3 contas têm piso_midia_brl", ["arrudafree", "xlunavitaligratis", "louisefree"].every((c) => R.config_por_conta[c].piso_midia_brl >= 14.9), null);

console.log("== encontro rico (item 6) ==");
r = calc({ msgs: papo.concat([[30, true, "bora marcar um encontro?"]]) });
confere("sem gasto pede encontro → OB_ENCONTRO", r.jogada.roteiro === "OB_ENCONTRO", r.jogada);
r = calc({ ficha: fichaPag(1500, [compra(60 * 30, 200)]), msgs: papo.concat([[30, true, "bora marcar um encontro?"]]) });
confere("VIP pede encontro, conta com chamada → OB_ENCONTRO_VIP_CHAMADA", r.jogada.roteiro === "OB_ENCONTRO_VIP_CHAMADA" && !!r.roteiro, r.jogada);
r = calc({ conta: "louisefree", ficha: fichaPag(200, [compra(60 * 30, 200)], [{ conta: "louisefree", gasto: 200, n: 1 }]), msgs: papo.concat([[30, true, "queria te ver pessoalmente"]]) });
confere("pagante pede encontro, conta sem chamada → OB_ENCONTRO_VIP", r.jogada.roteiro === "OB_ENCONTRO_VIP" && !!r.roteiro, r.jogada);
const textosEnc = ["OB_ENCONTRO_VIP", "OB_ENCONTRO_VIP_CHAMADA"].flatMap((id) => rot(id).variantes.concat(rot(id).dominante));
confere("roteiros de encontro dizem online e nunca prometem encontro", textosEnc.every((t) => /online|aqui dentro|por aqui|aqui na privacy/i.test(t) && !/quem sabe|um dia a gente|te encontro|vou te ver pessoalmente/i.test(t)), null);
confere("roteiros de encontro passam nos alertas de termos", textosEnc.every((t) => !M.alertas(t, null, M.aplicarModo(R, "dominante")).some((a) => a.nivel === "bloqueio_visual" && a.id !== "encontro")), textosEnc.map((t) => M.alertas(t, null, M.aplicarModo(R, "dominante")).map((a) => a.id)).filter((x) => x.length));

console.log("== post fixado (item 7) ==");
r = calc({ cfg: { palavra_fixado: ["quero vip", "segredo"] }, msgs: papo.concat([[30, true, "oi, SEGREDO"]]) });
confere("palavra do fixado na última msg dele → VD_POST_FIXADO com prioridade", r.fase.fixado === "segredo" && r.jogada.roteiro === "VD_POST_FIXADO" && !!r.roteiro && r.hud.some((h) => /post fixado/.test(h.txt)), { fase: r.fase, jog: r.jogada });
r = calc({ cfg: { palavra_fixado: ["segredo"] }, msgs: papo.concat([[30, true, "segredo, mas tá caro demais"]]) });
confere("fixado vence objeção (só perde para vulnerável)", r.jogada.roteiro === "VD_POST_FIXADO", r.jogada);
r = calc({ cfg: { palavra_fixado: ["segredo"] }, msgs: papo.concat([[30, true, "segredo"], [10, false, "oi amor, já te mando"]]) });
confere("depois que a conta respondeu, o fixado não dispara de novo", r.jogada.roteiro !== "VD_POST_FIXADO", r.jogada);
confere("sem palavra configurada nada muda", calc({ msgs: papo.concat([[30, true, "segredo"]]) }).jogada.roteiro !== "VD_POST_FIXADO", null);

console.log("== sumiu no meio (item 8) ==");
const sess = { ficha: fichaPag(130, [compra(20, 80), compra(40, 50)]), msgs: [[2600, false, "olha esse"], [2400, true, "comprei 🔥"], [1300, true, "manda outro"], [1250, false, "gostou? tem mais um que eu acho que você aguenta"], [420, false, "e aí?"]] };
r = calc(sess);
confere("sessão ativa + 7 min sem responder à conta → SS_SUMIU_MEIO", r.fase.sumiuMeio === true && r.jogada.roteiro === "SS_SUMIU_MEIO" && !!r.roteiro, { fase: r.fase, jog: r.jogada });
r = calc(Object.assign({}, sess, { msgs: sess.msgs.slice(0, 4).concat([[120, false, "e aí?"]]) }));
confere("só 2 min sem responder ainda não dispara", !r.fase.sumiuMeio, r.fase);
r = calc(Object.assign({}, sess, { msgs: sess.msgs.slice(0, 4).concat([[420, false, "olha esse", { preco: 99 }]]) }));
confere("com PPV pendente quem cuida é o follow-up, não o sumiu", !r.fase.sumiuMeio, r.fase);
r = calc({ cenaFixa: true, msgs: [[2000, true, "oi"], [1900, false, "pronto? começa assim..."], [1800, true, "nossa"], [400, false, "me fala o que você faria agora"]] });
confere("cena fixada em andamento também dispara", r.fase.sumiuMeio === true && r.jogada.roteiro === "SS_SUMIU_MEIO", r.fase);
r = calc({ msgs: [[2000, true, "oi"], [1900, false, "oi"], [1800, true, "tudo bem"], [400, false, "me conta mais"]] });
confere("sem sessão nem cena, não dispara", !r.fase.sumiuMeio, r.fase);

console.log("== previsão de 30 dias e Cara de Baleia (item 9) ==");
const f7 = (vals, por) => fichaPag(vals.reduce((a, b) => a + b, 0), vals.map((v, i) => ({ data: new Date(AG - (2 * 86400000) + i * 3600000).toISOString(), valor: v, conta: "arrudafree" })), por);
r = calc({ ficha: f7([400, 350, 300]), msgs: papo });
confere("R$ 1.050 em 2 dias → Cara de Baleia, projeção = gasto7 × 1,33", r.previsao.cara === true && r.previsao.previsao_30d_brl === Math.round(1050 * 1.33 * 100) / 100 && r.selos[0].id === "cara_baleia" && /Cara de Baleia · proj\. R\$/.test(r.selos[0].txt), { prev: r.previsao, selo: r.selos[0] });
r = calc({ ficha: f7([300, 250], [{ conta: "arrudafree", gasto: 300, n: 1 }, { conta: "louisefree", gasto: 250, n: 1 }]), msgs: papo });
confere("R$ 550 em 7 dias comprando em 2 contas → Cara de Baleia (× 2,41)", r.previsao.cara === true && r.previsao.fator === 2.41, r.previsao);
r = calc({ ficha: f7([60, 50]), msgs: papo });
confere("R$ 110 em 7 dias: tem projeção, mas não é Cara de Baleia", r.previsao && r.previsao.cara === false && !r.selos.some((s) => s.id === "cara_baleia"), r.previsao);
r = calc({ ficha: f7([1500, 1000]), msgs: papo });
confere("quem já passou do corte é BALEIA, não 'cara de'", r.selos.some((s) => s.id === "baleia") && !r.selos.some((s) => s.id === "cara_baleia"), r.selos.map((s) => s.id));

console.log("== ordem das variantes (item 2) ==");
const vend = { msgs: papo.concat([[100, true, "tô aqui"], [80, true, "pensando"], [60, true, "em você"], [20, true, "o que você tem de novo pra mim?"]]) };
r = calc(vend);
const rid = r.jogada.roteiro, n3 = r.variantes.length;
confere("sem dados: ordem original", JSON.stringify(r.variantesIdx) === JSON.stringify([0, 1, 2].slice(0, n3)), r.variantesIdx);
R.variantes_auto.algoritmo = "guloso"; // regra antiga (teste determinístico); o Thompson tem testes próprios abaixo
r = calc(Object.assign({}, vend, { convVar: [{ roteiro_id: rid, modo: "dominante", variante: 1, usos: 5, vendas: 0 }, { roteiro_id: rid, modo: "dominante", variante: 3, usos: 6, vendas: 3 }, { roteiro_id: rid, modo: "dominante", variante: 2, usos: 4, vendas: 1 }] }));
confere("15 usos na semana: a variante 3 (50%) vira a 1ª", r.variantesIdx[0] === 2 && r.variantesInfo.melhor.i === 2 && r.variantes[0] === (rot(rid).dominante || rot(rid).variantes)[2], r.variantesIdx);
r = calc(Object.assign({}, vend, { convVar: [{ roteiro_id: rid, modo: "dominante", variante: 3, usos: 6, vendas: 3 }] }));
confere("menos de 10 usos: não reordena", r.variantesIdx[0] === 0, r.variantesIdx);
R.variantes_auto.algoritmo = "thompson";
console.log("== Thompson Sampling (v2.3.12) ==");
{
  const rnd = M.aleatorio(M.semente("teste"));
  const media = (a, b) => { let t = 0; for (let k = 0; k < 4000; k++) t += M.amostrarBeta(a, b, rnd); return t / 4000; };
  confere("Beta(1,1) tem média ~0,5", Math.abs(media(1, 1) - 0.5) < 0.03, media(1, 1));
  confere("Beta(4,4) tem média ~0,5 e Beta(2,8) ~0,2", Math.abs(media(4, 4) - 0.5) < 0.03 && Math.abs(media(2, 8) - 0.2) < 0.03, [media(4, 4), media(2, 8)]);
  confere("Beta com forma < 1 fica entre 0 e 1", (() => { for (let k = 0; k < 500; k++) { const v = M.amostrarBeta(0.5, 0.7, rnd); if (!(v >= 0 && v <= 1)) return false; } return true; })(), null);
  const dados = [{ roteiro_id: "R", modo: "normal", variante: 1, usos: 20, vendas: 1 }, { roteiro_id: "R", modo: "normal", variante: 2, usos: 20, vendas: 10 }, { roteiro_id: "R", modo: "normal", variante: 3, usos: 0, vendas: 0 }];
  const RR = Object.assign({}, R, { _modo: "normal" });
  let primeiro = [0, 0, 0];
  for (let k = 0; k < 600; k++) primeiro[M.ordenarVariantes(3, "R", dados, null, RR, "sala" + k + "|R").ordem[0]]++;
  confere("a variante que vende (50%) vem 1ª na grande maioria", primeiro[1] > 400, primeiro);
  confere("a que não vendeu (5%) quase nunca vem 1ª", primeiro[0] < 30, primeiro);
  confere("a sem dado ainda aparece na frente de vez em quando (explora)", primeiro[2] > 20, primeiro);
  confere("mesma semente = mesma ordem (não embaralha a cada redesenho)", JSON.stringify(M.ordenarVariantes(3, "R", dados, null, RR, "s|R|2026|11|10").ordem) === JSON.stringify(M.ordenarVariantes(3, "R", dados, null, RR, "s|R|2026|11|10").ordem), null);
  confere("com menos de 10 usos do roteiro não mexe na ordem", JSON.stringify(M.ordenarVariantes(3, "R", [{ roteiro_id: "R", modo: "normal", variante: 2, usos: 4, vendas: 4 }], null, RR, "x").ordem) === "[0,1,2]", null);
  const ord = M.ordenarVariantes(3, "R", dados, [{ roteiro_id: "R", variante: 2, em: "2026-11-09" }], RR, "s2|R");
  confere("variante já usada com o fã continua saindo do carrossel", !ord.ordem.includes(1) && ord.ocultas.length === 1, ord);
}
r = calc(Object.assign({}, vend, { historico: [{ roteiro_id: rid, variante: 1, em: new Date(AG - 86400000).toISOString() }] }));
confere("variante já usada com este fã sai do carrossel", r.variantes.length === n3 - 1 && !r.variantesIdx.includes(0) && JSON.stringify(r.variantesInfo.ocultas) === "[0]", r.variantesIdx);
r = calc(Object.assign({}, vend, { historico: [1, 2, 3].map((v) => ({ roteiro_id: rid, variante: v, em: new Date(AG - 86400000).toISOString() })) }));
confere("todas já usadas: volta a mostrar todas, com o aviso de repetido", r.variantes.length === n3 && !!r.repetido, { n: r.variantes.length, rep: r.repetido });
r = calc(Object.assign({}, vend, { historico: [{ roteiro_id: rid, variante: 1, em: new Date(AG).toISOString(), local: true }] }));
confere("a que acabei de marcar nesta janela não some debaixo do dedo", r.variantes.length === n3, r.variantesIdx);

console.log("== compliance enquanto digita · Aho-Corasick (v2.3.14) ==");
{
  const ac = (termos, texto) => M.buscarAC(M.construirAC(termos), texto).sort();
  confere("Aho-Corasick: termos que terminam juntos (sufixos) saem todos de uma passada só", JSON.stringify(ac(["a-b-c", "b-c", "c", "x-y"], "oi a-b-c ok")) === JSON.stringify(["a-b-c", "b-c", "c"]), ac(["a-b-c", "b-c", "c", "x-y"], "oi a-b-c ok"));
  confere("Aho-Corasick: termo que quebra no meio e recomeça ('aab' em 'aaab')", ac(["aab"], "aaab").length === 0 && ac(["aab"], "aaab aab").length === 1, ac(["aab"], "aaab aab"));
  confere("só vale palavra inteira: 'garanto' não acha dentro de 'garantorum'", ac(["garanto"], "garantorum").length === 0 && ac(["garanto"], "eu te garanto.").length === 1, null);
  const CD = R.compliance_digitando;
  confere("a lista vem do coach_regras.json (3 grupos, ativo)", CD && CD.ativo === true && CD.grupos.length === 3 && CD.grupos.every((g) => g.termos.length >= 8), CD && CD.grupos.map((g) => g.id));
  let h = M.varrerRisco("Amor, te garanto que vale a pena. É o PREÇO FINAL, ta?", CD);
  confere("acha garantia e preço final, sem acento e sem diferença de maiúscula", h.map((x) => x.id).sort().join() === "garantia_promessa,preco_final" && h.every((x) => x.nivel === "aviso"), h);
  h = M.varrerRisco("faço quase de graça pra você, é queima de estoque", CD);
  confere("termo dentro de outro achado não aparece duas vezes ('te garanto' cobre 'garanto')", M.varrerRisco("te garanto", CD)[0].termos.join() === "te garanto", M.varrerRisco("te garanto", CD));
  confere("acha desconto agressivo", h.length === 1 && h[0].id === "desconto_agressivo" && h[0].termos.length === 2, h);
  confere("texto normal não dispara nada", M.varrerRisco("oi amor, como foi seu dia? tenho um vídeo novo pra te mostrar", CD).length === 0 && M.varrerRisco("", CD).length === 0, null);
  confere("ativo:false desliga", M.varrerRisco("te garanto", Object.assign({}, CD, { ativo: false })).length === 0, null);
  r = calc(Object.assign({}, vend, { texto: "te garanto, é o preço final" }));
  const dig = r.alertas.filter((x) => x.digitando);
  confere("entra nos alertas do painel como AVISO (nunca bloqueio) e marcado como 'digitando'", dig.length === 2 && dig.every((x) => x.nivel === "aviso" && x.gatilho), r.alertas.map((x) => x.id + ":" + x.nivel));
  confere("sem texto digitado: nenhum alerta de digitação", calc(vend).alertas.filter((x) => x.digitando).length === 0, null);
  const CD2 = { ativo: true, grupos: [{ id: "x", nivel: "bloqueio_visual", motivo: "m", termos: ["teste"] }] };
  confere("mesmo que a lista peça bloqueio_visual, o painel rebaixa para aviso", M.alertas("isto é um teste", {}, Object.assign({}, R, { compliance_digitando: CD2 })).filter((x) => x.digitando).every((x) => x.nivel === "aviso"), null);
}
console.log("== Momento de ofertar (v2.3.15) ==");
const _padroesOrig = R.momento_ofertar.padroes; R.momento_ofertar.padroes = ["mencionou_preco", "rapido_positivo"]; // os testes antigos exercitam o gatilho por padrão (no JSON ele agora vem vazio)
{
  const MO = R.momento_ofertar, base = { padrao: "mencionou_preco", total: 0, ultCompraValor: 0, ultPpv: null, fu: null }, fz = { id: "hora_de_vender" };
  confere("o bloco existe, ativo, com padrões e marcas vindos do JSON", MO && MO.ativo === true && MO.padroes.includes("mencionou_preco") && MO.padroes.includes("rapido_positivo") && MO.marcas_oferta.length > 0, MO && MO.padroes);
  confere("mencionou preço: é o momento (sem exigir gasto)", !!M.momentoOfertar(base, R, fz), null);
  confere("rápido positivo SEM gasto mínimo: não é", M.momentoOfertar(Object.assign({}, base, { padrao: "rapido_positivo", total: 20 }), R, fz) === null, null);
  confere("rápido positivo com gasto de R$ 80: é", !!M.momentoOfertar(Object.assign({}, base, { padrao: "rapido_positivo", total: 80 }), R, fz), null);
  confere("rápido positivo que já comprou antes (última compra > 0): é", !!M.momentoOfertar(Object.assign({}, base, { padrao: "rapido_positivo", ultCompraValor: 40 }), R, fz), null);
  confere("padrão neutro / áudio / curto: não é", ["neutro", "mandou_audio", "lento_curto", null].every((p) => M.momentoOfertar(Object.assign({}, base, { padrao: p }), R, fz) === null), null);
  confere("fase vulnerável ou objeção barra", ["vulneravel", "objecao"].every((f) => M.momentoOfertar(base, R, { id: f }) === null), null);
  const pend = Object.assign({}, base, { ultPpv: { comprado: false, t: 1 }, fu: { n: 1 } });
  confere("PPV pendente: não oferta outro (cobra o que já enviou)", M.momentoOfertar(pend, R, fz) === null, null);
  confere("PPV pendente + ppv_pendente:'ofertar' no JSON: é", !!M.momentoOfertar(pend, Object.assign({}, R, { momento_ofertar: Object.assign({}, MO, { ppv_pendente: "ofertar" }) }), fz), null);
  confere("ativo:false desliga", M.momentoOfertar(base, Object.assign({}, R, { momento_ofertar: Object.assign({}, MO, { ativo: false }) }), fz) === null, null);
  const vd = ROT.roteiros.filter((x) => x.fase === "hora_de_vender"), marcados = vd.map((x) => M.variantesOferta(x, x.variantes, R).size);
  confere("roteiros de venda têm variantes de oferta marcadas pelas marcas do JSON", marcados.some((n) => n > 0), marcados);
  const outra = ROT.roteiros.find((x) => x.fase === "rapport");
  confere("roteiro de outra fase não recebe marca", M.variantesOferta(outra, outra.variantes, R).size === 0, null);
  const fake = { id: "XX", fase: "hora_de_vender" }, vs3 = ["a {qtd_conteudo}", "b", "c R$ 50"];
  confere("marcas por texto: acha {qtd_conteudo} e R$", [...M.variantesOferta(fake, vs3, R)].join() === "0,2", [...M.variantesOferta(fake, vs3, R)]);
  confere("variantes_oferta explícita vale no lugar das marcas (números a partir de 1)", [...M.variantesOferta(fake, vs3, Object.assign({}, R, { momento_ofertar: Object.assign({}, MO, { variantes_oferta: { XX: [2] } }) }))].join() === "1", null);
  // Thompson: o boost faz a variante de oferta (índice 2) vir na frente muito mais vezes
  const dados = [1, 2, 3].map((v) => ({ roteiro_id: "R", modo: "normal", variante: v, usos: 12, vendas: 3 })), RR = Object.assign({}, R, { _modo: "normal" });
  const frente = (of) => { let k = 0; for (let s = 0; s < 600; s++) if (M.ordenarVariantes(3, "R", dados, null, RR, "o" + s, of).ordem[0] === 2) k++; return k; };
  const sem = frente(null), com = frente({ marcadas: new Set([2]), peso: 3 });
  confere("boost no Thompson: a de oferta vem 1ª em ~1/3 sem boost e em quase sempre com boost", sem > 120 && sem < 280 && com > 500, [sem, com]);
  confere("sem dados para sortear: variantes de oferta só sobem, mantendo a ordem original", JSON.stringify(M.ordenarVariantes(4, "R", null, null, RR, "x", { marcadas: new Set([1, 3]), peso: 3 }).ordem) === "[1,3,0,2]", null);
  confere("sem momento de ofertar a ordem original é a de sempre", JSON.stringify(M.ordenarVariantes(4, "R", null, null, RR, "x", null).ordem) === "[0,1,2,3]", null);
  // v2.3.16: roteiros 100% de oferta e peso aprendido
  const rotPed = ROT.roteiros.find((x) => x.id === "VD_PEDIU_PRECO"), rotImg = ROT.roteiros.find((x) => x.id === "VD_IMAGINE"), rotFu = ROT.roteiros.find((x) => x.id === "FU_1");
  confere("roteiro listado em roteiros_oferta: todas as variantes são de oferta", M.variantesOferta(rotPed, rotPed.variantes, R).size === rotPed.variantes.length, null);
  confere("aquecimento (VD_IMAGINE), follow-up (FU_1) e cobrança não são de oferta", M.variantesOferta(rotImg, rotImg.variantes, R).size === 0 && M.variantesOferta(rotFu, rotFu.variantes, R).size === 0, null);
  confere("os ids de roteiros_oferta existem todos em coach_roteiros.json", MO.roteiros_oferta.every((id) => ROT.roteiros.some((x) => x.id === id)), MO.roteiros_oferta.filter((id) => !ROT.roteiros.some((x) => x.id === id)));
  confere("peso sem dados suficientes: usa o do JSON", M.pesoOferta(R, null).peso === MO.peso_thompson && M.pesoOferta(R, [{ grupo: "oferta_no_momento", usos: 5, vendas: 5 }, { grupo: "outra_no_momento", usos: 40, vendas: 2 }]).aprendido === false, null);
  const st = (au, av, bu, bv) => [{ grupo: "oferta_no_momento", usos: au, vendas: av }, { grupo: "outra_no_momento", usos: bu, vendas: bv }, { grupo: "sem_momento", usos: 99, vendas: 1 }];
  let pw = M.pesoOferta(R, st(20, 10, 20, 2));
  confere("oferta vendeu 50% x 10%: aprende um peso alto (razão ~3,6) e marca como aprendido", pw.aprendido && pw.peso > 3 && pw.peso < 4, pw);
  pw = M.pesoOferta(R, st(20, 2, 20, 10));
  confere("oferta vendeu MENOS que o resto: o peso cai para o mínimo (1), nunca abaixo", pw.aprendido && pw.peso === MO.aprender_peso.min_peso, pw);
  pw = M.pesoOferta(R, st(20, 20, 20, 0));
  confere("razão enorme é cortada no máximo", pw.peso === MO.aprender_peso.max_peso, pw);
  confere("aprender_peso.ativo:false volta ao peso do JSON", M.pesoOferta(Object.assign({}, R, { momento_ofertar: Object.assign({}, MO, { aprender_peso: Object.assign({}, MO.aprender_peso, { ativo: false }) }) }), st(20, 10, 20, 2)).peso === MO.peso_thompson, null);
  // integração: calcular() entrega o banner e coloca a variante de oferta na frente
  const venda = { msgs: papo.concat([[100, true, "tô aqui"], [80, true, "pensando"], [60, true, "em você"], [20, true, "o que você tem de novo pra mim?"]]) };
  r = calc(Object.assign({}, venda, { padrao: "mencionou_preco" }));
  confere("calcular(): com padrão de preço traz momentoOfertar com motivo", !!r.momentoOfertar && r.momentoOfertar.padrao === "mencionou_preco" && r.momentoOfertar.motivo.length > 5, r.momentoOfertar);
  confere("calcular(): sem padrão não traz", calc(venda).momentoOfertar === null, null);
  const rid2 = r.jogada.roteiro, R2 = Object.assign({}, R, { momento_ofertar: Object.assign({}, R.momento_ofertar, { roteiros_ids: [rid2], variantes_oferta: { [rid2]: [2] } }) });
  r = calc(Object.assign({}, venda, { padrao: "mencionou_preco", R: R2 }));
  confere("calcular(): a variante marcada como oferta (nº 2) fica em primeiro e vem na lista do banner", r.variantesIdx[0] === 1 && JSON.stringify(r.momentoOfertar.variantes) === "[1]", [r.variantesIdx, r.momentoOfertar]);
  r = calc(Object.assign({}, venda, { padrao: "neutro", R: R2 }));
  confere("calcular(): sem o momento a ordem volta ao normal", r.variantesIdx[0] === 0 && r.momentoOfertar === null, r.variantesIdx);
}
console.log("== Roteiro de oferta sugerido (v2.3.17) ==");
{
  const mo = { gatilho: "mencionou_preco", padrao: "mencionou_preco", motivo: "x" }, fzv = { id: "hora_de_vender" }, SG = R.momento_ofertar.sugestao;
  const imag = ROT.roteiros.find((x) => x.id === "VD_IMAGINE"), ped = ROT.roteiros.find((x) => x.id === "VD_PEDIU_PRECO");
  confere("o bloco 'sugestao' existe e os ids sugeridos são roteiros de oferta que existem", SG && SG.ativo === true && Object.values(SG.por_gatilho).every((id) => R.momento_ofertar.roteiros_oferta.includes(id) && ROT.roteiros.some((x) => x.id === id)), SG);
  let sg = M.sugestaoOferta(mo, imag, R, ROT, fzv);
  confere("roteiro atual é o aquecimento: sugere VD_PEDIU_PRECO para quem falou de preço", sg && sg.id === "VD_PEDIU_PRECO" && sg.atual === "VD_IMAGINE" && sg.situacao.length > 5, sg);
  confere("rapido_positivo sugere VD_FECHAR", M.sugestaoOferta({ gatilho: "rapido_positivo", padrao: "rapido_positivo" }, imag, R, ROT, fzv).id === "VD_FECHAR", null);
  confere("se o roteiro atual já é de oferta: não sugere", M.sugestaoOferta(mo, ped, R, ROT, fzv) === null, null);
  confere("fora das fases do JSON ou sem momento: não sugere", M.sugestaoOferta(mo, imag, R, ROT, { id: "rapport" }) === null && M.sugestaoOferta(null, imag, R, ROT, fzv) === null, null);
  confere("sugestao.ativo:false desliga", M.sugestaoOferta(mo, imag, Object.assign({}, R, { momento_ofertar: Object.assign({}, R.momento_ofertar, { sugestao: Object.assign({}, SG, { ativo: false }) }) }), ROT, fzv) === null, null);
  // integração: força o roteiro atual a NÃO ser de oferta (tira os de oferta da lista) e confere o botão e a troca
  const venda2 = { msgs: papo.concat([[100, true, "tô aqui"], [80, true, "pensando"], [60, true, "em você"], [20, true, "o que você tem de novo pra mim?"]]) };
  const base2 = calc(Object.assign({}, venda2, { padrao: "mencionou_preco" })), atual = base2.jogada.roteiro;
  const ofertas2 = R.momento_ofertar.roteiros_oferta.filter((id) => id !== atual);
  const alvo2 = atual === "VD_FECHAR" ? "VD_LEGENDA" : "VD_FECHAR"; // o roteiro atual sai da lista de oferta; o sugerido é outro
  const R3 = () => Object.assign({}, R, { momento_ofertar: Object.assign({}, R.momento_ofertar, { roteiros_oferta: ofertas2, sugestao: Object.assign({}, R.momento_ofertar.sugestao, { por_gatilho: { mencionou_preco: alvo2 } }) }) });
  r = calc(Object.assign({}, venda2, { padrao: "mencionou_preco", R: R3() }));
  confere("calcular(): roteiro atual fora da lista de oferta → traz a sugestão, ainda não aplicada", r.sugestaoOferta && r.sugestaoOferta.id === alvo2 && r.sugestaoOferta.aplicada === false && r.sugestaoOferta.atual === atual && r.jogada.roteiro === atual, r.sugestaoOferta);
  const idSug = r.sugestaoOferta.id;
  r = calc(Object.assign({}, venda2, { padrao: "mencionou_preco", roteiroOferta: idSug, R: R3() }));
  confere("calcular(): com o clique (roteiroOferta) mostra o roteiro de oferta e registra ele", r.sugestaoOferta.aplicada === true && r.jogada.roteiro === idSug && r.roteiro.id === idSug && r.jogada.txt.includes(idSug), [r.jogada.roteiro, r.roteiro && r.roteiro.id]);
  r = calc(Object.assign({}, venda2, { padrao: "neutro", roteiroOferta: idSug, R: R3() }));
  confere("calcular(): o momento passou: o pedido de ver o roteiro some sozinho", r.sugestaoOferta === null && r.jogada.roteiro === atual, r.jogada.roteiro);
  r = calc(Object.assign({}, venda2, { padrao: "mencionou_preco", roteiroOferta: "NAO_EXISTE", R: R3() }));
  confere("calcular(): id de roteiro que não é a sugestão é ignorado", r.sugestaoOferta.aplicada === false && r.jogada.roteiro === atual, null);
}
R.momento_ofertar.padroes = _padroesOrig;
console.log("== Momento de ofertar v2: gatilhos medidos nos dados (v2.3.18) ==");
{
  const MO = R.momento_ofertar, T = Date.parse("2026-11-10T22:00:00-03:00"), MIN = 60000;
  const c0 = (o) => Object.assign({ agora: T, padrao: null, total: 0, ultCompraValor: 0, ultPpv: null, fu: null, ppvs: [], ultCompraEm: null, ultFa: null, daConta: [] }, o), fzv = { id: "pos_compra" };
  confere("padrões vêm VAZIOS no JSON (não mostraram ganho) e os gatilhos medidos estão ligados", MO.padroes.length === 0 && MO.gatilhos.compra_recente_min === 30 && MO.gatilhos.sequencia.n === 3 && MO.gatilhos.resposta_lenta_min === 30, MO.gatilhos);
  let g = M.momentoOfertar(c0({ ultCompraEm: T - 12 * MIN }), R, fzv);
  confere("comprou há 12 min: gatilho compra_recente, com o tempo no texto", g && g.gatilho === "compra_recente" && g.motivo.includes("12 min"), g);
  confere("comprou há 31 min: não", M.momentoOfertar(c0({ ultCompraEm: T - 31 * MIN }), R, fzv) === null, null);
  const compras = (n) => Array.from({ length: n }, (_, i) => ({ comprado: true, t: T - (5 + i * 10) * MIN, compradoEm: T - (4 + i * 10) * MIN }));
  g = M.momentoOfertar(c0({ ultCompraEm: T - 4 * MIN, ppvs: compras(3) }), R, fzv);
  confere("3 compras na última hora: gatilho sequencia (vale mais que compra recente)", g && g.gatilho === "sequencia" && g.motivo.includes("3 PPVs"), g);
  confere("2 compras recentes: cai no gatilho compra_recente", M.momentoOfertar(c0({ ultCompraEm: T - 4 * MIN, ppvs: compras(2) }), R, fzv).gatilho === "compra_recente", null);
  confere("3 compras mas a última foi há mais de uma hora da janela: não conta como sequência", (() => { const h = M.momentoOfertar(c0({ ppvs: [90, 100, 110].map((m) => ({ comprado: true, t: T - m * MIN, compradoEm: T - m * MIN })) }), R, fzv); return h === null; })(), null);
  const lento = (min) => c0({ ultCompraEm: T - 5 * MIN, ultFa: { t: T - MIN }, daConta: [{ t: T - MIN - min * MIN }] });
  confere("ele levou 40 min para responder: o clima esfriou, sem banner", M.momentoOfertar(lento(40), R, fzv) === null, null);
  confere("ele levou 10 min para responder: banner", !!M.momentoOfertar(lento(10), R, fzv), null);
  confere("fase descanso, objeção ou vulnerável barra", ["descanso", "objecao", "vulneravel"].every((f) => M.momentoOfertar(c0({ ultCompraEm: T - 5 * MIN }), R, { id: f }) === null), null);
  confere("pos_compra em aftercare (fim de sessão) barra: quem manda é o aftercare", M.momentoOfertar(c0({ ultCompraEm: T - 5 * MIN }), R, { id: "pos_compra", aftercare: "aftercare_1" }) === null, null);
  confere("PPV pendente barra", M.momentoOfertar(c0({ ultCompraEm: T - 5 * MIN, ultPpv: { comprado: false, t: 1 }, fu: { n: 1 } }), R, fzv) === null, null);
  confere("padrão sozinho (rapido_positivo) NÃO dispara com padroes vazio", M.momentoOfertar(c0({ padrao: "rapido_positivo", total: 500 }), R, fzv) === null, null);
  const sem = (k, v) => Object.assign({}, R, { momento_ofertar: Object.assign({}, MO, { gatilhos: Object.assign({}, MO.gatilhos, { [k]: v }) }) });
  confere("compra_recente_min:0 desliga o gatilho; sequencia:null desliga o outro", M.momentoOfertar(c0({ ultCompraEm: T - 5 * MIN }), sem("compra_recente_min", 0), fzv) === null && M.momentoOfertar(c0({ ultCompraEm: T - 4 * MIN, ppvs: compras(3) }), sem("sequencia", null), fzv).gatilho === "compra_recente", null);
  confere("ativo:false desliga tudo", M.momentoOfertar(c0({ ultCompraEm: T - 5 * MIN }), Object.assign({}, R, { momento_ofertar: Object.assign({}, MO, { ativo: false }) }), fzv) === null, null);
  // integração: uma conversa em que ele acabou de comprar
  const venda = { msgs: papo.concat([[200, true, "gostei muito"], [30, true, "quero mais"]]), ppvs: [{ msg_id: "pp1", preco: 40, enviado_em: new Date(AG - 12 * 60000).toISOString(), comprado: true, comprado_em: new Date(AG - 10 * 60000).toISOString() }] };
  r = calc(venda);
  confere("calcular(): comprou há 10 min traz momentoOfertar com gatilho compra_recente", !!r.momentoOfertar && r.momentoOfertar.gatilho === "compra_recente" && r.momentoOfertar.motivo.length > 20, [r.fase.id, r.momentoOfertar]);
  r = calc(Object.assign({}, venda, { ppvs: [Object.assign({}, venda.ppvs[0], { enviado_em: new Date(AG - 5 * 3600000).toISOString(), comprado_em: new Date(AG - 5 * 3600000 + 60000).toISOString() })] }));
  confere("calcular(): comprou há 5 h: sem banner", r.momentoOfertar === null, r.momentoOfertar);
}
console.log("== mensagem em massa do dia (item 12) ==");
const contas = R.contas_atendidas, dia = 86400000, vistos = new Set();
for (let i = 0; i < ROT.massa_dia.mensagens.length; i++) vistos.add(M.massaDoDia(ROT, AG + i * dia, "arrudafree", contas).texto);
confere("muda todo dia e só repete depois de usar as " + ROT.massa_dia.mensagens.length, vistos.size === ROT.massa_dia.mensagens.length, vistos.size);
confere("cada conta recebe uma mensagem diferente no mesmo dia", new Set(contas.map((c) => M.massaDoDia(ROT, AG, c, contas).texto)).size === 3, null);
const RD = M.aplicarModo(R, "dominante");
confere("nenhuma mensagem em massa dispara alerta vermelho nem tem preço", ROT.massa_dia.mensagens.every((t) => !/R\$/.test(t) && !M.alertas(t, null, RD).some((a) => a.nivel === "bloqueio_visual")), ROT.massa_dia.mensagens.filter((t) => M.alertas(t, null, RD).some((a) => a.nivel === "bloqueio_visual")));

console.log("== calibragem pelas conversas da momoi ==");
const fala = (k) => Array.from({ length: k }, (_, i) => [20 + (k - 1 - i) * 45, true, ["hoje foi corrido", "cheguei agora", "queria relaxar", "conversar contigo ajuda", "tava com saudade", "dia longo"][i % 6]]); // a última há 20 s
r = calc({ msgs: [[900, false, "oi amor 😘"]].concat(fala(6)) });
confere("quem nunca comprou, 6 mensagens dele: ainda NÃO é hora do 1º PPV (precisa de 11)", r.fase.id !== "hora_de_vender", r.fase);
r = calc({ msgs: [[900, false, "oi amor 😘"]].concat(fala(12)) });
confere("quem nunca comprou, 12 mensagens dele e ativo: hora do 1º PPV (VD_ENTRADA_DOM)", r.fase.id === "hora_de_vender" && r.jogada.roteiro === "VD_ENTRADA_DOM", { fase: r.fase, jog: r.jogada });
r = calc({ msgs: [[900, false, "oi amor 😘"]].concat(fala(3)).concat([[15, true, "quanto custa o vídeo?"]]) });
confere("se ele pede, vende na hora mesmo com pouca conversa", r.fase.id === "hora_de_vender", r.fase);
r = calc({ ficha: fichaPag(120, [compra(60 * 48, 60)]), msgs: [[4000, false, "olha esse", { preco: 60, comprado: true }]].concat(fala(4)) });
confere("quem já comprou: 4 mensagens dele desde o último PPV já bastam (Dominante)", r.fase.id === "hora_de_vender", r.fase);
confere("piso da oferta de Pagante = R$ 103,90 e reforço do PPV de 0 a 150 s (BASE momoi)", tiers.find((t) => t.id === "pagante").piso_oferta === 103.9 && JSON.stringify(R.modos.dominante.limiares.reforco_ppv_s.v) === "[0,150]" && R.limiares.primeiro_ppv_min_msgs_fa.v === 11, null);
r = calc({ msgs: [[900, false, "oi amor 😘"], [880, true, "oi linda"], [400, true, "quero ver"], [8, false, "olha o que eu separei", { preco: 49.9 }]] });
confere("PPV enviado há 8 s sem resposta: já sugere o reforço (FU_REFORCO)", r.jogada.roteiro === "FU_REFORCO", r.jogada);

console.log("== achados no teste real (10/11/2026) ==");
const dataDia = (d) => new Date(AG - d * 86400000).toISOString().slice(0, 10);
r = calc({ conta: "louisefree", ficha: { fa: { id: 1 }, total: 441.61, n: 10, por_conta: [{ conta: "louisefree", gasto: 441.61, n: 10 }], notas: [], tags: [],
  ultimas: [{ data: dataDia(5), valor: 10, tipo: "Mimo - Assinatura", conta: "louisefree" }, { data: dataDia(10), valor: 97.77, tipo: "Chat", conta: "louisefree" }, { data: dataDia(10), valor: 59.84, tipo: "Chat", conta: "louisefree" }] },
  msgs: [[9000, true, "oi"], [8400, true, "oi"]] });
confere("mimo de R$ 10 não vira base do preço: âncora = última compra de conteúdo (R$ 97,77)", r.ctx.ultCompraValor === 97.77 && r.preco.min >= 97.77 && r.preco.max <= 195.54, { ult: r.ctx.ultCompraValor, preco: [r.preco.min, r.preco.max] });
confere("fã que já gastou não aparece como 'assinante novo' no relógio", r.relogio.novo === false && r.relogio.espera_s > 0, r.relogio);
r = calc({ ficha: { fa: { id: 1 }, total: 150, n: 1, por_conta: [], notas: [], tags: [], ultimas: [{ data: dataDia(3), valor: 150, tipo: "Videochamada", conta: "arrudafree" }] }, msgs: papo });
confere("videochamada também não ancora o preço do PPV", r.ctx.ultCompraValor == null, r.ctx);

console.log("== roteiros novos ==");
for (const id of ["PC_FREIO_CARINHO", "OB_ENCONTRO_VIP", "OB_ENCONTRO_VIP_CHAMADA", "VD_POST_FIXADO", "SS_SUMIU_MEIO"]) {
  const x = rot(id);
  confere(id + " existe com 3 variantes normais e 3 dominantes e texto da jogada", !!x && x.variantes.length === 3 && x.dominante.length === 3 && !!R.modos.dominante.jogadas[id], x && x.id);
}
console.log("== compra vista na tela (v2.3.5, visto no real em 11/11/2026) ==");
{
  const semBanco = { fa: { id: 1 }, total: 0, n: 0, ultimas: [], por_conta: [], notas: [], tags: [] };
  const r1 = calc({ ficha: semBanco, msgs: papo.concat([[300, false, "olha o que separei pra você", { comprado: true, preco: 33.22 }], [60, true, "seus seios são muito lindos"]]) });
  confere("PPV pago na tela tira o selo 'Nunca pagou' mesmo com o banco ainda sem a venda", !r1.selos.some((s) => s.id === "nunca") && r1.ctx.ultCompraValor === 33.22, { selos: r1.selos.map((s) => s.id), ult: r1.ctx.ultCompraValor });
  const r2 = calc({ ficha: semBanco, msgs: papo.concat([[300, false, "olha o que separei pra você", { comprado: false, preco: 33.22 }], [60, true, "depois eu vejo"]]) });
  confere("PPV NÃO pago na tela continua 'Nunca pagou'", r2.selos.some((s) => s.id === "nunca"), r2.selos.map((s) => s.id));
}
console.log("== ficha ligada só pelo nome (v2.3.6, trazido do Aura) ==");
{
  const rica = fichaPag(1500, [compra(3 * 24 * 60, 300), compra(5 * 24 * 60, 200)]);
  const normal = calc({ ficha: rica, msgs: papo });
  const soNome = calc({ ficha: rica, msgs: papo, soNome: true });
  confere("com ligação confirmada: usa o total da ficha (R$ 1.500)", normal.ctx.total === 1500, normal.ctx.total);
  const soNomeTela = M.calcular({ agora: AG, conta: "arrudafree", conv: { nome: "João Teste", perfil: "joao_teste", sala: "s1", total: 640 }, msgs: msgs(papo), ppvs: null, ficha: rica, compraTelaEm: null,
    config: R.config_por_conta.arrudafree, texto: "", modo: "dominante", historico: null, convVar: null, cenaFixa: false, ligacaoSoNome: true }, R, ROT, CN);
  confere("só pelo nome, mas a Privacy mostra R$ 640 gastos: não cai para o preço de entrada", soNomeTela.ctx.total === 640 && soNomeTela.preco.min > R.config_por_conta.arrudafree.entrada_brl[1], { total: soNomeTela.ctx.total, preco: soNomeTela.preco });
  confere("só pelo nome: ignora as compras da ficha (total da tela), sem selo VIP/Baleia e sem 'Nunca pagou'", soNome.ctx.total === 0 && soNome.ctx.ultCompraValor == null && !soNome.selos.some((s) => ["vip", "baleia", "nunca"].includes(s.id)), { total: soNome.ctx.total, ult: soNome.ctx.ultCompraValor, selos: soNome.selos.map((s) => s.id) });
}
console.log("\n" + (n - falhas) + " ok, " + falhas + " falha(s)");
process.exit(falhas ? 1 : 0);
