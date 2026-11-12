# Anti-slop: o que NÃO fazer no visual do Delta

"Slop" = visual genérico de IA: bonito no print, cansativo em 8 horas de turno, igual a mil outros painéis.

## Proibido
- **Fonte Inter** (ou Poppins, Manrope etc. baixadas da web). Usar a fonte do sistema: o painel não faz pedido para fora.
- **Gradientes roxos / rosa-roxo / "aurora"** em fundo, botão, texto ou barra. Cor sólida sempre.
- **Texto com gradiente** (`background-clip:text`).
- **Cartão com borda colorida só à esquerda** (`border-left: 3px solid …`). Para estado, use um ponto (●) ou a cor do próprio texto.
- **Sombra em excesso**: nada de `box-shadow` grande em cartão. Profundidade vem do tom da superfície (s0 → s1 → s2).
- **Glow / brilho / anel pulsando** em mais de um lugar. A única animação permitida é a borda de urgência (e respeita `prefers-reduced-motion`).
- **Emoji como ícone de interface** em títulos e botões novos (🎯 🔥 ⚡ em todo lugar). Os que já existem no motor ficam; não criar novos.
- **Tudo em cartão**: cartão dentro de cartão dentro de cartão. Um nível de cartão por bloco.
- **Pílula para tudo**: chip só para estado curto (fase, tier, selo). Botão secundário é texto/fantasma.
- **CAIXA ALTA espaçada** em mais de um rótulo por bloco.
- **Glassmorphism**, blur de fundo, ruído, "bento grid".

## Preferir
- Superfícies quase pretas levemente quentes, identidade **vermelha** (não rosa: pedido do usuário em 12/11/2026), a cor da conta só no seletor de modelo.
- Linhas finas (1 px, 6–8% de branco) em vez de caixas.
- Alinhamento à esquerda e espaço em branco no lugar de divisórias.
- Números com `tabular-nums`.
