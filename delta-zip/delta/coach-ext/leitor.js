// Leitor passivo do Coach. Roda só em privacy.com.br/chat.
// Mesmo jeito de ler do Aura: só olha o que já está na tela e avisa a janela do Coach.
// Não clica, não rola, não digita, não envia, não altera nada e não faz nenhum pedido à Privacy.
(() => {
  const HEX24 = /^[0-9a-f]{24}$/;
  let ultimoJson = "", candidato = "", candidatoDesde = 0, agendado = null, observando = null, ultimoTexto = null, agTexto = null;

  function raiz() {
    const h = document.querySelector("privacy-web-chat");
    if (!h) return null;
    return h.shadowRoot || (chrome.dom && chrome.dom.openOrClosedShadowRoot ? chrome.dom.openOrClosedShadowRoot(h) : null);
  }
  const txt = (e) => (e ? (e.textContent || "").replace(/\s+/g, " ").trim() : "");
  function perfilDe(a) {
    const m = /\/profile\/([^/?#]+)/.exec((a && a.getAttribute("href")) || "");
    return m ? decodeURIComponent(m[1]) : null;
  }
  function dinheiro(s) {
    // Aceita centavos com vírgula (R$ 120,00 · R$ 1.234,56) e com ponto (R$ 441.81, como aparece na lista de salas).
    const m = /R\$\s*(\d{1,3}(?:[.,]\d{3})+|\d+)[.,](\d{2})(?!\d)/.exec(s || "");
    return m ? Number(m[1].replace(/[.,]/g, "") + "." + m[2]) : null;
  }

  // === Classificação de padrão (passiva) ===
  function classificarPadrao(msgs) {
    if (!msgs || !msgs.length) return "neutro";
    const doFan = msgs.filter(m => m.de_fa && m.texto).slice(-6);
    if (!doFan.length) return "neutro";

    const ultima = doFan[doFan.length - 1];
    const texto = (ultima.texto || "").toLowerCase();
    const temEmojiPositivo = /😍|🔥|❤️|🥰|😏|😘|💦|🥵|😈/.test(texto);
    // palavra inteira (v2.3.15): "apagou" e "comprado" não contam mais como menção a preço
    const mencionouPreco = /(?<![a-zà-ú0-9])(preço|preco|valor|quanto|pix|pago|pagar|compra|compro)(?![a-zà-ú0-9])|r\$/.test(texto);
    const curta = texto.length < 25;
    const temAudio = doFan.some(m => m.tipo === "audio");

    if (mencionouPreco) return "mencionou_preco";
    if (temAudio) return "mandou_audio";
    if (temEmojiPositivo && !curta) return "rapido_positivo";
    if (curta && doFan.length >= 2) return "lento_curto";
    return "neutro";
  }

  // PALPITE (confirmar no DOM real): mensagem da conta com mídia e preço/cadeado = PPV.
  const SEL_MIDIA = "img, video, .vac-message-image, .vac-message-video, .vac-message-files-container, .vac-message-file-container";
  const SEL_PAGO = "[class*='price'], [class*='paid'], [class*='lock'], [class*='ppv'], [class*='preco'], [class*='pago']";
  // PALPITE (confirmar no DOM real): campo de texto do chat.
  const SEL_CAMPO = "textarea#roomTextarea, .vac-box-footer textarea, .vac-room-footer textarea, footer textarea, textarea";

  function campo(r) { return r.querySelector(SEL_CAMPO); }

  function ler() {
    const r = raiz();
    if (!r) return null;
    const contaEl = r.querySelector("privacy-web-chatsettings[profile-name], [profile-name]") || document.querySelector("[profile-name]");
    const conta = contaEl ? contaEl.getAttribute("profile-name") : null;
    const cidTxt = new URLSearchParams(location.search).get("cid");
    const cid = /^\d{1,12}$/.test(cidTxt || "") ? Number(cidTxt) : null;

    const salas = [];
    r.querySelectorAll("#rooms-list .vac-room-item").forEach((it) => {
      const av = it.querySelector("a.vac-avatar");
      const ultima = txt(it.querySelector(".message-last"));
      // Gasto do fã que a Privacy mostra na linha da sala. Tira antes o texto da última mensagem, para um
      // "R$" escrito na conversa não ser lido como gasto.
      const linha = ultima ? txt(it).split(ultima).join(" ") : txt(it);
      salas.push({
        sala: it.id, perfil: perfilDe(av), nome: txt(it.querySelector(".name")),
        ultima: ultima.slice(0, 80), hora: txt(it.querySelector(".vac-text-date")),
        naoLidas: Number(txt(it.querySelector(".vac-text-unread-msg-counter"))) || 0,
        nossa: !!it.querySelector(".message-last .vac-icon-check"), gasto: dinheiro(linha),
        online: !!(av && av.classList.contains("vac-state-online")),
        aberta: it.classList.contains("vac-room-selected")
      });
    });

    let conv = null;
    const cab = r.querySelector("a.vac-list-name");
    const sel = salas.find((s) => s.aberta);
    if (cid && cab) {
      const perfil = perfilDe(cab);
      // sala = a marcada como aberta na lista; se a lista não marca (layout estreito de celular), a sala cujo avatar é o mesmo perfil
      const porPerfil = perfil ? salas.filter((s) => s.perfil === perfil && HEX24.test(s.sala)) : [];
      const sala = sel && sel.perfil === perfil && HEX24.test(sel.sala) ? sel.sala : porPerfil.length === 1 ? porPerfil[0].sala : null;
      conv = { cid, perfil, nome: txt(cab.querySelector(".vac-text-ellipsis")) || txt(cab), sala, total: null };
      const det = r.querySelector(".vac-subscriber-details-profile");
      const detPerfil = det ? perfilDe(det.querySelector("a.vac-avatar")) : null;
      if (det && detPerfil === perfil) conv.total = dinheiro(txt(r.querySelector(".vac-subscriber-details-total__value")));
    }

    // Lê as mensagens sempre que há conversa aberta (com ou sem sala identificada): o Delta só usa para sugerir.
    // diag = contagem do que foi visto/lido, para o painel mostrar quando a leitura falha (visto no teste real de
    // 10/11/2026: o filtro de aviso de venda da v2.1 descartava TODAS as mensagens na Privacy de verdade).
    // ppvs = PPVs da conversa no MESMO formato que o leitor do Aura manda (id, preço, hora, pago, hora da compra).
    const msgs = [], ppvs = [], diag = { vistas: 0, lidas: 0, avisos: 0, sem_id: 0, sala: !!(conv && conv.sala) };
    if (conv) {
      r.querySelectorAll("#messages-list .vac-message-wrapper").forEach((w) => {
        diag.vistas++;
        if (!HEX24.test(w.id)) { diag.sem_id++; return; }
        const corpo = w.querySelector(".vac-format-container");
        const audio = w.querySelector(".vac-audio-player");
        const texto = txt(corpo);
        const emMs = parseInt(w.id.slice(0, 8), 16) * 1000;
        // Aviso de venda da própria Privacy ("Venda realizada com sucesso."): não é mensagem de ninguém; dá a hora
        // da compra do último PPV pago (igual ao Aura). Só vale quando é mesmo um aviso: a mensagem tem a classe,
        // OU o aviso tem texto e não há texto de mensagem, OU o texto é o do aviso.
        const sn = w.querySelector(".vac-sale-notice");
        if (w.classList.contains("vac-sale-notice") || (sn && txt(sn) && !texto) || /^venda realizada com sucesso/i.test(texto)) {
          diag.avisos++;
          for (let i = ppvs.length - 1; i >= 0; i--) if (ppvs[i].pago && !ppvs[i].pago_em) {
            ppvs[i].pago_em = new Date(emMs).toISOString();
            const mp = msgs.find((x) => x.id === ppvs[i].id); if (mp) mp.comprado_em = emMs;
            break;
          }
          return;
        }
        const daConta = !!w.querySelector(".vac-message-current");
        const m = {
          id: w.id, de_fa: !daConta, em: emMs,
          tipo: texto ? "texto" : audio ? "audio" : "midia",
          texto: texto || (audio ? ("[áudio " + txt(w.querySelector(".vac-progress-time")) + "]").replace(" ]", "]") : "[mídia]")
        };
        // Estado real do PPV na tela da Privacy (mesma regra do Aura): mensagem NOSSA com o rodapé
        // .vac-text-not-paid (ainda não pagou) ou .vac-text-paid (pagou) E um preço em R$ dentro dele.
        const naoPago = daConta ? w.querySelector(".vac-text-not-paid") : null, pagou = daConta && !naoPago ? w.querySelector(".vac-text-paid") : null;
        const precoPpv = dinheiro(txt(naoPago || pagou));
        if ((naoPago || pagou) && precoPpv != null) {
          m.ppv = true; m.comprado = !!pagou; m.preco = precoPpv; m.tipo = "ppv";
          ppvs.push({ id: w.id, preco: precoPpv.toFixed(2), em: new Date(emMs).toISOString(), pago: !!pagou, pago_em: "" });
        } else if (daConta && w.querySelector(SEL_MIDIA)) {
          const pago = w.querySelector(SEL_PAGO);
          // só vale com o elemento de preço/pago; o preço vem só dele (nunca do texto livre da mensagem)
          if (pago) { m.ppv = true; m.preco = dinheiro(txt(pago)); }
        }
        msgs.push(m); diag.lidas++;
      });
    }

    // === NOVO: calcula o padrão ===
    const padrao = classificarPadrao(msgs);

    const c = campo(r);
    return { 
      conta, conv, salas, msgs: msgs.slice(-200), ppvs: conv && conv.sala ? ppvs.slice(-60) : [], 
      diag, texto: c ? String(c.value || "") : "",
      padrao
    };
  }

  function mandar(obj) { try { chrome.runtime.sendMessage(obj, () => void chrome.runtime.lastError); } catch (_) { /* extensão recarregada: atualize a aba */ } }

  function avisar(forcar) {
    agendado = null;
    let e; try { e = ler(); } catch (_) { return; }
    if (!e) return;
    // Igual ao Aura: só passa adiante depois que a conversa ficou estável por 1,2 s.
    const chave = e.conv ? [e.conv.cid, e.conv.perfil, e.conv.sala].join("|") : "";
    const agora = Date.now();
    if (chave !== candidato) { candidato = chave; candidatoDesde = agora; }
    if (e.conv && agora - candidatoDesde < 1200) { agendar(1300); return; }
    const base = { 
      t: "coach_estado", conta: e.conta, conv: e.conv, salas: e.salas, 
      msgs: e.msgs, ppvs: e.ppvs, diag: e.diag, texto: e.texto, 
      padrao: e.padrao,
      visivel: document.visibilityState === "visible" 
    };
    const json = JSON.stringify(base);
    if (!forcar && json === ultimoJson) return;
    ultimoJson = json; ultimoTexto = e.texto;
    mandar(base);
  }
  function agendar(ms) { if (!agendado) agendado = setTimeout(avisar, ms || 400); }

  // Lê o que está sendo digitado (só lê o valor; nunca escreve nem impede o envio).
  function lerTexto() {
    agTexto = null;
    const r = raiz(); if (!r) return;
    const c = campo(r); const v = c ? String(c.value || "") : "";
    if (v === ultimoTexto) return;
    ultimoTexto = v; mandar({ t: "coach_texto", texto: v });
  }

  function ligar() {
    const r = raiz();
    if (r && r !== observando) {
      observando = r;
      new MutationObserver(() => agendar()).observe(r, { childList: true, subtree: true, characterData: true });
      r.addEventListener("input", () => { if (!agTexto) agTexto = setTimeout(lerTexto, 300); }, { capture: true, passive: true });
      agendar();
    }
  }
  let ultimoEndereco = location.href;
  setInterval(() => {
    ligar();
    if (location.href !== ultimoEndereco) { ultimoEndereco = location.href; agendar(); }
    lerTexto(); // cobre campo que muda sem evento (ex.: após enviar)
  }, 2000);
  document.addEventListener("visibilitychange", () => agendar());
  chrome.runtime.onMessage.addListener((m, _s, responder) => {
    if (m && m.t === "coach_pedir") { ultimoJson = ""; avisar(true); responder({ ok: true }); }
  });
  ligar();
})();
