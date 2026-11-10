# Groundwork

A free personal learning app, running on one computer, that takes a near-complete beginner toward working as a software consultant. It's organized in four stages.

**New here and just want to use it?** Read [GETTING-STARTED.md](GETTING-STARTED.md). It's a short, non-technical setup guide. Everything below is for anyone who wants to understand how the app works or change it.

---

## What's in this version

All of **Stage 1** is written, plus the first module of Stage 2.

| | Status |
| --- | --- |
| The app: Today page, study plan, reviews, tracking, notes, flags, backups | Done |
| All 9 exercise types: terminal mission, live lab, Python, JavaScript, SQL, find the flaw, architecture builder, explain it back, consultant case | Done |
| All 7 visualizations: web request trip, DNS lookup, HTTPS handshake, CORS decision, polling vs. WebSockets, Git branches, SQL join | Done |
| Study plan generator and test-out quiz | Done |
| Prerequisites at the top of every lesson (needed or helpful, done or not, with links), never locking anything | Done |
| Weekly feedback: "How clear was this?" after each lesson, notes at any time, and a feedback file the learner sends you | Done |
| The beginner rule: every idea a lesson uses is taught first, checked automatically (see [content/STYLE.md](content/STYLE.md)) | Done |
| **Stage 1, Learning with AI** (3 lessons): AI as a tutor, when AI is confidently wrong, asking good questions | Done |
| **Stage 1, How computers run software** (10 lessons): files and paths, the terminal, Bash, code and the programs that run it, processes and ports, environment variables and PATH, settings files (JSON, YAML, .env), packages and lockfiles, npm run dev, installing Python | Done |
| **Stage 1, Git and GitHub** (7 lessons): first commits, .gitignore and history, branches, conflicts, push/pull/pull requests, undoing mistakes, and the milestone: publishing a page with GitHub Pages | Done |
| **Stage 1, Reading code** (13 lessons): Python values, first functions, decisions, loops, functions in depth, data, tracebacks, debugging and scripts, then JavaScript basics, array methods, Node and async, and reading unfamiliar code | Done |
| **Stage 2, How a web request really works** (8 lessons: the request trip, IPs and ports, DNS, HTTP, HTTPS, APIs and JSON, CORS, live updates) | Done |
| Every other topic in Stages 2–4 | Shown in the plan as "not written yet", delivered later through `update.bat` |

Three lessons need the internet, and say so: installing Python, installing Git (the first Git lesson), and the GitHub Pages milestone. When offline, Today skips them and suggests the next lesson that works offline. The terminal lessons use the copy of Node that came with Groundwork, so learners can run real JavaScript and npm without installing anything.

## How you use it

| You want to… | Do this |
| --- | --- |
| Get it | Download the ZIP from https://github.com/noachFrank/groundwork (green **Code** button → **Download ZIP**), see [GETTING-STARTED.md](GETTING-STARTED.md) |
| Start the app | Double-click **start.bat**, or the **Groundwork** shortcut on the Desktop |
| Stop the app | Close the black window |
| Get new lessons | Close the app, connect to the internet, double-click **update.bat** |
| Back up progress | In the app, go to **Settings → Download a backup** |
| See your progress | **Course** shows each stage and course with a percentage. Click a course to see its lessons. **All lessons** lists every lesson as done, in progress or not started |

The first time you start it, it needs the internet for about 5–15 minutes, depending on the connection. After that it runs with **no internet at all**.

## Offline and online

Everything a lesson needs works offline. Anything that needs the internet is labeled, and when there's no connection, it says so instead of failing:

> **You're offline.** Connect to the internet to watch this video. You can keep going with everything else and come back to this later.

| Works offline | Needs internet (labeled) |
| --- | --- |
| The app, lessons and diagrams | Videos (always optional extras) |
| Quizzes, reviews and progress | Real-world DNS lookups (a bonus task) |
| Python and SQL exercises (run inside the app) | Links to outside documentation |
| Local labs: CORS, WebSockets, DNS, HTTP | Pasting answers into Claude for feedback |
| Terminal missions | First-time setup, and `update.bat` |

The app checks for a real connection: the server makes a tiny request, every 20 seconds or so. It doesn't trust Windows's "connected" icon, so a dead hotel Wi-Fi counts as offline. The connection badge at the top shows the current state. When you're offline, **Today** skips past lessons that need the internet and says it did.

## What first-time setup does

`start.bat` assumes the computer has nothing installed:

1. **Checks the folder.** It stops with simple instructions if the app is still inside the zip file, or inside a OneDrive folder, since OneDrive syncing breaks the app.
2. **Downloads Node.js** (about 35 MB) into `.runtime\node`, inside this folder. It needs no admin rights, uses only `curl` and `tar`, which come with Windows, resumes broken downloads, and checks the file's fingerprint (SHA-256) before using it.
3. **Downloads the app's packages** (about 100 MB) with `npm ci`, retrying on slow connections.
4. **Prepares the lessons** (`vite build`). No internet is needed for this part.
5. **Creates the database**, adds a **Desktop shortcut**, starts the app, and opens the browser.

If the connection drops partway through, double-clicking `start.bat` again picks up where it stopped. On later starts it just compares two fingerprints and launches, with no internet needed.

## Where things are stored

