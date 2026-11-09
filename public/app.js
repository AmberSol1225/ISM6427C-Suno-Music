// SongForge front-end. Talks only to our own Netlify functions under /api/*,
// which hold the Suno API key server-side.

const $ = (sel, root = document) => root.querySelector(sel);
const STORAGE_KEY = "songforge.jobs.v1";
const PW_KEY = "songforge.pw";
const POLL_MS = 8000;
const MAX_POLL_MS = 10 * 60 * 1000;

const FAIL_STATUSES = new Set([
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "CALLBACK_EXCEPTION",
  "SENSITIVE_WORD_ERROR",
  "GENERATE_LYRICS_FAILED",
  "FAILED",
]);
const STATUS_LABEL = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Writing music",
  FIRST_SUCCESS: "Almost there",
  SUCCESS: "Ready",
};
const STATUS_PROGRESS = { PENDING: 15, TEXT_SUCCESS: 45, FIRST_SUCCESS: 80, SUCCESS: 100 };

const IDEAS = [
  "A dreamy lo-fi hip hop beat for studying late at night",
  "An upbeat summer pop anthem about road trips with friends",
  "A cinematic orchestral piece for an epic battle scene",
  "A soulful acoustic love song with warm male vocals",
  "A high-energy EDM track with a massive drop",
];
const STYLES = ["pop", "lo-fi", "hip hop", "rock", "edm", "jazz", "r&b", "country", "cinematic", "synthwave", "acoustic"];

// ---------- storage ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};
let jobs = store.get(STORAGE_KEY, []);
const saveJobs = () => store.set(STORAGE_KEY, jobs.slice(0, 50));

// ---------- API ----------
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const pw = store.get(PW_KEY, "");
  if (pw) headers["x-app-password"] = pw;
  const res = await fetch(path, { ...options, headers });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (res.status === 401 && data.needsPassword) {
    await askPassword();
    return api(path, options);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function askPassword() {
  const dlg = $("#pw-dialog");
  const input = $("#pw-input");
  input.value = "";
  return new Promise((resolve) => {
    dlg.addEventListener("close", function onClose() {
      dlg.removeEventListener("close", onClose);
      store.set(PW_KEY, input.value);
      resolve();
    });
    dlg.showModal();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- credits ----------
async function loadCredits() {
  const el = $("#credits strong");
  try {
    const data = await api("/api/credits");
    const n = typeof data === "number" ? data : data?.credits ?? data?.remainingCredits;
    el.textContent = n ?? "—";
  } catch {
    el.textContent = "—";
  }
}

// ---------- form ----------
const form = $("#gen-form");
const desc = $("#description");
const lyrics = $("#lyrics");
const titleIn = $("#title");
const styleIn = $("#style");
const modelSel = $("#model");
const instrumental = $("#instrumental");
const errorBox = $("#form-error");
let mode = "simple";
form.dataset.mode = mode;

document.querySelectorAll(".mode").forEach((btn) =>
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    form.dataset.mode = mode;
    document.querySelectorAll(".mode").forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", String(b === btn));
    });
    hideError();
  })
);

instrumental.addEventListener("change", () => form.classList.toggle("is-instrumental", instrumental.checked));

function limitsFor(model) {
  const v4 = model === "V4";
  return { lyrics: v4 ? 3000 : 5000, style: v4 ? 200 : 1000, title: v4 ? 80 : 100 };
}
function applyLimits() {
  const l = limitsFor(modelSel.value);
  lyrics.maxLength = l.lyrics;
  styleIn.maxLength = l.style;
  titleIn.maxLength = l.title;
  $("#lyrics-max").textContent = l.lyrics;
}
modelSel.addEventListener("change", applyLimits);
applyLimits();

const bindCount = (input, out) => {
  const update = () => ($(out).textContent = input.value.length);
  input.addEventListener("input", update);
  update();
};
bindCount(desc, "#description-count");
bindCount(lyrics, "#lyrics-count");

const ideaChips = $("#idea-chips");
IDEAS.forEach((idea) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = idea.split(" ").slice(1, 4).join(" ") + "…";
  b.title = idea;
  b.addEventListener("click", () => {
    desc.value = idea;
    desc.dispatchEvent(new Event("input"));
  });
  ideaChips.appendChild(b);
});
const styleChips = $("#style-chips");
STYLES.forEach((s) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = s;
  b.addEventListener("click", () => {
    const parts = styleIn.value.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.includes(s)) parts.push(s);
    styleIn.value = parts.join(", ");
  });
  styleChips.appendChild(b);
});

