let attacks = [];
let currentRecords = [];
const selectedRecordIds = new Set();
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const sortState = {
  key: "rounds",
  direction: "desc"
};
const algorithmTable = document.querySelector("#algorithm-table");
const exportButton = document.querySelector("#export-latex");
const clearExportButton = document.querySelector("#clear-latex-selection");
const latexCount = document.querySelector("#latex-count");
const latexOutput = document.querySelector("#latex-output");

function normalize(value) {
  return String(value || "").toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    if (url.protocol === "http:" || url.protocol === "https:") return escapeHtml(url.href);
  } catch {
    return "#";
  }
  return "#";
}

function rawSafeUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return "";
  }
  return "";
}

function numbers(value) {
  return String(value).match(/\d+(\.\d+)?/g)?.map(Number) || [];
}

function maxNumber(value) {
  const values = numbers(value);
  return values.length ? Math.max(...values) : null;
}

function roundRatio(item) {
  const totals = numbers(item.totalRounds);
  const attacked = numbers(item.attackedRounds);
  if (!totals.length || !attacked.length) return 0;
  return Math.min(1, Math.max(...attacked) / Math.max(...totals));
}

function coverageMarkup(item) {
  const coverage = Math.round(roundRatio(item) * 100);
  return `
    <div class="coverage-cell">
      <div class="bar" aria-hidden="true"><i style="width:${coverage}%"></i></div>
    </div>
  `;
}

function roundsCoverageMarkup(item) {
  return `
    <div class="rounds-cell">
      <strong>${escapeHtml(item.attackedRounds)} / ${escapeHtml(item.totalRounds)}</strong>
      ${coverageMarkup(item)}
    </div>
  `;
}

function formatComplexity(value) {
  return escapeHtml(value).replace(/2\^([0-9]+(?:\.[0-9]+)?|n)/g, "2<sup>$1</sup>");
}

function isFullRound(item) {
  return roundRatio(item) >= 0.999;
}

function compareAttackStrength(a, b) {
  const coverageDiff = roundRatio(b) - roundRatio(a);
  if (Math.abs(coverageDiff) > 0.001) return coverageDiff;
  const fullDiff = Number(isFullRound(b)) - Number(isFullRound(a));
  if (fullDiff !== 0) return fullDiff;
  const yearDiff = Number(b.year) - Number(a.year);
  if (yearDiff !== 0) return yearDiff;
  return collator.compare(a.attack, b.attack);
}

function pill(text, className = "") {
  return `<span class="pill ${escapeHtml(className)}">${escapeHtml(text)}</span>`;
}

function metricValue(item, key) {
  if (key === "rounds") {
    return maxNumber(item.attackedRounds) ?? (normalize(item.attackedRounds).includes("full") ? maxNumber(item.totalRounds) : null);
  }
  const value = item[key];
  const exponents = [...String(value || "").matchAll(/2\^([0-9]+(?:\.[0-9]+)?)/gi)].map((match) =>
    Number(match[1])
  );
  if (exponents.length) return Math.max(...exponents);
  return maxNumber(value);
}

function compareMetric(a, b, key, direction) {
  const left = metricValue(a, key);
  const right = metricValue(b, key);
  const leftMissing = left === null || Number.isNaN(left);
  const rightMissing = right === null || Number.isNaN(right);

  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  const diff = left - right;
  if (diff === 0) return 0;
  return direction === "asc" ? diff : -diff;
}

function compareForSort(a, b) {
  const priority = [sortState.key, ...["rounds", "time", "memory", "data"].filter((key) => key !== sortState.key)];
  for (const key of priority) {
    const result = compareMetric(a, b, key, sortState.direction);
    if (result !== 0) return result;
  }
  const yearDiff = Number(b.year) - Number(a.year);
  if (yearDiff !== 0) return yearDiff;
  return collator.compare(a.attack, b.attack);
}

