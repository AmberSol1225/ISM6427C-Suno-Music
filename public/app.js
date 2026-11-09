// SongForge front-end. Talks only to our own Netlify Functions under /api/*,
// which hold the Suno API key server-side.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STORE_KEY = "songforge.tasks.v1";
const POLL_MS = 6000;
const MAX_POLL_MS = 15 * 60 * 1000;

const STATUS_LABEL = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Writing music…",
  FIRST_SUCCESS: "Finishing…",
  SUCCESS: "Ready",
  CREATE_TASK_FAILED: "Failed",
  GENERATE_AUDIO_FAILED: "Failed",
  CALLBACK_EXCEPTION: "Failed",
  SENSITIVE_WORD_ERROR: "Blocked",
  TIMEOUT: "Timed out",
};
const STATUS_PROGRESS = { PENDING: 15, TEXT_SUCCESS: 45, FIRST_SUCCESS: 80, SUCCESS: 100 };

const IDEAS = [
  "Lo-fi hip hop beat for late-night studying, rain sounds",
  "Epic orchestral trailer music with choir and big drums",
  "Feel-good country song about a Friday night bonfire",
  "Latin reggaeton anthem about dancing in Miami",
  "Acoustic love ballad, warm male vocals, gentle guitar",
];
const STYLES = ["pop", "hip hop", "lo-fi", "EDM", "rock", "R&B", "country", "jazz", "reggaeton", "cinematic", "acoustic", "synthwave"];

// ---------------- storage ----------------
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function saveTasks() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(tasks.slice(0, 100)));
  } catch {
    /* storage unavailable — library just won't persist */
  }
}
let tasks = loadTasks();

