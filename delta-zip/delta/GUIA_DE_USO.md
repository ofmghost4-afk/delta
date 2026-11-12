# Guia de uso do Delta (versão 2.4.1)

Isto não é a lista do que mudou (essa é a `LEIA-ME.txt`). É como usar o Delta
bem, no dia a dia.

Antes de tudo, a regra que explica todas as outras: **o Delta só sugere. Quem
lê, escolhe e envia é você.** Ele nunca clica, nunca digita, nunca manda
mensagem. Se uma sugestão está errada, ignore — nada acontece.

---

## 1. O hábito que vale mais que todos os outros

**Use sempre o botão `Copiar` (ou a tecla `C`).** Nunca selecione o texto do
roteiro com o mouse.

O `Copiar` faz duas coisas ao mesmo tempo: põe o texto na área de
transferência **e** marca a jogada como usada. Essa marca é o que alimenta o
aprendizado — é assim que o Delta descobre quais variantes vendem mais e
começa a mostrar as boas primeiro.

Se você copiar com o mouse, a mensagem sai igual, mas o Delta fica cego: não
aprende nada daquele atendimento. Com o tempo a diferença é grande.

Se já copiou com o mouse sem querer, clique em `✓ Usei` para registrar.

---

## 2. A rotina de um turno

**Abrir (uma vez por turno)**
1. Dois cliques em `abrir_3_perfis.bat` — abre as 3 contas no Modo Palco.
2. Dois cliques em `arrumar_cockpit.bat` — arruma as janelas. Ele deixa uma
   janela preta aberta: **minimize, não feche** (é ela que faz o Alt+1/2/3).
3. Em cada conta, confira que o Delta está do lado direito da Privacy.

**Durante (o ciclo que se repete)**
1. Veja no topo qual modelo tem gente esperando (o nome pisca).
2. `Alt+1` / `Alt+2` / `Alt+3` para trocar de modelo.
3. Abra a conversa que o Delta indica como **próximo da fila** (no painel
   inteiro vem como aviso no topo; na doca, como `★ Próximo` no rodapé).
4. Leia a fase e o roteiro sugerido.
5. `C` para copiar, cole na Privacy, ajuste o que quiser, envie.

**Fechar**
- Clique em `📊 Fechar Turno`. Ele gera e copia um resumo das últimas 8 horas:
  faturamento, conversão, top 3 roteiros, baleias atendidas e quem ficou
  esperando.

---

## 3. Teclas (decore estas cinco)

| Tecla | O que faz |
|---|---|
| `C` ou `Enter` | Copia o roteiro **e** marca como usado |
| `←` `→` | Troca a variante do roteiro (ou o passo da cena) |
| `1` `2` `3` | Vai direto na variante 1, 2 ou 3 |
| `A` | ⚡ Liga/desliga a versão da IA para este roteiro |
| `N` | Nota rápida sobre o fã |
| `L` | Lembrete: 1× = 10 min, 2× = 30 min, 3× = 1 h, 4× = desliga |
| `M` | Minimiza o painel (não funciona no Modo Palco) |
| `Alt+1/2/3` | Traz a modelo 1, 2 ou 3 para a frente |

As teclas não funcionam quando o cursor está dentro de um campo de texto —
clique fora primeiro.

---

## 4. Ler o painel novo (2.4.1)

Existe **um só botão cheio** na tela: o `Copiar`, em vermelho. Se algum botão
está cheio e colorido, é esse. O resto (`✓ Usei`, `⚡`, `‹ ›`) é
propositalmente discreto — não é defeito, é para o seu olho não se perder.

**Nível 1 — sempre à vista:** o fã (nome e relógio grandes), a fase, o
roteiro sugerido e o `Copiar`. É o que muda a sua próxima mensagem.

**Nível 2 — quatro cartões, numa grade 2×2:**

| Cartão | O que mostra fechado |
|---|---|
| **Preço** | preço de entrada grande, o teto e o Pix |
| **Meta do dia** | quanto fez, de quanto é a meta, sua posição e a barrinha |
| **Leitura do fã** | termômetro N/10 e a cena |
| **Recursos** | quantos recursos da Privacy dão para usar |

Cada um já mostra fechado o número que importa — **não precisa abrir para
saber como está.** Clique só quando quiser o detalhe; aberto, o cartão ocupa
a largura toda.

