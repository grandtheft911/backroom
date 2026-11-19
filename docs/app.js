(() => {
  const $ = (id) => document.getElementById(id);
  const list = $("list");
  const sheet = $("sheet");
  const NEW_DAYS = 14;

  const DL_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const size = (b) => {
    if (!b) return "";
    const mb = b / 1048576;
    return mb >= 1000 ? (mb / 1024).toFixed(1) + " GB" : (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + " MB";
  };

  const date = (iso, short) => {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", short ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  };

  const isNew = (iso) => iso && (Date.now() - new Date(iso + "T12:00:00")) / 864e5 <= NEW_DAYS;
  const shots = (g) => (Array.isArray(g.screenshots) ? g.screenshots : []);

  // Tint each card with its icon's dominant colour.
  function tint(img, el) {
    const apply = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const s = mx ? (mx - mn) / mx : 0;
          const wt = (s * s + 0.02) * (d[i + 3] / 255) * (mx > 40 ? 1 : 0.1);
          r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
        }
        if (w > 0) el.style.setProperty("--tint", `${Math.round(r / w)}, ${Math.round(g / w)}, ${Math.round(b / w)}`);
      } catch {}
    };
    img.complete && img.naturalWidth ? apply() : img.addEventListener("load", apply, { once: true });
  }

  function card(g, i) {
    const meta = [g.version && "v" + g.version, size(g.size), date(g.updated)].filter(Boolean).join(" · ");
    return `
      <article class="game" data-i="${i}" tabindex="0">
        <img class="icon" src="${esc(g.icon)}" alt="">
        <div class="info">
          <div class="name-row"><h3 class="name">${esc(g.name)}</h3>${isNew(g.updated) ? '<span class="tag">New</span>' : ""}</div>
          ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ""}
          <p class="meta">${esc(meta)}</p>
        </div>
        <a class="btn" href="${esc(g.apk)}" download aria-label="Download ${esc(g.name)}">${DL_ICON}<span class="lbl">Download</span></a>
      </article>`;
  }

  function feature(g, i) {
    const s = shots(g).slice(0, 3);
    const chips = [g.version && "v" + g.version, size(g.size), g.minAndroid && "Android " + g.minAndroid + "+", date(g.updated)].filter(Boolean);
    return `
      <article class="feature" data-i="${i}">
        <div class="feature-in">
          <span class="flabel">Latest release</span>
          <div class="f-top">
            <img class="icon xl" src="${esc(g.icon)}" alt="">
            <div class="f-title">
              <h2>${esc(g.name)}</h2>
              <div class="chips">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div>
            </div>
          </div>
          ${g.description ? `<p class="f-desc">${esc(g.description)}</p>` : ""}
          ${s.length ? `<div class="f-shots">${s.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join("")}</div>` : ""}
          <div class="f-actions">
            <a class="btn wide" href="${esc(g.apk)}" download>${DL_ICON}<span>Download${g.size ? " · " + esc(size(g.size)) : ""}</span></a>
            <button class="btn ghost" type="button" data-details>Details</button>
          </div>
        </div>
      </article>`;
  }

  function open(g) {
    $("s-icon").src = g.icon;
    $("s-name").textContent = g.name;
    $("s-meta").textContent = [g.version && "Version " + g.version, size(g.size)].filter(Boolean).join(" · ");
    $("s-dl").href = g.apk;
    $("s-dl-label").textContent = "Download" + (g.size ? " · " + size(g.size) : "");
    const s = shots(g);
    $("s-shots").innerHTML = s.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join("");
    $("s-shots").hidden = !s.length;
    $("s-desc").textContent = g.description || "";
    $("s-desc").hidden = !g.description;
    $("s-log").textContent = g.changelog || "";
    $("s-log-wrap").hidden = !g.changelog;
    const facts = [
      ["Version", g.version],
      ["Size", size(g.size)],
      ["Updated", date(g.updated)],
      ["Android", g.minAndroid ? g.minAndroid + "+" : ""],
    ].filter(([, v]) => v);
    $("s-facts").innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
    sheet.showModal();
    sheet.querySelector(".sheet-in").scrollTop = 0;
  }

  $("close").onclick = () => sheet.close();
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  $("year").textContent = new Date().getFullYear();

  fetch("games.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      const games = (data.games || []).slice().sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
      if (!games.length) {
        $("more-head").hidden = true;
        list.innerHTML = '<div class="empty">No games yet. Check back soon.</div>';
        return;
      }

      $("stats").hidden = false;
      $("st-games").textContent = games.length;
      $("st-size").textContent = size(games.reduce((t, g) => t + (g.size || 0), 0));
      $("st-date").textContent = date(games[0].updated, true);

      $("featured").innerHTML = feature(games[0], 0);
      const rest = games.slice(1);
      if (rest.length) {
        $("more-title").textContent = "More games";
        $("count").textContent = rest.length === 1 ? "1 game" : rest.length + " games";
        list.innerHTML = rest.map((g, k) => card(g, k + 1)).join("");
      } else {
        $("more-head").hidden = true;
        list.innerHTML = "";
      }

      document.querySelectorAll(".game, .feature").forEach((el) => tint(el.querySelector(".icon"), el));

      document.querySelector(".wrap").addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        const el = e.target.closest("[data-i]");
        if (!el) return;
        if (el.classList.contains("feature") && !e.target.closest("[data-details], .icon, h2, .f-shots")) return;
        open(games[+el.dataset.i]);
      });
      list.addEventListener("keydown", (e) => {
        const el = e.target.closest(".game");
        if (el && e.key === "Enter") open(games[+el.dataset.i]);
      });
    })
    .catch(() => {
      $("more-head").hidden = true;
      list.innerHTML = "<div class='empty'>Couldn&rsquo;t load the list. Try again in a minute.</div>";
    });
})();
