// Regras que não podem ser quebradas, conferidas no texto do código (sem abrir navegador).
// Uso: node teste/estatico.mjs <pasta coach-ext>
import fs from "node:fs";
import path from "node:path";

const EXT = path.resolve(process.argv[2] || "coach-ext");
const ler = (f) => fs.readFileSync(path.join(EXT, f), "utf8");
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
let falhas = 0;
function confere(nome, cond, detalhe) { if (!cond) falhas++; console.log((cond ? "  ok   " : "  FALHA ") + nome + (cond ? "" : "  → " + JSON.stringify(detalhe))); }
const achar = (txt, re) => { const r = []; let m; while ((m = re.exec(txt))) r.push(m[0]); return r; };

const leitor = semComentario(ler("leitor.js"));
const fundo = semComentario(ler("fundo.js"));
// painel.js e seus modulos (painel-*.js): TODOS entram nas conferencias abaixo.
const ARQS_PAINEL = fs.readdirSync(EXT).filter((f) => /^painel.*\.js$/.test(f)).sort();
const PAINEL = Object.fromEntries(ARQS_PAINEL.map((f) => [f, semComentario(ler(f))]));
const painel = Object.values(PAINEL).join("\n");
const motor = semComentario(ler("motor.js"));
const manifest = JSON.parse(ler("manifest.json"));

