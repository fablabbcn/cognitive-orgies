# MDEF Archive — Cognitive Orgies

Interactive archive of all projects from the **Master in Design for Emergent Futures** (MDEF) at Fab Lab Barcelona / IAAC, visualized as a living network of people, projects and ideas across cohorts.

🌐 **Live:** [https://fablabbcn.github.io/cognitive-orgies/](https://fablabbcn.github.io/cognitive-orgies/) (set this up — see deploy section below)

---

## ✏️ How to update the data

Two CSV files drive everything. Edit them in **Excel, Google Sheets, or directly on GitHub** — the live site reloads them on every page visit (cache-busted).

### `data.csv` — projects (one row per project)

| Column | Description |
|---|---|
| `id` | Unique id (`proj001`, `proj002`…). Keep stable across edits. |
| `title` | Project name |
| `year` | Year (e.g. `2024`) |
| `type` | `Microchallenge 1` / `Microchallenge 2` / `Microchallenge 3` / `Microchallenge 4` |
| `description` | Short paragraph about the project |
| `areas` | Comma-separated, e.g. `mail art, post art` |
| `knowledge` | Comma-separated knowledge fields |
| `weak_signals` | Comma-separated weak signals |
| `photo` | URL to project image (any public URL works — GitLab raw, S3, etc.) |
| `students` | Student names separated by **`\|`** (pipe), e.g. `Roger\|Alejandra` |
| `link` | URL to project repo / website |

### `students.csv` — student profiles (optional)

| Column | Description |
|---|---|
| `name` | Student name (must match exactly what's in `data.csv` `students`) |
| `bio` | Short bio sentence |
| `photo` | URL to portrait photo |

A row only needs to be added here if you want a bio or photo. Students appear in the network whether or not they exist in this file.

### Editing workflow

1. Download `data.csv` from this repo
2. Open in Excel / Numbers / Google Sheets — edit normally
3. **Save as CSV** (UTF-8 encoded)
4. Commit + push (or upload via GitHub web UI: **Add file → Upload files**)
5. Wait ~1 min for GitHub Pages to rebuild — done.

> ⚠️ **Always save as CSV (UTF-8)** — Excel sometimes defaults to other encodings that break special characters.

---

## 🚀 Deploy to GitHub Pages

This project is 100% static — no build step. Deploy in 3 steps:

### 1. Create the repo
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/fablabbcn/cognitive-orgies.git
git branch -M main
git push -u origin main
```

### 2. Enable Pages
- Go to **Settings → Pages**
- Source: **Deploy from a branch**
- Branch: `main`, folder: `/ (root)`
- Save. After ~1 min the site is live at `https://<username>.github.io/cognitive-orgies/`

### 3. (Optional) Custom domain
- Add a `CNAME` file with your domain
- Configure DNS as per [GitHub docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)

---

## 🧪 Validation

A GitHub Action (`.github/workflows/validate.yml`) runs on every push and checks:

- `data.csv` and `students.csv` parse correctly
- All required columns are present
- No duplicate project ids
- All students referenced in `data.csv` are spelled consistently

If validation fails, the build is flagged red and the broken commit won't break production data.

---

## 🛠 Local development

Just open `MDEF Archive.html` through a local server (so `fetch()` works for CSVs):

```bash
# Python
python3 -m http.server 8000

# Or Node
npx serve .
```

Then open `http://localhost:8000/MDEF Archive.html`.

Opening the file directly with `file://` won't work — browsers block fetch from local file URLs.

---

## 📂 Project structure

```
cognitive-orgies/
├── MDEF Archive.html      # Entry point
├── loader.js              # Fetches & parses CSVs at runtime
├── graph.jsx              # Network visualization (React + SVG)
├── panels.jsx             # Toolbar, detail panels, filters
├── data.csv               # ⭐ Project data — edit this
├── students.csv           # ⭐ Student bios/photos — edit this
└── .github/workflows/
    └── validate.yml       # CI: validate CSVs on every push
```

---

## 🙏 Credits

Made for **Fab Lab Barcelona / IAAC** · MDEF programme.