function showError(msg) { errorBox.textContent = msg; errorBox.classList.remove("hidden"); }
function hideError() { errorBox.classList.add("hidden"); }

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.innerHTML = busy ? `<span class="spinner"></span><span>${label}</span>` : `<span class="btn-label">${label}</span>`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();
  const payload = {
    customMode: mode === "custom",
    instrumental: instrumental.checked,
    model: modelSel.value,
    vocalGender: $("#vocal-gender").value,
    negativeTags: $("#negative").value.trim(),
  };
  if (mode === "simple") {
    payload.prompt = desc.value.trim();
    if (!payload.prompt) return showError("Describe the song you want.");
  } else {
    payload.title = titleIn.value.trim();
    payload.style = styleIn.value.trim();
    payload.prompt = lyrics.value.trim();
    if (!payload.title) return showError("Give your song a title.");
    if (!payload.style) return showError("Describe the style of music.");
    if (!payload.instrumental && !payload.prompt) return showError("Add lyrics, or turn on Instrumental.");
  }

  const btn = $("#generate-btn");
  setBusy(btn, true, "Starting…");
  try {
    const data = await api("/api/generate", { method: "POST", body: JSON.stringify(payload) });
    if (!data.taskId) throw new Error("No task id returned by the API.");
    const job = {
      id: data.taskId,
      title: payload.title || payload.prompt.slice(0, 60) || "Untitled",
      model: payload.model,
      createdAt: Date.now(),
      status: "PENDING",
      tracks: [],
    };
    jobs.unshift(job);
    saveJobs();
    render();
    poll(job.id);
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(btn, false, "Generate song");
  }
});

// ---------- AI lyrics ----------
$("#ai-lyrics-btn").addEventListener("click", () => {
  $("#ai-lyrics-box").classList.toggle("hidden");
  $("#lyrics-idea").focus();
});
$("#lyrics-go").addEventListener("click", async () => {
  const idea = $("#lyrics-idea").value.trim();
  if (!idea) return showError("Tell the AI what the lyrics should be about.");
  hideError();
  const btn = $("#lyrics-go");
  setBusy(btn, true, "Writing…");
  try {
    const { taskId } = await api("/api/lyrics", { method: "POST", body: JSON.stringify({ prompt: idea }) });
    const start = Date.now();
    while (Date.now() - start < 3 * 60 * 1000) {
      await sleep(4000);
      const d = await api(`/api/lyrics?taskId=${encodeURIComponent(taskId)}`);
      if (FAIL_STATUSES.has(d.status)) throw new Error(d.errorMessage || "Lyrics generation failed.");
      const items = d.response?.data || d.response?.lyricsData || [];
      const first = items.find((x) => x && x.text);
      if (d.status === "SUCCESS" && first) {
        lyrics.value = first.text;
        lyrics.dispatchEvent(new Event("input"));
        if (!titleIn.value && first.title) titleIn.value = first.title;
        $("#ai-lyrics-box").classList.add("hidden");
        return;
      }
    }
    throw new Error("Lyrics are taking too long. Try again.");
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(btn, false, "Generate");
  }
});

// ---------- polling ----------
const polling = new Set();
async function poll(id) {
  if (polling.has(id)) return;
  polling.add(id);
  try {
    while (true) {
      const job = jobs.find((j) => j.id === id);
      if (!job) return;
      if (Date.now() - job.createdAt > MAX_POLL_MS) {
        Object.assign(job, { status: "FAILED", error: "Timed out waiting for the song." });
        break;
      }
      try {
        const d = await api(`/api/status?taskId=${encodeURIComponent(id)}`);
        job.status = d.status || job.status;
        const tracks = d.response?.sunoData || d.response?.data || [];
        if (tracks.length) job.tracks = tracks.map(normalizeTrack);
        if (FAIL_STATUSES.has(job.status)) job.error = d.errorMessage || "Generation failed.";
        saveJobs();
        render();
        if (job.status === "SUCCESS" || FAIL_STATUSES.has(job.status)) break;
      } catch (err) {
        console.warn("poll error", err);
      }
      await sleep(POLL_MS);
    }
    saveJobs();
    render();
    loadCredits();
  } finally {
    polling.delete(id);
  }
}

