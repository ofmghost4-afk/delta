// Extrai o prompt de sistema (const SISTEMA = `...`) da função coach-ia e monta teste/ia/prompt.json (system + user).
// Assim o teste usa SEMPRE o texto que está publicado, sem copiar à mão. Uso: node teste/ia/gerar_sistema.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const aqui = path.dirname(fileURLToPath(import.meta.url));
const fonte = fs.readFileSync(path.join(aqui, "../../supabase/functions/coach-ia/index.ts"), "utf8");
const m = fonte.match(/const SISTEMA = `([\s\S]*?)`;\n/);
if (!m) { console.error("Não achei 'const SISTEMA' em coach-ia/index.ts"); process.exit(1); }
const sistema = m[1].replace(/\\`/g, "`");
fs.writeFileSync(path.join(aqui, "prompt.json"), JSON.stringify([{ role: "system", content: sistema }, { role: "user", content: "{{pedido}}" }], null, 2));
console.log("prompt.json gerado (" + sistema.length + " caracteres de sistema)");
