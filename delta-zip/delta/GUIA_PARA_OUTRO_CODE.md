# Delta — guia de passagem para outra sessão do Claude Code

**Desde 12/11/2026 o resumo para sessões novas é o `CLAUDE.md` na pasta `Downloads\Delta 2.0.2` (carregado sozinho).** Este guia virou o histórico detalhado: leia só a parte que precisar.

## Onde está tudo (Windows, usuário "Gerencia Seduct")

- Projeto: `C:\Users\Gerencia Seduct\Downloads\Delta 2.0.2\delta-zip\delta`
  - `coach-ext/` → a extensão (painel.js, painel.css, painel.html, motor.js, fundo.js, leitor.js, manifest.json 2.2.1)
  - `coach-ext/data/` → ÚNICO lugar dos dados (coach_regras.json, coach_roteiros.json, coach_cenas.json)
  - `coach_sql.sql` → SQL do banco (v2.2, já aplicado)
  - `teste/estatico.mjs` e `teste/unit_v22.mjs` → testes (Node puro, sem dependências, não abrem janela); `teste/previa/` → prévia local do painel
  - `abrir_3_perfis.bat` / `.ps1` → abre os 3 perfis do Chrome lado a lado no Windows
  - `LEIA-ME.txt`, `COACH_SPEC.md` (seções 20c e 20d descrevem o estado atual)
- Aura (NÃO alterar): `C:\Users\Gerencia Seduct\Downloads\Delta 2.0.2\aura-zip\painel-fa 2`
- A pasta não é repositório git: não há como desfazer. Olhe o conteúdo antes de apagar ou sobrescrever.
- Supabase "Central de Chat", projeto `ndtnwukltujxzkfvqxtk`, migrações `delta_coach_v2_0_1`, `delta_coach_v2_2` e `delta_coach_v2_2_radar_fix` (todas aplicadas).

## ATUALIZAÇÃO 10/11/2026: v2.1 (Cockpit 3x2) implementada

O problema de espaço descrito abaixo foi resolvido com a opção escolhida pelo usuário: a Privacy como 3 Web Apps (janelas `type: "app"`, 480×665) em cima e o Delta em modo mini como doca de 480×195 embaixo de cada uma. Detalhes na seção 20e do `COACH_SPEC.md`; desenho interativo em `teste/preview_cockpit.html`.

- Extensão em `coach-ext/` é a 2.1.0. Para valer no Chrome do usuário: recarregar em `chrome://extensions` nos 3 perfis e dar F5 na Privacy.
- Na época o teste e2e passava com 441 verificações (ele foi apagado em 11/11).
- NÃO testado de verdade: o `abrir_3_perfis.ps1` novo (só a sintaxe; ele abre os perfis reais do usuário), a doca nas contas reais, o som, e os seletores `.vac-sale-notice` / `.vac-text-paid` / `.vac-text-not-paid` / `.vac-icon-check` na Privacy real.
- As pendências antigas continuam (4 linhas de teste em `central.emp_jogadas`; Mac ainda na 2.0.1). A pendência "fechar e reabrir esquece o que foi gravado" foi resolvida (fica salvo no dia).

## ATUALIZAÇÃO 10/11/2026 (noite): v2.2 implementada

Detalhes na seção 20f do `COACH_SPEC.md`. Extensão em `coach-ext/` é a 2.2.0.

- Banco: migração `delta_coach_v2_2` JÁ APLICADA (com confirmação do usuário). Edge Function `coach-ia` JÁ PUBLICADA; falta o usuário pôr o secret `AI_API_KEY` no Supabase (ele criou uma chave da Grok).
- Testes: `node teste/estatico.mjs coach-ext` (tudo ok), `node teste/unit_v22.mjs coach-ext` (47 ok). O e2e passava com 501 na época (apagado em 11/11).
- NÃO testado nas contas reais: nada da v2.1 nem da v2.2. As funções SQL novas só foram conferidas por permissão e por uma consulta equivalente de leitura; nunca foram chamadas com login de verdade. A função de IA nunca rodou com chave.
- Os Web Apps "Privacy" desta máquina abrem pelo Chrome do AdsPower (`adspower_global\cwd_global\chrome_151`), não pelo Google Chrome: a extensão tem de ser recarregada lá.
- `config_por_conta.<conta>.palavra_fixado` está vazio: o gatilho do post fixado só liga quando o usuário disser as palavras.

