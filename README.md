# Kontor

Kontor is a free, open-source office suite for Mac, Windows, Linux and the browser. It has three
programs. Their layout, behavior and keyboard shortcuts follow the classic desktop office programs,
so they feel familiar from the first minute.

**Download:** installers for every system are on the [Releases](../../releases/latest) page and on
the project website (the `website/` folder, published with GitHub Pages).

| Folder | Program | What it does | Files | Dev port |
|---|---|---|---|---|
| [`kontor-docs`](kontor-docs) | Kontor Docs | Word processor | `.docx`, `.odt`, `.rtf`, `.md`, PDF via print | 5174 |
| [`kontor-sheets`](kontor-sheets) | Kontor Sheets | Spreadsheet | `.xlsx`, `.ods`, `.csv`, PDF via print | 5175 |
| [`kontor-slides`](kontor-slides) | Kontor Slides | Presentations | `.pptx`, PDF, PNG/JPEG, MP4/WebM video | 5176 |

Each program is self-contained. Its folder has its own `package.json`, dependencies, README and
feature checklist, and nothing is shared between folders. You can copy one folder out and use it
on its own.

## Run a program

Requirements: Node.js 20 or newer.

```bash
cd kontor-sheets
npm install
npm run dev
```

`npm run build` type-checks the program and writes a static production build to `dist/`.
You can host that folder on any static web host.

## Desktop apps

Each program is also a desktop app (Electron). The `electron/` folder holds the window, the
native open and save dialogs and the AutoSave store; `build/icon.png` is the app icon.

```bash
npm run desktop        # build and start the desktop app
npm run desktop:dist   # build installers into release/ for the current system
```

Installers per release: macOS `.dmg` and `.pkg` (Apple Silicon and Intel), Windows setup `.exe`
and `.msi` (the `.msi` installs for all users, for software deployment tools), Linux
`.AppImage` and `.deb`. The `.pkg` and `.msi` are meant for IT departments.

## Saving

- **Save (Ctrl/Cmd+S)** writes back into the file that was opened or saved last, like any desktop
  program. **Save As** always asks where to save. In browsers without file access (Firefox,
  Safari) Save downloads a copy instead.
- **AutoSave** keeps the open document while you type. The desktop apps store it in files in the
  user data folder; the browser uses localStorage and moves to IndexedDB when that is full.
- Files the system hands over (double-click, Open With) open in the desktop app.

## Publishing a release

1. Raise `version` in the three `package.json` files.
2. Push a tag: `git tag v1.0.0 && git push origin v1.0.0`.
3. The **Release desktop apps** workflow builds the installers on macOS, Windows and Linux and
   attaches them to a GitHub release. The website's download buttons always point to the latest
   release, so it needs no change.
4. The **Website** workflow publishes `website/` and the browser versions (`/app/docs/`,
   `/app/sheets/`, `/app/slides/`) to GitHub Pages on every push to `main`. Turn on Pages once
   under Settings › Pages › Source: GitHub Actions.

The repository name lives in `website/index.html` (`<meta name="kontor-repo">`), in each
`electron/config.cjs` (`website`) and in each `package.json` (`homepage`).

The apps are not signed with paid certificates yet, so macOS and Windows ask users to confirm the
first start; the website's FAQ explains how.

## Feature coverage

Every folder has a `FEATURES.md` with a checklist of the original program's features. Each item
is marked as done, partial or open, and the top of the file has the current totals.

| Program | Done | Partial | Open | Weighted (partial counts half) |
|---|---|---|---|---|
| Kontor Docs | 375 | 32 | 7 | 94 % |
| Kontor Sheets (without the function library) | 344 | 23 | 15 | 93 % |
| Kontor Slides | 340 | 38 | 6 | 93.5 % |

The open items need a server, an online service or an AI model (co-authoring, cloud storage,
AI assistants, online pictures) or are not planned (VBA; macros replay the program's own
commands instead).

Every program's interface can be switched between English, German, French and Spanish
(File › Options › Interface language); without a choice it follows the system language.

Files are checked with automated package tests (well-formed XML, content types, relationships,
element order). They have not yet been opened in other office programs as part of testing.

## Tech

React, TypeScript and Vite. The formula engine, the file readers and writers and the page layout
are our own code. The libraries we use are under permissive licenses (MIT, Apache-2.0, BSD, ISC),
and fonts are under the SIL Open Font License.

## Name and trademarks

"Kontor" is a working title. Each program reads its name from `src/brand.ts`. Kontor is not
affiliated with, endorsed by or connected to any maker of other office software. File-format names
such as `.docx`, `.xlsx` and `.pptx` only describe compatibility.
