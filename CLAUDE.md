# Delta — resumo para o Claude Code (ler isto primeiro; não reler tudo)

Delta = extensão Chrome (MV3) que roda ao lado do chat da Privacy e SÓ SUGERE (fase, jogada, roteiro, preço, IA ⚡).
Versão atual: **2.3.10**. Responda em português, curto, com no máximo 3 passos por vez (o usuário não é técnico).

## Onde está cada coisa (tudo dentro de `delta-zip/delta/`)
- `coach-ext/` → a extensão: `painel.js` (~1.185 linhas: use Grep, não leia inteiro) + 3 módulos que carregam ANTES dele: `painel-turno.js` (📊 Fechar Turno), `painel-ia.js` (⚡ Adaptar), `painel-abas.js` (abas Delta/Ficha/Fila/Sumidos/Mais), `painel.css`, `painel.html`, `motor.js` (regras), `fundo.js` (janela/acoplar), `leitor.js` (lê a tela), `manifest.json` (versão).
- `coach-ext/data/` → ÚNICO lugar dos dados: `coach_regras.json` (números e chaves), `coach_roteiros.json`, `coach_cenas.json`, `coach_exemplos.json` (exemplos reais da momoi para a IA).
- `coach_sql.sql` → SQL do banco (fonte). `supabase/functions/coach-ia/index.ts` → função da IA.
- Scripts Windows: `abrir_3_perfis.bat/.ps1` (abre as 3 contas no Modo Palco), `arrumar_cockpit.bat/.ps1` (arruma as janelas abertas), `trocar_modelo.ps1` (ajudante Alt+1/2/3). Mac: `.command/.sh` (antigos).
- Documentação: `COACH_SPEC.md` (seções 20c–20m = mudanças recentes), `LEIA-ME.txt` (para o usuário), `GUIA_PARA_OUTRO_CODE.md` (histórico longo: só se precisar).
- `aura-zip/` → cópia de CONSULTA do Aura (outra extensão). Não editar.

## Ambiente
- Supabase "Central de Chat", projeto `ndtnwukltujxzkfvqxtk`. Migrações do Delta aplicadas: `delta_coach_v2_0_1`, `delta_coach_v2_2`, `delta_coach_v2_2_radar_fix`, `delta_coach_v2_3_3_conversa`, `delta_coach_v2_3_9_nomes_conta`, `delta_coach_v2_3_10_recall_fatos`.
- Função `coach-ia` publicada: versão 9 (Grok `grok-4.20-0309-non-reasoning`, reserva `grok-4.7`; secret `AI_API_KEY` no Supabase).
- Contas: `arrudafree` (Chrome Profile 30), `xlunavitaligratis` (Profile 31; no banco a conta se chama **"Luna"**), `louisefree` (Profile 34).
- Modo Palco: Privacy 1030×860 à esquerda + Delta 410×860 à direita, as 3 contas empilhadas; troca pelo nome no topo do Delta ou Alt+1/2/3.
- O Delta grava no banco: jogadas (`emp_jogadas`), PPVs vistos (`painel_ppvs`), conversas (`painel_msgs` → `emp_mensagens`), radar. Usa as funções `painel_*` do Aura (sem alterá-las). A extensão Aura não é mais necessária.

## Regras que não podem ser quebradas
- Delta é passivo: só lê a tela. Nunca clica, digita, envia, rola ou faz pedido à Privacy. `leitor.js` não ganha ação.
- `chrome.windows.update` só na janela do próprio Delta; nenhuma escrita em abas.
- Regras e números nos JSON de `coach-ext/data/`, não chumbados. Não recriar cópias dos JSON fora de `data/`.
- Funções `public.coach_*`: security definer, `search_path = ''`, checam `central.coach_pode()`, sem anon.
- Não mexer no Aura: pasta, tabelas e funções `painel_*` (pode CHAMAR, não alterar nem apagar).
- SQL novo ou publicar a função da IA: só com "sim" explícito do usuário; antes, conferir o banco só em leitura e mostrar o SQL.
- Arquivos `.ps1`: só ASCII (o PowerShell lê em ANSI). Teste e2e que abre janelas: PROIBIDO (o usuário removeu).
- O projeto tem git (branch `principal`) e fica no GitHub **privado** em `ofmghost4-afk/delta`. Dê `git pull` antes de editar e `git push` ao terminar: o mesmo repositório é usado no PC Windows (onde o Delta roda) e no Mac (só edição).

## Como testar e mostrar
- `node delta-zip/delta/teste/estatico.mjs delta-zip/delta/coach-ext` → "tudo ok".
- `node delta-zip/delta/teste/unit_v22.mjs delta-zip/delta/coach-ext` → 61 ok (some 1 por teste novo que você criar).
- Prévia sem abrir Chrome: servidor `delta-previa` (`.claude/launch.json`) → `http://127.0.0.1:4391/` (painel com dados de mentira; Palco em `/teste/previa/palco.html`).
- Conferir no real de preferência pelo banco e pelos registros do Supabase (barato); captura de tela só se precisar.
- Depois de mudar a extensão: subir `version` no `manifest.json`, registrar na `COACH_SPEC.md`, e pedir ao usuário para recarregar o Delta nos 3 perfis (`chrome://extensions`) + F5 na Privacy.

## Pendências conhecidas
- (Resolvido na 2.3.9) Luna ("xlunavitaligratis" no Delta, "Luna" em `emp_ppvs`): `central.coach_nomes_conta()` junta os dois nomes em `coach_ppvs`, `coach_placar` e nas conversões.
- `emp_jogadas` tem jogadas de teste da arrudafree de 10/11/2026 (não apagar sem o usuário pedir).
- No Mac o Delta não é executado, só editado; não há extensão carregada no Chrome de lá. Os launchers do Mac (`abrir_3_perfis.command/.sh`) continuam na lógica da 2.0.1: perfis genéricos ("Profile 1/2/3") e tela em 3 terços, sem o Modo Palco. Não foram atualizados e não dá para testá-los pelo Windows.
- Uso das conversas da momoi como base foi autorizado pelo usuário em 12/11/2026 (exemplos curados e sem nomes).
