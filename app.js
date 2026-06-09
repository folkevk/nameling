const state = {
  manifest: null,
  names: [],
  normalizedToName: new Map(),
  prefixCache: new Map(),
  selectedMetric: "",
  selectedName: null,
  results: [],
  page: 0,
  pageSize: 10,
  debug: false,
  favorites: [],
  draggedFavorite: "",
  sessionId: "",
  supabaseClient: null,
  storageConsent: "unknown",
};

const elements = {
  form: document.querySelector("#search-form"),
  input: document.querySelector("#name-input"),
  suggestions: document.querySelector("#name-suggestions"),
  metric: document.querySelector("#metric-select"),
  status: document.querySelector("#status"),
  title: document.querySelector("#results-title"),
  list: document.querySelector("#results-list"),
  prev: document.querySelector("#prev-page"),
  next: document.querySelector("#next-page"),
  pageLabel: document.querySelector("#page-label"),
  favorites: document.querySelector("#favorites-list"),
  clearFavorites: document.querySelector("#clear-favorites"),
  consentBanner: document.querySelector("#consent-banner"),
  consentAllow: document.querySelector("#consent-allow"),
  consentDeny: document.querySelector("#consent-deny"),
};

const FAVORITES_KEY = "nameling.favorites";
const SESSION_KEY = "nameling.session_id";
const CONSENT_KEY = "nameling.consent";
const SUPABASE_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
let supabaseScriptPromise = null;