## ATUALIZAÇÃO 11/11/2026 (madrugada): teste nas contas reais

- Cockpit 3x2 funcionando nas 3 contas reais (Web Apps do AdsPower, 500 px de largura mínima). `arrumar_cockpit.bat` arruma as janelas já abertas.
- Corrigido depois de ver a tela real: `coach_radar` (coluna ambígua, migração `delta_coach_v2_2_radar_fix`), mimo/videochamada não ancoram preço, filtro de aviso de venda do `leitor.js` descartava todas as mensagens, radar sempre em "1d".
- O usuário pediu: dados do lead ACIMA da sugestão (bloco `.lead` no cabeçalho, também na doca) e o ⚡ da IA na doca (as versões da IA entram no lugar das variantes). Feito, AINDA NÃO VISTO no real.
- A função `coach-ia` (versão 4, chave da Grok no secret) NUNCA foi chamada: os registros do Supabase não têm nenhuma chamada.
- O usuário NÃO quer que o `teste/e2e_real.mjs` rode (abre janelas por cima do atendimento). Ele está DESATUALIZADO para o ⚡ e para o bloco do lead. Use só `teste/estatico.mjs` e `teste/unit_v22.mjs`.

## ATUALIZAÇÃO 11/11/2026 (tarde): v2.2.1 fechada

Detalhes na seção 20g do `COACH_SPEC.md`. Extensão em `coach-ext/` é a 2.2.1 (sem SQL novo).

- Entrou: dados do lead acima da sugestão, `#faTopo` na doca, ⚡ na doca (tecla A), próximo da fila, lembrete ⏰ (tecla L), nota rápida ＋ (tecla N), diagnóstico de leitura, prévia local.
- Corrigido ao fechar: a lista "Abra na Privacy, nesta ordem" saía como "[object HTMLDivElement]" (`el()` agora usa `flat(Infinity)`); a nota do roteiro `VD_ENTRADA_DOM` citava preço antigo.
- **`teste/e2e_real.mjs` foi APAGADO a pedido do usuário.** Não recriar. Testes que existem: `node teste/estatico.mjs coach-ext` (tudo ok) e `node teste/unit_v22.mjs coach-ext` (56 ok).
- Visual: `node teste/previa/servidor.mjs` → `http://127.0.0.1:4391/` (painel de verdade com dados de mentira; não abre Chrome). Conferido assim: doca nos 4 cenários, painel inteiro em 480 px, lembrete, nota rápida e ⚡ com IA simulada.
- NÃO visto no real: nada da 2.2.1. A função `coach-ia` continua sem nenhuma chamada de verdade.
- Para valer no Chrome do usuário: recarregar a extensão nos 3 perfis (os Web Apps "Privacy" abrem pelo Chrome do AdsPower) e dar F5 na Privacy, porque o `leitor.js` mudou.
- `coach_regras.json > gravar_ppvs: true`: o Delta chama `painel_ppvs` (função do Aura, sem alteração) com os PPVs vistos na tela. Se o usuário não quiser, basta pôr `false`.

## ATUALIZAÇÃO 11/11/2026 (17h30): 2.2.1 vista no real e IA funcionando

