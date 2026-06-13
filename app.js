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
  language: "de",
  statusState: null,
  emptyState: null,
  invalidQueryName: "",
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
  languageButtons: document.querySelectorAll(".language-button"),
};

const FAVORITES_KEY = "nameling.favorites";
const SESSION_KEY = "nameling.session_id";
const CONSENT_KEY = "nameling.consent";
const LANGUAGE_KEY = "nameling.language";
const SUPABASE_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const NAME_LINK_BASE = "https://nameling.net/";
const SUPPORTED_LANGUAGES = new Set(["de", "en"]);
const TRANSLATIONS = {
  de: {
    navLabel: "Hauptnavigation",
    navSearch: "Namen suchen",
    navAbout: "About",
    navImprint: "Impressum",
    navPrivacy: "Datenschutz",
    languageSwitch: "Sprache",
    tagline: "Vornamen, die gemeinsam schwingen.",
    nameLabel: "Name",
    namePlaceholder: "z. B. Folke",
    searchButton: "Suchen",
    metricLabel: "Metrik",
    favoritesTitle: "Favoriten",
    clearFavorites: "Leeren",
    similarNames: "Ähnliche Namen",
    topResults: "Top 10",
    prevResults: "Vorherige Treffer",
    nextResults: "Weitere Treffer",
    consentTitle: "Datenspeicherung erlauben?",
    consentText:
      "Nameling kann Favoriten auf diesem Gerät merken und anonyme Nutzungsereignisse zur Verbesserung speichern. Ohne Zustimmung bleibt die Suche nutzbar, aber ohne dauerhafte Favoriten und ohne Supabase-Auswertung.",
    consentDeny: "Ablehnen",
    consentAllow: "Erlauben",
    defaultTitle: "Nameling – Ähnliche Vornamen finden",
    defaultDescription:
      "Entdecke ähnliche Vornamen mit Nameling und finde Namen, die gemeinsam schwingen.",
    nameTitle: "{name} – Ähnliche Namen | Nameling",
    nameDescription: "Entdecke den Namen {name} und finde ähnliche Vornamen mit Nameling.",
    notFoundTitle: "{name} – Name nicht gefunden | Nameling",
    notFoundDescription: "Dieser Name ist derzeit nicht im Nameling-Index enthalten.",
    metricNotLoaded: "Nicht geladen",
    openHttp: "Per HTTP öffnen",
    fileStatus:
      "Die JSON-Daten können nicht per Doppelklick geladen werden. Bitte im Projektordner starten: python -m http.server 8000 --directory docs",
    fileEmpty: "Dann http://localhost:8000 öffnen.",
    nameNotFoundStatus: "Name nicht im Index gefunden.",
    noHit: "Kein Treffer.",
    loadingMetric: "Lade {metric} für {name}...",
    hitsForName: "{count} Treffer für {name}.",
    missingMetricData: "Daten fehlen für diese Metrik.",
    enterName: "Name eingeben.",
    noSimilarNames: "Keine ähnlichen Namen gefunden.",
    favoriteRemove: "Favorit entfernen",
    favoriteAdd: "Als Favorit speichern",
    noFavorites: "Noch keine Favoriten.",
    namesLoaded: "{count} Namen geladen.",
    missingIndex: "Index fehlt",
    jsonLoadFailed: "JSON-Daten konnten nicht geladen werden. Bitte per lokalem Webserver oder GitHub Pages öffnen.",
    loadPathFailed: "{path} konnte nicht geladen werden",
  },
  en: {
    navLabel: "Main navigation",
    navSearch: "Search names",
    navAbout: "About",
    navImprint: "Legal notice",
    navPrivacy: "Privacy",
    languageSwitch: "Language",
    tagline: "Given names that resonate together.",
    nameLabel: "Name",
    namePlaceholder: "e.g. Folke",
    searchButton: "Search",
    metricLabel: "Metric",
    favoritesTitle: "Favorites",
    clearFavorites: "Clear",
    similarNames: "Similar names",
    topResults: "Top 10",
    prevResults: "Previous results",
    nextResults: "More results",
    consentTitle: "Allow data storage?",
    consentText:
      "Nameling can remember favorites on this device and store anonymous usage events to improve the service. Without consent, search still works, but without persistent favorites or Supabase analytics.",
    consentDeny: "Decline",
    consentAllow: "Allow",
    defaultTitle: "Nameling – Find Similar Given Names",
    defaultDescription: "Discover similar given names with Nameling and find names that resonate together.",
    nameTitle: "{name} – Similar Names | Nameling",
    nameDescription: "Discover the name {name} and find similar given names with Nameling.",
    notFoundTitle: "{name} – Name Not Found | Nameling",
    notFoundDescription: "This name is currently not included in the Nameling index.",
    metricNotLoaded: "Not loaded",
    openHttp: "Open via HTTP",
    fileStatus:
      "The JSON data cannot be loaded by double-clicking. Please start this in the project folder: python -m http.server 8000 --directory docs",
    fileEmpty: "Then open http://localhost:8000.",
    nameNotFoundStatus: "Name not found in the index.",
    noHit: "No match.",
    loadingMetric: "Loading {metric} for {name}...",
    hitsForName: "{count} results for {name}.",
    missingMetricData: "Data is missing for this metric.",
    enterName: "Enter a name.",
    noSimilarNames: "No similar names found.",
    favoriteRemove: "Remove favorite",
    favoriteAdd: "Save as favorite",
    noFavorites: "No favorites yet.",
    namesLoaded: "{count} names loaded.",
    missingIndex: "Index missing",
    jsonLoadFailed: "JSON data could not be loaded. Please open via a local web server or GitHub Pages.",
    loadPathFailed: "{path} could not be loaded",
  },
};
let supabaseScriptPromise = null;

