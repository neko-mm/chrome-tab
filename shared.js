/** Shared storage helpers for Fixed Cards New Tab. */

const STORAGE_KEY = "cards";

/**
 * @typedef {{ id: string, title: string, url: string, createdAt: number }} Card
 */

/** @returns {Promise<Card[]>} */
export async function getCards() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const cards = data[STORAGE_KEY];
  return Array.isArray(cards) ? cards : [];
}

/** @param {Card[]} cards */
export async function saveCards(cards) {
  await chrome.storage.local.set({ [STORAGE_KEY]: cards });
}

/** @param {{ title: string, url: string }} input */
export async function addCard({ title, url }) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    throw new Error("网址无效");
  }

  const cards = await getCards();
  const existing = cards.find((c) => urlsEqual(c.url, normalizedUrl));
  if (existing) {
    return { card: existing, created: false };
  }

  const card = {
    id: crypto.randomUUID(),
    title: (title || hostnameOf(normalizedUrl)).trim() || "未命名",
    url: normalizedUrl,
    createdAt: Date.now(),
  };
  cards.push(card);
  await saveCards(cards);
  return { card, created: true };
}

/** @param {string} id @param {{ title?: string, url?: string }} patch */
export async function updateCard(id, patch) {
  const cards = await getCards();
  const index = cards.findIndex((c) => c.id === id);
  if (index < 0) throw new Error("卡片不存在");

  const next = { ...cards[index] };
  if (typeof patch.title === "string") {
    next.title = patch.title.trim() || "未命名";
  }
  if (typeof patch.url === "string") {
    const normalizedUrl = normalizeUrl(patch.url);
    if (!normalizedUrl) throw new Error("网址无效");
    next.url = normalizedUrl;
  }
  cards[index] = next;
  await saveCards(cards);
  return next;
}

/** @param {string} id */
export async function removeCard(id) {
  const cards = await getCards();
  await saveCards(cards.filter((c) => c.id !== id));
}

/** @param {string[]} orderedIds */
export async function reorderCards(orderedIds) {
  const cards = await getCards();
  const map = new Map(cards.map((c) => [c.id, c]));
  const next = [];
  for (const id of orderedIds) {
    const card = map.get(id);
    if (card) {
      next.push(card);
      map.delete(id);
    }
  }
  for (const leftover of map.values()) next.push(leftover);
  await saveCards(next);
  return next;
}

/** @param {string} raw */
export function normalizeUrl(raw) {
  const value = (raw || "").trim();
  if (!value) return "";
  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
      ? value
      : `https://${value}`;
    const url = new URL(withProtocol);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

/** @param {string} a @param {string} b */
function urlsEqual(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.hostname.replace(/^www\./, "") === ub.hostname.replace(/^www\./, "") &&
      ua.pathname.replace(/\/$/, "") === ub.pathname.replace(/\/$/, "") &&
      ua.search === ub.search
    );
  } catch {
    return a === b;
  }
}

/** @param {string} href */
export function hostnameOf(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

/** Favicon via Chrome extension API (works for chrome-extension pages). */
export function faviconUrl(pageUrl, size = 64) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(size));
  return url.toString();
}

export function isRestrictedUrl(url) {
  return /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(
    url || ""
  );
}

/** @param {Card[]} cards */
export function buildExportPayload(cards) {
  return {
    app: "wuge-newtab",
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: cards.map((c) => ({
      id: c.id,
      title: c.title,
      url: c.url,
      createdAt: c.createdAt,
    })),
  };
}

/**
 * Parse import JSON. Accepts `{ cards: [...] }` or a bare card array.
 * @param {unknown} raw
 * @returns {Card[]}
 */
export function parseImportPayload(raw) {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.cards)
      ? raw.cards
      : null;
  if (!list) throw new Error("文件格式无效：需要包含 cards 数组");

  /** @type {Card[]} */
  const cards = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const url = normalizeUrl(String(item.url || ""));
    if (!url) continue;
    cards.push({
      id:
        typeof item.id === "string" && item.id
          ? item.id
          : crypto.randomUUID(),
      title: String(item.title || hostnameOf(url)).trim() || "未命名",
      url,
      createdAt:
        typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
          ? item.createdAt
          : Date.now(),
    });
  }
  if (!cards.length) throw new Error("文件中没有有效卡片");
  return cards;
}

/**
 * @param {Card[]} incoming
 * @param {"merge" | "replace"} mode
 */
export async function importCards(incoming, mode) {
  if (mode === "replace") {
    await saveCards(incoming);
    return { total: incoming.length, added: incoming.length, skipped: 0 };
  }

  const existing = await getCards();
  const next = [...existing];
  let added = 0;
  let skipped = 0;
  for (const card of incoming) {
    if (next.some((c) => urlsEqual(c.url, card.url))) {
      skipped += 1;
      continue;
    }
    next.push({
      ...card,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    });
    added += 1;
  }
  await saveCards(next);
  return { total: next.length, added, skipped };
}
