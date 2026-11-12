// Prévia local do painel do Delta, SEM abrir Chrome por cima de nada.
// Serve os arquivos da extensão como estão e, na rota /painel, entrega o painel.html de verdade com um "chrome" de
// mentira (teste/previa/shim.js) no lugar das APIs da extensão. Nada sai para a internet: banco e IA são simulados.
// Uso: node teste/previa/servidor.mjs   → http://127.0.0.1:4391/
//   /painel?c=vip&mini=1          doca (abra numa janela de 466x157)
//   /painel?c=novo                painel inteiro
//   cenários (c): vip · novo · ppv · vazio        conta: arrudafree · xlunavitaligratis · louisefree
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORTA = Number(process.env.PORT) || 4391;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
const INDICE = `<!doctype html><meta charset="utf-8"><title>Delta · prévia</title>
<body style="font:14px system-ui;background:#0e0a0d;color:#f5eef2;padding:24px">
<h1 style="font-size:18px">Delta · prévia local (dados de mentira)</h1>
<p>Doca (466×157): <a style="color:#f0c86e" href="/painel?c=vip&mini=1">VIP esperando</a> · <a style="color:#f0c86e" href="/painel?c=novo&mini=1">1º PPV com campos</a> · <a style="color:#f0c86e" href="/painel?c=ppv&mini=1">PPV pendente</a> · <a style="color:#f0c86e" href="/painel?c=vazio&mini=1">sem conversa</a></p>
<p><b>Modo Palco (v2.3)</b>, tela 1440×860 com as 3 modelos: <a style="color:#f0c86e" href="/teste/previa/palco.html">abrir</a></p>
<p>Painel inteiro: <a style="color:#f0c86e" href="/painel?c=vip">VIP</a> · <a style="color:#f0c86e" href="/painel?c=novo">novo</a> · <a style="color:#f0c86e" href="/painel?c=ppv">PPV pendente</a> · <a style="color:#f0c86e" href="/painel?c=vazio">sem conversa</a></p></body>`;

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const manda = (cod, corpo, tipo) => { res.writeHead(cod, { "content-type": tipo || "text/plain; charset=utf-8", "cache-control": "no-store" }); res.end(corpo); };
  if (u.pathname === "/") return manda(200, INDICE, TIPOS[".html"]);
  if (u.pathname === "/painel") {
    let h = fs.readFileSync(path.join(RAIZ, "coach-ext", "painel.html"), "utf8");
    h = h.replace("<head>", '<head><base href="/coach-ext/">').replace('<script src="config.js"></script>', '<script src="/teste/previa/shim.js"></script><script src="config.js"></script>');
    return manda(200, h, TIPOS[".html"]);
  }
  const arq = path.normalize(path.join(RAIZ, decodeURIComponent(u.pathname)));
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || !fs.statSync(arq).isFile()) return manda(404, "não achei " + u.pathname);
  manda(200, fs.readFileSync(arq), TIPOS[path.extname(arq).toLowerCase()] || "application/octet-stream");
}).listen(PORTA, "127.0.0.1", () => console.log("Prévia do Delta em http://127.0.0.1:" + PORTA + "/"));