// 1) leitor.js: desde a v2.5.0 ele tem DUAS ações de acessibilidade (abrir a conversa que você escolheu e pôr o
//    texto no campo), cada uma disparada por um clique seu no Delta. A trava deixou de ser "nenhuma ação" e passou
//    a ser precisa: o que não pode, em hipótese alguma, é ENVIAR ou imitar gente para enganar a detecção.
confere("leitor.js: nenhum pedido de rede", achar(leitor, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b/g).length === 0, null);
confere("leitor.js: não altera o conteúdo da página (só o campo de digitar)",
  achar(leitor, /\.(innerHTML|outerHTML|textContent|innerText|checked|href|src)\s*=(?!=)|\b(append\w*|prepend|insert\w+|replaceChildren|replaceWith|setAttribute|removeAttribute)\s*\(|\blocation\s*(\.\w+\s*)?=(?!=)/g).length === 0, null);
// NUNCA enviar: nada de tecla, de botão de enviar, de submit, de atalho do chat.
const enviar = achar(leitor, /KeyboardEvent|key(down|press|up)|["'`]Enter["'`]|keyCode|\.submit\s*\(|vac-send|send-?(icon|button)|btnEnviar/gi);
confere("leitor.js: NÃO envia (sem tecla, sem botão de enviar, sem submit)", enviar.length === 0, enviar);
// Nada de imitar gente: atraso aleatório e coordenada sorteada existem para enganar detecção, não para acessibilidade.
confere("leitor.js: sem sorteio/atraso para parecer humano", !/Math\.random|jitter|humaniz/i.test(leitor), null);
confere("leitor.js: no máximo UM clique, no item que você escolheu", achar(leitor, /\.click\s*\(/g).length <= 1, achar(leitor, /\.click\s*\(/g));
confere("leitor.js: sem lote (nenhum temporizador mexendo na página)", !/set(Timeout|Interval)\([^)]*(click|preencher|abrirConversa)/.test(leitor), null);
const ouvintes = achar(leitor, /addEventListener\(\s*"[^"]+"/g);
confere("leitor.js só escuta input e visibilitychange", ouvintes.every((x) => /"(input|visibilitychange)"/.test(x)), ouvintes);
// 1b) o painel só pede ação depois de um clique seu: nada de laço ou temporizador chamando pedirAcao.
confere("painel: ação só por clique seu (sem temporizador chamando pedirAcao)",
  !/set(Timeout|Interval)\([^)]*pedirAcao|for\s*\([^)]*\)\s*[^;]*pedirAcao|\.forEach\([^)]*pedirAcao/.test(painel), null);
// o leitor só aceita as DUAS ações: o mapa ACOES é a lista fechada do que pode acontecer na página.
{
  const mapa = (leitor.match(/const ACOES\s*=\s*\{([^}]*)\}/) || [])[1] || "";
  const chaves = (mapa.match(/coach_[a-z_]+/g) || []).sort();
  confere("leitor.js: só existem 2 ações (abrir conversa e preencher campo)",
    JSON.stringify(chaves) === JSON.stringify(["coach_abrir_conversa", "coach_preencher"]), chaves);
}

// 2) Nenhuma escrita em abas, em nenhum arquivo da extensão.
const tudo = { "leitor.js": leitor, "fundo.js": fundo, ...PAINEL, "motor.js": motor };
for (const [f, t] of Object.entries(tudo)) {
  const abas = achar(t, /chrome\.(tabs\.(update|create|remove|reload|move|duplicate|discard|goBack|goForward|group|ungroup|highlight|setZoom\w*|executeScript|insertCSS)|scripting\.\w+|debugger\.\w+)/g);
  confere(f + ": nenhuma escrita em abas / scripting / debugger", abas.length === 0, abas);
}
// 2b) Todo modulo painel*.js tem que estar declarado no painel.html (senao fica codigo morto).
const html = ler("painel.html");
for (const f of ARQS_PAINEL) confere(f + ": declarado no painel.html", html.includes(`src="${f}"`), f);

// 2c) v2.4.2: a IA no automatico so pode ligar pela chave do JSON (nunca chumbada) e tem que ter os freios.
{
  const auto = JSON.parse(ler(path.join("data", "coach_regras.json"))).ia.automatico || {};
  confere("IA automatica: so liga pela chave R.ia.automatico", /R\.ia && R\.ia\.automatico/.test(PAINEL["painel-ia.js"] || ""), null);
  confere("IA automatica: freios no JSON (so_na_sua_vez, folga_ms, max_por_hora)", ["so_na_sua_vez", "folga_ms", "max_por_hora"].every((k) => k in auto), Object.keys(auto));
  confere("IA automatica: pedido fora do desenho (setTimeout) e uma vez por roteiro", /setTimeout\(\(\) => adaptar\(/.test(PAINEL["painel-ia.js"] || "") && /autoFeito\.has\(chave\)/.test(PAINEL["painel-ia.js"] || ""), null);
}
// 3) chrome.windows.update só na janela do Delta; windows.create só do painel.html; nada de remove.
const upd = achar(fundo + "\n" + painel, /chrome\.windows\.update\(\s*[^,)]+/g);
confere("chrome.windows.update só com a janela do Delta (coachJanela / eu.id)", upd.length > 0 && upd.every((x) => /\(\s*(coachJanela|eu\.id)$/.test(x)), upd);
confere("chrome.windows.create só abre painel.html", achar(fundo + painel, /chrome\.windows\.create\(/g).length === achar(fundo, /chrome\.windows\.create\(Object\.assign\(\{\}, opc|chrome\.windows\.create\(opc\)/g).length && /url:\s*"painel\.html"/.test(fundo), null);
confere("nenhum chrome.windows.remove", !/chrome\.windows\.remove/.test(fundo + painel), null);
// 4) Pedidos de rede do painel só para o Supabase e para os arquivos da própria extensão.
const fetches = achar(painel + motor + fundo, /fetch\(\s*[^,)]+/g);
confere("fetch só para CFG.url (Supabase) e chrome.runtime.getURL", fetches.every((x) => /fetch\(\s*(CFG\.url|chrome\.runtime\.getURL)/.test(x)), fetches);
confere("manifest: sem permissão de host para a Privacy, sem tabs/scripting/debugger", (manifest.host_permissions || []).every((h) => /supabase\.co/.test(h)) && !(manifest.permissions || []).some((p) => ["tabs", "scripting", "debugger", "webRequest", "activeTab"].includes(p)), { host: manifest.host_permissions, perm: manifest.permissions });
confere("manifest: leitor.js só em privacy.com.br/chat", JSON.stringify(manifest.content_scripts.map((c) => c.matches)) === '[["https://privacy.com.br/chat*"]]', manifest.content_scripts);
// 5) Dados só em coach-ext/data/ e JSON válido.
for (const f of ["coach_regras.json", "coach_roteiros.json", "coach_cenas.json"]) {
  let ok = true; try { JSON.parse(ler(path.join("data", f))); } catch (_) { ok = false; }
  confere("data/" + f + " existe e é JSON válido", ok, null);
  confere("sem cópia de " + f + " na raiz do projeto", !fs.existsSync(path.join(EXT, "..", f)), "existe " + path.join(EXT, "..", f));
}
// 6) v2.3 · ajudante do Modo Palco e scripts do Windows: só mexem em JANELA (frente/foco/posição), nunca em
//    teclado, mouse ou mensagens para a Privacy. Ficam fora de coach-ext/ (não fazem parte da extensão).
for (const f of ["trocar_modelo.ps1", "arrumar_cockpit.ps1"]) {
  const p = path.join(EXT, "..", f);
  if (!fs.existsSync(p)) { confere(f + " existe", false, p); continue; }
  const t = fs.readFileSync(p, "utf8").replace(/^\s*#.*$/gm, "").replace(/^\s*\/\/.*$/gm, "");
  const proibido = achar(t, /\b(SendInput|keybd_event|mouse_event|SendKeys|SendMessage\w*|PostMessage\w*|SendWait|Invoke-WebRequest|Invoke-RestMethod|WebClient|HttpClient|Start-Process)\b/g);
  confere(f + ": sem tecla, clique, mensagem para janela, rede ou abrir programa", proibido.length === 0, proibido);
  confere(f + ": só ASCII (o PowerShell lê em ANSI)", !/[^\x00-\x7F]/.test(fs.readFileSync(p, "utf8")), null);
}
const ajud = fs.existsSync(path.join(EXT, "..", "trocar_modelo.ps1")) ? fs.readFileSync(path.join(EXT, "..", "trocar_modelo.ps1"), "utf8") : "";
confere("trocar_modelo.ps1: não move nem redimensiona janela (SWP_NOMOVE|SWP_NOSIZE, sem MoveWindow)", !/MoveWindow/.test(ajud) && /SetWindowPos\(h, (TOPMOST|NOTOPMOST), 0, 0, 0, 0, 0x0001 \| 0x0002 \| 0x0010\)/.test(ajud), null);
// o painel pede a troca SÓ pelo título da própria janelinha (nada de rede nova)
confere("painel.js: troca de modelo só pelo document.title", /document\.title = t/.test(painel) && !/localhost|127\.0\.0\.1/.test(painel), null);
console.log("\n" + (falhas ? falhas + " falha(s)" : "tudo ok"));
process.exit(falhas ? 1 : 0);
