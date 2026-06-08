const state = {
  query: "",
  type: "block",
  tags: new Set()
};

let attacks = [];
const tagFilters = document.querySelector("#tag-filters");
const searchInput = document.querySelector("#search");
const segments = [...document.querySelectorAll(".segment")];
const attackTable = document.querySelector("#attack-table");
const clearFilters = document.querySelector("#clear-filters");
const tagSummary = document.querySelector("#tag-summary");

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
let taxonomy = [];
let optionIndex = new Map();

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

function canonical(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function queryTokens(value) {
  return canonical(value).split(" ").filter(Boolean);
}

function fieldMatches(field, query, tokens) {
  const text = canonical(field);
  if (!text) return false;
  return text.includes(query) || tokens.every((token) => text.includes(token));
}

function textSearchFields(item) {
  return [
    item.algorithm,
    item.structure,
    item.attack,
    item.model,
    item.venue,
    item.year,
    item.paper
  ];
}

function textSearchMatches(item, query, tokens) {
  const text = canonical(textSearchFields(item).join(" "));
  return text.includes(query) || tokens.every((token) => text.includes(token));
}

function roundRatio(item) {
  const totals = String(item.totalRounds).match(/\d+(\.\d+)?/g) || [];
  const attacked = String(item.attackedRounds).match(/\d+(\.\d+)?/g) || [];
  if (!totals.length || !attacked.length) return 0;
  const total = Math.max(...totals.map(Number));
  const rounds = Math.max(...attacked.map(Number));
  return Math.min(1, rounds / total);
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
  return escapeHtml(value)
    .replace(/2\^([0-9]+(?:\.[0-9]+)?|n)/g, "2<sup>$1</sup>")
    .replace(/below 2<sup>/g, "below 2<sup>")
    .replace(/up to 2<sup>/g, "up to 2<sup>");
}

function isFullRound(item) {
  return roundRatio(item) >= 0.999;
}

function compareAttackStrength(a, b) {
  const coverageDiff = roundRatio(b) - roundRatio(a);
  if (Math.abs(coverageDiff) > 0.001) return coverageDiff;
  const fullDiff = Number(isFullRound(b)) - Number(isFullRound(a));
  if (fullDiff !== 0) return fullDiff;
  return Number(b.year) - Number(a.year);
}

function filteredAttacks() {
  const q = canonical(state.query);
  const tokens = queryTokens(state.query);
  const algorithmNameHit =
    q !== "" && attacks.some((item) => fieldMatches(item.algorithm, q, tokens));

  return attacks.filter((item) => {
    const typeMatch = item.type === state.type;
    const tagMatch =
      state.tags.size === 0 ||
      taxonomy.every((group) => {
        const active = group.options.filter((option) => state.tags.has(option.key));
        return active.length === 0 || active.some((option) => option.test(item));
      });
    const queryMatch =
      q === "" ||
      (algorithmNameHit
        ? fieldMatches(item.algorithm, q, tokens)
        : textSearchMatches(item, q, tokens));
    return typeMatch && tagMatch && queryMatch;
  });
}

function bestAttacksByAlgorithm(items) {
  const groups = new Map();
  for (const item of items) {
    const records = groups.get(item.algorithm) || [];
    records.push(item);
    groups.set(item.algorithm, records);
  }
  return [...groups.entries()]
    .map(([algorithm, records]) => ({
      algorithm,
      records,
      best: [...records].sort(compareAttackStrength)[0]
    }))
    .sort((a, b) => collator.compare(a.algorithm, b.algorithm));
}

function pill(text, className = "") {
  return `<span class="pill ${escapeHtml(className)}">${escapeHtml(text)}</span>`;
}

function competitionOptions() {
  const hasAny = (matcher) => attacks.some((item) => matcher(item));
  return [
    {
      key: "program:aes",
      label: "AES",
      test: (item) => item.tags.some((tag) => tag.startsWith("AES ")),
      visible: hasAny((item) => item.tags.some((tag) => tag.startsWith("AES ")))
    },
    {
      key: "program:caesar",
      label: "CAESAR",
      test: (item) => item.tags.some((tag) => tag.startsWith("CAESAR")),
      visible: hasAny((item) => item.tags.some((tag) => tag.startsWith("CAESAR")))
    },
    {
      key: "program:nist-lwc",
      label: "NIST LWC",
      test: (item) => item.tags.some((tag) => tag.startsWith("NIST LWC")),
      visible: hasAny((item) => item.tags.some((tag) => tag.startsWith("NIST LWC")))
    },
    {
      key: "program:sha3",
      label: "SHA-3 program",
      test: (item) => item.tags.some((tag) => tag.startsWith("SHA-3")),
      visible: hasAny((item) => item.tags.some((tag) => tag.startsWith("SHA-3")))
    }
  ].filter((option) => option.visible);
}

function buildTaxonomy() {
  const structureOptions = [...new Set(attacks.map((item) => item.structure).filter(Boolean))]
    .sort(collator.compare)
    .map((structure) => ({
      key: `structure:${structure}`,
      label: structure,
      test: (item) => item.structure === structure
    }));

  const standardOptions = ["National Standard", "ISO/IEC", "3GPP"]
    .filter((tag) => attacks.some((item) => item.tags.includes(tag)))
    .map((tag) => ({
      key: `tag:${tag}`,
      label: tag,
      test: (item) => item.tags.includes(tag)
    }));

  const researchOptions = [
    {
      key: "context:lightweight",
      label: "Lightweight",
      test: (item) => item.tags.includes("Lightweight")
    },
    {
      key: "context:tweakable",
      label: "Tweakable",
      test: (item) =>
        item.tags.some((tag) => tag.includes("Tweakable")) || String(item.structure || "").includes("Tweakable")
    }
  ].filter((option) => attacks.some((item) => option.test(item)));

  return [
    { id: "structure", label: "Structure", options: structureOptions },
    { id: "standard", label: "Standard", options: standardOptions },
    { id: "competition", label: "Competitions", options: competitionOptions() },
    { id: "research", label: "Research context", options: researchOptions }
  ].filter((group) => group.options.length > 0);
}

function renderTags() {
  optionIndex = new Map(taxonomy.flatMap((group) => group.options.map((option) => [option.key, option])));
  const selectedLabels = [...state.tags].map((key) => optionIndex.get(key)?.label || key);
  tagSummary.textContent =
    state.tags.size === 0
      ? "None selected"
      : `${state.tags.size} selected: ${selectedLabels.slice(0, 2).join(", ")}${
          state.tags.size > 2 ? "..." : ""
        }`;
  tagFilters.innerHTML = taxonomy
    .map(
      (group) => `
        <section class="tag-section">
          <div class="tag-section-head">
            <strong>${group.label}</strong>
          </div>
          <div class="tags">
            ${group.options
              .map((option) => {
                const active = state.tags.has(option.key) ? " active" : "";
                return `<button class="tag${active}" type="button" data-tag="${escapeHtml(option.key)}">${escapeHtml(option.label)}</button>`;
              })
              .join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderStats() {
  document.querySelector("#stat-algos").textContent = new Set(attacks.map((i) => i.algorithm)).size;
  document.querySelector("#stat-attacks").textContent = attacks.length;
}

function algorithmSubtitle(item) {
  const structure = item.structure;
  const year = item.algorithmYear || "unknown year";
  return `${structure} · ${year}`;
}

function renderTable(items) {
  const groups = bestAttacksByAlgorithm(items);

  attackTable.innerHTML =
    groups
      .map((group) => {
        const item = group.best;
        const href = `algorithm.html?algorithm=${encodeURIComponent(item.algorithm)}`;
        return `
          <tr>
            <td>
              <a class="row-link" href="${escapeHtml(href)}">
                ${escapeHtml(item.algorithm)}
              </a>
              <span class="subtle">${escapeHtml(algorithmSubtitle(item))}</span>
            </td>
            <td>
              <strong>${escapeHtml(item.attack)}</strong>
              <span class="subtle">${escapeHtml(item.model)}</span>
            </td>
            <td>${roundsCoverageMarkup(item)}</td>
            <td>${formatComplexity(item.data)}</td>
            <td>${formatComplexity(item.time)}</td>
            <td>${formatComplexity(item.memory)}</td>
            <td>
              <a href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">
                ${escapeHtml(item.venue)} ${escapeHtml(item.year)}
              </a>
            </td>
          </tr>
        `;
      })
      .join("") || `<tr><td colspan="7" class="empty">No matching attack records.</td></tr>`;
}

function render() {
  renderTags();
  const items = filteredAttacks();
  renderTable(items);
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

segments.forEach((button) => {
  button.addEventListener("click", () => {
    state.type = button.dataset.type;
    segments.forEach((segment) => segment.classList.toggle("active", segment === button));
    render();
  });
});

tagFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");
  if (!button) return;
  const tag = button.dataset.tag;
  if (state.tags.has(tag)) state.tags.delete(tag);
  else state.tags.add(tag);
  render();
});

clearFilters.addEventListener("click", () => {
  state.query = "";
  state.tags.clear();
  searchInput.value = "";
  render();
});

async function init() {
  const dataset = await window.attackBackend.loadPublicDataset();
  attacks = dataset.attacks;
  taxonomy = buildTaxonomy();
  renderStats();
  render();
}

init();