function normalizeName(value) {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
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

function t(key, values = {}) {
  const dictionary = TRANSLATIONS[state.language] || TRANSLATIONS.de;
  const template = dictionary[key] || TRANSLATIONS.de[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function hasTranslation(key) {
  return Boolean(TRANSLATIONS[state.language]?.[key] || TRANSLATIONS.de[key]);
}

function detectBrowserLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => String(language).toLowerCase().startsWith("de")) ? "de" : "en";
}

function readStoredLanguage() {
  try {
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
    return SUPPORTED_LANGUAGES.has(storedLanguage) ? storedLanguage : "";
  } catch {
    return "";
  }
}

function initialLanguage() {
  const params = new URLSearchParams(window.location.search);
  const requestedLanguage = params.get("lang");
  if (SUPPORTED_LANGUAGES.has(requestedLanguage)) return requestedLanguage;
  return readStoredLanguage() || detectBrowserLanguage();
}

function translatedUrlLanguage(url, language) {
  if (url.protocol === "file:") return "";
  const params = new URLSearchParams(url.search);
  params.set("lang", language);
  return `${url.pathname}?${params.toString()}${url.hash}`;
}

function persistLanguage(language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Ignore blocked storage; the URL still reflects the explicit choice.
  }
}

function updateLanguageUrl(language) {
  if (window.location.protocol === "file:") return;
  const nextUrl = translatedUrlLanguage(new URL(window.location.href), language);
  if (nextUrl) {
    window.history.replaceState({ name: state.selectedName?.name || "", language }, "", nextUrl);
  }
}

