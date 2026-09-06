# Lurith Website

Static landing page + docs for **Lurith** (Discord Lua / Luau obfuscator).
Built for **GitHub Pages** — no database, no backend, no build step. Just
drop the files in a repo and turn Pages on.

## What's inside

```
Lurith-Website/
├── index.html             # Landing, features, levels, docs, FAQ, demo
├── .nojekyll              # tells GitHub Pages to skip Jekyll processing
├── assets/
│   ├── css/style.css
│   ├── js/app.js          # page interactivity
│   ├── js/lurith-web.js   # in-browser obfuscation engine (no deps)
│   └── img/               # logo, favicon
└── README.md
```

Everything is static. The demo on the page runs a lightweight browser edition
of the engine, fully offline. The full engine lives in the Discord bot — the
page points people there.

## Deploy to GitHub Pages

### Option A — from the GitHub website (phone-friendly)

1. Go to https://github.com/new — create a repository named `lurith` (public
   is fine and free).
2. In the new repo, click **Add file → Upload files**.
3. Upload this folder's contents: `index.html`, `.nojekyll`, and the `assets`
   folder. (You can drag multiple files at once; create the `assets/css`,
   `assets/js`, `assets/img` subfolders by typing them in the upload path
   box, e.g. `assets/css/style.css`.)
4. Commit the changes.
5. Go to **Settings → Pages** (on the left), and under *Build and deployment*:
   - Source: **Deploy from a branch**
   - Branch: `main`, folder: `/ (root)` — Save.
6. Wait a minute. Your site is live at
   `https://YOURUSERNAME.github.io/lurith/`.

### Option B — with git (on a PC)

```bash
git clone https://github.com/YOURUSERNAME/lurith.git
# copy index.html, .nojekyll and assets/ into the cloned folder
git add -A && git commit -m "Lurith site" && git push
```

Then enable Pages as in step 5 above.

### Custom domain (optional)

Settings → Pages → **Custom domain**, enter your domain, and add the DNS
record GitHub shows you. GitHub Pages + custom domains are free.

## Updating the site

Edit the files and re-upload (Option A) or `git push` (Option B). Done.

## Notes

- No build tooling, no npm, no database. GitHub Pages serves the files as-is.
- The paths in the page are relative, so it works under any repo/subpath or
  custom domain.
- `assets/js/lurith-web.js` is a lightweight browser companion to the full
  Lurith engine (the Discord bot / CLI). The bot runs the complete engine
  with all six protection levels and VM families.