- Visto na tela do usuário, nas 3 contas reais: Cockpit 3x2, bloco do lead acima da sugestão, "Próximo" no rodapé, botões ＋ e ⏰.
- ⚡: a `coach-ia` versão 4 dava 504 (Grok não respondia em 20 s). Publicada a **versão 5** (com o sim do usuário) com `reasoning_effort: "low"`. Primeira chamada real: xAI 200 em 12,1 s, função 200 em 14,2 s, versão adaptada apareceu na doca da Luna. Funciona, mas é lenta para atendimento.
- Acelerado em seguida: `coach-ia` **versão 6** (com o sim do usuário) usa `grok-4.20-0309-non-reasoning`, reserva `grok-4.7`. Medido no real: 1,6 s na xAI, 3,2 s no total. `coach_regras.json > ia.timeout_ms` está em 25000.
- Visto no real depois: lista "Abra na Privacy, nesta ordem" nas 3 contas (sem conversa aberta). Ainda não visto: lembrete vencendo, nota rápida gravando.

## ATUALIZAÇÃO 11/11/2026 (noite): v2.3 Modo Palco implementado

Detalhes na seção 20h do `COACH_SPEC.md`. Extensão em `coach-ext/` é a 2.3.0 (sem SQL novo).

- Palco: Privacy 1030×860 à esquerda, Delta 410×860 à direita, as 3 contas empilhadas. `arrumar_cockpit.ps1` / `abrir_3_perfis.ps1` com `-Modo palco` (padrão) ou `-Modo 3x2`.
- Troca de modelo: abas no `#radarGlobal`; o pedido sai no título da janelinha (`Delta · Arruda » Luna #n`); o ajudante `trocar_modelo.ps1` (abre no fim dos dois scripts) casa Delta ↔ Privacy pelo perfil (AppUserModelID) e traz o par para a frente; Alt+1/2/3 globais.
- Conferido: `estatico.mjs` tudo ok (com checagens novas dos scripts), `unit_v22.mjs` 56 ok, sintaxe dos 3 `.ps1`, leitura dos títulos pelo ajudante com exemplos, `trocar_modelo.ps1 -Listar` nas janelas reais (achou as 4 Privacy; os Deltas ainda eram da versão antiga, só "Delta"), e a prévia `teste/previa/palco.html` trocando Arruda → Luna → Louise pelo clique.
- Visto no real (11/11, 18h40): Palco nas 3 contas e Alt+1/2/3 trocando Arruda / Luna / Louise (o usuário confirmou). Perfis: Arruda = `Profile 30`, Luna = `Profile 31`, Louise = `Profile 34`.
- Corrigido depois disso e AINDA NÃO rodado no real: `arrumar_cockpit.ps1` ignora janela comum do Chrome com a Privacy numa aba (título "… - Google Chrome") e o ajudante prefere a Web App e fecha o ajudante antigo ao abrir.
- `abrir_3_perfis.ps1` ajustado (com o sim do usuário) para `Profile 30/31/34` = Arruda, Luna, Louise e rodado pelo usuário: abriu as 3 Privacy, mas nenhum Delta (só abria pelo ícone).
- **2.3.1**: o Delta abre sozinho quando a Privacy carrega (`fundo.js`, uma vez por aba; `palco.abrir_sozinho`). Visto no real às 19h41: os 3 abriram sozinhos no Palco.

## ATUALIZAÇÃO 12/11/2026: v2.3.2 · IA que lê a conversa

Detalhes na seção 20i do `COACH_SPEC.md`.

- Reclamação do usuário: o ⚡ estava genérico e não lia as conversas. Causa medida: pedidos de 0,6–1,3 KB (quase sem mensagens) e um pedido que mandava reescrever o roteiro.
- Feito: painel manda até 60 mensagens com hora/PPV + jeito dele + dados + motivo da fase e mostra "A IA leu: …"; função `coach-ia` v7 com novo pedido e campo `leitura`.
- Estado: extensão 2.3.2 pronta (estático tudo ok, unitário 56 ok, sintaxe do TS ok, visto na prévia). Função `coach-ia` **v7 publicada** em 12/11/2026 com o sim do usuário. Ainda não vista no real (falta recarregar a extensão nos 3 perfis + F5 e clicar no ⚡).
- Nada do texto das conversas das 3 contas fica salvo (`emp_mensagens` vazia; `delta_msgs` só momoi/morieris). Gravar as conversas para a IA ter histórico seria decisão do usuário (dado sensível + SQL novo).

