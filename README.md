# Backroom

Site privat de jocuri Android (APK), găzduit gratuit pe GitHub Pages.

- `docs/` — site-ul public (GitHub Pages servește acest folder). Lista de jocuri e în `docs/games.json`.
- `admin/` — panoul de admin, rulează doar local: `node admin/server.js` → http://localhost:4777
  - APK-urile se urcă în GitHub Releases (până la 2 GB / fișier), iconițele în `docs/icons/`.
  - Folosește contul GitHub CLI `grandtheft911` (`gh auth login`).