function updateSortButtons() {
  document.querySelectorAll("[data-sort]").forEach((button) => {
    const active = button.dataset.sort === sortState.key;
    button.classList.toggle("active", active);
    button.classList.toggle("asc", active && sortState.direction === "asc");
    button.classList.toggle("desc", active && sortState.direction === "desc");
    button.setAttribute(
      "aria-sort",
      active ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"
    );
  });
}

function methodCell(group) {
  const models = [...new Set(group.records.map((item) => item.model).filter(Boolean))].sort(collator.compare);
  return `
    <td class="method-cell" rowspan="${group.records.length}">
      <strong>${escapeHtml(group.attack)}</strong>
      ${models.length ? `<span class="subtle">${escapeHtml(models.join(" / "))}</span>` : ""}
    </td>
  `;
}

function recordRow(item, methodMarkup) {
  const checked = selectedRecordIds.has(item.id) ? " checked" : "";
  return `
    <tr>
      ${methodMarkup}
      <td>${roundsCoverageMarkup(item)}</td>
      <td>${formatComplexity(item.data)}</td>
      <td>${formatComplexity(item.time)}</td>
      <td>${formatComplexity(item.memory)}</td>
      <td>
        <a href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.venue)} ${escapeHtml(item.year)}</a>
        <span class="subtle">${escapeHtml(item.paper)}</span>
        <label class="record-select">
          <input type="checkbox" data-select-record="${escapeHtml(item.id)}"${checked}>
          <span>Select</span>
        </label>
      </td>
    </tr>
  `;
}

function methodGroups(records) {
  const groups = new Map();
  for (const item of records) {
    const key = normalize(item.attack);
    if (!groups.has(key)) groups.set(key, { attack: item.attack, records: [] });
    groups.get(key).records.push(item);
  }
  const result = [...groups.values()];
  for (const group of result) group.records.sort(compareForSort);
  return result.sort((a, b) => compareForSort(a.records[0], b.records[0]) || collator.compare(a.attack, b.attack));
}

function groupedTableRows(records) {
  return methodGroups(records)
    .map((group) =>
      group.records
        .map((item, index) => recordRow(item, index === 0 ? methodCell(group) : ""))
        .join("")
    )
    .join("");
}

function updateExportControls() {
  const visibleIds = new Set(currentRecords.map((item) => item.id));
  for (const id of [...selectedRecordIds]) {
    if (!visibleIds.has(id)) selectedRecordIds.delete(id);
  }
  const count = selectedRecordIds.size;
  if (latexCount) latexCount.textContent = `${count} selected`;
  if (exportButton) exportButton.disabled = count === 0;
  if (clearExportButton) clearExportButton.disabled = count === 0;
  if (count === 0 && latexOutput) {
    latexOutput.hidden = true;
    latexOutput.value = "";
  }
}

function latexEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function latexValue(value) {
  const text = String(value || "");
  if (!text) return "";
  const parts = [];
  let cursor = 0;
  const pattern = /2\^([0-9]+(?:\.[0-9]+)?|n)/g;
  for (const match of text.matchAll(pattern)) {
    parts.push(latexEscape(text.slice(cursor, match.index)));
    parts.push(`$2^{${latexEscape(match[1])}}$`);
    cursor = match.index + match[0].length;
  }
  parts.push(latexEscape(text.slice(cursor)));
  return parts.join("");
}

function latexSource(item) {
  const label = `${item.venue || ""} ${item.year || ""}`.trim();
  const url = rawSafeUrl(item.url);
  if (!url) return latexEscape(label);
  return `\\href{${url.replace(/[{}\\]/g, "")}}{${latexEscape(label)}}`;
}

function selectedRecords() {
  return currentRecords
    .filter((item) => selectedRecordIds.has(item.id))
    .sort((a, b) =>
      collator.compare(a.algorithm, b.algorithm) ||
      collator.compare(a.attack, b.attack) ||
      compareForSort(a, b)
    );
}