function applyStaticTranslations() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
    for (const rule of element.dataset.i18nAttr.split(",")) {
      const [attribute, key] = rule.split(":").map((part) => part.trim());
      if (attribute && key) {
        element.setAttribute(attribute, t(key));
      }
    }
  });
  elements.languageButtons.forEach((button) => {
    const active = button.dataset.lang === state.language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function refreshTranslatedState() {
  applyStaticTranslations();
  if (state.statusState) {
    renderStatusState();
  }
  if (state.emptyState) {
    renderEmptyState();
  }
  if (state.selectedName) {
    updatePageMetadata(state.selectedName);
    renderResults();
  } else if (state.invalidQueryName) {
    markCurrentQueryNoindex(state.invalidQueryName);
  } else {
    updatePageMetadata(null);
  }
  renderFavorites();
}

function setLanguage(language, options = {}) {
  if (!SUPPORTED_LANGUAGES.has(language) || language === state.language) return;
  state.language = language;
  if (options.persist !== false) {
    persistLanguage(language);
    updateLanguageUrl(language);
  }
  refreshTranslatedState();
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
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(t("loadPathFailed", { path }));
  }
  return response.json();
}

function renderStatusState() {
  if (!state.statusState) return;
  const { key, values } = state.statusState;
  elements.status.textContent = hasTranslation(key) ? t(key, values) : key;
}

function setStatus(key, values = {}) {
  state.statusState = { key, values };
  renderStatusState();
}

function renderEmptyState() {
  if (!state.emptyState) return;
  const { key, values } = state.emptyState;
  const message = hasTranslation(key) ? t(key, values) : key;
  elements.list.innerHTML = `<li class="empty-state">${escapeHtml(message)}</li>`;
  elements.title.textContent = t("topResults");
  elements.pageLabel.textContent = "0 / 0";
  elements.prev.disabled = true;
  elements.next.disabled = true;
}

function setEmpty(key, values = {}) {
  state.emptyState = { key, values };
  renderEmptyState();
}

function setMetricUnavailable(labelKey = "metricNotLoaded") {
  const label = hasTranslation(labelKey) ? t(labelKey) : labelKey;
  elements.metric.innerHTML = `<option value="">${escapeHtml(label)}</option>`;
  elements.metric.disabled = true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function nameUrl(name) {
  const url = new URL(NAME_LINK_BASE);
  url.searchParams.set("q", name);
  return url.toString();
}

function setMeta(name, content, attribute = "name") {
  let meta = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

function setCanonical(url) {
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", url);
}

function setRobots(content) {
  const existing = document.head.querySelector('meta[name="robots"]');
  if (!content) {
    existing?.remove();
    return;
  }
  setMeta("robots", content);
}

function updatePageMetadata(entry) {
  const title = entry ? t("nameTitle", { name: entry.name }) : t("defaultTitle");
  const description = entry ? t("nameDescription", { name: entry.name }) : t("defaultDescription");
  const url = entry ? nameUrl(entry.name) : NAME_LINK_BASE;

  document.title = title;
  setMeta("description", description);
  setMeta("og:title", title, "property");
  setMeta("og:description", description, "property");
  setMeta("og:url", url, "property");
  setCanonical(url);
  setRobots("");
}

function markCurrentQueryNoindex(rawName) {
  const titleName = rawName ? t("notFoundTitle", { name: rawName }) : t("defaultTitle");
  document.title = titleName;
  setMeta("description", t("notFoundDescription"));
  setCanonical(NAME_LINK_BASE);
  setRobots("noindex");
}

function updateNameUrl(entry, replace = false) {
  if (!entry || window.location.protocol === "file:") return;
  const params = new URLSearchParams(window.location.search);
  params.set("q", entry.name);
  const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  if (replace) {
    window.history.replaceState({ name: entry.name }, "", nextUrl);
  } else {
    window.history.pushState({ name: entry.name }, "", nextUrl);
  }
}

function populateNames(indexPayload) {
  const dedupedNames = new Map();
  for (const rawEntry of indexPayload.names || []) {
    const normalized = normalizeName(rawEntry.normalized || rawEntry.name);
    if (!normalized || dedupedNames.has(normalized)) continue;
    dedupedNames.set(normalized, {
      ...rawEntry,
      normalized,
      legacyPrefix: rawEntry.prefix || "",
      prefix: prefixFor(normalized),
    });
  }
  state.names = Array.from(dedupedNames.values());
  state.normalizedToName = dedupedNames;
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
  if (!entry) return;
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
        <a class="suggestion-button" href="${escapeHtml(nameUrl(entry.name))}" data-name="${escapeHtml(entry.name)}" role="option">
          <span>${escapeHtml(entry.name)}</span>
        </a>
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

function resolveNameByNormalized(normalized) {
  return state.normalizedToName.get(normalizeName(normalized)) || null;
}

function findNeighborsForEntry(prefixPayload, entry) {
  const neighbors = prefixPayload.neighbors || {};
  if (neighbors[entry.normalized]) {
    return neighbors[entry.normalized];
  }
  for (const [key, rows] of Object.entries(neighbors)) {
    if (normalizeName(key) === entry.normalized) {
      return rows;
    }
  }
  return [];
}

async function searchName(rawName, options = {}) {
  const entry = resolveName(rawName);
  if (!entry) {
    state.selectedName = null;
    state.invalidQueryName = rawName || "";
    state.results = [];
    state.page = 0;
    markCurrentQueryNoindex(rawName);
    setStatus("nameNotFoundStatus");
    setEmpty("noHit");
    return;
  }

  state.selectedName = entry;
  state.invalidQueryName = "";
  updatePageMetadata(entry);
  if (options.updateUrl !== false) {
    updateNameUrl(entry, Boolean(options.replaceUrl));
  }
  state.selectedMetric = elements.metric.value;
  state.page = 0;
  elements.input.value = entry.name;
  hideSuggestions();
  setStatus("loadingMetric", { metric: formatMetricLabel(state.selectedMetric), name: entry.name });
  trackEvent("search", {
    searched_name: entry.name,
    searched_normalized: entry.normalized,
  });

  try {
    const prefixes = [...new Set([entry.prefix, entry.legacyPrefix, prefixFor(entry.normalized)].filter(Boolean))];
    state.results = [];
    let lastError = null;
    for (const prefix of prefixes) {
      try {
        const prefixPayload = await loadPrefix(state.selectedMetric, prefix);
        state.results = findNeighborsForEntry(prefixPayload, entry);
      } catch (error) {
        lastError = error;
        continue;
      }
      if (state.results.length) {
        break;
      }
    }
    if (!state.results.length && lastError) {
      throw lastError;
    }
    setStatus("hitsForName", { count: state.results.length, name: entry.name });
    renderResults();
  } catch (error) {
    state.results = [];
    setStatus(error.message);
    setEmpty("missingMetricData");
  }
}

function renderResults() {
  if (!state.selectedName) {
    setEmpty("enterName");
    return;
  }
  if (!state.results.length) {
    setEmpty("noSimilarNames");
    return;
  }

  state.emptyState = null;
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
          <a class="result-name" href="${escapeHtml(nameUrl(row.name))}" data-name="${escapeHtml(row.name)}" data-normalized="${escapeHtml(row.normalized)}" data-rank="${row.rank}">${escapeHtml(row.name)}</a>
          <button
            class="favorite-add ${isFavorite(row.normalized) ? "is-active" : ""}"
            type="button"
            data-name="${escapeHtml(row.name)}"
            data-normalized="${escapeHtml(row.normalized)}"
            aria-label="${isFavorite(row.normalized) ? t("favoriteRemove") : t("favoriteAdd")}"
          >${isFavorite(row.normalized) ? "♥" : "♡"}</button>
          <span class="score">${formatScore(row.score)}</span>
        </li>
      `,
    )
    .join("");
}

function renderFavorites() {
  if (!state.favorites.length) {
    elements.favorites.innerHTML = `<li class="favorite-empty">${escapeHtml(t("noFavorites"))}</li>`;
    elements.clearFavorites.disabled = true;
    return;
  }

  elements.clearFavorites.disabled = false;
  elements.favorites.innerHTML = state.favorites
    .map(
      (entry) => `
        <li class="favorite-item" draggable="true" data-normalized="${escapeHtml(entry.normalized)}">
          <span class="drag-handle" aria-hidden="true">↕</span>
          <a class="favorite-name" href="${escapeHtml(nameUrl(entry.name))}" data-name="${escapeHtml(entry.name)}" data-normalized="${escapeHtml(entry.normalized)}">${escapeHtml(entry.name)}</a>
          <button class="favorite-remove" type="button" data-normalized="${escapeHtml(entry.normalized)}" aria-label="${escapeHtml(t("favoriteRemove"))}">×</button>
        </li>
      `,
    )
    .join("");
}

async function bootstrap() {
  if (window.location.protocol === "file:") {
    setMetricUnavailable("openHttp");
    setStatus("fileStatus");
    setEmpty("fileEmpty");
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
    updatePageMetadata(null);
    const params = new URLSearchParams(window.location.search);
    const requestedMetric = params.get("metric");
    if (state.debug && requestedMetric && manifest.metrics?.some((metric) => metric.id === requestedMetric)) {
      elements.metric.value = requestedMetric;
      state.selectedMetric = requestedMetric;
    }
    setStatus("namesLoaded", { count: state.names.length });
    setEmpty("enterName");
    const requestedName = params.get("q");
    if (requestedName) {
      await searchName(requestedName, { replaceUrl: true });
    }
  } catch (error) {
    setMetricUnavailable("missingIndex");
    setStatus(
      error instanceof TypeError
        ? "jsonLoadFailed"
        : error.message,
    );
    setEmpty("missingIndex");
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
    searchName(state.selectedName.name, { updateUrl: false });
  }
});

elements.list.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest(".favorite-add");
  if (favoriteButton) {
    const entry = resolveNameByNormalized(favoriteButton.dataset.normalized) || resolveName(favoriteButton.dataset.name);
    toggleFavorite(entry, "result");
    return;
  }

  const button = event.target.closest(".result-name");
  if (!button) return;
  event.preventDefault();
  trackEvent("result_click", {
    from_name: state.selectedName?.name || null,
    clicked_name: button.dataset.name,
    clicked_normalized: button.dataset.normalized,
    rank: Number(button.dataset.rank || 0),
  });
  const entry = resolveNameByNormalized(button.dataset.normalized) || resolveName(button.dataset.name);
  searchName(entry?.name || button.dataset.name);
});

elements.favorites.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".favorite-remove");
  if (removeButton) {
    removeFavorite(removeButton.dataset.normalized, "favorites");
    return;
  }

  const nameButton = event.target.closest(".favorite-name");
  if (!nameButton) return;
  event.preventDefault();
  trackEvent("favorite_click", {
    clicked_name: nameButton.dataset.name,
    clicked_normalized: nameButton.dataset.normalized,
    favorites_order: favoriteSnapshot(),
  });
  const entry = resolveNameByNormalized(nameButton.dataset.normalized) || resolveName(nameButton.dataset.name);
  searchName(entry?.name || nameButton.dataset.name);
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

elements.languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setLanguage(button.dataset.lang || "de");
  });
});

elements.prev.addEventListener("click", () => {
  state.page -= 1;
  renderResults();
});

elements.next.addEventListener("click", () => {
  state.page += 1;
  renderResults();
});

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  const requestedLanguage = params.get("lang");
  if (SUPPORTED_LANGUAGES.has(requestedLanguage) && requestedLanguage !== state.language) {
    state.language = requestedLanguage;
    refreshTranslatedState();
  }
  const requestedName = params.get("q");
  if (requestedName) {
    searchName(requestedName, { updateUrl: false });
  } else {
    state.selectedName = null;
    state.invalidQueryName = "";
    updatePageMetadata(null);
  }
});

state.language = initialLanguage();
applyStaticTranslations();
setupDebugMode();
setupConsent();
setupSession();
setupSupabase();
bootstrap();
