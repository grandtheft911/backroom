// Backroom admin — local-only server. Publishes games to GitHub (Releases + Pages).
// Run: node admin/server.js   (or the "Backroom Admin" shortcut on the Desktop)
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const { execFile, exec } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const GAMES = path.join(DOCS, "games.json");
const ICONS = path.join(DOCS, "icons");
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const REPO = `${CFG.owner}/${CFG.repo}`;
const PORT = CFG.port || 4777;
const TMP = path.join(os.tmpdir(), "backroom-admin");
fs.mkdirSync(TMP, { recursive: true });

let TOKEN = null;
let busy = false;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT, maxBuffer: 1 << 26, env: { ...process.env, GH_TOKEN: TOKEN || "" }, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd} ${args[0]}: ${(stderr || err.message).trim()}`));
      resolve(stdout.trim());
    });
  });
}

const git = (...a) => run("git", ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", ...a]);
const gh = (...a) => run("gh", a);

async function token() {
  if (TOKEN) return TOKEN;
  TOKEN = await run("gh", ["auth", "token", "--user", CFG.user], { env: process.env });
  return TOKEN;
}

const readGames = async () => JSON.parse(await fsp.readFile(GAMES, "utf8"));
const writeGames = (d) => fsp.writeFile(GAMES, JSON.stringify(d, null, 2) + "\n");

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "joc";
const safeFile = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
const today = () => new Date().toISOString().slice(0, 10);

async function sync() {
  await git("pull", "--rebase", "--autostash", "origin", "main");
}

async function commit(msg) {
  await git("add", "docs");
  const st = await git("status", "--porcelain", "docs");
  if (!st) return;
  await git("commit", "-m", msg);
  await git("push", "origin", "main");
}

async function releaseExists(tag) {
  try { await gh("release", "view", tag, "--repo", REPO, "--json", "tagName"); return true; } catch { return false; }
}

async function deleteRelease(tag) {
  if (tag && (await releaseExists(tag))) await gh("release", "delete", tag, "--repo", REPO, "--yes", "--cleanup-tag");
}

async function publish(p) {
  await token();
  await sync();
  const data = await readGames();
  const games = data.games;
  let g = p.id ? games.find((x) => x.id === p.id) : null;
  if (p.id && !g) throw new Error("Jocul nu mai există în listă.");
  const name = String(p.name || "").trim();
  const version = String(p.version || "").trim().replace(/^v/i, "");
  if (!name) throw new Error("Lipsește numele.");
  if (!version) throw new Error("Lipsește versiunea.");
  if (!g && !p.apkTmp) throw new Error("Lipsește fișierul APK.");
  if (!g && !p.icon) throw new Error("Lipsește iconița.");

  if (!g) {
    let id = slug(name), n = 2;
    while (games.some((x) => x.id === id)) id = `${slug(name)}-${n++}`;
    g = { id };
    games.push(g);
  }

  if (p.apkTmp) {
    const tmp = path.join(TMP, path.basename(p.apkTmp));
    if (!fs.existsSync(tmp)) throw new Error("Fișierul APK încărcat nu mai există. Alege-l din nou.");
    let tag = `${g.id}-v${slug(version)}`;
    if (tag === g.tag || (await releaseExists(tag))) tag += "-" + Date.now().toString(36);
    const file = path.join(TMP, `${safeFile(name)}-${safeFile(version)}.apk`);
    await fsp.rename(tmp, file);
    const st = await fsp.stat(file);
    await gh("release", "create", tag, file, "--repo", REPO, "--title", `${name} ${version}`, "--notes", p.changelog || `${name} ${version}`);
    await fsp.unlink(file).catch(() => {});
    const old = g.tag;
    g.tag = tag;
    g.apk = `https://github.com/${REPO}/releases/download/${tag}/${path.basename(file)}`;
    g.size = st.size;
    g.updated = today();
    if (old && old !== tag) await deleteRelease(old).catch(() => {});
  }

  if (p.icon) {
    const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(p.icon);
    if (!m) throw new Error("Iconiță invalidă.");
    await fsp.mkdir(ICONS, { recursive: true });
    await fsp.writeFile(path.join(ICONS, `${g.id}.png`), Buffer.from(m[2], "base64"));
    g.icon = `icons/${g.id}.png?v=${Date.now().toString(36)}`;
  }

  g.name = name;
  g.version = version;
  g.description = String(p.description || "").trim();
  g.changelog = String(p.changelog || "").trim();
  g.minAndroid = String(p.minAndroid || "").trim();
  if (!g.updated) g.updated = today();

  await writeGames(data);
  await commit(`${p.id ? "Actualizează" : "Adaugă"} ${name} ${version}`);
  return g;
}

async function remove(id) {
  await token();
  await sync();
  const data = await readGames();
  const g = data.games.find((x) => x.id === id);
  if (!g) throw new Error("Jocul nu există.");
  await deleteRelease(g.tag);
  data.games = data.games.filter((x) => x.id !== id);
  await fsp.unlink(path.join(ICONS, `${id}.png`)).catch(() => {});
  await writeGames(data);
  await commit(`Șterge ${g.name}`);
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function body(req, limit = 20 << 20) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("Prea mare")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function locked(res, fn) {
  if (busy) return json(res, 409, { error: "Altă operație e în curs. Așteaptă să se termine." });
  busy = true;
  try { json(res, 200, await fn()); }
  catch (e) { console.error(e); json(res, 500, { error: e.message }); }
  finally { busy = false; }
}

const server = http.createServer(async (req, res) => {
  // Only accept requests addressed to this local server (blocks DNS-rebinding / foreign pages).
  const host = req.headers.host || "";
  if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) { res.writeHead(403); return res.end(); }
  const origin = req.headers.origin;
  if (req.method !== "GET" && origin && origin !== `http://${host}`) { res.writeHead(403); return res.end(); }

  const url = new URL(req.url, `http://${host}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(path.join(__dirname, "admin.html")).pipe(res);
    }
    if (req.method === "GET" && url.pathname.startsWith("/icons/")) {
      const f = path.join(ICONS, path.basename(url.pathname));
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
      return fs.createReadStream(f).pipe(res);
    }
    if (req.method === "GET" && url.pathname === "/api/games") {
      return json(res, 200, { ...(await readGames()), site: `https://${CFG.owner}.github.io/${CFG.repo}/` });
    }
    if (req.method === "POST" && url.pathname === "/api/apk") {
      const name = `up-${Date.now()}-${Math.random().toString(36).slice(2)}.apk`;
      const out = fs.createWriteStream(path.join(TMP, name));
      req.pipe(out);
      out.on("finish", () => json(res, 200, { tmp: name }));
      out.on("error", (e) => json(res, 500, { error: e.message }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/publish") {
      const p = JSON.parse(await body(req));
      return locked(res, () => publish(p));
    }
    if (req.method === "POST" && url.pathname === "/api/delete") {
      const { id } = JSON.parse(await body(req));
      return locked(res, async () => { await remove(id); return { ok: true }; });
    }
    res.writeHead(404); res.end();
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const u = `http://localhost:${PORT}/`;
  console.log(`Backroom Admin: ${u}  (închide fereastra ca să oprești)`);
  if (!process.argv.includes("--no-open")) exec(`start "" "${u}"`);
});