## ATUALIZAÇÃO 12/11/2026: v2.3.3 · conversas salvas (usuário pediu)

Detalhes na seção 20j do `COACH_SPEC.md`.

- Extensão 2.3.3: grava as mensagens da conversa aberta via `painel_msgs` (do Aura) e o ⚡ junta o histórico salvo com a tela. Conferido na prévia (6 de 6 gravadas; IA recebeu 8, 2 do histórico).
- SQL novo `coach_conversa` (seção 15 do `coach_sql.sql`) **aplicado** em 12/11/2026 com o sim do usuário (migração `delta_coach_v2_3_3_conversa`). Conferido: security definer, `search_path ''`, chama `coach_pode()`, anon e public sem execução, só authenticated; usa o índice `emp_mensagens_fa_idx`.
- Achado e NÃO corrigido: Luna fica fora de `coach_ppvs`/`coach_placar` (conta "Luna" no banco x "xlunavitaligratis" no Delta).

## ATUALIZAÇÃO 12/11/2026: v2.3.4 · exemplos reais da momoi para a IA (usuário pediu)

Detalhes na seção 20k do `COACH_SPEC.md` (a regra "nada da Momoi" da seção 2 foi mudada pelo usuário).

- `coach-ext/data/coach_exemplos.json`: 28 exemplos curados e anonimizados em 5 situações; o painel manda 4 da situação certa a cada ⚡.
- Extensão 2.3.4: estático tudo ok, unitário 56 ok, visto na prévia (fã novo → `primeiro_ppv`, esfriou → `reabrir`).
- Função `coach-ia` **v8 publicada** em 12/11/2026 com o sim do usuário (bloco de exemplos no pedido).
- Visto no real (11/11, 23h03–23h09, horário de Brasília): 4 cliques no ⚡ com a v8, todos 200; Grok em 2,0–4,2 s, total 2,3–6,1 s; pedidos de 1,5–2,2 KB (antes 0,6–1,3 KB). `emp_mensagens`: 130 mensagens gravadas da arrudafree em 9 conversas (65 do fã). Luna e Louise ainda com 0 gravadas nessa hora; às 23h16 as 3 gravavam (Arruda 149 msgs/10 conversas, Luna 10/1, Louise 10/1; todas as chamadas de `painel_msgs` com 200; Luna gravada como "Luna", como esperado).
- CORRIGIDO na 2.3.5 (seção 20l da spec; ainda não visto no real) — visto na tela às 23h16: fã que acabou de comprar (venda vista na tela, R$ 33,22) aparece com "sem compra" e selo "Nunca pagou" no bloco do lead, porque `nuncaPagou` no motor só olha a ficha (total/n do banco, que ainda não tem a venda). O preço já usa a última compra certa.

## ATUALIZAÇÃO 12/11/2026: v2.3.5 e v2.3.6 · só o Delta

- 2.3.5: compra vista na tela tira o "Nunca pagou" (seção 20l). 2.3.6: trazidos do Aura o aviso "ligação só por nome" (`painel_extra`) e o tempo médio de resposta do dia (`painel_dia`) (seção 20m). Com isso o Delta faz tudo o que o Aura fazia; o usuário quer ficar só com o Delta. NÃO apagar funções/tabelas do Aura no banco: o Delta usa todas.
- Estado: 61 testes ok, estático ok, visto na prévia. Não visto no real (falta recarregar 2.3.6 nos 3 perfis).

