// Leitor passivo. Roda só em privacy.com.br/chat.
// Ele só olha o que a Privacy já colocou na tela e avisa o painel.
// Não clica, não rola, não envia, não faz nenhum pedido à Privacy e não altera a página.
(() => {
  const HEX24 = /^[0-9a-f]{24}$/;
  const enviadas = new Map(); // sala -> Set de ids de mensagens já entregues ao painel
  let ultimoJson = "", candidato = "", candidatoDesde = 0, agendado = null, observando = null, cegoDesde = 0;

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
    const m = /R\$\s*([\d.]+,\d{2})/.exec(s || "");
    return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : null;
  }
  const horaDoId = (id) => new Date(parseInt(id.slice(0, 8), 16) * 1000).toISOString();
  function cidDoEndereco() {
    const t = new URLSearchParams(location.search).get("cid");
    return /^\d{1,12}$/.test(t || "") ? Number(t) : null;
  }

  function ler() {
    const r = raiz();
    if (!r) return null;
    const contaEl = r.querySelector("privacy-web-chatsettings[profile-name], [profile-name]") || document.querySelector("[profile-name]");
    const conta = contaEl ? contaEl.getAttribute("profile-name") : null;
    const cid = cidDoEndereco();

    const salas = [];
    r.querySelectorAll("#rooms-list .vac-room-item").forEach((it) => {
      const av = it.querySelector("a.vac-avatar");
      salas.push({
        sala: it.id, perfil: perfilDe(av), nome: txt(it.querySelector(".name")),
        ultima: txt(it.querySelector(".message-last")).slice(0, 80), hora: txt(it.querySelector(".vac-text-date")),
        naoLidas: Number(txt(it.querySelector(".vac-text-unread-msg-counter"))) || 0,
        online: !!(av && av.classList.contains("vac-state-online")),
        aberta: it.classList.contains("vac-room-selected"),
        // o visto ao lado da última mensagem só aparece quando ela foi enviada pela conta
        nossa: !!it.querySelector(".message-last .vac-icon-check")
      });
    });

    let conv = null;
    const cab = r.querySelector("a.vac-list-name");
    const sel = salas.find((s) => s.aberta);
    if (cid && cab) {
      const perfil = perfilDe(cab);
      conv = { cid, perfil, nome: txt(cab.querySelector(".vac-text-ellipsis")) || txt(cab), sala: sel && sel.perfil === perfil && HEX24.test(sel.sala) ? sel.sala : null, total: null, ultima: null };
      const det = r.querySelector(".vac-subscriber-details-profile");
      const detPerfil = det ? perfilDe(det.querySelector("a.vac-avatar")) : null;
      if (det && detPerfil === perfil) conv.total = dinheiro(txt(r.querySelector(".vac-subscriber-details-total__value")));
    }

    const msgs = [], ppvs = [];
    if (conv && conv.sala) {
      r.querySelectorAll("#messages-list .vac-message-wrapper").forEach((w) => {
        if (!HEX24.test(w.id)) return;
        const em = horaDoId(w.id);
        // aviso "Venda realizada com sucesso": não é mensagem de ninguém; dá o momento da compra
        if (w.querySelector(".vac-sale-notice")) {
          msgs.push({ id: w.id, de_fa: false, em, tipo: "aviso", texto: "[venda realizada]" });
          for (let i = ppvs.length - 1; i >= 0; i--) if (ppvs[i].pago && !ppvs[i].pago_em) { ppvs[i].pago_em = em; break; }
          return;
        }
        const corpo = w.querySelector(".vac-format-container");
        const audio = w.querySelector(".vac-audio-player");
        const texto = txt(corpo);
        const nossa = !!w.querySelector(".vac-message-current");
        // PPV: o rodapé da mensagem tem um campo para "pago" e outro para "ainda não pago"
        const naoPago = w.querySelector(".vac-text-not-paid"), pago = naoPago ? null : w.querySelector(".vac-text-paid");
        const preco = dinheiro(txt(naoPago || pago));
        if ((naoPago || pago) && preco != null && nossa) {
          ppvs.push({ id: w.id, preco: preco.toFixed(2), em, pago: !!pago, pago_em: "" });
          msgs.push({ id: w.id, de_fa: false, em, tipo: "ppv", texto: "[PPV R$ " + preco.toFixed(2).replace(".", ",") + "]" + (texto ? " " + texto : "") });
          return;
        }
        msgs.push({
          id: w.id, de_fa: !nossa, em,
          tipo: texto ? "texto" : audio ? "audio" : "midia",
          texto: texto || (audio ? "[áudio " + txt(w.querySelector(".vac-progress-time")) + "]" : "[mídia]")
        });
      });
      const reais = msgs.filter((m) => m.tipo !== "aviso");
      const u = reais[reais.length - 1];
      if (u) conv.ultima = { de_fa: u.de_fa, em: u.em };
    }
    return { conta, conv, salas, msgs, ppvs, temCabecalho: !!cab };
  }

  function mandar(base, novas, aoEntregar) {
    const json = JSON.stringify(base);
    try {
      chrome.runtime.sendMessage(Object.assign({ novas }, base), (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) return; // painel fechado: tenta de novo depois
        ultimoJson = json;
        if (aoEntregar && resp.msgs) aoEntregar();
      });
    } catch (_) { /* extensão recarregada: esta aba precisa ser atualizada */ }
  }

  function avisar(forcar) {
    agendado = null;
    let e;
    try { e = ler(); } catch (_) { e = null; }
    const agora = Date.now();

    // Saúde da leitura: há conversa no endereço, mas não acho cabeçalho nem lista há 10 s.
    const cego = cidDoEndereco() != null && (!e || (!e.temCabecalho && !e.salas.length));
    if (cego) {
      if (!cegoDesde) cegoDesde = agora;
      if (agora - cegoDesde >= 10000) {
        const base = { t: "estado", conta: e ? e.conta : null, conv: null, salas: [], ppvs: [], saude: "cega", visivel: document.visibilityState === "visible" };
        if (forcar || JSON.stringify(base) !== ultimoJson) mandar(base, []);
      } else agendar(2000);
      return;
    }
    cegoDesde = 0;
    if (!e) return;

    // Só passa a conversa adiante depois que endereço, cabeçalho e lista ficaram iguais por 1,2 s
    // (evita misturar o fã anterior com o novo durante a troca de conversa).
    const chave = e.conv ? [e.conv.cid, e.conv.perfil, e.conv.sala].join("|") : "";
    if (chave !== candidato) { candidato = chave; candidatoDesde = agora; }
    if (e.conv && agora - candidatoDesde < 1200) { agendar(1300); return; }

    let novas = [];
    if (e.conv && e.conv.sala) {
      const ja = enviadas.get(e.conv.sala) || new Set();
      novas = e.msgs.filter((m) => !ja.has(m.id)).slice(-400);
    }
    const base = { t: "estado", conta: e.conta, conv: e.conv, salas: e.salas, ppvs: e.conv && e.conv.sala ? e.ppvs : [], saude: "ok", visivel: document.visibilityState === "visible" };
    if (!forcar && JSON.stringify(base) === ultimoJson && !novas.length) return;
    mandar(base, novas, novas.length ? () => {
      const ja = enviadas.get(e.conv.sala) || new Set();
      novas.forEach((m) => ja.add(m.id));
      enviadas.set(e.conv.sala, ja);
    } : null);
  }
  function agendar(ms) { if (!agendado) agendado = setTimeout(avisar, ms || 400); }

  function ligar() {
    const r = raiz();
    if (r && r !== observando) {
      observando = r;
      new MutationObserver(() => agendar()).observe(r, { childList: true, subtree: true, characterData: true });
      agendar();
    }
  }
  // Confere de 2 em 2 segundos se a página já montou o chat e se o endereço mudou. É tudo local.
  let ultimoEndereco = location.href;
  setInterval(() => {
    ligar();
    if (location.href !== ultimoEndereco) { ultimoEndereco = location.href; agendar(); }
    else if (ultimoJson === "" || cegoDesde) agendar();
  }, 2000);
  document.addEventListener("visibilitychange", () => agendar());
  chrome.runtime.onMessage.addListener((m, _s, responder) => {
    if (m && m.t === "pedir") { ultimoJson = ""; enviadas.clear(); avisar(true); responder({ ok: true }); }
  });
  ligar();
})();
