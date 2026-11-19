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

  const date = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isNew = (iso) => iso && (Date.now() - new Date(iso + "T12:00:00")) / 864e5 <= NEW_DAYS;

  function card(g, i) {
    const meta = [g.version && "v" + g.version, size(g.size), date(g.updated)].filter(Boolean).join(" · ");
    return `
      <article class="game" data-i="${i}" tabindex="0">
        <img class="icon" src="${esc(g.icon)}" alt="" loading="lazy">
        <div class="info">
          <div class="name-row"><h2 class="name">${esc(g.name)}</h2>${isNew(g.updated) ? '<span class="tag">New</span>' : ""}</div>
          ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ""}
          <p class="meta">${esc(meta)}</p>
        </div>
        <a class="btn" href="${esc(g.apk)}" download aria-label="Download ${esc(g.name)}">${DL_ICON}<span class="lbl">Download</span></a>
      </article>`;
  }

  function open(g) {
    $("s-icon").src = g.icon;
    $("s-name").textContent = g.name;
    $("s-meta").textContent = [g.version && "Version " + g.version, size(g.size)].filter(Boolean).join(" · ");
    $("s-dl").href = g.apk;
    $("s-dl-label").textContent = "Download" + (g.size ? " · " + size(g.size) : "");
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
  }

  $("close").onclick = () => sheet.close();
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });

  fetch("games.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      const games = (data.games || []).slice().sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
      $("count").textContent = games.length === 1 ? "1 game" : games.length + " games";
      if (!games.length) {
        list.innerHTML = '<div class="empty">No games yet.</div>';
        return;
      }
      list.innerHTML = games.map(card).join("");
      list.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        const el = e.target.closest(".game");
        if (el) open(games[+el.dataset.i]);
      });
      list.addEventListener("keydown", (e) => {
        const el = e.target.closest(".game");
        if (el && e.key === "Enter") open(games[+el.dataset.i]);
      });
    })
    .catch(() => {
      list.innerHTML = "<div class='empty'>Couldn&rsquo;t load the list. Try again in a minute.</div>";
    });
})();
