# SongForge: AI Music Generator (ISM6427C)

A web app that lets users generate original songs with AI, powered by the [sunoapi.org](https://docs.sunoapi.org/) API and deployed on Netlify.

## Features
- **Simple mode**: describe a song in plain English (up to 500 characters).
- **Custom mode**: set your own title, style tags and lyrics. Includes **✨ Write with AI** to generate lyrics.
- Instrumental toggle, model picker (V4 → V5.5), vocal gender, excluded styles.
- Live progress for each generation (Queued → Writing music → Almost there → Ready).
- Each request returns 2 tracks with cover art, an in-browser player, lyrics and an MP3 download.
- Song history is kept in the browser (localStorage).
- Shows remaining API credits.

## How it works
```
public/                 static front-end (HTML/CSS/vanilla JS), no build step
netlify/functions/      serverless proxy to https://api.sunoapi.org
  generate.mjs   POST /api/generate   -> POST /api/v1/generate
  status.mjs     GET  /api/status     -> GET  /api/v1/generate/record-info
  lyrics.mjs     POST/GET /api/lyrics -> /api/v1/lyrics (+ record-info)
  credits.mjs    GET  /api/credits    -> GET  /api/v1/generate/credit
  callback.mjs   /api/callback        (required callBackUrl, just acknowledges; the app polls)
```
The Suno API key lives **only** in a Netlify environment variable. It's never sent to the browser or committed to git.

## Deploying on Netlify
1. In Netlify: **Add new site → Import an existing project →** pick this repo (branch `main`).
   Build settings come from `netlify.toml` (publish `public`, functions `netlify/functions`). No build command is needed.
2. **Site configuration → Environment variables**, add:
   - `SUNO_API_KEY` = your key from https://sunoapi.org/api-key
   - *(optional)* `APP_PASSWORD` = a password users must enter before generating. Recommended, because otherwise anyone with the link can spend your credits.
3. Trigger a redeploy so the functions pick up the variables.

## Local development
```bash
npm i -g netlify-cli
cp .env.example .env   # fill in SUNO_API_KEY
netlify dev
```
