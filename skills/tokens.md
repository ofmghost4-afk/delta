# Tokens de design do Delta

Fonte única: o bloco `:root` no topo de `delta-zip/delta/coach-ext/painel.css`. Nada de cor ou tamanho solto no
resto do arquivo quando existir token. Tema único: escuro (o painel roda ao lado da Privacy à noite).

## Cor
| Token | Uso |
|---|---|
| `--s0` | fundo da janela |
| `--s1` | cartão / superfície 1 |
| `--s2` | superfície 2 (caixa do roteiro, campo) |
| `--s3` | hover, trilho de barra |
| `--linha`, `--linha2` | divisórias (fraca / média) |
| `--tx`, `--tx2`, `--tx3` | texto principal / secundário / apagado |
| `--acao`, `--acao-tx`, `--acao-h` | o ÚNICO botão cheio (Copiar) |
| `--conta` | cor da conta ativa (vem do `coach_regras.json`); só identidade, nunca botão |
| `--ok`, `--alerta`, `--perigo` | estado (verde / âmbar / vermelho) |
| `--dinheiro` | valores em R$ e VIP/Baleia (ouro) |
| `--*-bg` | fundo tingido de cada estado (8–12% de opacidade) |

Aliases antigos (`--bg`, `--fraco`, `--rosa`, `--ouro`, `--verde`, `--amarelo`, `--vermelho`) apontam para os novos,
para não quebrar estilos inline no JS.

## Tipografia
- Família: `--fonte` = pilha do sistema (SF / Segoe UI / Roboto). Sem fonte baixada.
- Escala: `--t-xs` 11 · `--t-s` 12 · `--t-m` 13.5 · `--t-l` 15 · `--t-xl` 18 · `--t-xxl` 26 (px).
- Pesos: 400 texto, 600 rótulo/botão, 700 nome/número. Nada de 800/900.
- `font-variant-numeric: tabular-nums` no corpo.

## Espaçamento (grade de 4)
`--e1` 4 · `--e2` 8 · `--e3` 12 · `--e4` 16 · `--e5` 24 · `--e6` 32 (px).

## Raio
`--r-s` 6 (chip, campo pequeno) · `--r-m` 10 (botão, caixa) · `--r-l` 14 (cartão) · `--r-full` 999 (só chips de estado).

## Movimento
`--rapido` 120ms. Só transição de cor/fundo. A borda de urgência é a única animação contínua.
