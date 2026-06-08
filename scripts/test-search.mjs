import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

globalThis.window = {};
await import(pathToFileURL(resolve("data.js")).href);

const attacks = globalThis.window.attackData.attacks;

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
  return Boolean(text) && (text.includes(query) || tokens.every((token) => text.includes(token)));
}

function textSearchFields(item) {
  return [
    item.id,
    item.algorithmKey,
    item.sourceKey,
    item.algorithm,
    item.structure,
    item.attack,
    item.model,
    item.venue,
    item.year,
    item.paper,
    item.data,
    item.time,
    item.memory
  ];
}

function textSearchMatches(item, query, tokens) {
  const text = canonical(textSearchFields(item).join(" "));
  return text.includes(query) || tokens.every((token) => text.includes(token));
}

function filteredAttacks(query = "", tags = []) {
  const q = canonical(query);
  const tokens = queryTokens(query);
  const algorithmNameHit =
    q !== "" && attacks.some((item) => fieldMatches(item.algorithm, q, tokens));

  return attacks.filter((item) => {
    const tagMatch = tags.length === 0 || tags.every((tag) => item.tags.includes(tag));
    const queryMatch =
      q === "" ||
      (algorithmNameHit
        ? fieldMatches(item.algorithm, q, tokens)
        : textSearchMatches(item, q, tokens));
    return tagMatch && queryMatch;
  });
}

function algorithms(rows) {
  return [...new Set(rows.map((item) => item.algorithm))].sort();
}

function recordSearchMode(query = "") {
  const q = canonical(query);
  if (!q) return false;
  const tokens = queryTokens(query);
  return !attacks.some((item) => fieldMatches(item.algorithm, q, tokens));
}

function assertAlgorithms(label, query, tags, expected) {
  const actual = algorithms(filteredAttacks(query, tags));
  const same =
    actual.length === expected.length && actual.every((name, index) => name === expected[index]);
  if (!same) {
    throw new Error(
      `${label}\nexpected: ${expected.join(", ") || "(none)"}\nactual:   ${
        actual.join(", ") || "(none)"
      }`
    );
  }
}

function assertRecordCount(label, query, expected) {
  const actual = filteredAttacks(query).length;
  if (actual !== expected) {
    throw new Error(`${label}\nexpected: ${expected}\nactual:   ${actual}`);
  }
}

assertAlgorithms("Algorithm-name search is not polluted by tags", "AES", [], [
  "AES-128",
  "AES-192",
  "AES-256"
]);
assertAlgorithms("Search and tag filters are intersected independently", "AES", ["AES finalist"], []);
assertAlgorithms("Tag-only filtering still works", "", ["AES finalist"], ["RC6", "Serpent", "Twofish"]);
assertAlgorithms("SHA-3 name search should not return SHA-3 finalists", "SHA-3", [], [
  "Keccak / SHA-3"
]);
assertAlgorithms("Tag text typed into search is not a tag filter", "National standard", [], []);
assertAlgorithms("Venue/year text search still works", "CRYPTO 2017", [], ["SHA-1"]);
assertRecordCount("Record-field search should not collapse multiple matching rows", "chosen-prefix", 3);
if (!recordSearchMode("chosen-prefix")) throw new Error("chosen-prefix should use record-search rendering mode");
if (recordSearchMode("MD5")) throw new Error("MD5 should remain algorithm-name rendering mode");

console.log("Search tests passed");