## O PROBLEMA A RESOLVER (histórico: resolvido na v2.1)

**Com 3 contas lado a lado não sobra espaço para atender.**

- Tela desta máquina: 1440×900 (área útil 1440×860).
- O Chrome não aceita janela com menos de ~516 px de largura. Três janelas ficam com 516 px cada, sobrepostas ~54 px.
- O Delta acoplado entra "por dentro" da borda direita com 300 px. Sobram ~216 px de chat em cada janela: não dá para atender.
- O modo mini (▴, ~180 px de altura) libera a parte de baixo, mas ainda cobre o topo direito da janela (cabeçalho da conversa) e continua com 300 px de largura.
- Em 516 px a Privacy entra em layout de celular: mostra a lista de conversas OU a conversa, nunca as duas.

Restrições técnicas que limitam a solução:

- 1 perfil do Chrome = 1 conta da Privacy = 1 instância da extensão. Extensões de perfis diferentes não se enxergam, então não existe "um Delta só para as 3 contas".
- O Delta é uma janela popup (`chrome.windows.create`), porque o painel lateral do Chrome fica com o Aura.
- O Delta é passivo: não pode mexer na janela nem na página da Privacy (ver regras abaixo). Só pode mover/redimensionar a própria janelinha.

Ideias a avaliar COM O USUÁRIO antes de programar (nenhuma foi implementada):

1. **Delta em faixa horizontal**: em vez de coluna de 300 px, uma faixa baixa (por exemplo 516×110 px) acoplada no rodapé ou no topo da própria janela, com conta, fã, relógio, fase, jogada, "✓ Usei" e "Copiar" numa linha; abre o painel inteiro só quando clicado. É o mini atual, mas largo e baixo, e passaria a ser o padrão em janela estreita.
2. **Delta sob demanda**: fica só um selo pequeno (por exemplo 160×40 px) com relógio e cor de alerta; expande ao clicar ou quando há faixa vermelha.
3. **Um Delta visível por vez**: só o da janela em foco aparece inteiro; os outros dois encolhem para selo.
4. **Duas contas por tela em vez de três** (2×720 px, com a Privacy em layout normal), e a terceira em outro monitor ou em segunda área de trabalho.
5. **Zoom da Privacy** em 67–80% em cada janela (o usuário faz à mão com Ctrl e -; o Delta não pode alterar a página).
6. **Segundo monitor** só para os três Deltas.

O usuário disse textualmente: "não vai dar certo, não vai ter espaço pra atendimento". Comece perguntando como ele atende hoje (uma conta por vez ou as três ao mesmo tempo, com quantos monitores) e mostre a ele um desenho da opção escolhida antes de escrever código.

## ESTADO ATUAL (já feito, não refazer)

Versão 2.0.2 da extensão. Em relação à 2.0.1:

- **"✓ Usei" fixo no topo** (`#btnUseiTopo`, ao lado do ▴): sempre visível, também no mini. Estados "✓ Usei" / "✓ Feito" / "Não gravou". O botão ao lado do "Copiar" continua.
- **Uma gravação por sala+roteiro+variante** enquanto a janelinha está aberta (`registradas`, um Set, no lugar de `ultimoRegistro`).
- **Janelinha nunca cortada para fora da tela**: o painel grava `chrome.storage.local.tela` (área útil do monitor) e `posAcoplada()` no `fundo.js` usa isso. Janela de origem <1000 px, maximizada ou sem 410 px livres à direita → compacto 300 px por dentro da borda direita, 80 px abaixo do topo.
- **Reacopla ao voltar de minimizado** (`visibilitychange` no painel).
- **Ordem no compacto (<360 px)**: fã → fase/jogada/roteiro → avisos → placar (CSS `order`).
- Cópias dos três JSON que tinham voltado para a raiz foram apagadas.
- Launcher para Windows (`abrir_3_perfis.bat`): perfis `Profile 20` (Leticia), `Profile 30` (Thays+), `Profile 31` (Anonimo), nessa ordem da esquerda para a direita. Não sei qual perfil é de qual conta.