**Nível 3 — faixas embaixo:** Mais avisos, Fila, Roteiros da semana e
Diagnóstico. As duas últimas vêm com borda tracejada, que é o jeito do painel
dizer "isto é técnico, não é para a sua próxima mensagem".

O painel lembra o que você deixou aberto.

---

## 5. Os avisos que você não deve ignorar

| O que aparece | O que significa |
|---|---|
| 🎯 **Ofertar agora** | O Delta leu sinal de compra (compra recente, sequência boa, resposta rápida). As variantes de oferta sobem para o topo. É a hora de pedir dinheiro. |
| **Faixa vermelha no topo** | Ele não conseguiu ler a conversa. **Dê F5 na Privacy.** Enquanto isso, qualquer sugestão está no escuro — não confie. |
| **Bipe grave** (uma vez) | Você digitou um termo de risco. É só aviso, nunca bloqueia; releia a frase antes de enviar. |
| **Chip vermelho "N no prazo estourado"** | Tem gente esperando demais na fila. A aba Fila **não abre mais sozinha** — é você que decide ir lá. |
| **Borda pulsando em ouro** | Um lembrete venceu. Aquele fã virou o primeiro do `★ Próximo`. |

---

## 6. As cinco abas

- **Delta** — o trabalho. Fase, roteiro, preço. É onde você fica 95% do tempo.
- **Ficha** — quem é o fã: gasto, compras, notas, tags. Escreva aqui o que
  descobrir (`profissao: engenheiro`, `recebe dia 5`) e os roteiros passam a
  usar isso.
- **Fila** — quem está esperando, por quanto tempo, quanto já gastou.
- **Sumidos** — quem parou de responder e vale um follow-up.
- **Mais** — placar, conversão, subir extrato e o link da visão de gestor.

### Visão de gestor (2.4.3)

Na aba **Mais**, "Abrir numa aba": abre o Delta em tela cheia do Chrome, só
com números — hoje por conta, o turno, operadores, roteiros da semana e as
variantes que mais venderam. Não grava nada e não fala com a Privacy; é para
você olhar no fim do dia, não durante o atendimento.

---

## 6b. A IA no automático (2.4.2)

Desde a 2.4.2 você **não precisa apertar o ⚡**. Quando o fã escreve e é a sua
vez de responder, o Delta já pede as versões adaptadas à Grok sozinho e elas
entram no lugar do roteiro.

Os freios, para não virar dinheiro jogado fora:

- **Só na sua vez.** Se a última mensagem é sua, ele não pede nada.
- **Uma vez por roteiro de cada conversa.** Mudou a fase, pede de novo.
- **5 segundos** de folga entre dois pedidos e teto de **60 por hora**.

Se não gostar de uma versão, aperte `A` (ou ⚡, ou "voltar ao roteiro
normal") e volta ao roteiro escrito — e ele **não** insiste de novo naquele
roteiro.

Para desligar de vez: `coach-ext/data/coach_regras.json` → `ia` →
`automatico` → `ativo: false`. Aí o ⚡ volta a ser no botão, como antes.

---

## 7. Modo Dominante

Botão no topo, alterna entre `Normal` e `Dominante`. Fica salvo neste Chrome
(é por conta, não é global). No Dominante os roteiros mudam de tom e aparece
a projeção dos próximos degraus de preço. Use com fã que já respondeu bem a
esse tom — não como padrão para todo mundo.

---

## 8. Erros comuns (e o que fazer)

| Sintoma | Causa | Solução |
|---|---|---|
| Sugestões não mudam ao abrir outra conversa | O leitor travou | F5 na Privacy |
| "Não trocou…" no Alt+1/2/3 | A janela preta foi fechada | Rodar `arrumar_cockpit.bat` de novo |
| ⚡ Adaptar não responde | Chave de IA no Supabase | Me avise |
| O placar ignora uma conta | Nome da conta diferente no banco | Me avise |
| Painel na versão antiga depois de atualizar | Extensão não recarregada | `chrome://extensions` nos 3 perfis + F5 |

---

## 9. O que o Delta aprende sozinho

Três coisas, todas a partir das suas jogadas registradas:

1. **Qual variante vende** — ele testa as 3 e vai mostrando mais a que
   converte (Thompson Sampling).
2. **Quando ofertar** — o peso dos gatilhos do 🎯 vem das suas vendas reais,
   não de um número chumbado.
3. **Quanto cobrar** — os degraus de preço se calibram pela sua base.

Nada disso funciona sem o passo 1 deste guia. **Copiar sempre pelo botão.**
