# Guia de uso do Delta (versão 2.5.1)

Isto é como usar. A lista do que mudou em cada versão é a `LEIA-ME.txt`.

**Em uma frase:** o Delta lê a conversa, diz em que fase o fã está e entrega o
texto pronto. Ele pode abrir a conversa e pôr o texto no campo — mas **quem
aperta Enter é sempre você**.

---

## 1. O turno em três momentos

**Abrir (uma vez)**
1. Dois cliques em `abrir_3_perfis.bat` — abre as 3 contas no Modo Palco.
2. Dois cliques em `arrumar_cockpit.bat` — arruma as janelas. Deixa uma janela
   preta aberta: **minimize, não feche** (é ela que faz o Alt+1/2/3).

**Durante (o ciclo que se repete)**
1. No topo, veja qual modelo tem gente esperando (o nome pisca).
2. `Alt+1` / `Alt+2` / `Alt+3` para trocar de modelo.
3. `Espaço` ou clique no nome → a conversa abre na Privacy.
4. Leia a fase e o texto. Se a IA já adaptou, ele vem adaptado.
5. `V` põe o texto no campo → você revisa → **Enter seu**.

**Fechar**
- `📊 Fechar Turno` gera e copia o resumo das últimas 8 h.

---

## 2. As três formas de mandar o texto

| Como | Quando usar |
|---|---|
| **`C` · Copiar** | o padrão. Copia e marca como usado. Cole com Ctrl+V. |
| **`V` · Campo** | põe o texto direto no campo da Privacy. Menos Ctrl+V, menos dor no braço. Também marca como usado. |
| `←` `→` ou `1` `2` `3` | troca a variante antes de mandar |

As duas primeiras **marcam a jogada**, e é essa marca que ensina o Delta. Se
você selecionar o texto com o mouse, ele não aprende nada daquele atendimento.

Com um `{campo}` por preencher, o `V` recusa e diz qual falta.

---

## 3. Abrir a conversa certa sem caçar na lista

Clique no nome e a conversa abre na Privacy. Funciona em três lugares:

- o aviso **"Próximo da fila"**, no alto do painel;
- as linhas da aba **Fila**;
- o **"★ Próximo"** no rodapé da doca.

Ou só `Espaço`, que abre o primeiro da fila.

Se a conversa não estiver na lista já carregada da Privacy, ele avisa em vez
de sair procurando — role a lista e clique de novo.

---

## 4. A IA (⚡)

Ela roda **sozinha** quando o fã escreve e é a sua vez de responder. As
versões adaptadas entram no lugar do roteiro.

- As **3 versões aparecem sempre.** A que bate numa regra de risco vem com
  contorno vermelho e o motivo: *"Alerta: …"*. Ela não some — você decide.
- `A` (ou ⚡) volta ao roteiro escrito, e ele não insiste naquele roteiro.
- Freios: só na sua vez, uma vez por roteiro, 5 s entre pedidos, 60 por hora.
- Desligar de vez: `coach-ext/data/coach_regras.json` → `ia` → `automatico` →
  `ativo: false`.

---

## 5. Teclas

| Tecla | O que faz |
|---|---|
| `C` ou `Enter` | Copia o roteiro **e** marca como usado |
| `V` | Põe o texto no campo da Privacy (não envia) |
| `Espaço` | Abre o próximo da fila na Privacy |
| `←` `→` | Troca a variante (ou o passo da cena) |
| `1` `2` `3` | Vai direto na variante 1, 2 ou 3 |
| `A` | Liga/desliga a versão da IA |
| `N` | Nota rápida sobre o fã |
| `L` | Lembrete: 1× 10 min, 2× 30 min, 3× 1 h, 4× desliga |
| `M` | Minimiza (não funciona no Palco) |
| `Alt+1/2/3` | Traz a modelo 1, 2 ou 3 para a frente |

Não funcionam com o cursor dentro de um campo de texto.

---

## 6. Ler o painel

**Um só botão cheio:** o `Copiar`, vermelho. O resto é discreto de propósito.

**Sempre à vista:** fã, relógio, fase, texto e o Copiar.

**Quatro cartões (2×2), fechados mostram o número que importa:** Preço, Meta
do dia, Leitura do fã e Recursos. **Não precisa abrir para saber como está.**

**Faixas embaixo:** Mais avisos, Fila, Roteiros da semana e Diagnóstico. As
tracejadas são técnicas — não são para a sua próxima mensagem.

---

## 7. Avisos que não dá para ignorar

| O que aparece | O que significa |
|---|---|
| 🎯 **Ofertar agora** | sinal de compra lido. É a hora de pedir dinheiro. |
| **Faixa vermelha no topo** | não conseguiu ler a conversa. **F5 na Privacy.** Até lá, qualquer sugestão está no escuro. |
| **Alerta vermelho na versão da IA** | aquele texto bate numa regra de risco. Leia antes de usar. |
| **Bipe grave** | você digitou um termo de risco. Só aviso. |
| **Chip "N no prazo estourado"** | gente esperando demais. A Fila não abre sozinha. |
| **Borda pulsando em ouro** | um lembrete venceu. |

---

## 8. As abas

- **Delta** — o trabalho. É onde você fica 95% do tempo.
- **Ficha** — quem é o fã. Escreva `profissao: engenheiro` ou `recebe dia 5` e
  os roteiros passam a usar isso.
- **Fila** — quem está esperando (e clicável, veja o item 3).
- **Sumidos** — quem parou de responder.
- **Mais** — placar, extrato e o link da **visão de gestor**.

**Visão de gestor:** "Abrir numa aba", na aba Mais. Tela cheia só com números —
hoje por conta com meta, ticket e conversão; o turno; operadores; roteiros e
variantes que mais venderam. O botão **Montar curva** mostra sua receita hora a
hora (é sua, das salas que você atendeu, não a da casa). Olhe no fim do dia.

---

## 9. Modo Dominante

Botão no topo, alterna `Normal` / `Dominante`, salvo neste Chrome. Muda o tom
dos roteiros e mostra os próximos degraus de preço. Use com fã que já respondeu
bem a esse tom, não como padrão.

---

## 10. Quando der errado

| Sintoma | Solução |
|---|---|
| Sugestões não mudam ao trocar de conversa | F5 na Privacy |
| "Não trocou…" no Alt+1/2/3 | rodar `arrumar_cockpit.bat` de novo |
| "essa conversa não está na lista carregada" | role a lista da Privacy e clique de novo |
| "a Privacy desta janela não está aberta" | F5 na Privacy daquele perfil |
| ⚡ não responde | me avise (chave de IA no Supabase) |
| Versão antiga depois de atualizar | `chrome://extensions` nos 3 perfis + F5 |

---

## 11. O que ele aprende — e o que ele nunca faz

**Aprende**, a partir das jogadas marcadas: qual variante vende, quando ofertar
e quanto cobrar. Por isso vale sempre usar `C` ou `V`, nunca o mouse.

**Nunca faz**, e o teste automático impede: apertar enviar, simular Enter,
rodar em lote ou fingir ser gente para enganar a Privacy. Uma ação por clique
seu. O envio é sempre seu.
