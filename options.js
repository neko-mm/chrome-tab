import {
  buildExportPayload,
  getCards,
  hostnameOf,
  importCards,
  parseImportPayload,
} from "./shared.js";

const countEl = document.getElementById("count");
const previewEl = document.getElementById("preview");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const statusEl = document.getElementById("status");

function setStatus(message, type) {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.className = "status";
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function refreshPreview() {
  const cards = await getCards();
  countEl.textContent = String(cards.length);
  if (!cards.length) {
    previewEl.replaceChildren();
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "暂无卡片";
    previewEl.append(empty);
    return;
  }

  previewEl.replaceChildren(
    ...cards.map((card) => {
      const li = document.createElement("li");
      const title = document.createElement("span");
      title.textContent = card.title || hostnameOf(card.url);
      const url = document.createElement("span");
      url.className = "url";
      url.textContent = card.url;
      url.title = card.url;
      li.append(title, url);
      return li;
    })
  );
}

exportBtn.addEventListener("click", async () => {
  try {
    const cards = await getCards();
    if (!cards.length) {
      setStatus("当前没有可导出的卡片。", "err");
      return;
    }
    const payload = buildExportPayload(cards);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wuge-newtab-cards-${stamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`已导出 ${cards.length} 张卡片。`, "ok");
  } catch (err) {
    setStatus(err?.message || "导出失败", "err");
  }
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;

  const mode =
    document.querySelector('input[name="mode"]:checked')?.value === "replace"
      ? "replace"
      : "merge";

  if (mode === "replace") {
    const ok = confirm("替换模式会清空当前全部卡片，确定继续？");
    if (!ok) return;
  }

  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const incoming = parseImportPayload(raw);
    const result = await importCards(incoming, mode);
    await refreshPreview();
    if (mode === "replace") {
      setStatus(`已替换为 ${result.total} 张卡片。`, "ok");
    } else {
      setStatus(
        `导入完成：新增 ${result.added} 张，跳过重复 ${result.skipped} 张，当前共 ${result.total} 张。`,
        "ok"
      );
    }
  } catch (err) {
    setStatus(err?.message || "导入失败", "err");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.cards) refreshPreview();
});

refreshPreview();
