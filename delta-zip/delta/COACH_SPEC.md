# Delta (ex-Aura Coach) — Especificação v2 (extensão Chrome, separada do Aura)

> v2.0.0: §1–16 são a base v1 (Modo normal). §17–21 descrevem o Modo Dominante (padrão), as 15 melhorias do GAPS.md e o uso com 3 perfis. Onde §17+ conflita com §1–16, vale §17+ (só no Modo Dominante, salvo indicação).

> Para o Claude: você já construiu o **Aura – Painel do fã**. Agora quero uma **segunda extensão, separada**, chamada **Delta**. Leia tudo, **monte um plano e espere eu responder "pode"** antes de escrever código. Junto com este arquivo vão `coach_regras.json` (regras, limiares, palavras-chave, preços, gatilhos, alertas) e `coach_roteiros.json` (biblioteca de roteiros). O código deve **ler esses JSONs** e não ter regras chumbadas.

## 1. Objetivo

Delta é um **treinador em tempo real** ao lado do chat da Privacy. Para a conversa aberta, ele mostra:
1. a **fase** da conversa;
2. a **próxima jogada** em 1 linha + o **roteiro** sugerido (3 variantes);
3. a **faixa de preço em R$** para este fã;
4. o **recurso da Privacy** certo para o momento (chamada de vídeo, mimo, desafio, vitrine de pacotes, plano trimestral, Pix);
5. **alertas dos termos da Privacy** sobre o que está digitado no campo de mensagem, **antes** de enviar;
6. o **relógio**: tempo esperando, follow-up pendente, horário nobre.

v1 = **só regras, sem IA**. v2 (fora do escopo): sugestões de IA. Em qualquer versão, **quem envia é sempre o Henrique, à mão**.

## 2. Regras de design (inegociáveis)

- **Passivo.** Só lê o DOM. Nunca clica, digita, envia, rola, altera o campo de texto, nem faz requisição à Privacy. Nada de `fetch`/XHR para privacy.com.br.
- **O Henrique envia à mão.** O Delta no máximo **copia o roteiro para a área de transferência** quando o Henrique clica em "Copiar" no painel. Nada de colar no campo.
- **Ler o campo de mensagem** é permitido (`input` listener passivo, só `value`). Nunca escrever nele, nunca `preventDefault`.
- **Compatível com o Aura.** Mesmo projeto Supabase, mesmo login, nenhuma tabela do Aura alterada. A única escrita nova é `central.emp_jogadas` (opcional, por clique).
- **Nada de tática fora dos termos:** sem contato/Pix por fora, sem prova falsa de identidade, sem promessa de encontro, sem emergência inventada, sem "fiz só pra você" falso, sem conteúdo que evoque menoridade, humilhação ou dominação.
- **Origem dos números visível.** Toda regra no JSON tem `origem`: `OF` (medido no OnlyFans/SaintHaus, em US$), `BASE` (medido no extrato das nossas contas), `PRIVACY`, `LEI`, `CONSENSO`, `HIPOTESE`. O painel mostra uma etiqueta pequena (ex.: "OF", "base") ao lado de cada número.
- Nada de dados da Momoi nem de outras criadoras como referência. **Mudado pelo usuário em 12/11/2026**: as conversas da momoi (`central.delta_msgs`) podem ser usadas como base — primeiro para calibrar números (v2.2) e agora como exemplos de estilo para a IA (`coach_exemplos.json`, v2.3.4), curados e anonimizados (seção 20k).

## 3. Arquitetura