function normalizeTrack(t) {
  return {
    id: t.id,
    title: t.title,
    tags: t.tags,
    lyrics: t.prompt,
    duration: t.duration,
    image: t.imageUrl || t.sourceImageUrl || "",
    audio: t.audioUrl || t.sourceAudioUrl || "",
    stream: t.streamAudioUrl || t.sourceStreamAudioUrl || "",
  };
}

// ---------- render ----------
const fmtTime = (s) => {
  if (!s && s !== 0) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
};

function render() {
  const wrap = $("#jobs");
  $("#empty").classList.toggle("hidden", jobs.length > 0);
  // Preserve playing audio elements: rebuild only jobs that changed.
  const existing = new Map([...wrap.children].map((el) => [el.dataset.id, el]));
  const order = [];
  for (const job of jobs) {
    const key = JSON.stringify([job.status, job.error, job.tracks.map((t) => [t.audio, t.stream, t.image, t.title])]);
    let el = existing.get(job.id);
    if (!el || el.dataset.key !== key) {
      const fresh = renderJob(job);
      fresh.dataset.key = key;
      if (el) {
        // keep the audio playing if the same src is still present
        el.querySelectorAll("audio").forEach((a) => {
          if (a.paused) return;
          const match = [...fresh.querySelectorAll("audio")].find((b) => b.src === a.src);
          if (match) match.replaceWith(a);
        });
        el.remove();
      }
      el = fresh;
    }
    existing.delete(job.id);
    order.push(el);
  }
  existing.forEach((el) => el.remove());
  order.forEach((el) => wrap.appendChild(el));
}

function renderJob(job) {
  const el = $("#job-tpl").content.firstElementChild.cloneNode(true);
  el.dataset.id = job.id;
  $(".job-title", el).textContent = job.title;
  $(".job-meta", el).textContent = `${job.model?.replace("_", ".") || ""} · ${new Date(job.createdAt).toLocaleString()}`;
  const failed = FAIL_STATUSES.has(job.status);
  const done = job.status === "SUCCESS";
  const badge = $(".badge", el);
  badge.textContent = failed ? "Failed" : STATUS_LABEL[job.status] || job.status;
  badge.classList.toggle("done", done);
  badge.classList.toggle("failed", failed);
  el.classList.toggle("is-done", done || failed);
  $(".bar", el).style.width = `${STATUS_PROGRESS[job.status] ?? 10}%`;
  if (failed) {
    const e = $(".job-error", el);
    e.textContent = job.error || "Generation failed.";
    e.classList.remove("hidden");
  }
  const tracksEl = $(".tracks", el);
  for (const t of job.tracks) {
    const tr = $("#track-tpl").content.firstElementChild.cloneNode(true);
    if (t.image) $("img", tr).src = t.image;
    $(".track-title", tr).textContent = `${t.title || job.title}${t.duration ? ` · ${fmtTime(t.duration)}` : ""}`;
    $(".track-tags", tr).textContent = t.tags || "";
    const audio = $("audio", tr);
    const src = t.audio || t.stream;
    if (src) audio.src = src; else audio.classList.add("hidden");
    const dl = $(".download", tr);
    if (t.audio) {
      dl.href = t.audio;
      dl.setAttribute("download", `${(t.title || "song").replace(/[^\w\- ]+/g, "")}.mp3`);
    } else {
      dl.setAttribute("aria-disabled", "true");
      dl.textContent = "⏳ Finishing MP3…";
    }
    const lyr = $(".track-lyrics", tr);
    const toggle = $(".lyrics-toggle", tr);
    if (t.lyrics) {
      lyr.textContent = t.lyrics;
      toggle.addEventListener("click", () => lyr.classList.toggle("hidden"));
    } else {
      toggle.remove();
    }
    tracksEl.appendChild(tr);
  }
  return el;
}

$("#clear-btn").addEventListener("click", () => {
  if (!jobs.length || !confirm("Remove all songs from this list?")) return;
  jobs = [];
  saveJobs();
  render();
});

// ---------- boot ----------
render();
loadCredits();
jobs.filter((j) => j.status !== "SUCCESS" && !FAIL_STATUSES.has(j.status)).forEach((j) => poll(j.id));