function normalizeName(value) {
  return value
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[.,;:!?()[\]{}"']+|[.,;:!?()[\]{}"']+$/g, "");
}

function prefixFor(normalized) {
  const prefixLength = state.manifest?.prefix_length || 2;
  return normalized.slice(0, prefixLength).padEnd(prefixLength, "_") || "_".repeat(prefixLength);
}

function formatMetricLabel(metric) {
  return metric.replaceAll("_", " ");
}

function formatScore(score) {
  if (!Number.isFinite(score)) return "";
  if (score >= 1) return score.toFixed(3);
  return score.toPrecision(4);
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function optionalStorageAllowed() {
  return state.storageConsent === "granted";
}

function setupSession() {
  if (!optionalStorageAllowed()) {
    state.sessionId = "";
    return;
  }
  try {
    state.sessionId = localStorage.getItem(SESSION_KEY) || createId();
    localStorage.setItem(SESSION_KEY, state.sessionId);
  } catch {
    state.sessionId = createId();
  }
}

function setupDebugMode() {
  const params = new URLSearchParams(window.location.search);
  state.debug = params.get("debug") === "on";
  document.body.classList.toggle("debug-mode", state.debug);
  document.body.classList.toggle("debug-on", state.debug);
}

function loadSupabaseLibrary() {
  if (window.supabase?.createClient) {
    return Promise.resolve();
  }
  if (!supabaseScriptPromise) {
    supabaseScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SUPABASE_SCRIPT_URL;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return supabaseScriptPromise;
}

async function setupSupabase() {
  if (!optionalStorageAllowed()) {
    state.supabaseClient = null;
    return;
  }
  const config = window.NAMELING_SUPABASE || {};
  if (!config.url || !config.anonKey) {
    return;
  }
  try {
    await loadSupabaseLibrary();
    state.supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  } catch (error) {
    state.supabaseClient = null;
    if (state.debug) {
      console.warn("Supabase library could not be loaded", error);
    }
  }
}

async function trackEvent(eventType, payload = {}) {
  if (!optionalStorageAllowed() || !state.supabaseClient) return;
  try {
    await state.supabaseClient.from("nameling_usage_events").insert({
      event_type: eventType,
      session_id: state.sessionId,
      metric: state.selectedMetric || null,
      query_name: state.selectedName?.name || null,
      payload,
    });
  } catch (error) {
    if (state.debug) {
      console.warn("Supabase logging failed", error);
    }
  }
}

function favoriteSnapshot() {
  return state.favorites.map((entry, index) => ({
    position: index + 1,
    id: entry.id,
    name: entry.name,
    normalized: entry.normalized,
  }));
}

function persistFavorites(eventType, payload = {}) {
  if (optionalStorageAllowed()) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
  }
  renderFavorites();
  trackEvent(eventType, {
    ...payload,
    favorites_order: favoriteSnapshot(),
  });
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} konnte nicht geladen werden`);
  }
  return response.json();
}

function setStatus(message) {
  elements.status.textContent = message;
}

function setEmpty(message) {
  elements.list.innerHTML = `<li class="empty-state">${message}</li>`;
  elements.title.textContent = "Top 10";
  elements.pageLabel.textContent = "0 / 0";
  elements.prev.disabled = true;
  elements.next.disabled = true;
}

function setMetricUnavailable(label = "Nicht geladen") {
  elements.metric.innerHTML = `<option value="">${label}</option>`;
  elements.metric.disabled = true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function populateNames(indexPayload) {
  state.names = indexPayload.names || [];
  state.normalizedToName = new Map(state.names.map((entry) => [entry.normalized, entry]));
}

function loadFavorites() {
  if (!optionalStorageAllowed()) {
    renderFavorites();
    return;
  }
  try {
    const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    state.favorites = favorites
      .map((entry) => state.normalizedToName.get(entry.normalized))
      .filter(Boolean);
  } catch {
    state.favorites = [];
  }
  renderFavorites();
}

function clearNamelingCookies() {
  document.cookie.split(";").forEach((cookie) => {
    const name = cookie.split("=")[0]?.trim();
    if (!name?.startsWith("nameling")) return;
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  });
}

function clearOptionalStorage() {
  try {
    localStorage.removeItem(FAVORITES_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore blocked storage; the app can continue without persistence.
  }
  clearNamelingCookies();
  state.sessionId = "";
  state.supabaseClient = null;
}

function rememberConsent(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    state.storageConsent = value;
  }
}

function hideConsentBanner() {
  if (elements.consentBanner) {
    elements.consentBanner.hidden = true;
  }
}

function showConsentBanner() {
  if (elements.consentBanner) {
    elements.consentBanner.hidden = false;
  }
}

async function applyConsent(value) {
  state.storageConsent = value;
  rememberConsent(value);
  hideConsentBanner();

  if (optionalStorageAllowed()) {
    setupSession();
    await setupSupabase();
    try {
      if (state.favorites.length) {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
      } else {
        loadFavorites();
      }
    } catch {
      renderFavorites();
    }
    trackEvent("consent_granted");
    return;
  }

  clearOptionalStorage();
  renderFavorites();
}

function setupConsent() {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    if (value === "granted" || value === "denied") {
      state.storageConsent = value;
      hideConsentBanner();
      if (value === "denied") {
        clearOptionalStorage();
      }
      return;
    }
  } catch {
    state.storageConsent = "unknown";
  }
  showConsentBanner();
}

function isFavorite(normalized) {
  return state.favorites.some((entry) => entry.normalized === normalized);
}

function addFavorite(entry, source = "result") {
  if (!entry || isFavorite(entry.normalized)) return;
  state.favorites.push(entry);
  persistFavorites("favorite_add", {
    source,
    favorite_name: entry.name,
    favorite_normalized: entry.normalized,
  });
  renderResults();
}

function removeFavorite(normalized, source = "favorites") {
  const entry = state.favorites.find((favorite) => favorite.normalized === normalized);
  state.favorites = state.favorites.filter((favorite) => favorite.normalized !== normalized);
  persistFavorites("favorite_remove", {
    source,
    favorite_name: entry?.name || null,
    favorite_normalized: normalized,
  });
  renderResults();
}

function toggleFavorite(entry, source = "result") {
  if (isFavorite(entry.normalized)) {
    removeFavorite(entry.normalized, source);
  } else {
    addFavorite(entry, source);
  }
}

function hideSuggestions() {
  elements.suggestions.classList.remove("is-open");
  elements.suggestions.innerHTML = "";
  elements.input.setAttribute("aria-expanded", "false");
}

function showSuggestions(rawQuery) {
  const query = normalizeName(rawQuery);
  if (!query) {
    hideSuggestions();
    return;
  }

  const startsWithMatches = [];
  const containsMatches = [];
  for (const entry of state.names) {
    if (entry.normalized.startsWith(query)) {
      startsWithMatches.push(entry);
    } else if (entry.normalized.includes(query)) {
      containsMatches.push(entry);
    }
    if (startsWithMatches.length >= 10 || startsWithMatches.length + containsMatches.length >= 20) {
      break;
    }
  }

  const matches = startsWithMatches.concat(containsMatches).slice(0, 10);
  if (!matches.length) {
    hideSuggestions();
    return;
  }

  elements.suggestions.innerHTML = matches
    .map(
      (entry) => `
        <button class="suggestion-button" type="button" data-name="${escapeHtml(entry.name)}" role="option">
          <span>${escapeHtml(entry.name)}</span>
        </button>
      `,
    )
    .join("");
  elements.suggestions.classList.add("is-open");
  elements.input.setAttribute("aria-expanded", "true");
}

function populateMetrics(manifest) {
  elements.metric.disabled = false;
  const metricIds = (manifest.metrics || []).map((metric) => metric.id);
  elements.metric.innerHTML = (manifest.metrics || [])
    .map((metric) => `<option value="${metric.id}">${formatMetricLabel(metric.id)}</option>`)
    .join("");
  state.selectedMetric = metricIds.includes("avg_sim")
    ? "avg_sim"
    : manifest.default_metric || manifest.metrics?.[0]?.id || "";
  elements.metric.value = state.selectedMetric;
}

async function loadPrefix(metric, prefix) {
  const cacheKey = `${metric}/${prefix}`;
  if (!state.prefixCache.has(cacheKey)) {
    state.prefixCache.set(cacheKey, loadJson(`data/${metric}/${prefix}.json`));
  }
  return state.prefixCache.get(cacheKey);
}

function resolveName(rawName) {
  const normalized = normalizeName(rawName);
  return state.normalizedToName.get(normalized) || null;
}

async function searchName(rawName) {
  const entry = resolveName(rawName);
  if (!entry) {
    state.selectedName = null;
    state.results = [];
    state.page = 0;
    setStatus("Name nicht im Index gefunden.");
    setEmpty("Kein Treffer.");
    return;
  }

  state.selectedName = entry;
  state.selectedMetric = elements.metric.value;
  state.page = 0;
  elements.input.value = entry.name;
  hideSuggestions();
  setStatus(`Lade ${formatMetricLabel(state.selectedMetric)} für ${entry.name}...`);
  trackEvent("search", {
    searched_name: entry.name,
    searched_normalized: entry.normalized,
  });

  try {
    const prefixPayload = await loadPrefix(state.selectedMetric, entry.prefix || prefixFor(entry.normalized));
    state.results = prefixPayload.neighbors?.[entry.normalized] || [];
    setStatus(`${state.results.length} Treffer für ${entry.name}.`);
    renderResults();
  } catch (error) {
    state.results = [];
    setStatus(error.message);
    setEmpty("Daten fehlen für diese Metrik.");
  }
}

function renderResults() {
  if (!state.selectedName) {
    setEmpty("Name eingeben.");
    return;
  }
  if (!state.results.length) {
    setEmpty("Keine ähnlichen Namen gefunden.");
    return;
  }

  const maxPage = Math.max(Math.ceil(state.results.length / state.pageSize) - 1, 0);
  state.page = Math.min(Math.max(state.page, 0), maxPage);
  const start = state.page * state.pageSize;
  const pageRows = state.results.slice(start, start + state.pageSize);

  elements.title.textContent = `${state.selectedName.name}: ${start + 1}-${start + pageRows.length}`;
  elements.pageLabel.textContent = `${state.page + 1} / ${maxPage + 1}`;
  elements.prev.disabled = state.page === 0;
  elements.next.disabled = state.page >= maxPage;
  elements.list.innerHTML = pageRows
    .map(
      (row) => `
        <li class="result-card">
          <span class="rank">${row.rank}</span>
          <button class="result-name" type="button" data-name="${escapeHtml(row.name)}" data-rank="${row.rank}">${escapeHtml(row.name)}</button>
          <button
            class="favorite-add ${isFavorite(row.normalized) ? "is-active" : ""}"
            type="button"
            data-name="${escapeHtml(row.name)}"
            aria-label="${isFavorite(row.normalized) ? "Favorit entfernen" : "Als Favorit speichern"}"
          >${isFavorite(row.normalized) ? "♥" : "♡"}</button>
          <span class="score">${formatScore(row.score)}</span>
        </li>
      `,
    )
    .join("");
}

function renderFavorites() {
  if (!state.favorites.length) {
    elements.favorites.innerHTML = `<li class="favorite-empty">Noch keine Favoriten.</li>`;
    elements.clearFavorites.disabled = true;
    return;
  }

  elements.clearFavorites.disabled = false;
  elements.favorites.innerHTML = state.favorites
    .map(
      (entry) => `
        <li class="favorite-item" draggable="true" data-normalized="${escapeHtml(entry.normalized)}">
          <span class="drag-handle" aria-hidden="true">↕</span>
          <button class="favorite-name" type="button" data-name="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</button>
          <button class="favorite-remove" type="button" data-normalized="${escapeHtml(entry.normalized)}" aria-label="Favorit entfernen">×</button>
        </li>
      `,
    )
    .join("");
}

async function bootstrap() {
  if (window.location.protocol === "file:") {
    setMetricUnavailable("Per HTTP öffnen");
    setStatus(
      "Die JSON-Daten können nicht per Doppelklick geladen werden. Bitte im Projektordner starten: python -m http.server 8000 --directory docs",
    );
    setEmpty("Dann http://localhost:8000 öffnen.");
    return;
  }

  try {
    const [manifest, indexPayload] = await Promise.all([
      loadJson("data/manifest.json"),
      loadJson("data/names.json"),
    ]);
    state.manifest = manifest;
    populateMetrics(manifest);
    populateNames(indexPayload);
    loadFavorites();
    const params = new URLSearchParams(window.location.search);
    const requestedMetric = params.get("metric");
    if (state.debug && requestedMetric && manifest.metrics?.some((metric) => metric.id === requestedMetric)) {
      elements.metric.value = requestedMetric;
      state.selectedMetric = requestedMetric;
    }
    setStatus(`${state.names.length} Namen geladen.`);
    setEmpty("Name eingeben.");
  } catch (error) {
    setMetricUnavailable("Index fehlt");
    setStatus(
      error instanceof TypeError
        ? "JSON-Daten konnten nicht geladen werden. Bitte per lokalem Webserver oder GitHub Pages öffnen."
        : error.message,
    );
    setEmpty("Index fehlt.");
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  searchName(elements.input.value.trim());
});

elements.input.addEventListener("input", () => {
  showSuggestions(elements.input.value);
});

elements.input.addEventListener("focus", () => {
  showSuggestions(elements.input.value);
});

elements.suggestions.addEventListener("mousedown", (event) => {
  const button = event.target.closest(".suggestion-button");
  if (!button) return;
  event.preventDefault();
  searchName(button.dataset.name);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-form")) {
    hideSuggestions();
  }
});

elements.metric.addEventListener("change", () => {
  if (state.selectedName) {
    searchName(state.selectedName.name);
  }
});

elements.list.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest(".favorite-add");
  if (favoriteButton) {
    const entry = resolveName(favoriteButton.dataset.name);
    toggleFavorite(entry, "result");
    return;
  }

  const button = event.target.closest(".result-name");
  if (!button) return;
  trackEvent("result_click", {
    from_name: state.selectedName?.name || null,
    clicked_name: button.dataset.name,
    rank: Number(button.dataset.rank || 0),
  });
  searchName(button.dataset.name);
});

elements.favorites.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".favorite-remove");
  if (removeButton) {
    removeFavorite(removeButton.dataset.normalized, "favorites");
    return;
  }

  const nameButton = event.target.closest(".favorite-name");
  if (!nameButton) return;
  trackEvent("favorite_click", {
    clicked_name: nameButton.dataset.name,
    favorites_order: favoriteSnapshot(),
  });
  searchName(nameButton.dataset.name);
});

elements.favorites.addEventListener("dragstart", (event) => {
  const item = event.target.closest(".favorite-item");
  if (!item) return;
  state.draggedFavorite = item.dataset.normalized;
  item.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
});

elements.favorites.addEventListener("dragend", (event) => {
  const item = event.target.closest(".favorite-item");
  if (item) item.classList.remove("is-dragging");
  state.draggedFavorite = "";
});

elements.favorites.addEventListener("dragover", (event) => {
  event.preventDefault();
});

elements.favorites.addEventListener("drop", (event) => {
  event.preventDefault();
  const target = event.target.closest(".favorite-item");
  if (!target || target.dataset.normalized === state.draggedFavorite) return;

  const fromIndex = state.favorites.findIndex((entry) => entry.normalized === state.draggedFavorite);
  const toIndex = state.favorites.findIndex((entry) => entry.normalized === target.dataset.normalized);
  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = state.favorites.splice(fromIndex, 1);
  state.favorites.splice(toIndex, 0, moved);
  persistFavorites("favorites_reorder", {
    moved_normalized: state.draggedFavorite,
  });
});

elements.clearFavorites.addEventListener("click", () => {
  state.favorites = [];
  persistFavorites("favorites_clear");
  renderResults();
});

elements.consentAllow?.addEventListener("click", () => {
  applyConsent("granted");
});

elements.consentDeny?.addEventListener("click", () => {
  applyConsent("denied");
});

elements.prev.addEventListener("click", () => {
  state.page -= 1;
  renderResults();
});

elements.next.addEventListener("click", () => {
  state.page += 1;
  renderResults();
});

setupDebugMode();
setupConsent();
setupSession();
setupSupabase();
bootstrap();