| What | Where | Why |
| --- | --- | --- |
| The app | Wherever you unzipped it (`C:\Groundwork` is suggested) | |
| **Your progress** | `%LOCALAPPDATA%\Groundwork\progress.db` | Outside the app folder, so updates or a fresh download can't erase it, and outside OneDrive |
| Automatic backups | `%LOCALAPPDATA%\Groundwork\backups\` | One a day, the last 10 kept, plus one before any database upgrade |
| Practice folder | `%USERPROFILE%\Groundwork-Practice` | The only folder "Check my work" ever looks in |

## Safety

- Every server listens on `127.0.0.1` only, so other computers can't connect to them.
- Websites open in your browser can't use the app either. The server checks the `Host` header, which blocks a trick called DNS rebinding, and refuses changes from any other website.
- A Content-Security-Policy header stops the browser loading anything from outside this computer, except the YouTube player when you're online.
- "Check my work" only reads files inside the practice folder, ignores shortcuts that point elsewhere, and never runs commands.
- The labs are deliberately simple and hold no real data. They reset whenever the app restarts.

## Updating

`update.bat` gets the newest version:

- If the folder came from `git clone`, it runs `git pull`.
- Otherwise it downloads the zip from GitHub and replaces the app's files. It never touches `.runtime`, `node_modules` or your progress.

Then it installs any new packages and re-prepares the lessons.

The project lives at **https://github.com/noachFrank/groundwork**. `groundwork.config.json` points `update.bat` there. If the repository ever moves, change `"githubRepo"` to the new `username/repository`. Zip updates need the repository to stay **public**.

---

## For developers

### Technical design

| Part | Choice |
| --- | --- |
| Frontend | React, TypeScript and Vite |
| Backend | A small Node server using [Hono](https://hono.dev), with a JSON API at `/api` |
| Database | SQLite through Node's built-in `node:sqlite` (needs Node ≥ 22.13; `start.bat` uses 24 LTS) |
| Lessons | MDX files in `content/`, with exercises and quizzes in each file's YAML header |
| Code in the browser | Pyodide (Python) in a web worker, sql.js (SQL), CodeMirror (the editor). All served from `node_modules`, with nothing loaded from outside. JavaScript exercises run in a worker served from `/js-runner.js` with its own policy (`default-src 'none'`), so learner code can be evaluated but can't reach the network, and is stopped after 5 seconds |
| Reviews | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), day-based, with a daily limit |
| Labs | Real servers on ports 4311–4314: a website and an API on separate origins (CORS), WebSocket and polling, and a practice HTTP API. There's also a real UDP DNS server on `127.0.0.1:53`, because Windows's `nslookup` ignores `-port`. It needs no admin rights on loopback, and falls back to 4315 with an in-app lookup box if 53 is taken |

### Commands

```bash
npm install
npm run dev            # server and hot-reloading frontend at http://localhost:5173
npm start              # the production build at http://localhost:4310
npm test               # progress, scheduling, plan, API, labs, security
npm run check-content  # validates every lesson and runs every exercise's solution and wrong answer
npm run check-content -- --links   # also confirms videos and doc links still exist (needs internet)
npm run e2e            # drives a real browser through every lesson (start the app first)
npm run typecheck
npm run feedback-report  # summarizes the feedback files in feedback/ (see below)
```

### Getting feedback from a learner

Learners' notes and "How clear was this?" answers stay on their own computer. Once a week, they download a feedback file from **Settings → Send feedback** and send it to you. Each file covers only what's new since their last send, with the dates it covers, and every item it includes is marked "Sent". A learner can mark an item as not sent to change it and send it again.

1. Save the files you receive into `feedback/`. It's ignored by Git, because it holds private messages.
2. Run `npm run feedback-report`. It prints the least clear lessons, the ideas most often ticked as unclear, and everything written, grouped by lesson. An item sent twice appears once, in its newest version.
3. Fix or add lessons, following [content/STYLE.md](content/STYLE.md). Raise a lesson's `revision:` when you change it, so learners who finished it see "rewritten: worth a re-read".
4. Commit and push. The learner runs `update.bat`.

The name in "Send feedback to …" comes from `developerName` in `groundwork.config.json`.

For an offline browser run, start the app with `GROUNDWORK_FORCE_OFFLINE=1`, then run `npm run e2e -- --offline`. The script blocks and reports any request to an outside address.

Useful environment variables: `GROUNDWORK_DATA_DIR`, `GROUNDWORK_PRACTICE_DIR`, `GROUNDWORK_FORCE_OFFLINE=1`, `GROUNDWORK_NO_BROWSER=1`, and `GROUNDWORK_NO_SHORTCUT=1`.

### Project layout

```
start.bat, update.bat     double-click entry points (CRLF, kept that way by .gitattributes)
scripts/                  first-run setup (get-node.ps1, launch.mjs, lib.mjs), update, checks, e2e
server/                   API, database and migrations, labs, "Check my work", connectivity
shared/                   code used by both sides: types, plan generator, scheduler, validation
src/                      the web app: pages, lesson flow, exercises, visualizations
content/                  curriculum.yaml, the lesson modules, and practice datasets
tests/                    automated tests
```

### Writing a lesson

Add an `.mdx` file to a module folder. A new module folder also needs a `module.yaml` (id, title, summary, stage, order); the course is ordered by stage, then by `order`. The YAML header holds the structured parts: `predict`, `tasks`, `recall`, `cards`, `testOut`, `docs` and `videos`. The body is the Learn step, and can use `<Viz name="…" />`, `<Callout>` and `<ConsultantNote>`. Terminal steps can write `{{nodeDir}}` for the folder of the Node that runs Groundwork, and checks can use `notContains` as well as `contains`. Then run `npm run check-content`. It refuses a lesson marked `offline` if any required task needs the internet, and it proves each exercise's reference solution passes while its wrong answer fails.

Keep lesson and card `id`s stable once they've been shipped, because progress and reviews are stored by id.

### Database changes

Add a new entry to the end of `MIGRATIONS` in `server/db.ts`, and never edit an old one. The app backs up the database automatically before upgrading it.
