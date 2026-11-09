# ISM6427C-Suno-Music — SongForge

A web app that lets anyone generate original songs with AI, powered by the
[Suno API](https://docs.sunoapi.org/) and hosted on Netlify.

## Purpose
SongForge makes music creation open to everyone. You don't need instruments, studio
time or music training: describe an idea, or bring your own lyrics, and get original
songs in minutes. Use them for school projects, videos, podcasts, small businesses,
gifts or just for fun.

## Features
- **Simple mode** – describe a song ("upbeat summer pop about road trips") and the AI writes the lyrics, title and style.
- **Custom mode** – set your own title, style tags and exact lyrics, plus vocal gender, length, style adherence, weirdness and excluded styles.
- **AI lyric writer** – generate lyric drafts from a topic and drop them into Custom mode.
- **Personas** – turn any finished song into a persona (its voice and style), then pick it when creating new songs so they sound alike.
- **Instrumental toggle** and model picker (V6, V6 Mini, V6 Wild).
- Live progress, streaming preview while the full track finishes, built-in player, lyrics view and MP3 download.
- Song history saved in the browser; remaining API credits shown in the header.

## How it works
```
Browser (public/)  ──►  Netlify Functions (/api/*)  ──►  https://api.sunoapi.org
                         holds SUNO_API_KEY
```
The API key is **never** sent to the browser. The front end calls our own functions:

| App route            | Suno endpoint                         |
|----------------------|----------------------------------------|
| `POST /api/generate` | `POST /api/v1/generate`                |
| `GET  /api/status`   | `GET  /api/v1/generate/record-info`    |
| `GET  /api/credits`  | `GET  /api/v1/generate/credit`         |
| `POST/GET /api/lyrics` | `POST /api/v1/lyrics`, `GET /api/v1/lyrics/record-info` |
| `POST /api/persona`  | `POST /api/v1/generate/generate-persona` (the returned `personaId` is sent to `/api/v1/generate`) |
| `POST /api/callback` | receives Suno's completion webhook (the app polls instead) |

## Deploy on Netlify
1. In Netlify: **Add new site → Import an existing project → GitHub** and pick this repo (branch `main`).
2. Build settings are read from `netlify.toml` (publish `public`, functions `netlify/functions`, no build command).
3. **Site configuration → Environment variables → Add variable**
   - Key: `SUNO_API_KEY`
   - Value: your key from <https://sunoapi.org/api-key>
4. Trigger a deploy (Deploys → Trigger deploy) so the functions pick up the variable.

## Run locally (optional)
```bash
npm i -g netlify-cli
cp .env.example .env   # then put your key in .env
netlify dev
```

Generated files are hosted by Suno for about 14 days, so download anything you want to keep.