- **Chrome MV3**, `side_panel`, `host_permissions`: `https://privacy.com.br/*` e o domínio do Supabase.
- **content script** (`reader.js`): leitor do DOM copiado do Aura (não importe do Aura, são extensões separadas). Publica um **snapshot** da conversa para o painel via `chrome.runtime` (porta).
- **painel** (`panel.html/js`): motor de regras (`engine/`) + UI.
- **engine/** em módulos puros e testáveis: `phase.js`, `nextMove.js`, `price.js`, `features.js`, `tosAlerts.js`, `clock.js`, `keywords.js` (normalização).
- **dados**: `regras` e `roteiros` empacotados como JSON em `/data`. Opcional (v1.1): carregar override de uma linha em `central.emp_contas` se existir; senão, usar o empacotado.
- **Supabase**: reusar o cliente e a autenticação do Aura (mesmo método de login/chave). Só RPCs `security definer`; nenhum `select` direto em tabela.

**Aviso de limitação do Chrome:** só **um** side panel aparece por janela. Proponha no plano uma das saídas (eu escolho): (a) Delta abre em `chrome.windows.create({type:"popup"})` estreito ao lado; (b) Delta como side panel e Aura alterna pelo ícone; (c) no futuro, Delta vira uma aba dentro do Aura. Padrão sugerido: (a).

## 4. Leitura do DOM (igual ao Aura)

O chat fica no **shadow root aberto** de `<privacy-web-chat>` (vue-advanced-chat, classes `vac-`).

| Dado | Onde |
|---|---|
| conta | atributo `profile-name` de `<privacy-web-chatsettings>` |
| cid / sala | parâmetro da URL |
| fã (header) | `a.vac-list-name` (href = perfil; nome em `.vac-text-ellipsis`) |
| lista de salas | `#rooms-list .vac-room-item` (id = sala; `a.vac-avatar` href = perfil; `.name`, `.message-last`, `.vac-text-date`, `.vac-text-unread-msg-counter`, `vac-state-online`, `vac-room-selected`) |
| total gasto | `.vac-subscriber-details-total__value` |
| mensagens | `#messages-list .vac-message-wrapper` (id hex de 24; os 8 primeiros = timestamp Unix em hex); `.vac-message-current` = enviada pela conta; texto em `.vac-format-container`; áudio `.vac-audio-player` |
| campo de texto | provável `textarea` dentro do footer do vac (ex.: `#roomTextarea` / `.vac-textarea`). **Confirmar no DOM real** e documentar o seletor no plano. |

- `MutationObserver` no shadow root, **snapshot estável após 1,2 s** sem mudanças (igual ao Aura).
- Campo de texto: listener `input` com debounce 300 ms → só roda `tosAlerts`.
- Hora de cada mensagem = `parseInt(id.slice(0,8),16)*1000`.
- Snapshot: `{conta, sala, fa:{id,nome,href}, total_gasto_brl, mensagens:[{id, ts, da_conta:bool, texto, audio:bool}], online, nao_lidas}`.

## 5. Leituras do Supabase (projeto "Central de Chat", schema `central`)

1. `public.painel_abrir(...)` (já existe, do Aura) → `central.emp_ficha`: totais, gasto por conta, horários, tipos, últimas 8 compras, notas, tags, sinais. Use: total geral, gasto nos **primeiros 7 dias** (calcular a partir das compras se a ficha não trouxer; se não der, mostrar "sem dado"), gasto por conta (multi-conta), última compra (valor, hora), notas (trabalho, cidade, dia do pagamento, favorito).
2. **Nova RPC de leitura** `public.coach_ppvs(p_sala text, p_conta text)` → últimas 20 linhas de `central.emp_ppvs` (Aura 1.3) da sala: `msg_id, preco, enviado_em, comprado, comprado_em`. Se o Aura 1.3 ainda não existir, o Delta funciona sem estado de PPV e mostra "estado do PPV indisponível".
3. Cache por sala de 60 s; recarregar ao trocar de sala ou quando entra mensagem nova da conta que pareça PPV.

## 6. Motor de fase (`phase.js`)

Use `coach_regras.json → fases` (avaliar em ordem de `prioridade`; a primeira que casar vence) e `palavras` (normalizar: minúsculas, sem acento via NFD, espaços colapsados; casar por palavra/expressão inteira; itens `re:` são regex).

Variáveis calculadas:
- `msgs_fa_desde_ultimo_ppv`: msgs do fã depois do último PPV enviado (emp_ppvs; sem PPV = desde o início da sala).
- `msgs_fa_total`, `ultima_msg_fa_ts`, `ultima_msg_conta_ts`, `gap_fa_s = agora − ultima_msg_fa_ts`.
- `ppv_pendente`: último PPV com `comprado=false`; `min_desde_ppv`.
- `compra_recente_min`: minutos desde a última compra.
- `sinais`: conjuntos que casaram nas **2 últimas** msgs do fã (vulnerabilidade/menor: últimas 10).

| Prioridade | Fase | Quando (limiares no JSON) |
|---|---|---|
| 1 | **vulnerável** | `sinais.vulnerabilidade` ou `sinais.menor` → trava venda, mostra faixa vermelha "PARE DE VENDER – avise o gestor" |
| 2 | **objeção [tipo]** | última(s) msg do fã casa `objecoes.*`; tipo = primeiro na ordem `encontro, contato_externo, autenticidade, sem_dinheiro, caro, previa, depois` |
| 3 | **pós-compra** | compra há ≤ 60 min (BASE: mediana até a 2ª compra 48 min; 27,9% recompram em 1 h) |
| 4 | **hora de vender** | (`msgs_fa_desde_ultimo_ppv` ≥ 6 **e** fã ativo < 2 min) **ou** `sinais.compra` **ou** > 10 msgs desde o último PPV (OF) |
| 5 | **reengajamento** | última msg do fã ≥ 7 dias; ou VIP sem compra ≥ 72 h e sem resposta |
| 6 | **abertura** | ≤ 2 msgs do fã na sala e sem compras |
| 7 | **qualificação** | ≤ 5 msgs desde o último PPV e notas sem trabalho/rotina/gosto |
| 8 | **rapport** | demais casos |

Modificadores (selos): `esfriou` (fã parado > 15 min sem PPV enviado → jogada "reabrir", **nunca PPV frio**, OF), `ppv_pendente`, `VIP` (R$500+ nos 7 primeiros dias → 59,4% chegam a R$1.000, BASE; ou top 10% da conta), `potencial` (R$200+ nos 7 dias → 24,7%, BASE), `multi-conta` (compra em 2+ contas: mediana R$229 x R$50, BASE), `nunca pagou + 2 recusas` (só conversa, OF).

## 7. Próxima jogada (`nextMove.js`)

Tabela fase × condição → jogada (texto de 1 linha) → `roteiro_id` (de `coach_roteiros.json`). Primeira linha que casar vence.

| Fase | Condição | Jogada (1 linha) | roteiro_id |
|---|---|---|---|
| vulnerável | — | Pare de vender. Conversa leve e avise o gestor. | PAUSA_VULNERAVEL |
| objeção | encontro | Só online, leve, sem prometer nada. | OB_ENCONTRO |
| objeção | contato_externo | Tudo fica aqui dentro; volte ao desejo dele. | OB_CONTATO_EXTERNO |
| objeção | autenticidade | Curto e natural. Sem prova falsa. | OB_AUTENTICIDADE |
| objeção | autenticidade + oferece_chamada | Ofereça chamada de vídeo (a modelo atende). | FT_CHAMADA |
| objeção | sem_dinheiro | Pergunte quando recebe, anote, pare de vender. | OB_SEM_DINHEIRO |
| objeção | caro | Item menor de verdade, nunca desconto. | VD_ITEM_MENOR |
| objeção | caro + vitrine_ativa | Mostre o pacote menor da vitrine. | FT_VITRINE |
| objeção | previa | A prévia é a borrada; descreva com honestidade. | OB_PREVIA |
| objeção | depois | Libere ele; deixe porta aberta. | OB_DEPOIS |
| pós-compra | ≤ 5 min da compra | Mensagem pessoal agora: o que ele mais gostou. | PC_AGRADECER |
| pós-compra | `pos_compra_positivo` | Abra o próximo degrau (faixa abaixo). | PC_PROXIMO |
| pós-compra | VIP + aceita_custom | Proponha custom do menu aprovado. | VIP_CUSTOM |
| pós-compra | mimo recebido | Agradeça pessoalmente. | FT_MIMO_RECEBIDO |
| hora de vender | PPV pendente, min ≥ intervalo FU n | Follow-up n/5 com ângulo novo. | FU_1 … FU_5 |
| hora de vender | nunca pagou + 2 recusas | Só conversa por enquanto. | FU_NUNCA_PAGOU |
| hora de vender | esfriou | Reabra a conversa antes do PPV. | RE_REABRIR |
| hora de vender | `sinais.compra` | Ele pediu: venda agora. | VD_PEDIU_PRECO |
| hora de vender | comprou nesta sequência | Suba o degrau (+38–50%). | VD_SUBIR |
| hora de vender | preço sugerido > R$200 | Envie e lembre que no Pix passa direto. | VD_PIX_ALTO |
| hora de vender | interesse_chamada + oferece_chamada | Ofereça chamada de vídeo. | FT_CHAMADA |
| hora de vender | desafio_ativo + nobre | Mencione o desafio ativo. | FT_DESAFIO |
| hora de vender | padrão | Envie o PPV agora, legenda em 4 partes. | VD_LEGENDA |
| reengajamento | VIP sumido, tentativas < 3 | Mensagem pessoal sem venda. | RE_WHALE |
| reengajamento | tentativas esgotadas | Encerre com gentileza. | RE_ENCERRAR |
| reengajamento | expirado | Uma oferta de volta (uma vez). | RE_EXPIRADO |
| reengajamento | `sinais.assinatura` + trimestral_ativo | Sugira o plano trimestral. | FT_TRIMESTRAL |
| reengajamento | nota "favorito" | Cite a favorita dele. | RE_FOTO_FAV |
| reengajamento | padrão | Algo das notas, sem preço. | RE_QUIETO |
| abertura | comprou boas-vindas | Mensagem pessoal em até 1 h. | AB_POS_BOASVINDAS |
| abertura | resposta seca | Espelhe curto + pergunta fácil. | AB_RESPOSTA_SECA |
| abertura | padrão | Brinque com o username + pergunta de escolha. | AB_USERNAME / AB_ESCOLHA |
| qualificação | falta trabalho | Descubra trabalho/rotina. | QL_TRABALHO |
| qualificação | falta gosto | Descubra o que ele curte. | QL_GOSTO |
| qualificação | dia de pagamento citado | Anote o dia. | QL_PAGAMENTO |
| rapport | 3–4 msgs | Commonality ou quebra de rapport. | RP_COMMONALITY / RP_QUEBRA |
| rapport | 5+ msgs | Pergunta de opinião para virar a conversa. | RP_TRANSICAO |
| rapport | `interesse_mimo` | Diga que o mimo existe (sem pedir). | FT_MIMO_EXISTE |

Exibir: jogada + roteiro (variante 1, setas para 2 e 3) + botão **Copiar**. Placeholders `{nome}` etc.: preencher com snapshot/notas; se faltar, destacar o campo em amarelo (não inventar).

## 8. Motor de preço (`price.js`) — tudo em R$

Regras em `coach_regras.json → preco`:
- **Piso** R$14,90; teto R$2.000 no chat (PRIVACY; conflito com termos §16 R$5–200, mostrar aviso se > 200 em post pago).
- **Nunca pagou (entrada):** faixa **R$54,90–82,90** = conversão de US$10–15 (OF, **hipótese**, etiqueta "calibrar"). `entrada_override` no JSON substitui.
- **Já pagou, sem sequência:** a partir de **R$165,90** (≈US$30, OF), limitado ao 2x da última compra.
- **Em sequência:** próximo = última × **1,38** (mediana de alta da base) a × **1,5** (padrão do curso); sem hesitação até × 1,7; hesitou = mantém; **nunca > 2x**.
- **Nunca abaixo da última compra** (OF: preço menor rende ~metade). Na base o preço caiu em 31,5% das compras seguidas → alertar quando o valor digitado for menor.
- Arredondar para o **X,90 mais próximo** (ex.: 82,80 → 82,90; 90,00 → 89,90); nunca abaixo de R$14,90.
- **> R$200 → selo Pix** (BASE: Pix = 74% da receita e 67% das vendas > R$200; vendas > R$200 = 3,3% das vendas e 28,9% da receita).
- Mostrar "você recebe ≈ R$X" (× 0,80; taxa Privacy 20%).
- VIP: pode pular um degrau.

## 9. Gatilhos de recursos (`features.js`)

Ver `recursos` no JSON. Só sugerir recurso que a conta marcou `true` em `config_por_conta`.
- **Chamada de vídeo** (R$39,90–5.000): objeção de autenticidade, pedido de chamada/ao vivo, ou VIP. Aviso fixo: "só a modelo atende".
- **Mimo** (R$5–2.000): só quando **ele** fala em presente/gorjeta, ou ao receber um (agradecer). Nunca pedir.
- **Desafio** (metas R$50–2.000): desafio ativo + fã pagante + horário nobre.
- **Vitrine de pacotes** (até 5): "tem mais?", "o que você tem", objeção "caro" (pacote menor), fora do horário, ex-assinante.
- **Plano trimestral/semestral**: fã fala em cancelar/renovar/mensalidade.
- **Pix (da plataforma)**: preço > R$200.

## 10. Alertas de termos no campo de texto (`tosAlerts.js`)

Ver `alertas_composer`. Ler o texto digitado, rodar padrões, mostrar faixa **acima** do painel:
- **Vermelho "NÃO ENVIE assim"**: contato externo (WhatsApp, Telegram, Insta, @usuário, telefone, e-mail, link, chave Pix), outras plataformas, promessa de encontro, emergência para pedir dinheiro, termos que evocam menoridade.
- **Amarelo**: "fiz só pra você"/"ninguém mais viu" (só se for verdade), humilhação/dominação, valor menor que a última compra.
- **Info**: valor > R$200 → lembrar Pix.
Mostrar qual palavra disparou e o motivo. Nunca alterar o texto nem bloquear o envio de verdade.

## 11. Relógio (`clock.js`)

- **Esperando**: `agora − última msg do fã` se a última msg da sala é do fã. Verde ≤ 90 s (meta, OF), amarelo ≤ 4 min, vermelho > 4 min. Sala sem msg da conta (assinante novo): limite 5 min (OF: US$15,29 no 1º mês x US$1,95 ignorado).
- **Follow-up**: PPV pendente → "FU n/5 em mm:ss". 1º aos 5 min (OF); intervalos seguintes `[15, 60, 1440, 4320]` min são **hipótese configurável**.
- **Horário nobre**: selo 20h–3h (BASE: 41,3% da receita), "PICO" perto das 23h. Pico de almoço **não confirmado**: não mostrar.
- Atualizar a cada 1 s só no painel (sem tocar no DOM).
- Na lista de salas (snapshot), mostrar mini-fila: salas com não lidas ordenadas por tempo esperando, VIP primeiro.

## 12. UI (cores do Aura: rosa `#d3456f`, vinho `#8b1e3f`)

Largura 360–420 px, de cima para baixo:
1. **Faixa de alerta** (só quando há): vermelho `#b00020` / amarelo / info em rosa claro.
2. **Cabeçalho**: nome do fã, conta, selos (VIP, potencial, multi-conta, nunca pagou), relógio grande.
3. **Fase** (chip vinho) + motivo curto ("6 msgs desde o PPV, ativo há 40 s").
4. **Próxima jogada** (1 linha, negrito) + **roteiro** (card rosa claro, setas 1/2/3, botão Copiar, etiqueta de origem).
5. **Preço**: faixa em R$, "você recebe ≈", selo Pix, etiqueta OF/base/hipótese.
6. **Recurso do momento** (se houver).
7. **Fila** (colapsável): salas esperando.
8. Rodapé: "Delta só sugere. Você envia." + botão "Usei esta jogada" (registra em emp_jogadas).
Sem animações pesadas; fonte do sistema; contraste AA.

## 13. Tabela e RPC novas (única escrita)

```sql
create table if not exists central.emp_jogadas (
  id bigint generated always as identity primary key,
  sala text not null,
  fa_id text not null,
  conta text,
  fase text not null,
  jogada text not null,
  roteiro_id text,
  variante smallint,
  preco_sugerido numeric(10,2),
  em timestamptz not null default now()
);
create index if not exists emp_jogadas_fa_em on central.emp_jogadas (fa_id, em desc);
alter table central.emp_jogadas enable row level security;
revoke all on central.emp_jogadas from anon, authenticated;

create or replace function public.coach_registrar_jogada(
  p_sala text, p_fa_id text, p_conta text, p_fase text, p_jogada text,
  p_roteiro_id text default null, p_variante smallint default null,
  p_preco numeric default null)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  if p_sala is null or p_fa_id is null or p_fase is null or p_jogada is null then
    raise exception 'campos obrigatórios';
  end if;
  insert into central.emp_jogadas (sala, fa_id, conta, fase, jogada, roteiro_id, variante, preco_sugerido)
  values (p_sala, p_fa_id, p_conta, p_fase, p_jogada, p_roteiro_id, p_variante, p_preco)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.coach_registrar_jogada from public, anon;
grant execute on function public.coach_registrar_jogada to authenticated;

create or replace function public.coach_ppvs(p_sala text, p_conta text)
returns table (msg_id text, preco numeric, enviado_em timestamptz, comprado boolean, comprado_em timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select p.msg_id, p.preco, p.enviado_em, p.comprado, p.comprado_em
  from central.emp_ppvs p
  where p.sala = p_sala and p.conta = p_conta
  order by p.enviado_em desc limit 20
$$;
revoke all on function public.coach_ppvs from public, anon;
grant execute on function public.coach_ppvs to authenticated;
```
Ajuste o papel (`authenticated` ou o que o Aura usa) para bater com o login do Aura e diga no plano. Registrar só quando o Henrique clica "Usei esta jogada" (nunca automático). Depois cruzamos `emp_jogadas` com `emp_compras`/extrato para medir conversão por jogada.

## 14. Testes

- **Unitários** (Vitest/Jest, sem navegador) para `phase`, `nextMove`, `price`, `features`, `tosAlerts`, `clock`, `keywords`, com fixtures de snapshot em `/test/fixtures`. Mínimo:
  - normalização: "Quanto É?" casa "quanto e"; "zap" casa; "whatsapp" dentro de outra palavra não gera falso positivo indevido.
  - fase: 6 msgs + fã ativo há 30 s → hora de vender; 6 msgs + parado 20 min → selo esfriou + RE_REABRIR; "tá caro" após PPV → objeção caro; "tenho 17" → vulnerável (vence tudo); compra há 10 min → pós-compra.
  - preço: última R$60 → faixa R$82,90–89,90 (1,38–1,5 arredondado ,90), nunca > R$120; nunca pagou → R$54,90–82,90; > R$200 → selo Pix; valor digitado R$40 com última R$60 → alerta amarelo.
  - alertas: "me chama no zap 11 91234-5678" → vermelho (2 motivos); "te encontro amanhã" → vermelho; "gravei só pra você" → amarelo.
  - relógio: 95 s → amarelo; 5 min → vermelho; 23h → selo pico.
- **Garantia de passividade**: teste que falha se `reader.js` chamar `click`, `dispatchEvent`, `focus`, `scroll*`, atribuir `.value`, ou usar `fetch/XMLHttpRequest` para privacy.com.br (grep no build + monkeypatch em teste).
- **Manual**: checklist nas 3 contas (arrudafree, xlunavitaligratis, louisefree) com print de cada fase.

## 15. Fora do escopo (v1)

IA ou LLM; enviar, colar ou agendar mensagens; clicar em qualquer coisa da Privacy; ler dados fora da conversa aberta e da lista de salas; scraping de outras páginas; alterar tabelas do Aura; notificações push; multiusuário (só o Henrique). **v2**: IA sugere texto a partir do contexto, sempre revisado e enviado pelo humano.

## 16. Entregáveis do plano (antes do "pode")

1. Estrutura de pastas e manifest.
2. Seletor confirmado do campo de texto e da marcação de PPV no DOM.
3. Opção escolhida para o conflito de side panel (seção 3).
4. Como o Delta autentica no Supabase igual ao Aura.
5. Lista de testes.
Depois do "pode", entregue em etapas: (1) leitor + snapshot; (2) engine + testes; (3) UI; (4) SQL + registro de jogada.


---

## 17. Modo Dominante (padrão na v2)

- Seleção: `R.modos.padrao = "dominante"`; botão `#btnModo` no painel grava `chrome.storage.local.modo` (`normal`|`dominante`). `aplicarModo(R, modo)` mescla `R.modos.dominante.limiares` sobre `R.limiares` e marca `R._modo`/`R._dom`. Modo normal = comportamento v1 (testes v1 rodam com `modo:"normal"`).
- Roteiros: todo roteiro tem `variantes` (normal) e `dominante` (3 variantes). `PAUSA_VULNERAVEL` não muda. 81 roteiros (`coach-roteiros-2.1-dominante-gaps`).
- Teste-guarda: nenhuma variante dominante dispara alerta acima de `info` (ToS, falsa exclusividade, urgência falsa, ofensa, desconto).
- Alertas novos (os dois modos): `urgencia_falsa` (aviso), `ofensa_fa` (vermelho), `oferta_desconto` (aviso), `protecao_modelo` (vermelho, termos por conta).

### 17.1 Preço (dominante)
| Regra | Valor |
|---|---|
| Piso | nunca abaixo da última compra (`piso_ultima_compra`); digitar menor = `bloqueio_visual` |
| Degrau | mín +50%, padrão +70%, VIP/baleia +100% |
| Teto | 2x última compra; R$2.000 no chat (nota de teto) |
| Arredondamento | `,90` para cima no mínimo e para baixo no máximo |
| Entrada (nunca pagou) | arrudafree R$29,90–49,90; Luna/louisefree R$39,90–59,90 (`entrada_brl`, os 2 modos) |
| Tiers | baleia ≥R$2.500 total (HIPÓTESE, piso R$299,90); VIP gasto7 ≥500 ou total ≥1.000 (piso R$219,90); potencial gasto7 ≥200 ou multi-conta; pagante; novo |
| Meta 7 dias | R$500 nos 7 primeiros dias (BASE: 59,4% chegam a R$1.000) |
| Pix | acima de R$200 |

### 17.2 Fases e tempo (dominante)
| Limiar | Normal | Dominante |
|---|---|---|
| Aquecimento | v1 | 4–7 msgs do fã |
| Qualificação até | v1 | 3 msgs |
| Abertura até | v1 | 1 msg |
| Esfriou | v1 | 600 s |
| Relógio meta/limite/novo | v1 | 60 / 180 / 180 s |
| Follow-ups (min) | v1 | 5, 12, 40, 180, 1440 (máx. 5) + `FU_REFORCO` a 20–150 s do PPV |
| Upsell pós-compra | v1 | após 3 min |
| PPV abandonado | — | 30 min sem compra e ele voltou → `PPV_ABANDONADO` |
| Reengajar | v1 | quieto 4 d; whale sumido 48 h (RE_WHALE → RE_WHALE_2 → RE_ENCERRAR) |
| HUD | — | VIP esperando >60 s; fila ≥3; FU vencido; pico 22h30–23h30; nobre 20h–3h |

Rota de jogada (hora de vender): FU pendente → PPV abandonado → nunca pagou 2 recusas → esfriou → chamada (se `oferece_chamada`) → pediu preço → sequência (VD_SUBIR / WH_SEQUENCIA) → entrada → multi-conta → META7 → Pix → pico → nobre → desafio → VD_ANCORA/VD_LEGENDA.

### 17.3 Placar do dia
`coach_placar()` (dia em America/Sao_Paulo, só agregados por conta: receita, vendas, ppvs, jogadas). Painel mostra meta (`meta_dia_brl`, 500), ticket, conversão, ranking. Sem SQL v2: `placarLocal` (vendas vistas na tela hoje).

## 18. As 15 melhorias do GAPS.md (todas no Modo Dominante; revisor, proteção e ToS nos dois)
| # | Item | Onde |
|---|---|---|
| 1 | Revisor pré-envio (nível `revisor`, nunca bloqueia) | `revisor()`, `R.revisor` |
| 2 | Mimo ativo honesto, 1x pós-sessão, flag `mimo_ativo` por conta (substitui "nunca pedir mimo") | `sessao()`, `FT_MIMO_AGRADECER` |
| 3 | Videochamada ON na arrudafree | `config_por_conta.arrudafree.oferece_chamada` |
| 4 | Sinais sutis / ruins | `contexto().compraSutil/rajada/ruim`, `RP_SINAL_RUIM` |
| 5 | SLA por tipo na fila | `fila()`, `R.fila_sla` |
| 6 | Calendário BR (5º dia útil, dia anotado, 13º 30/11 e 20/12) | `calendario()`, `quintoDiaUtil()`, `RE_DIA_PAGAMENTO` |
| 7 | Entrada pela base | `entrada_brl` |
| 8 | Modo sequência (32 cenas PT-BR, 6 degraus, ESPERE, Pix ≥4º) | `coach_cenas.json`, `cena()` |
| 9 | Espelho + termômetro | `espelho()`, `termometro()` |
| 10 | Dia X de 7 + gasto | `meta7().dia`, HUD |
| 11 | Roteiro repetido | `coach_historico`, `repetido()` |
| 12 | Perfil do fã | `perfil()`, `R.perfis_fa`, `PF_*` |
| 13 | Conversão semanal por roteiro | `coach_conversao_semana`, `conversaoSemana()` |
| 14 | Aftercare 2 passos, brinde R$500+ (flag), descanso 10 h vence o follow-up | `sessao()`, `PC_AFTERCARE_1/2`, `PC_BRINDE`, `RP_DESCANSO` |
| 15 | Proteção da modelo (`protecao_termos`, vazio) | `alertas()` |

Cenas fora (`coach_cenas.json > fora`, com motivo): K1, K2, K4, S9, S25, S30, S3, S7, S11, S15, S18, S19, S23, S38, S41, tarefas de submissão, dick rate, DNP automático.

## 19. 3 perfis / 3 janelas
- 1 perfil do Chrome = 1 conta = 1 Aura + 1 Delta. Storage é por perfil; `contaDoPerfil` é aprendido na 1ª conta atendida vista e gera aviso se outra conta aparecer naquele perfil.
- Selo de conta `#contaBadge` com `cor`/`rotulo` de `config_por_conta`.
- Acoplamento (`fundo.js`): janela de origem <1000 px → popup compacto 300 px por dentro da borda direita da origem (abaixo de 80 px de barra); ≥1000 px → 410 px à direita. Segue `onBoundsChanged`. `chrome.windows.update` só na janela do Delta; nenhum `chrome.tabs.*` de escrita (teste estático).
- Painel <360 px → classe `compacto`.
- Launcher `abrir_3_perfis.command`/`.sh` (macOS): `open -na "Google Chrome" --args --profile-directory=… --new-window https://privacy.com.br/chat`, grava ids de janelas antes, só posiciona as novas em terços via `osascript`. Sem flags (teste estático lista flags proibidas).
- Não detecta a mesma conta aberta em 2 perfis (perfis não se veem); regra "um leitor por conta" é operacional. Aba "seed" do leitor Delta existente: nunca tocada.

## 20. SQL v2
`emp_jogadas.modo`; `coach_registrar_jogada` com 9 args (`p_modo` ∈ normal|dominante; versão de 8 args removida); `coach_placar()`, `coach_historico(p_fa_id)` (90 dias), `coach_conversao_semana(p_conta)` (compra até 60 min após a jogada). Todas `security definer`, `search_path ''`, checam `coach_pode`, sem acesso anon.

## 20b. Nome visível "Delta" e visual v2
- Só nomes visíveis: `manifest.name/short_name` = "Delta", `action.default_title` = "Abrir o Delta", `<title>`, marca do topo, rodapé e textos. NÃO mudam: pasta `coach-ext`, `coach_sql.sql`, tabelas/RPCs `coach_*`/`emp_jogadas`, chaves do `chrome.storage`, `config.js`. O leitor Delta já existente (aba seed, hash de chave próprio) não é tocado.
- Visual: tema escuro (fundo #0e0a0d, cartões #17111a/#1f1723), rosa/vinho do logo Aura (#e0507c → #8b1e3f) como acento, ouro (#f0c86e) só para Modo Dominante e ranking, cor da conta (`--conta`) na faixa do topo e no selo. Grade de 8 px, raio 12/8 px, fonte do sistema. Compacto (<360 px) reorganiza topo, placar e cabeçalho do fã.

## 20c. v2.0.1 (ergonomia e correções)
- **Relógio**: `relogio()` devolve `meta_s = L(R, "resposta_meta_s")` (limiar do modo ativo). O painel escreve "esperando · meta {meta_s} s" (60 no Dominante, 90 no normal) e "assinante novo · limite {limite_s}" (3 min / 5 min). Nenhum número chumbado no painel.
- **Meta dos 7 primeiros dias**: no compacto (<360 px) não entra no cartão de Preço; fica só no HUD (item `tipo: "meta7"` com `pct` → barrinha `.hud-barra`). Largura normal: cartão de Preço como antes.
- **"Usei esta jogada"**: botão `.btn.usei` na barra do roteiro ativo, antes do "Copiar" ("✓ Usei" → "✓ Feito"). O botão no fim do painel só existe quando não há cartão de roteiro. Mesmo `coach_registrar_jogada`, uma gravação por sala+roteiro+variante.
- **Modo mini**: `#btnMini` (▴/▾) na linha do selo da conta. `chrome.storage.local.mini`; `body.mini` mostra só selo da conta, nome do fã + relógio, fase e próxima jogada (alertas `bloqueio_visual`/`pare` continuam). Altura da janela do Delta = 180 px + moldura (`miniAltura`); `fundo.js` respeita `mini` ao criar/acoplar. Só `chrome.windows.update` na janela do Delta.
- **Redesenho**: o tique de 1 s não troca o DOM com o ponteiro apertado (clique em Copiar/Usei não se perde); "Copiado" fica 2,5 s.
- **SQL**: `coach_conversao_semana` atribui cada PPV comprado só à jogada mais recente antes de `comprado_em` (`not exists` de outra jogada da mesma sala/conta entre a jogada e a compra; empate de horário → maior `id`).
- **Dados**: `coach_regras.json`, `coach_roteiros.json` e `coach_cenas.json` existem só em `coach-ext/data/`. Cenas `coach-cenas-1.1`: legendas sem texto repetido.

## 20d. v2.0.2 (correções achadas no teste com Chrome real)
- **"Usei"**: `registradas` (Set de `sala|roteiro|variante`) substitui `ultimoRegistro` (só guardava a última). Uma gravação por combinação enquanto a janelinha está aberta; voltar a uma variante já usada mostra "✓ Feito" e não grava de novo.
- **Acoplamento dentro da tela**: o painel grava `chrome.storage.local.tela = {esq, topo, larg, alt}` (área útil do monitor onde o Delta está; o service worker não enxerga a tela). `posAcoplada()` usa isso, só quando o centro da janela de origem está nesse monitor: origem <1000 px **ou** sem 410 px livres à direita → compacto 300 px por dentro da borda direita (top + 80), com `left`/`top`/`height` limitados à área útil. Sem `tela` (primeira abertura) vale a regra antiga e o painel reacopla assim que grava. Mini usa a mesma posição com `miniAltura`. Continua só `chrome.windows.update` na janela do Delta.
- **"Usei" fixo no topo**: `#btnUseiTopo` no `<header>` (antes do `#btnMini`), atualizado por `useiTopo(res)` no fim de `desenhar()`; mesmo `registrar()`. Estados: "✓ Usei" / "✓ Feito" (`.feito`) / "Não gravou" (`.falhou`, motivo no `title`). Visível também em `body.mini`. O cabeçalho não é redesenhado no tique de 1 s. Motivo: no teste ao vivo (arrudafree, janela maximizada em 1440×900) o botão do roteiro ficava abaixo da dobra.
- **Ordem no compacto**: CSS `order` em `body.compacto:not(.mini) #conteudo` → alerta de conta, `.cab`, `.jogo`, `.hud`, depois placar e o resto. Largura normal não muda.
- **Sem SQL novo** (banco continua em `delta_coach_v2_0_1`).

## 20e. v2.1 (Cockpit 3x2 + atendimento mais rápido)
- **Web Apps**: `fundo.js` aceita janela de origem `type: "app"` (PWA da Privacy) e usa 34 px de barra (`BARRA_APP`) em vez de 80.
- **Doca Inferior**: mini = janelinha de **195 px de altura total** (`ALT_MINI`, `miniAltura`). Se `origem.top + origem.height + 195 <= fundo da área útil + 8`, `posAcoplada()` devolve `{left: origem.left, top: origem.top + origem.height, width: clamp(origem.width, 300, 480), height: 195, doca: true}`. Sem espaço embaixo, o mini fica no alto como na 2.0.2. `definirMini()` sempre pede `coach_acoplar`. Continua só `chrome.windows.update(coachJanela | eu.id, …)`.
- **Launcher** `abrir_3_perfis.ps1`: `--app=https://privacy.com.br/chat` por perfil; 3 janelas de `largura/3` × `(altura útil − 195)` no topo. `.command`/`.sh` (Mac) não mudaram.
- **{placeholders}**: `M.dadosFa(notas, textoDoFã)` lê notas/tags `chave: valor` (profissao, time, hobby, detalhe…) e `dia_pagamento` ("dia 5", "5º dia útil") → `res.dados`. Painel: `dadosDe(res)` = nome + dados + `varsSala` (por sala, só memória). Chips de 1 clique vêm de `coach_regras.json > chips_placeholders`. Clicar num `{campo}` (`.falta` ou `.posto`) abre um `<input>` em cima do texto; enquanto `editando`, `desenhar()` não roda.
- **Copiar + Usei**: `copiarAtual()` copia e chama `registrar()` se a chave ainda não está em `registradas`. `#btnCopiarTopo` no cabeçalho. Teclas (foco fora de campo): `C`/`Enter` copia+usa, `1`/`2`/`3`/`←`/`→` variante (ou degrau da cena), `M` mini.
- **Mini completo**: conta + ✓ Usei + Copiar + ▾ · fã + relógio · fase + faixa de preço (`.preco-chip`) + `‹ 1/3 ›` (`.nav-mini`) · 1 linha da jogada · 2 linhas do roteiro (ou 1 linha de chips no lugar da jogada). Sem rolagem.
- **Cena fixada**: `cenaSala[sala].fixa`. Botão "🎬 Fixar Cena no Topo" no cartão de leitura; `desenharCenaTopo()` troca o cartão principal por degrau N/total, barrinha, −/+, aviso "ESPERE" e legenda. Grava como `p_roteiro_id = CENA_<id>_D<n>`, variante 1. Desafixa sozinha quando passa do último degrau.
- **Radar**: `body.urgente-vip` (ouro, VIP/Baleia com mensagem esperando) e `body.urgente-sla` (vermelho, relógio vermelho ou follow-up vencido). `#btnSom` (storage `som`, padrão desligado): bipe por `AudioContext` na mensagem nova de VIP e no follow-up que vence.
- **Ordem** (CSS `order`, todas as larguras): alerta de conta → fã → fase/jogada/roteiro → avisos → preço → leitura/cena → placar e o resto. Compacto esconde a marca e o chip de tier.
- **Escada**: `M.escada(pr, c, R, 3)` → `res.escada` (Dominante ou fã comprando): 1º = piso da faixa, cada degrau +`padrao_pct` (VIP/Baleia `vip_pct`), ≤ 2× o anterior, ≤ teto do chat.
- **"✓ Feito" persistente**: `chrome.storage.local.registradas = {data: hojeSP(), chaves}`; vale só no dia.
- **Leitor**: `dinheiro()` aceita `R$ 441.81` e `R$ 1.234,56`; salas ganham `nossa` (`.message-last .vac-icon-check`) e `gasto`; `.vac-sale-notice` é ignorado; `.vac-text-paid` / `.vac-text-not-paid` → `ppv: true, comprado: true|false` (o motor usa quando não há PPV do banco; `res.ppvEstadoTela`). `fila()`: hora que não é HH:MM com não lida = 86400 s (estourado); empate → maior `gasto`.
- **Sem SQL novo.** Seletores `.vac-sale-notice`, `.vac-text-paid`, `.vac-text-not-paid`, `.vac-icon-check` ainda não foram conferidos na Privacy de verdade.

## 20f. v2.2 (calibragem pela base + painel único)
- **Calibragem** (`coach_regras.json > calibragem`, medido só em leitura em 10/11/2026): 3.891 compradores / R$ 849.096 em `emp_compras`; mensagens só da conta momoi em `delta_msgs` (`emp_mensagens` e `emp_ppvs` vazias). Mudou: Baleia R$ 2.300 (top 1%), Potencial R$ 300 em 7 dias, metas do dia 530/490/230, degrau Dominante +38% a +70%, resposta normal 80 s / 300 s, novos `sumiu_meio_s`, `piso_midia_brl`, `previsao_30d`.
- **Motor**: `freio_gasto` (objeção de quem já comprou → `PC_FREIO_CARINHO`, preço travado na última compra, sem escada); encontro de pagante/VIP/ego → `OB_ENCONTRO_VIP` ou `OB_ENCONTRO_VIP_CHAMADA`; `palavra_fixado` → `VD_POST_FIXADO` (prioridade logo abaixo de vulnerável); `sumiuMeio()` → `SS_SUMIU_MEIO`; `soBoasVindas` → aviso no HUD + `AB_USERNAME`; `piso_midia_brl` em `preco()` e alerta `piso_midia` (bloqueio_visual); `previsao()` + selo `cara_baleia`; `ordenarVariantes()` (melhor conversão em 1º com 10+ usos; usadas com o fã ficam ocultas; `variantesIdx` guarda o número original que vai para `p_variante`); `massaDoDia()`.
- **Painel**: barra `#radarGlobal` (publica só números; no mini mostra as outras 2 contas na linha do topo); ritmo `⚡ chats/h`; "Você hoje"; `📊 Fechar Turno`; abas Delta/Ficha/Fila/Sumidos/Mais abaixo do comando principal (usam `painel_nota`, `painel_nota_apagar`, `painel_ligar`, `painel_fila`, `painel_sumidos`, `painel_extrato`; escondidas no mini); `⚡ Adaptar` (função `coach-ia`, versões filtradas por `alertas()`/`revisor()`, memória salva com 1 clique por `coach_memoria`). Redesenho pausa com foco em `<input>` dentro de `#conteudo`.
- **SQL** (migração `delta_coach_v2_2`, aplicada em 10/11/2026): `coach_conversao_variantes`, tabela `central.coach_radar` + `coach_radar`, `coach_placar_chatter`, `coach_ex_assinantes`, `coach_relatorio_turno`, `coach_memoria`. Todas security definer, `search_path ''`, `coach_pode()`, sem anon (conferido).
- **Edge Function** `supabase/functions/coach-ia` (publicada, versão 2): chave `xai-…` → Grok `grok-4.7`; outra → Claude Haiku. Falta o secret `AI_API_KEY`.
- **Calibragem pelas conversas da momoi** (`calibragem.conversas_momoi`, só leitura): 90 conversas, 408 PPVs, todos destravados (só dá para ver o que veio antes de venda). Novos limiares `primeiro_ppv_min_msgs_fa` 11 e `primeiro_ppv_max_msgs_fa` 24 (1º PPV de quem nunca comprou; pedir ou rajada continuam vendendo na hora), Dominante `aquecimento` 4/9, normal máx 11, `reforco_ppv_s` [0,150], `ppv_abandonado_min` 30 confirmado, piso de oferta de Pagante R$ 103,90.
- **Não feito / diferente do pedido**: memória não grava sozinha (1 clique); as abas não gravam mensagens nem PPVs no banco (isso continua sendo do Aura); nenhum arquivo do Aura foi alterado.

## 20g. v2.2.1 (11/11/2026: doca que basta para atender)
- **Dados do lead acima da sugestão** (pedido do usuário): `dadosLead(res, total)` desenha o bloco `.lead` dentro do cabeçalho do fã, no painel inteiro e na doca. Linha 1 = dinheiro (total, nº de compras, última compra de conteúdo, há quantos dias, selos). Linha 2 = o que se sabe dele (`res.dados` das notas `chave: valor`, perfil, até 3 tags, a nota livre mais recente, "compra em N contas", gasto dos 7 primeiros dias).
- **Topo da doca**: `#faTopo` (só em `body.mini`) = nome do fã + até 2 selos (`SELO_CURTO`) + relógio (espera, follow-up do PPV ou "em dia ✓").
- **⚡ na doca**: botão `.btn.nav.adaptar` na barra do roteiro e tecla `A`. As versões da IA entram no lugar das variantes (`‹ 1/3 ›` passa por elas); clicar de novo volta ao roteiro normal. Continua passando por `alertas()` e `revisor()` antes de aparecer.
- **Próximo da fila**: `proximos()` ordena as salas com mensagem não lida (menos a aberta): 1) lembrete vencido; 2) fã grande (`gasto` na lista ≥ `coach_regras.json > proximo.grande_brl`, 1000); 3) quem escreveu hoje, menor folga primeiro, online na frente; 4) sem hora conhecida; 5) mensagens de outro dia, por quem gastou mais. Aparece no rodapé da doca (`linhaProximo()`: "★/▶ Próximo: nome · espera · msgs · gasto +N") e, sem conversa aberta, como lista "Abra na Privacy, nesta ordem" (3 nomes). O Delta só indica: não abre conversa.
- **Lembrete por fã**: botão ⏰ no bloco do lead ou tecla `L`; cada clique passa para o próximo tempo de `coach_regras.json > lembretes.minutos` (10, 30, 60) e depois desliga. `chrome.storage.local.lembretes = [{k, conta, nome, min, em, avisado}]`. Ao vencer: bipe (se o som estiver ligado), `body.urgente-lembrete` (borda ouro pulsando) e o fã vai para o 1º lugar do "Próximo" ("⏰ Voltar agora"). Some ao abrir a conversa dele ou depois de 6 h.
- **Nota rápida**: botão ＋ no bloco do lead ou tecla `N` abre um campo de 1 linha; Enter grava com `painel_nota` (a mesma função que a aba Ficha já usava), Esc cancela. Notas `chave: valor` viram dado do lead na hora.
- **Rodapé da doca** (`barraDoca()`): à esquerda os chips do 1º `{campo}` que falta, ou o "Próximo"; à direita ✓ Usei e Copiar.
- **Diagnóstico de leitura**: `leitor.js` manda `diag = {vistas, lidas, avisos, sem_id, sala}` (só contagens). Com conversa aberta e `lidas === 0` o painel mostra faixa vermelha "Não li as mensagens desta conversa… dê F5 na Privacy" em vez de sugerir no escuro; no fim da aba Delta há a linha "Leitura da tela: X de Y mensagens lidas".
- **PPVs vistos na tela → banco**: com `coach_regras.json > gravar_ppvs: true`, o painel chama `painel_ppvs` (função do Aura, sem alteração) com os PPVs da conversa aberta (preço, hora, pago ou não; nenhum texto). É o que alimenta placar, conversão e relatório de turno quando o Aura não está instalado. `false` desliga. **Isto muda o que a 20f dizia** ("as abas não gravam PPVs no banco").
- **Correções de 11/11 (tarde)**: `el()` achata filhos em qualquer profundidade (`flat(Infinity)`); antes a lista "Abra na Privacy, nesta ordem" aparecia como "[object HTMLDivElement]". Nota do roteiro `VD_ENTRADA_DOM` não cita mais preço antigo (R$69,90–89,90); manda usar a faixa mostrada.
- **Prévia local** `teste/previa/servidor.mjs` (+ `shim.js`): serve o `painel.html` de verdade em `http://127.0.0.1:4391/painel?c=vip|novo|ppv|vazio[&mini=1][&conta=…]` com `chrome.*`, banco e IA de mentira. Não abre Chrome e nada sai para a internet. É como se confere o visual agora.
- **IA (`coach-ia` versão 5, publicada em 11/11/2026 com o sim do usuário)**: no teste real a função esperava a Grok por 20 s e devolvia 504 (o `grok-4.7` usa esforço de raciocínio "high" por padrão). Agora manda `reasoning_effort` = secret `AI_EFFORT` ou "low"; se a xAI recusar o campo (400/422), tenta uma vez sem ele; registra só status e tempo. No painel, `coach_regras.json > ia.timeout_ms` passou de 12000 para 25000 para mostrar a resposta ou o erro real da função. Versão 5 medida no real: 12,1 s na xAI, 14,2 s no total.
- **IA versão 6** (publicada em 11/11/2026 com o sim do usuário): modelo padrão `grok-4.20-0309-non-reasoning` (sem raciocínio, segundo a página da xAI); se a xAI recusar o modelo (400/403/404/422), cai no `grok-4.7` com esforço "low". O secret `AI_MODEL`, se existir, tem prioridade e desliga a troca. O registro mostra "coach-ia: <modelo> respondeu <status> em <ms> ms". Medido no real (11/11/2026 17h54): `grok-4.20-0309-non-reasoning` respondeu em 1,6 s; função inteira 3,2 s (antes 14,2 s).
- **Sem SQL novo** nesta versão. Banco: `delta_coach_v2_0_1`, `delta_coach_v2_2`, `delta_coach_v2_2_radar_fix`.

## 20h. v2.3 (Modo Palco + seletor de modelo)
- **Por quê**: no Cockpit 3x2 a Privacy fica com 480 px e entra no layout de celular (lista OU conversa). No Palco a tela inteira é de UMA modelo por vez: Privacy à esquerda em largura de desktop (lista + conversa juntas) e o Delta inteiro na coluna da direita. As 3 contas continuam abertas, empilhadas no mesmo lugar, lendo a tela e publicando no `coach_radar`.
- **Layout** (tela 1440×860): Privacy `left 0, top 0, 1030 × 860`; Delta `left 1030, top 0, 410 × 860`. `arrumar_cockpit.ps1` e `abrir_3_perfis.ps1` têm `-Modo palco` (padrão) e `-Modo 3x2` (o Cockpit antigo); no Palco a largura da Privacy é `área útil − 410`.
- **fundo.js**: `posAcoplada()` marca `palco = w.width >= 1000 && cabeAoLado` (tolerância de 8 px à direita). No Palco a janelinha é `{left: w.left + w.width, top: w.top, width: 410, height: w.height}` e o mini é ignorado. `marcarPalco(p)` grava `chrome.storage.local.palco` e, no Palco, `mini: false`. Continua só `chrome.windows.update(coachJanela, …)`.
- **painel.js**: `chrome.storage.onChanged` acompanha `palco` e `mini`; `body.palco` some com o ▴, com a tecla M, com a marca e com o ✓ Usei/Copiar repetidos do topo (no Palco o cartão do roteiro fica sempre à vista, com os dois botões). O selo da conta sai: a aba acesa já diz qual é.
- **Seletor de modelo** (`#radarGlobal`): 3 botões `.rg` em 2 linhas: `● Nome · ATIVA | Alt+N` e `★ VIPs esperando · ⏱ maior espera · 💬 não lidas` (+ `⏰` com follow-up vencido). A da janela tem borda e fundo na cor da conta (`--c`); as outras ganham `.rg-pulso` quando há VIP esperando, follow-up vencido ou espera acima de `coach_regras.json > radar.sla_s` (180 s; vermelho nesse caso). Aparece mesmo sem dados do radar (contadores em "…"). No mini continua só a bolinha das outras contas.
- **Troca de janela**: uma extensão não enxerga a janela de outro perfil, e o `estatico.mjs` não deixa o painel falar com nada além do Supabase. Então o pedido sai no **título da própria janelinha**: `tituloJanela()` mantém `Delta · <rótulo>` e `pedirTroca(conta)` (clique na aba ou Alt+1/2/3 no painel) escreve `Delta · Arruda » Luna #<n>` por `palco.troca_espera_ms` (2500 ms). Se a janelinha não perder o foco nesse tempo, o painel avisa que falta o ajudante. Ordem do Alt+N: `coach_regras.json > palco.teclas`.
- **Ajudante `trocar_modelo.ps1`** (Windows, fora da extensão; roda no fim do `arrumar_cockpit` e do `abrir_3_perfis`): a cada 120 ms lê os títulos `Chrome_WidgetWin_1`; casa cada Delta com a Privacy do **mesmo perfil** pelo AppUserModelID da janela (`…UserData.ProfileNN`, visto no real: as 6 janelas estão no mesmo processo do Chrome) + PID; reserva Alt+1/2/3 (`RegisterHotKey`). Ao pedido: traz Privacy e Delta da modelo para a frente (`SetWindowPos` TOPMOST→NOTOPMOST com `SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE`) e dá o foco à Privacy (`AttachThreadInput` + `SetForegroundWindow`). Clicar numa janela de uma modelo traz o par dela junto. Não move, não redimensiona, não envia tecla, clique ou mensagem (conferido pelo `estatico.mjs`). `-Listar` só mostra o que enxerga.
- **Prévia**: `node teste/previa/servidor.mjs` → `http://127.0.0.1:4391/teste/previa/palco.html` (1440×860: Privacy de mentira de 1030 px + o painel de verdade de cada modelo; a página faz o papel do ajudante lendo os títulos). `/painel?…&palco=1` abre um painel sozinho no Palco.
- **Abrir sozinho (2.3.1)**: no real, o `abrir_3_perfis` abriu as 3 Privacy e nenhum Delta (o Delta só abria pelo ícone). Agora o `fundo.js` escuta o 1º `coach_estado` de cada aba (o leitor já mandava; nada mudou nele) e, se o Delta do perfil estiver fechado, chama `abrirCoach(aba.windowId)`. Uma vez por aba (`chrome.storage.session.auto_<tabId>`): fechou, só volta pelo ícone. `coach_regras.json > palco.abrir_sozinho` (true) liga/desliga. Visto no real (11/11, 19h41): depois de recarregar a extensão e dar F5, os 3 Deltas abriram sozinhos, cada um em 410×860 ao lado da sua Privacy de 1030 px (Arruda já pela Web App, sem barra de endereço).
- **Só Web Apps**: `arrumar_cockpit.ps1` arruma só janelas "Privacy | Chat" sem " - " no título (uma janela comum do Chrome com a Privacy numa aba vira "Privacy | Chat - Google Chrome" e fica de fora) e, no Palco, todas elas (não só 3). O ajudante prefere a Web App ao casar o par e, ao abrir, fecha um ajudante antigo ainda aberto (libera o Alt+1/2/3). Visto no real em 11/11: com uma 4ª janela comum minimizada, a Web App da Arruda tinha ficado de fora.
- **Sem SQL novo.** Visto no real (11/11, 18h37): Luna e Louise no Palco (Privacy 1030×860 em 0,0 e Delta 410×860 em 1030,0), seletor com as 3 abas, ajudante casando Arruda=Profile30, Luna=Profile31, Louise=Profile34. Visto no real às 18h40: Alt+1/2/3 trouxe Arruda, Luna e Louise para a frente (confirmado pelo usuário), Arruda em 1030 + 410 lendo a conversa, radar das 3 contas no seletor. Nessa hora ainda rodava o ajudante de antes da correção das "janelas comuns".
- **Risco conhecido**: o Chrome no Windows trata janela totalmente coberta como escondida e pode desacelerar os relógios dela; o radar das 2 contas de trás pode atualizar mais devagar (até 1 min). Ele só marca "off" depois de `radar.offline_min` (3 min).

## 20i. v2.3.2 (IA que lê a conversa)
- **Problema (usuário, 12/11/2026)**: as versões do ⚡ saíam genéricas e "não liam a conversa". Medido nos registros da `coach-ia`: os pedidos tinham 0,6 a 1,3 KB (só um tem 2,9 KB) — praticamente só o roteiro, quase nenhuma mensagem. E o pedido mandava "reescrever o roteiro base mantendo o tom", então a saída era uma paráfrase do roteiro.
- **O que fica salvo** (conferido só em leitura): `central.emp_mensagens` = 0 linhas (é onde o Aura grava as conversas com `painel_msgs`; o Aura não está instalado nesses perfis); `central.delta_msgs` só tem as contas momoi e morieris (do leitor antigo). Ou seja: o texto das conversas da Arruda, Luna e Louise NÃO é salvo em lugar nenhum. O Delta guarda só jogadas (✓ Usei), PPVs vistos na tela (preço, hora, pago; sem texto), números do radar e as notas/memória que você mandar salvar. A IA vê só o que está na tela no momento do ⚡.
- **Painel**: manda até `ia.max_msgs` = 60 mensagens de até `ia.max_chars_msg` = 600 caracteres (antes 30 × 400), cada uma com `ha_min` e o PPV marcado (preço, pago); mais `estilo` (espelho), `termometro`, `dados` (das notas), `fase_motivo` e `usados` (roteiros já usados com ele). Mostra "A IA leu: …" (o que ela entendeu) e quantas mensagens da tela foram.
- **Função `coach-ia` v7** (publicada em 12/11/2026 com o sim do usuário): esquema ganha `leitura`; o pedido virou "1) leia a conversa e diga o que ele disse por último; 2) 3 versões que RESPONDEM a ele com 1 detalhe concreto dele, espelhando o jeito; o roteiro é exemplo de tom e objetivo, não para copiar; proibido frase que serve para qualquer fã; não repetir o que a conta já mandou". Modelo continua `grok-4.20-0309-non-reasoning`.
- **Limite que continua**: o Delta não rola a conversa (é passivo), então a IA só vê as mensagens que a Privacy já carregou na tela.

## 20j. v2.3.3 (conversas salvas para a IA)
- **Pedido do usuário (12/11/2026)**: salvar as conversas e a IA ler o histórico.
- **Gravar** (`enviarMsgs()`): a cada leitura da conversa aberta, o painel manda para `painel_msgs` (função do Aura, sem alteração → `central.emp_mensagens`: msg_id, sala, conta, fa_id, de_fa, em, tipo, texto até 4000) só as mensagens com id de 24 hex ainda não mandadas nesta janela (repetida é ignorada no banco). Exige ficha carregada da mesma conversa e conta atendida. Liga/desliga: `coach_regras.json > gravar_msgs`. Só grava a partir de quando ligou.
- **Ler** (`coach_conversa(p_fa bigint, p_sala text, p_conta text, p_limite int default 80)`, seção 15 do `coach_sql.sql`): security definer, `search_path ''`, `coach_pode()`, sem anon; busca por `fa_id` (índice `emp_mensagens_fa_idx` que já existe) + sala + conta traduzida de `profile_name` para `emp_contas.conta` ("xlunavitaligratis" → "Luna"); devolve as últimas 1–200 em ordem de hora. Aplicada em 12/11/2026 (migração `delta_coach_v2_3_3_conversa`, com o sim do usuário) e conferida: definer, `search_path ''`, `coach_pode()`, sem anon/public.
- **IA**: `adaptar()` junta `coach_conversa` + tela (a tela vale por cima, por id), ordena por hora e manda as últimas `ia.max_msgs` (60). "A IA leu" mostra quantas vieram do histórico salvo, fora da tela. `ia.usar_historico: false` volta a usar só a tela. Sem a função no banco, usa só a tela (sem erro).
- **Defeito antigo achado (não corrigido)**: `coach_ppvs` e `coach_placar` comparam `emp_ppvs.conta` com o profile_name, mas o Aura/Delta gravam `emp_contas.conta`; para a Luna ("Luna" ≠ "xlunavitaligratis") os PPVs não aparecem no placar nem no estado do PPV. Arruda e Louise não são afetadas (nomes iguais).

## 20k. v2.3.4 (exemplos reais para a IA)
- **Pedido do usuário (12/11/2026)**: usar as conversas da momoi como base. Medido só em leitura: 90 conversas, 27.529 mensagens (14.510 da modelo, 13.019 dos fãs), mediana de 298 por conversa, 408 PPVs vendidos (todos destravados).
- **`coach-ext/data/coach_exemplos.json`** (`coach-exemplos-1.0`): 28 exemplos em 5 situações — `abertura` (7: a modelo respondeu e o fã voltou em ≤10 min), `reabrir` (2: depois de ≥20 h parado, o fã respondeu em ≤3 h), `pediu` (6), `primeiro_ppv` (6), `recompra` (7: PPV vendido ≤3 h depois de outro). Cada um: `fa` (última msg do fã), `conta` (o que a conta mandou antes), `msg` (a legenda do PPV vendido ou a mensagem respondida), `preco` (só referência, não vai à IA). Extraídos por SQL de leitura, com nomes de `delta_salas` trocados por `{nome}` e filtro de link/@/número longo/contato/pix/encontro/menoridade/dominação/humilhação/terceiros; depois curados à mão (alguns textos encurtados; "objeção de preço" ficou de fora por falta de exemplo bom). `por_pedido`: 4.
- **Painel**: `situacaoExemplo(res)` → objeção/vulnerável: nenhum; `RE_*`, reengajamento ou selo esfriou: `reabrir`; abertura/qualificação/rapport: `abertura`; `VD_PEDIU_PRECO`: `pediu`; hora de vender/pós-compra: `primeiro_ppv` (selo "nunca" ou total 0) ou `recompra`. `exemplosPara(res)` escolhe `por_pedido` exemplos da situação, fixos por conversa (hash da sala), e manda em `corpo.exemplos`.
- **Função `coach-ia` v8** (publicada em 12/11/2026 com o sim do usuário): bloco "EXEMPLOS REAIS QUE FUNCIONARAM … imite o jeito, não copie" no pedido; regra nova no sistema: imitar tamanho/ousadia/como responde/pergunta no fim, nunca copiar frases, nomes ou conteúdo; "nada de dominação ou humilhação".

## 20l. v2.3.5 (compra vista na tela conta)
- **Visto no real (11/11/2026, 23h16)**: fã que acabou de comprar (venda na tela, R$ 33,22) aparecia com "sem compra" e selo "Nunca pagou", porque `nuncaPagou` só olhava a ficha do banco, que ainda não tinha a venda. O preço já estava certo.
- **Motor**: `nuncaPagou` agora também é falso quando há compra vista (`ultCompraValor > 0`, `compraTelaEm` ou PPV pago na lista de PPVs). **Painel**: o bloco do lead mostra "R$ X · comprou agora (vista na tela)" em vez de "sem compra"; `situacaoExemplo` usa `total` OU `ultCompraValor` para escolher `recompra`. 2 testes novos no `unit_v22.mjs` (58 ok). Sem SQL e sem mudar a função da IA.

## 20m. v2.3.6 (o que faltava do Aura)
- **Pedido do usuário (12/11/2026)**: ficar só com o Delta. Comparando as funções do banco chamadas pelos dois, só `painel_extra` e `painel_dia` eram exclusivas do Aura; as duas foram trazidas (funções do Aura, sem alteração).
- **Ligação só por nome** (`painel_extra.provavel`): o painel chama `painel_extra(p_fa, p_conta, p_sala)` quando a ficha abre. Se a ligação fã ↔ comprador foi só pelo nome: alerta "Ligação só por nome…", chip "⚠ só por nome" no lead (também na doca), e o motor recebe `ligacaoSoNome` → ignora total/compras/por_conta da ficha (`fd = null`) e usa só a tela; notas e dados dele continuam. A IA não recebe as compras da ficha nesse caso.
- **Preço de quem já pagou sem última compra lida**: antes caía na entrada de quem nunca pagou (tipo `sem_dado`). Agora, com `total > 0`, oferta de pagante a partir de `tier.piso_oferta` ou `preco.pagante_oferta_min_brl`, até +`degrau.padrao_pct`. `nuncaPagou` com só-por-nome = `false` quando a Privacy mostra total > 0 ou há compra vista.
- **Tempo médio de resposta do dia** (`painel_dia`, a cada 1 min): "resposta média hoje m:ss (N respostas)" no resumo da Fila e no placar. Medido nas conversas salvas em `emp_mensagens` (agora o Delta grava).
- Testes: 3 novos no `unit_v22.mjs` (61 ok). Sem SQL novo e sem mudar a função da IA.


## 20n. v2.3.7–2.3.8 (painel.js em módulos)
Começa a quebrar o `painel.js` (1.571 linhas num arquivo só) em módulos. **Nenhuma mudança de lógica**: as linhas foram recortadas e colocadas em outro arquivo, na mesma ordem.
- **`painel-abas.js` (243 linhas)**: o bloco "Painel Único" (abas Delta · Ficha · Fila · Sumidos · Mais) saiu inteiro do `painel.js`. O `painel.js` foi de 1.571 para 1.332 linhas.
- Carrega **antes** do `painel.js` no `painel.html`. Os dois são scripts clássicos, então o estado (`est`, `aba`, `R`…) continua compartilhado sem precisar de `import`/`export`.
- **`teste/estatico.mjs`**: agora lê todos os `painel*.js` da pasta e aplica as conferências de segurança em cada um (não só no `painel.js`), mais uma nova: todo `painel*.js` precisa estar declarado no `painel.html`.
- Conferido na prévia: as 5 abas foram abertas antes e depois do corte e o texto da tela saiu **idêntico** nas cinco (mesmo tamanho e mesmo hash), sem erro no console. `estatico.mjs` "tudo ok" e `unit_v22.mjs` 61 ok.

**2ª e 3ª etapas (v2.3.8)**, pelo mesmo método e com a mesma conferência:
- **`painel-ia.js` (115 linhas)**: o bloco `⚡ Adaptar` (Edge Function `coach-ia` + memória do fã).
- **`painel-turno.js` (39 linhas)**: o relatório `📊 Fechar Turno`.
- `painel.js`: **1.571 → 1.185 linhas** (−25%). Ordem no `painel.html`: `painel-turno.js` → `painel-ia.js` → `painel-abas.js` → `painel.js`.
- Conferido na prévia antes e depois de cada corte: 5 abas + fluxo completo do `⚡` (clique, resposta, revisor descartando a versão com contato externo) + `📊 Fechar Turno`. **Os 7 deram texto idêntico**, mesmo tamanho e mesmo hash, sem erro no console.
- Ainda por fazer: o miolo do `painel.js` (estado, banco, desenho) continua junto; é o pedaço mais entrelaçado e exige mais cuidado.

## 20o. v2.3.9 (4 correções cirúrgicas)
- **`coach_sql.sql` (ainda NÃO aplicado no banco)**: nova `central.coach_nomes_conta(p_conta)` (interna, sem acesso de anon/authenticated) devolve os nomes da mesma conta ("Luna" + "xlunavitaligratis"). `coach_ppvs`, `coach_placar`, `coach_conversao_semana`, `coach_conversao_variantes`, `coach_placar_chatter` e `coach_relatorio_turno` passam a comparar `emp_ppvs.conta = any(...)`. Isso resolve a Luna fora de `coach_ppvs`/`coach_placar`. No relatório de turno, o top de roteiros ganhou o mesmo "not exists" da conversão (uma venda conta em um roteiro só).
- **`leitor.js`**: no fallback de PPV por mídia, só vira PPV se existir o elemento `SEL_PAGO`, e o preço vem só de `txt(pago)` (nunca do texto da mensagem inteira).
- **`painel.js`**: `cenaSala` e `varsSala` ficam salvos em `chrome.storage.local` (`estadoSalas`, com a data do dia, igual `registradas`) por `salvarEstadoSalas()`; restaurados na abertura se for o mesmo dia.
- **`supabase/functions/coach-ia/index.ts`**: modelo padrão `claude-haiku-4-5` (função ainda NÃO republicada).

## 20p. v2.3.10 (lembranças antigas dele na IA)
- **Banco**: nova `public.coach_recall_fatos(p_fa, p_busca, p_limite)` (migração `delta_coach_v2_3_10_recall_fatos`): só LEITURA das mensagens DELE em `emp_mensagens` (busca de texto em português), até 10, mais novas primeiro. `security definer`, `coach_pode()`, sem anon.
- **`painel-ia.js`**: antes do ⚡, pega as palavras mais fortes das últimas 3 falas dele, chama a função para cada uma (até 4) e manda até 5 lembranças que NÃO estão na conversa enviada (`lembrancas`). Sem a função no banco ou `recall.ativo:false` em `coach_regras.json` (`ia.recall`): como antes.
- **`coach-ia` v9 (publicada)**: o pedido ganhou o bloco "LEMBRANÇAS ANTIGAS DELE", só usado se encaixar. Modelo padrão da Anthropic continua `claude-haiku-5-5` (Grok não mudou).
- **Não feito**: busca "híbrida" por significado (precisaria de embeddings/pgvector e outro provedor).

## 20q. v2.3.11 (lembranças: sem acento e com erro de digitação)
- **Banco** (migrações `delta_coach_v2_3_11_extensoes_busca` e `delta_coach_v2_3_11_recall_sem_acento`): ligadas as extensões `unaccent` e `pg_trgm` (schema `extensions`); `coach_recall_fatos` agora acha "acai" em "açaí", "sao paulo" em "São Paulo" e "trabaio" em "trabalho" (similaridade de palavra ≥ 0,6). Testado no banco com frases de exemplo e `search_path = ''`. Nenhuma mudança na extensão (continua 2.3.10) nem na `coach-ia`.

## 20r. v2.3.12 (pesquisa de repositórios: o que entrou)
Fonte: pesquisa de 11/11/2026 (bandits, memória de agentes, busca no Postgres, avaliação de prompts, churn). Nada foi copiado de repositório; entraram as ideias.
- **Thompson Sampling (`motor.js`, `ordenarVariantes`)**: `variantes_auto.algoritmo = "thompson"` em `coach_regras.json`. Cada variante sorteia uma taxa Beta (Marsaglia-Tsang, JS puro) a partir de vendas/usos; a maior vai na frente. A "crença inicial" é a taxa média do roteiro (`forca_prior`, 4), então variante sem dado não passa na frente de quem já vende. O sorteio usa semente (sala + roteiro + dia + modo): a ordem não muda a cada redesenho. Continua exigindo `min_usos` (10) do roteiro; `"guloso"` volta à regra antiga. +9 testes (`unit_v22.mjs`, agora 70).
- **Teste de regressão da IA (`teste/ia/`)**: promptfoo (rodado à mão, com chave sua; NÃO roda sozinho nem abre janela). `gerar_sistema.mjs` extrai o prompt publicado em `prompt.json`; `casos.yaml` tem 6 conversas INVENTADAS; `checks.cjs` confere: 3 versões, sem R$, sem WhatsApp/Pix, sem desconto, sem encontro, só acolher quando o fã diz que está devendo, campo `{chave}` intacto e memória só com o que o fã disse. Os checks foram conferidos contra saídas de exemplo; a rodada com a IA de verdade ainda NÃO foi feita.
- **Sumidos pelo ritmo (migração `delta_coach_v2_3_12_sumidos_ritmo`)**: `coach_ex_assinantes` ganhou a coluna `atraso` (dias desde a última compra ÷ intervalo médio dele nesta conta, só com 3+ compras). Ordena por total × peso: atraso de 1 a 3 intervalos pesa 1,5 (mais fácil de recuperar), acima de 8 pesa 0,4 (provável sumiço de vez). A aba Sumidos mostra "(2,6× o ritmo dele)" entre 1,5 e 8. É uma aproximação simples do "probabilidade de estar ativo" do BG/NBD (`lifetimes`, Python), sem ajustar modelo.
- **Fica para depois**: busca por significado (pgvector está disponível, mas o `gte-small` do Supabase é só inglês; português pediria o multilingual-e5-small), fatos do fã com data (ideia do Graphiti).

## 20s. v2.3.13 (VanJS na camada de renderização + remendo do DOM)
- **`coach-ext/vendor/van.js`**: VanJS 1.5.5 (MIT, pacote npm `vanjs-core@1.5.5`, ~5 KB). Única alteração no arquivo: `export default {` virou `self.van = {` (o painel usa scripts comuns, não módulos). Carrega antes do `motor.js` no `painel.html`. Sem CDN: a extensão não baixa nada de fora.
- **`el()` (painel.js)** agora monta o elemento por `van.tags[tag]`. Mesmo uso de antes (≈250 chamadas inalteradas); mesmas regras de atributo (null/false some, true vira vazio, `on*` vira ouvinte). O VanJS só constrói elementos; ele não compara telas. A lógica do painel continua igual.
- **`remendar(vivo, novo)`**: a cada segundo o `desenhar()` monta a tela em um `<div>` solto (`desenharCorpo`) e copia para o `#conteudo` só o que mudou (texto, atributo, bloco que entra/sai) em vez de `replaceChildren()`. Regras de segurança: o campo em foco e tudo ao redor dele nunca é trocado nem apagado; elemento com clique/tecla próprio, botão e campo de digitação são trocados inteiros (ouvinte novo vale); elemento só de exibição é atualizado no lugar. Efeito: o painel não pisca, mantém a rolagem e **continua atualizando mesmo com você digitando uma nota** (antes ele congelava).
- **Verificação (prévia local, sem Chrome real)**: texto idêntico ao da 2.3.12 em 4 cenários × 4 abas (16 comparações, 0 diferenças); sem erro no console; 106 de 129 nós de exibição sobreviveram a 3,5 s de redesenhos (os demais ficam dentro de botões, que são trocados de propósito); com um campo da Ficha em foco e texto digitado, o campo manteve foco e valor e um texto adulterado em outro ponto foi corrigido em 2,5 s. `estatico.mjs` tudo ok; `unit_v22.mjs` 70 ok.
- **Ainda não visto no Chrome real**: o painel com a Privacy aberta, as 3 contas e o Modo Palco.

## 20t. v2.3.14 (compliance enquanto digita · Aho-Corasick)
- **`motor.js`**: `construirAC` / `buscarAC` / `varrerRisco` (Aho-Corasick em JS puro, ~35 linhas, sem dependência; o `pyloque/fastscan` é de Python, por isso foi escrito aqui). Uma varredura só no texto digitado acha todos os termos de todos os grupos; vale só palavra/frase inteira, sem acento e sem diferença de maiúscula (mesma regra dos outros alertas). Termo dentro de outro achado não repete ("te garanto" cobre "garanto").
- **Lista em `coach_regras.json > compliance_digitando`** (nada chumbado): `ativo`, `som` e 3 grupos iniciais, origem HIPOTESE, para editar: `garantia_promessa`, `preco_final`, `desconto_agressivo`. Cada grupo tem `id`, `motivo` e `termos`. Complementa (não substitui) `alertas_composer` (que já cobre "só hoje", "promoção", "faço por menos"...).
- **Painel**: o alerta entra em `alertas()` como **aviso** amarelo marcado `digitando` (um grupo que peça `bloqueio_visual` é rebaixado a aviso). `avisarRisco()` toca um bipe grave (440→330 Hz) **uma vez por termo novo na sala**, só com o som do Delta ligado (🔔) e `som:true`; apagar o termo e digitar de novo avisa de novo. **Nunca bloqueia o envio nem altera o texto.** O `leitor.js` não mudou (já lia o campo de digitação; continua passivo).
- **Verificação (prévia local)**: texto "te garanto… preço final" gerou 2 avisos amarelos e 1 bipe; mais 2 s com o mesmo texto não repetiu o bipe; texto apagado limpou os avisos; digitar de novo bipou de novo; sem erro no console. `unit_v22.mjs`: 82 ok. `estatico.mjs`: tudo ok. Não visto no Chrome real.

## 21. Testes v2
- **Testes que existem hoje**: `teste/estatico.mjs` (desde a v2.3 também confere `trocar_modelo.ps1` e `arrumar_cockpit.ps1`: sem tecla/clique/mensagem/rede, só ASCII, ajudante sem mover nem redimensionar) e `teste/unit_v22.mjs` (verificações do motor). Nenhum abre janela.
- **`teste/e2e_real.mjs` foi REMOVIDO em 11/11/2026 a pedido do usuário** (abria janelas do Chrome por cima do atendimento). Ele carregava a extensão num Chrome real com Privacy e Supabase simulados; chegou a 501 verificações na v2.2, mas já estava desatualizado para o ⚡ na doca e o bloco do lead. Não recriar sem o usuário pedir. `teste/preview_cockpit.html` (simulação 1440×860 com o `painel.css` de verdade) continua e abre com dois cliques.
- `teste/estatico.mjs`: passividade do `leitor.js`, nenhuma escrita em abas, `chrome.windows.update` só na janela do Delta, JSON só em `coach-ext/data/`.
- `teste/unit.test.js`: 82 testes (v1 + dominante + 15 gaps + 3 janelas + passividade).
- `teste/sql.test.mjs` (PGlite): instala v1, atualiza para v2, checa modo, placar, histórico, conversão, anon negado, 1 versão do registrar.
- `teste/e2e.mjs` (Chrome real, Privacy de mentira, Supabase interceptado): dominante, troca de modo, aviso de repetido, compacto 300 px, alertas digitando, DOM da Privacy intocado; `--ppv404` sem RPCs v2.
