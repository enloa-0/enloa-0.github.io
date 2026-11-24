/* 검색창 비밀 링크: 암호가 맞을 때만 브라우저에서 복호화 (PBKDF2-SHA256 + AES-GCM) */
(function () {
  var S = { salt: "8/vAZgGfAB2ViVcUl2uk+g==", iv: "7PhoxX0BcoF/lFFJ", it: 600000,
    ct: "idIv6QzSLjIIlWvtWLNK1wQBshVTmGKyZ2JZtdtJG9iU77QkO6uuvu8DVsDQV+kMxqN6xTiUHzEzqCy5+L9ZjuEN9kpNV7udtVvPB2oerh1yMMguUods0dLX3LoJz5vxe8PrRbk0fTDPD5jijYxqewZVrIK/FgQ7nl5QEDlo4+V66dmYnGGwtx9x" };
  var QR_LIB = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";

  function u8(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

  async function tryOpen(pw) {
    try {
      var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
      var key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: u8(S.salt), iterations: S.it, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      var pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u8(S.iv) }, key, u8(S.ct));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) { return null; }
  }

  function loadLib() {
    return new Promise(function (ok, fail) {
      if (window.qrcode) return ok();
      var s = document.createElement("script");
      s.src = QR_LIB; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }

  /* 파란 점 스타일 QR 그리기 */
  function drawQR(canvas, text) {
    var qr = window.qrcode(0, "M"); qr.addData(text); qr.make();
    var n = qr.getModuleCount(), cell = 8, pad = cell * 3, size = n * cell + pad * 2;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr; canvas.height = size * dpr;
    canvas.style.width = size + "px"; canvas.style.height = size + "px";
    var g = canvas.getContext("2d"); g.scale(dpr, dpr);
    g.fillStyle = "#fff"; g.fillRect(0, 0, size, size);
    var grad = g.createLinearGradient(0, size, size, 0);
    grad.addColorStop(0, "#4cc9f7"); grad.addColorStop(1, "#2384d6");
    g.fillStyle = grad;
    function finder(r, c) { return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7); }
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || finder(r, c)) continue;
      g.beginPath(); g.arc(pad + c * cell + cell / 2, pad + r * cell + cell / 2, cell * 0.44, 0, Math.PI * 2); g.fill();
    }
    function rr(x, y, w, rad) {
      g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + w, rad); g.arcTo(x + w, y + w, x, y + w, rad);
      g.arcTo(x, y + w, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath();
    }
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (p) {
      var x = pad + p[1] * cell, y = pad + p[0] * cell;
      g.fillStyle = grad; rr(x, y, cell * 7, cell * 2); g.fill();
      g.fillStyle = "#fff"; rr(x + cell, y + cell, cell * 5, cell * 1.4); g.fill();
      g.fillStyle = grad; g.beginPath(); g.arc(x + cell * 3.5, y + cell * 3.5, cell * 1.6, 0, Math.PI * 2); g.fill();
    });
  }

  var found = null, timer = null, seq = 0;

  function render() {
    var box = document.getElementById("search-results");
    if (!box || !found || box.querySelector(".secret-card")) return;
    var card = document.createElement("article");
    card.className = "secret-card";
    card.innerHTML = '<div class="secret-head">🔓 비밀 링크 발견!</div>' +
      '<div class="secret-qr-wrap"><canvas class="secret-qr"></canvas><div class="secret-name"></div></div>' +
      '<a class="secret-btn" target="_blank" rel="noopener noreferrer">인스타그램 보러 가기 →</a>';
    card.querySelector(".secret-name").textContent = found.name;
    card.querySelector(".secret-btn").href = found.link;
    box.prepend(card);
    loadLib().then(function () { drawQR(card.querySelector(".secret-qr"), found.link); })
      .catch(function () { card.querySelector(".secret-qr").remove(); });
  }

  function clear() {
    found = null;
    document.querySelectorAll(".secret-card").forEach(function (el) { el.remove(); });
  }

  function init() {
    var input = document.getElementById("search-input");
    var box = document.getElementById("search-results");
    if (!input || !box) return;
    new MutationObserver(function () { if (found) render(); }).observe(box, { childList: true });
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var v = input.value.trim(), my = ++seq;
      clear();
      if (v.length < 4 || v.length > 40) return;
      timer = setTimeout(async function () {
        var r = await tryOpen(v);
        if (r && my === seq && input.value.trim() === v) { found = r; render(); }
      }, 350);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