function buildLatexTable(records) {
  const rows = records.map((item) =>
    [
      latexEscape(item.algorithm),
      latexEscape(item.attack),
      latexValue(item.attackedRounds),
      latexValue(item.data),
      latexValue(item.time),
      latexValue(item.memory),
      latexSource(item)
    ].join(" & ") + " \\\\"
  );
  return [
    "% Requires \\usepackage{booktabs,hyperref}",
    "\\begin{tabular}{lllllll}",
    "\\toprule",
    "Algorithm & Method & Rounds & Data & Time & Memory & Source \\\\",
    "\\midrule",
    ...rows,
    "\\bottomrule",
    "\\end{tabular}"
  ].join("\n");
}

async function exportSelectedLatex() {
  const latex = buildLatexTable(selectedRecords());
  if (latexOutput) {
    latexOutput.hidden = false;
    latexOutput.value = latex;
    latexOutput.select();
  }
  try {
    await navigator.clipboard.writeText(latex);
    exportButton.textContent = "Copied LaTeX table";
    window.setTimeout(() => {
      exportButton.textContent = "Copy LaTeX table";
    }, 1400);
  } catch {
    exportButton.textContent = "Select and copy manually";
    window.setTimeout(() => {
      exportButton.textContent = "Copy LaTeX table";
    }, 1800);
  }
}

function renderAlgorithmPage() {
  const params = new URLSearchParams(window.location.search);
  const algorithm = params.get("algorithm");
  const records = attacks
    .filter((item) => item.algorithm === algorithm)
    .sort(compareForSort);
  currentRecords = records;

  if (!records.length) {
    document.querySelector("#algorithm-title").textContent = "Algorithm not found";
    const origin = document.querySelector("#algorithm-origin");
    if (origin) origin.hidden = true;
    algorithmTable.innerHTML =
      '<tr><td colspan="6" class="empty">No records are available for this algorithm.</td></tr>';
    updateExportControls();
    return;
  }

  const best = records[0];
  const bestByStrength = [...records].sort(compareAttackStrength)[0];
  const tags = [...new Set(records.flatMap((item) => item.tags))].sort(collator.compare);

  document.title = `${algorithm} | SYMMETRIC CRYPTANALYSIS INDEX`;
  document.querySelector("#algorithm-title").textContent = algorithm;
  const origin = document.querySelector("#algorithm-origin");
  if (origin) {
    const venueParts = bestByStrength.designVenue || "";
    if (bestByStrength.designPaper && bestByStrength.designUrl) {
      origin.innerHTML = `<a href="${safeUrl(bestByStrength.designUrl)}" target="_blank" rel="noreferrer">${escapeHtml(bestByStrength.designPaper)}</a>${
        venueParts ? ` <span>${escapeHtml(venueParts)}</span>` : ""
      }`;
      origin.hidden = false;
    } else if (bestByStrength.designPaper || venueParts) {
      origin.innerHTML = `${escapeHtml(bestByStrength.designPaper || "")}${bestByStrength.designPaper && venueParts ? " " : ""}${
        escapeHtml(venueParts || "")
      }`;
      origin.hidden = false;
    } else {
      origin.hidden = true;
      origin.textContent = "";
    }
  }
  document.querySelector("#algorithm-tags").innerHTML = tags.map((tag) => pill(tag)).join("");
  algorithmTable.innerHTML = groupedTableRows(records);
  updateSortButtons();
  updateExportControls();
}

async function init() {
  const dataset = await window.attackBackend.loadPublicDataset();
  attacks = dataset.attacks;
  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      if (sortState.key === button.dataset.sort) {
        sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      } else {
        sortState.key = button.dataset.sort;
        sortState.direction = "asc";
      }
      renderAlgorithmPage();
    });
  });
  algorithmTable.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-select-record]");
    if (!checkbox) return;
    if (checkbox.checked) selectedRecordIds.add(checkbox.dataset.selectRecord);
    else selectedRecordIds.delete(checkbox.dataset.selectRecord);
    updateExportControls();
  });
  exportButton.addEventListener("click", exportSelectedLatex);
  clearExportButton.addEventListener("click", () => {
    selectedRecordIds.clear();
    renderAlgorithmPage();
  });
  renderAlgorithmPage();
}

init();
