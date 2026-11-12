# Restrições do painel do Delta

## Larguras e modos (classes no `<body>`)
| Modo | Largura | Altura útil | Regra |
|---|---|---|---|
| Palco (`body.palco`) | 410 px | ~860 px | Alvo principal. Cartão da jogada inteiro acima da dobra. |
| Inteiro | 380–420 px | livre | Mesmo desenho do Palco, com o selo da conta no topo. |
| Compacto (`body.compacto`) | < 360 px | ~590 px | Mesmo conteúdo, espaçamento menor. Copiar acima da dobra. |
| Mini / doca (`body.mini`) | 300–466 px | ~155 px | SEM rolagem. 4 linhas: topo · lead · cartão (3 linhas de texto) · barra com Copiar. |

## Densidade baixa
- Grade de 4 px; respiro entre blocos de 16 px (12 px no compacto).
- No nível 1: no máximo 5 blocos visíveis antes das abas.
- Corpo 13.5 px; texto do roteiro 14.5 px (é o que o chatter lê e copia).
- Alvo de clique ≥ 28 px de altura (22 px só na doca).

## Modo mini (doca)
- Não mexer na estrutura de linhas da doca sem conferir na prévia `?mini=1` (466×157 e 300×157).
- Mostra só: conta, fã, relógio, fase + preço, instrução, texto (3 linhas), próximo da fila, ✓ Usei, Copiar.
- Alerta vermelho substitui a linha do fã. Nada mais aparece.

## Passivo sempre
- Nenhum elemento novo pode clicar, digitar, rolar ou enviar na Privacy. Botões do painel só mudam o próprio painel,
  copiam para a área de transferência ou gravam no banco do Delta.
- `leitor.js` não muda por causa de visual.

## Como conferir
- Prévia: servidor `delta-previa` → `/painel?c=vip`, `?c=novo`, `?c=ppv`, `?c=vazio`, com `&mini=1` para a doca;
  Palco em `/teste/previa/palco.html`.