// Personas (saved voice + style from a finished song), kept in this browser.
const PERSONA_KEY = "songforge.personas.v1";
function loadPersonas() {
  try {
    const list = JSON.parse(localStorage.getItem(PERSONA_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
let personas = loadPersonas();
function savePersonas() {
  try {
    localStorage.setItem(PERSONA_KEY, JSON.stringify(personas));
  } catch {
    /* storage unavailable */
  }
}
function renderPersonaSelect(selectId) {
  const sel = $("#persona");
  const keep = selectId ?? sel.value;
  sel.innerHTML = '<option value="">None — fresh voice &amp; style</option>';
  for (const p of personas) {
    const o = document.createElement("option");
    o.value = p.personaId;
    o.textContent = `🎤 ${p.name}`;
    sel.appendChild(o);
  }
  sel.value = personas.some((p) => p.personaId === keep) ? keep : "";
  $("#personaHint").textContent = personas.length
    ? "New songs will borrow this persona's voice and style."
    : "Make a persona from any finished song (🎤 button) to reuse its voice and style.";
}

// ---------------- api ----------------
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server returned an unexpected response (HTTP ${res.status}).`);
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
  return data;
}

// ---------------- credits ----------------
async function refreshCredits() {
  const el = $("#credits");
  const txt = $("#creditsText");
  try {
    const { credits } = await api("/api/credits");
    el.className = "credits ok";
    txt.textContent = `${Number(credits).toLocaleString()} credits`;
  } catch (err) {
    el.className = "credits err";
    txt.textContent = "Credits unavailable";
    el.title = err.message;
  }
}

// ---------------- form / mode ----------------
let mode = "simple";
function setMode(next) {
  mode = next;
  $$(".tab").forEach((t) => {
    const active = t.dataset.mode === next;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });
  $(".mode-simple").hidden = next !== "simple";
  $(".mode-custom").hidden = next !== "custom";
  $$(".custom-only").forEach((el) => (el.hidden = next !== "custom"));
  $$(".simple-only").forEach((el) => (el.hidden = next !== "simple"));
  syncInstrumental();
  hideError();
}

function syncInstrumental() {
  const inst = $("#instrumental").checked;
  $(".lyrics-field").hidden = mode !== "custom" || inst;
}

function showError(msg) {
  const el = $("#formError");
  el.textContent = msg;
  el.hidden = false;
}
function hideError() {
  $("#formError").hidden = true;
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.innerHTML = busy ? `<span class="spinner"></span><span>${label}</span>` : label;
}

function collectPayload() {
  const instrumental = $("#instrumental").checked;
  const base = { customMode: mode === "custom", instrumental, model: $("#model").value, personaId: $("#persona").value };

  if (mode === "simple") {
    return { ...base, prompt: $("#prompt").value.trim(), style: $("#style").value.trim() };
  }
  return {
    ...base,
    title: $("#title").value.trim(),
    style: $("#style").value.trim(),
    lyrics: instrumental ? "" : $("#lyrics").value.trim(),
    negativeTags: $("#negativeTags").value.trim(),
    vocalGender: $("#vocalGender").value,
    duration: Number($("#duration").value),
    styleWeight: Number($("#styleWeight").value),
    weirdnessConstraint: Number($("#weirdness").value),
  };
}

function validate(p) {
  if (!p.customMode) {
    if (!p.prompt && !p.style) return "Describe the song you want to create.";
  } else {
    if (!p.style) return "Add a style or genre (e.g. “indie pop, dreamy synths”).";
    if (!p.instrumental && !p.lyrics) return "Add lyrics, use “Write lyrics”, or turn on Instrumental.";
  }
  return null;
}

async function onGenerate(e) {
  e.preventDefault();
  hideError();
  const payload = collectPayload();
  const problem = validate(payload);
  if (problem) return showError(problem);

  const btn = $("#generateBtn");
  setBusy(btn, true, "Starting…");
  try {
    const { taskId } = await api("/api/generate", { method: "POST", body: JSON.stringify(payload) });
    if (!taskId) throw new Error("No task ID returned from Suno.");
    const label =
      payload.customMode
        ? payload.title || payload.style
        : payload.prompt || payload.style;
    const task = {
      taskId,
      label: label.slice(0, 140),
      meta: [
        payload.model.replace("_", " "),
        payload.instrumental ? "Instrumental" : "Vocals",
        payload.customMode ? "Custom" : "Simple",
        personas.find((p) => p.personaId === payload.personaId)?.name,
      ]
        .filter(Boolean)
        .join(" · "),
      createdAt: Date.now(),
      status: "PENDING",
      tracks: [],
    };
    tasks.unshift(task);
    saveTasks();
    render();
    poll(task);
    $("#library").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(btn, false, "✨ Generate song");
  }
}

// ---------------- polling ----------------
const polling = new Set();
async function poll(task) {
  if (polling.has(task.taskId)) return;
  polling.add(task.taskId);
  try {
    while (true) {
      if (Date.now() - task.createdAt > MAX_POLL_MS) {
        task.status = "TIMEOUT";
        task.errorMessage = "This is taking longer than usual. Reload the page later to check again.";
        task.done = true;
        break;
      }
      try {
        const r = await api(`/api/status?taskId=${encodeURIComponent(task.taskId)}`);
        task.status = r.status;
        if (r.tracks?.length) task.tracks = r.tracks;
        task.errorMessage = r.errorMessage;
        task.done = r.done;
        task.failed = r.failed;
        saveTasks();
        renderTask(task);
        if (r.done) {
          if (!r.failed) refreshCredits();
          break;
        }
      } catch (err) {
        // transient error (rate limit, network) — keep trying
        console.warn("poll error", err);
      }
      await new Promise((res) => setTimeout(res, POLL_MS));
    }
  } finally {
    polling.delete(task.taskId);
    saveTasks();
    renderTask(task);
  }
}

// ---------------- rendering ----------------
function fmtDuration(sec) {
  if (!sec && sec !== 0) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtTime(ts) {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function render() {
  const lib = $("#library");
  lib.innerHTML = "";
  for (const t of tasks) lib.appendChild(buildTask(t));
  $("#emptyState").hidden = tasks.length > 0;
}

function renderTask(task) {
  const existing = document.querySelector(`[data-task="${CSS.escape(task.taskId)}"]`);
  const fresh = buildTask(task);
  if (existing) existing.replaceWith(fresh);
  else render();
}

function buildTask(task) {
  const node = $("#taskTpl").content.firstElementChild.cloneNode(true);
  node.dataset.task = task.taskId;
  $(".task-title", node).textContent = task.label || "Untitled";
  $(".task-meta", node).textContent = `${task.meta || ""} · ${fmtTime(task.createdAt)}`;

  const badge = $(".badge", node);
  badge.textContent = STATUS_LABEL[task.status] || task.status;
  if (task.status === "SUCCESS") badge.classList.add("ok");
  if (task.failed || task.status === "TIMEOUT") badge.classList.add("err");

  const progress = $(".progress", node);
  if (task.done) node.classList.add("done");
  else {
    const pct = STATUS_PROGRESS[task.status];
    if (pct) $(".bar", progress).style.width = `${pct}%`;
    else progress.classList.add("indeterminate");
  }

  if (task.errorMessage && (task.failed || task.status === "TIMEOUT")) {
    const err = $(".task-error", node);
    err.textContent = task.errorMessage;
    err.hidden = false;
  }

  const list = $(".task-tracks", node);
  for (const tr of task.tracks || []) list.appendChild(buildTrack(tr, task));
  return node;
}

function buildTrack(tr, task) {
  const node = $("#trackTpl").content.firstElementChild.cloneNode(true);
  node.dataset.track = tr.id;
  const src = tr.audioUrl || tr.streamUrl;

  const img = $("img", node);
  if (tr.imageUrl) img.src = tr.imageUrl;
  else img.remove();

  $(".track-title", node).textContent = tr.title || task.label || "Untitled";
  $(".track-tags", node).textContent = tr.tags || "";
  const sub = [];
  if (tr.duration) sub.push(fmtDuration(tr.duration));
  if (!tr.audioUrl && tr.streamUrl) sub.push("streaming preview — full file coming");
  $(".track-sub", node).textContent = sub.join(" · ");

  const cover = $(".cover", node);
  if (!src) {
    cover.disabled = true;
    $(".play-icon", node).textContent = "…";
  }
  cover.addEventListener("click", () => playTrack(tr, task));
  if (currentTrackId === tr.id) {
    node.classList.add("playing");
    $(".play-icon", node).textContent = audio.paused ? "▶" : "❚❚";
  }

  const dl = $(".download", node);
  if (tr.audioUrl) {
    dl.href = tr.audioUrl;
    dl.setAttribute("download", `${(tr.title || "song").replace(/[^\w\- ]+/g, "")}.mp3`);
  } else {
    dl.setAttribute("aria-disabled", "true");
  }

  const personaBtn = $(".persona-btn", node);
  if (task.status !== "SUCCESS" || !tr.audioUrl || !tr.id) personaBtn.remove();
  else if (tr.personaId) {
    personaBtn.textContent = "🎤 Use persona";
    personaBtn.title = "Use this song's persona for your next song";
    personaBtn.addEventListener("click", () => {
      renderPersonaSelect(tr.personaId);
      $("#createTitle").scrollIntoView({ behavior: "smooth" });
    });
  } else personaBtn.addEventListener("click", () => openPersonaDialog(tr, task));

  const lyricsBtn = $(".lyrics-toggle", node);
  const pre = $(".track-lyrics", node);
  const instrumentalOnly = !tr.lyrics || /^\s*$/.test(tr.lyrics);
  if (instrumentalOnly) lyricsBtn.remove();
  else {
    pre.textContent = tr.lyrics;
    lyricsBtn.addEventListener("click", () => {
      pre.hidden = !pre.hidden;
      lyricsBtn.textContent = pre.hidden ? "Lyrics" : "Hide";
    });
  }
  return node;
}

// ---------------- player ----------------
const audio = $("#audio");
let currentTrackId = null;

function playTrack(tr, task) {
  const src = tr.audioUrl || tr.streamUrl;
  if (!src) return;
  if (currentTrackId === tr.id) {
    audio.paused ? audio.play() : audio.pause();
    return;
  }
  currentTrackId = tr.id;
  audio.src = src;
  $("#player").hidden = false;
  $("#playerTitle").textContent = tr.title || task.label || "Untitled";
  $("#playerTags").textContent = tr.tags || "";
  const art = $("#playerArt");
  if (tr.imageUrl) art.src = tr.imageUrl;
  else art.removeAttribute("src");
  audio.play().catch(() => {});
  highlightPlaying();
}

function highlightPlaying() {
  $$(".track").forEach((el) => {
    const on = el.dataset.track === currentTrackId;
    el.classList.toggle("playing", on);
    const icon = $(".play-icon", el);
    if (icon && !$(".cover", el).disabled) icon.textContent = on && !audio.paused ? "❚❚" : "▶";
  });
}
audio.addEventListener("play", highlightPlaying);
audio.addEventListener("pause", highlightPlaying);
audio.addEventListener("ended", highlightPlaying);

// ---------------- personas ----------------
let personaTarget = null;
function openPersonaDialog(tr, task) {
  personaTarget = { tr, task };
  $("#personaSource").textContent = tr.title || task.label || "this song";
  $("#personaName").value = tr.title ? `${tr.title} voice`.slice(0, 100) : "";
  $("#personaDesc").value = tr.tags || "";
  $("#personaError").hidden = true;
  $("#personaDialog").showModal();
}

async function onCreatePersona(e) {
  e.preventDefault();
  const { tr, task } = personaTarget || {};
  if (!tr) return;
  const name = $("#personaName").value.trim();
  const description = $("#personaDesc").value.trim();
  const errEl = $("#personaError");
  if (!name || !description) {
    errEl.textContent = "Add a name and a short description of the sound.";
    errEl.hidden = false;
    return;
  }
  const btn = $("#personaSave");
  setBusy(btn, true, "Creating…");
  try {
    const r = await api("/api/persona", {
      method: "POST",
      body: JSON.stringify({ taskId: task.taskId, audioId: tr.id, name, description, style: tr.tags || "" }),
    });
    personas.unshift({ personaId: r.personaId, name: r.name, description: r.description, createdAt: Date.now() });
    savePersonas();
    tr.personaId = r.personaId; // each song can only become a persona once
    saveTasks();
    renderTask(task);
    renderPersonaSelect(r.personaId);
    $("#personaDialog").close();
    refreshCredits();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    setBusy(btn, false, "Create persona");
  }
}

// ---------------- lyrics helper ----------------
async function onWriteLyrics() {
  const idea = $("#lyricsIdea").value.trim() || $("#title").value.trim() || $("#style").value.trim();
  if (!idea) return showError("Type a topic for the lyrics first (e.g. “falling in love in Fort Lauderdale”).");
  hideError();

  const btn = $("#lyricsBtn");
  const box = $("#lyricVariants");
  setBusy(btn, true, "Writing…");
  box.hidden = true;
  try {
    const { taskId } = await api("/api/lyrics", { method: "POST", body: JSON.stringify({ prompt: idea.slice(0, 200) }) });
    const started = Date.now();
    let result;
    while (Date.now() - started < 3 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        result = await api(`/api/lyrics?taskId=${encodeURIComponent(taskId)}`);
      } catch {
        continue;
      }
      if (result.done) break;
    }
    if (!result?.done) throw new Error("Lyrics are taking too long. Please try again.");
    if (result.failed || !result.variants.length) throw new Error(result.errorMessage || "Couldn't write lyrics for that idea.");

    box.innerHTML = "";
    result.variants.forEach((v) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "variant";
      b.innerHTML = `<strong></strong><span></span>`;
      b.querySelector("strong").textContent = `Use: ${v.title || "Lyrics"}`;
      b.querySelector("span").textContent = v.text;
      b.addEventListener("click", () => {
        $("#lyrics").value = v.text;
        if (!$("#title").value && v.title) $("#title").value = v.title;
        updateCounts();
        box.hidden = true;
      });
      box.appendChild(b);
    });
    box.hidden = false;
    refreshCredits();
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(btn, false, "✍️ Write lyrics");
  }
}

// ---------------- theme ----------------
const THEME_KEY = "songforge.theme";
function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else root.removeAttribute("data-theme"); // system: CSS follows prefers-color-scheme
  $$("[data-theme-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === choice)));
}
function initTheme() {
  let saved = "system";
  try {
    saved = localStorage.getItem(THEME_KEY) || "system";
  } catch {
    /* storage unavailable */
  }
  applyTheme(saved);
  $$("[data-theme-choice]").forEach((b) =>
    b.addEventListener("click", () => {
      const choice = b.dataset.themeChoice;
      applyTheme(choice);
      try {
        localStorage.setItem(THEME_KEY, choice);
      } catch {
        /* storage unavailable */
      }
    })
  );
}

// ---------------- misc UI ----------------
function updateCounts() {
  $("#promptCount").textContent = $("#prompt").value.length;
  $("#lyricsCount").textContent = $("#lyrics").value.length;
}

function chip(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function init() {
  initTheme();
  $$(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
  $("#instrumental").addEventListener("change", syncInstrumental);
  $("#genForm").addEventListener("submit", onGenerate);
  $("#lyricsBtn").addEventListener("click", onWriteLyrics);
  $("#prompt").addEventListener("input", updateCounts);
  $("#lyrics").addEventListener("input", updateCounts);

  const bindRange = (id, out, fmt) => {
    const el = $(id);
    const sync = () => ($(out).textContent = fmt(el.value));
    el.addEventListener("input", sync);
    sync();
  };
  bindRange("#duration", "#durationVal", (v) => v);
  bindRange("#styleWeight", "#styleWeightVal", (v) => Number(v).toFixed(2));
  bindRange("#weirdness", "#weirdVal", (v) => Number(v).toFixed(2));

  const ideas = $("#ideaChips");
  IDEAS.forEach((i) => ideas.appendChild(chip(i.split(",")[0], () => { $("#prompt").value = i; updateCounts(); })));
  const styles = $("#styleChips");
  STYLES.forEach((s) =>
    styles.appendChild(
      chip(s, () => {
        const el = $("#style");
        const parts = el.value.split(",").map((x) => x.trim()).filter(Boolean);
        if (!parts.includes(s)) parts.push(s);
        el.value = parts.join(", ");
      })
    )
  );

  $("#clearBtn").addEventListener("click", () => {
    if (!tasks.length || !confirm("Remove all songs from this browser's list?")) return;
    tasks = tasks.filter((t) => polling.has(t.taskId));
    saveTasks();
    render();
  });

  $("#personaForm").addEventListener("submit", onCreatePersona);
  $("#personaCancel").addEventListener("click", () => $("#personaDialog").close());
  renderPersonaSelect();

  setMode("simple");
  updateCounts();
  render();
  refreshCredits();
  // Resume polling for anything still in progress from a previous visit.
  tasks.filter((t) => !t.done || t.status === "TIMEOUT").forEach((t) => {
    if (t.status === "TIMEOUT") {
      t.createdAt = Date.now();
      t.done = false;
    }
    poll(t);
  });
}

init();