## O QUE FOI TESTADO

De verdade, na conta arrudafree, Chrome 156 maximizado nesta máquina:

- login (mesmo e-mail e senha do Aura), leitura da página real da Privacy, ficha, placar, relógio com "meta 60 s", fila, preço, aviso de roteiro repetido;
- "✓ Usei" gravou em `central.emp_jogadas` e virou "✓ Feito";
- ▴ encolheu a janelinha e ela ficou acoplada no alto.

Com Chrome real, mas Privacy e Supabase simulados (`teste/e2e_real.mjs`, 254 verificações, todas passando):

- 3 contas × janela larga e 1/3, mais tela cheia e maximizada;
- Usei (9 argumentos, Feito, sem gravação dupla, erro do banco), ▴/▾, lembrar o mini ao reabrir, acompanhar a janela da Privacy, voltar de minimizado, janelinha dentro da tela;
- página da Privacy intocada e nenhum pedido da extensão à Privacy.

NÃO testado:

- xlunavitaligratis e louisefree reais; ▾ na conta real; janela real em 1/3 com o Delta aberto nas três;
- Mac e o launcher `abrir_3_perfis.command`;
- dois monitores;
- o Aura não está instalado neste Chrome (só o Delta), então o estado dos PPVs (comprou ou não) não foi visto funcionando.

## PENDÊNCIAS

- `central.emp_jogadas` tem 4 linhas de TESTE da arrudafree (roteiro RE_REABRIR, 10/11/2026 entre 19:33 e 19:40). Contam como "usos" no relatório da semana. Não foram apagadas; só apague com confirmação do usuário.
- Fechar e reabrir a janelinha esquece o que já foi gravado e permite gravar a mesma jogada de novo. Dá para corrigir usando `coach_historico`.
- No Mac do Henrique a pasta ainda é a 2.0.1.

## COMO RODAR OS TESTES

Na pasta do projeto:

```
node teste/estatico.mjs coach-ext
node teste/unit_v22.mjs coach-ext
```

Nenhum dos dois abre janela. Para ver o painel: `node teste/previa/servidor.mjs` e abrir `http://127.0.0.1:4391/`.

Arquivos do painel (`painel.html/js/css`) valem ao fechar e reabrir a janelinha do Delta. Mudanças em `manifest.json`, `fundo.js` ou `leitor.js` exigem recarregar a extensão em `chrome://extensions` (e F5 na aba da Privacy para o `leitor.js`).

## REGRAS QUE NÃO PODEM SER QUEBRADAS

- O Delta é passivo: só lê a tela. Nunca clica, digita, envia, rola ou faz pedido à Privacy. `leitor.js` não ganha ação nenhuma.
- `chrome.windows.update` só na janela do próprio Delta; nenhuma escrita em abas (`chrome.tabs.update/create/...`).
- Regras e números ficam nos JSON de `coach-ext/data/`, não chumbados no código. Não recriar cópias dos JSON na raiz.
- Toda função `public.coach_*` é security definer, com `search_path = ''` e valida `central.coach_pode()`; anon não executa.
- Não mexer em nada do Aura (pasta, tabelas ou funções `painel_*`).
- Só rodar SQL se o arquivo mudar; antes, conferir o banco só em leitura e pedir confirmação ao usuário.

## SOBRE O USUÁRIO DESTA MÁQUINA

- Responde curto e pelos botões; não é técnico. Não consegue seguir instruções longas de "role até achar X".
- O que precisa aparecer deve estar visível sem rolar. Mostre a tela pronta em vez de explicar.
- O Claude não consegue clicar dentro do Chrome dele (só ver a tela). Carregar extensão, login e cliques são com ele: dê no máximo 2 ou 3 passos por vez.
