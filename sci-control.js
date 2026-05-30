(function () {
  const STRUCTURE_OPTIONS = [
    "SPN",
    "Feistel",
    "Unbalanced Feistel",
    "Generalized Feistel",
    "ARX",
    "Feistel ARX",
    "ARX permutation",
    "Lai-Massey",
    "Tweakable SPN",
    "FX / reflection SPN",
    "Threefish / tweakable block cipher",
    "Merkle-Damgard",
    "HAIFA / ARX",
    "Sponge",
    "Sponge permutation",
    "Sponge-like permutation",
    "AES-like sponge",
    "AES-like hash"
  ];

  const TAG_GROUPS = [
    {
      label: "Standard",
      options: ["National Standard", "ISO/IEC", "3GPP", "Legacy standard"]
    },
    {
      label: "Competition",
      options: [
        "AES candidate",
        "AES finalist",
        "AES selected standard",
        "CAESAR competition",
        "NIST LWC candidate",
        "NIST LWC finalist",
        "NIST LWC selected standard",
        "SHA-3 candidate",
        "SHA-3 finalist",
        "SHA-3 selected standard"
      ]
    },
    {
      label: "Research context",
      options: ["Lightweight", "Tweakable", "Related-key", "Low-data", "Message authentication"]
    }
  ];

  const state = {
    records: [],
    query: "",
    tags: new Set()
  };

  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const loginSection = document.querySelector("#login-section");
  const editorSection = document.querySelector("#editor-section");
  const recordsSection = document.querySelector("#records-section");
  const loginForm = document.querySelector("#login-form");
  const loginMessage = document.querySelector("#login-message");
  const logoutButton = document.querySelector("#logout-admin");
  const form = document.querySelector("#record-form");
  const table = document.querySelector("#record-table");
  const message = document.querySelector("#admin-message");
  const recordCount = document.querySelector("#record-count");
  const searchInput = document.querySelector("#record-search");
  const refreshButton = document.querySelector("#refresh-records");
  const submitRecord = document.querySelector("#submit-record");
  const cancelEdit = document.querySelector("#cancel-edit");
  const structureSelect = document.querySelector("#structure-select");
  const structureCustomWrap = document.querySelector("#structure-custom-wrap");
  const structureCustomInput = document.querySelector("#structure-custom");
  const recordTagPicker = document.querySelector("#record-tag-picker");

  function apiUrl(path) {
    const config = window.CLOUDFLARE_CONFIG || {};
    return `${String(config.apiBase || "").replace(/\/$/, "")}${path}`;
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(apiUrl(path), {
      credentials: "include",
      ...options,
      headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}.`);
    return data;
  }

  function normalize(value) {
    return String(value || "").toLowerCase();
  }

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function safeHref(value) {
    try {
      const url = new URL(String(value || ""), window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch {
      return "#";
    }
    return "#";
  }

  function numbers(value) {
    return String(value).match(/\d+(\.\d+)?/g)?.map(Number) || [];
  }

  function roundCoverage(record) {
    const totals = numbers(record.totalRounds);
    const attacked = numbers(record.attackedRounds);
    if (!totals.length || !attacked.length) return null;
    return Number(Math.min(1, Math.max(...attacked) / Math.max(...totals)).toFixed(4));
  }

  function activeStructureValue() {
    if (structureSelect?.value === "__custom__") return String(structureCustomInput?.value || "").trim();
    return String(structureSelect?.value || "").trim();
  }

  function selectedTags() {
    const tags = new Set(state.tags);
    const structure = activeStructureValue();
    if (structure) tags.add(structure);
    if (form?.elements.type.value === "block") tags.add("Block cipher");
    if (form?.elements.type.value === "hash") tags.add("Hash function");
    return [...tags].sort(collator.compare);
  }

  function createCell(text, className = "") {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function appendSubtle(parent, text) {
    const span = document.createElement("span");
    span.className = "subtle";
    span.textContent = text || "";
    parent.append(span);
  }

  function setMessage(target, text, tone = "") {
    if (!target) return;
    target.textContent = text;
    target.dataset.tone = tone;
  }

  function setAuthenticated(authenticated) {
    loginSection.hidden = authenticated;
    editorSection.hidden = !authenticated;
    recordsSection.hidden = !authenticated;
    logoutButton.hidden = !authenticated;
  }

  function populateStructureOptions() {
    structureSelect.replaceChildren();
    const empty = new Option("Select structure", "");
    structureSelect.append(empty);
    for (const option of STRUCTURE_OPTIONS) structureSelect.append(new Option(option, option));
    structureSelect.append(new Option("Other / custom", "__custom__"));
  }

  function syncStructureUi(value = "") {
    const normalized = String(value || "").trim();
    const known = STRUCTURE_OPTIONS.includes(normalized);
    if (!normalized) {
      structureSelect.value = "";
      structureCustomWrap.hidden = true;
      structureCustomInput.required = false;
      structureCustomInput.value = "";
      return;
    }
    if (known) {
      structureSelect.value = normalized;
      structureCustomWrap.hidden = true;
      structureCustomInput.required = false;
      structureCustomInput.value = "";
      return;
    }
    structureSelect.value = "__custom__";
    structureCustomWrap.hidden = false;
    structureCustomInput.required = true;
    structureCustomInput.value = normalized;
  }

  function renderTagPicker() {
    recordTagPicker.replaceChildren();
    for (const group of TAG_GROUPS) {
      const section = document.createElement("section");
      section.className = "tag-picker-group";
      const title = document.createElement("p");
      title.className = "subtle tag-picker-title";
      title.textContent = group.label;
      const tags = document.createElement("div");
      tags.className = "tags";
      for (const tag of group.options) {
        const button = document.createElement("button");
        button.className = `tag${state.tags.has(tag) ? " active" : ""}`;
        button.type = "button";
        button.dataset.recordTag = tag;
        button.textContent = tag;
        tags.append(button);
      }
      section.append(title, tags);
      recordTagPicker.append(section);
    }
  }

  function formRecord() {
    const data = new FormData(form);
    const algorithm = String(data.get("algorithm") || "").trim();
    const venue = String(data.get("venue") || "").trim();
    const year = Number(data.get("year")) || null;
    const paper = String(data.get("paper") || "").trim();
    return {
      id: String(data.get("id") || "").trim(),
      algorithm,
      structure: activeStructureValue(),
      algorithmYear: Number(data.get("algorithmYear")) || null,
      designPaper: String(data.get("designPaper") || "").trim(),
      designVenue: String(data.get("designVenue") || "").trim(),
      designUrl: String(data.get("designUrl") || "").trim(),
      standard: String(data.get("standard") || "").trim() || "Research primitive",
      type: String(data.get("type") || "block"),
      totalRounds: String(data.get("totalRounds") || "").trim(),
      attackedRounds: String(data.get("attackedRounds") || "").trim(),
      attack: String(data.get("attack") || "").trim(),
      model: String(data.get("model") || "").trim(),
      data: String(data.get("data") || "").trim(),
      time: String(data.get("time") || "").trim(),
      memory: String(data.get("memory") || "").trim(),
      venue,
      year,
      paper,
      url: String(data.get("url") || "").trim(),
      tags: selectedTags(),
      algorithmKey: slug(algorithm),
      sourceKey: slug(`${venue}-${year}-${paper}`),
      roundCoverage: roundCoverage({
        totalRounds: String(data.get("totalRounds") || ""),
        attackedRounds: String(data.get("attackedRounds") || "")
      })
    };
  }

  function resetForm() {
    form.reset();
    form.elements.editingId.value = "";
    state.tags.clear();
    syncStructureUi("");
    renderTagPicker();
    submitRecord.textContent = "Save record";
  }

  function fillForm(record) {
    form.elements.editingId.value = record.id || "";
    form.elements.algorithm.value = record.algorithm || "";
    form.elements.type.value = record.type || "block";
    syncStructureUi(record.structure || "");
    form.elements.algorithmYear.value = record.algorithmYear || "";
    form.elements.designPaper.value = record.designPaper || "";
    form.elements.designVenue.value = record.designVenue || "";
    form.elements.designUrl.value = record.designUrl || "";
    form.elements.standard.value = record.standard || "";
    form.elements.totalRounds.value = record.totalRounds || "";
    form.elements.id.value = record.id || "";
    form.elements.attack.value = record.attack || "";
    form.elements.model.value = record.model || "";
    form.elements.attackedRounds.value = record.attackedRounds || "";
    form.elements.data.value = record.data || "";
    form.elements.time.value = record.time || "";
    form.elements.memory.value = record.memory || "";
    form.elements.venue.value = record.venue || "";
    form.elements.year.value = record.year || "";
    form.elements.paper.value = record.paper || "";
    form.elements.url.value = record.url || "";
    state.tags = new Set((record.tags || []).filter((tag) => TAG_GROUPS.some((group) => group.options.includes(tag))));
    renderTagPicker();
    submitRecord.textContent = "Update record";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function filteredRecords() {
    const query = normalize(state.query);
    if (!query) return state.records;
    return state.records.filter((record) =>
      [
        record.algorithm,
        record.structure,
        record.attack,
        record.model,
        record.venue,
        record.year,
        record.paper
      ]
        .map(normalize)
        .join(" ")
        .includes(query)
    );
  }

  function renderTable() {
    const records = filteredRecords().sort((a, b) => collator.compare(a.algorithm, b.algorithm) || collator.compare(a.id, b.id));
    recordCount.textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
    table.replaceChildren();
    if (!records.length) {
      const row = document.createElement("tr");
      const empty = createCell("No records found.", "empty");
      empty.colSpan = 6;
      row.append(empty);
      table.append(row);
      return;
    }

    for (const record of records) {
      const row = document.createElement("tr");

      const algorithm = createCell(record.algorithm);
      appendSubtle(algorithm, `${record.structure || ""}${record.algorithmYear ? ` · ${record.algorithmYear}` : ""}`);

      const attack = createCell(record.attack);
      appendSubtle(attack, record.model);

      const rounds = createCell(`${record.attackedRounds || ""} / ${record.totalRounds || ""}`);

      const complexities = createCell("");
      appendSubtle(complexities, `D: ${record.data || ""}`);
      appendSubtle(complexities, `T: ${record.time || ""}`);
      appendSubtle(complexities, `M: ${record.memory || ""}`);

      const source = document.createElement("td");
      const link = document.createElement("a");
      link.href = safeHref(record.url);
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `${record.venue || ""} ${record.year || ""}`.trim();
      source.append(link);
      appendSubtle(source, record.paper);

      const actions = document.createElement("td");
      const edit = document.createElement("button");
      edit.className = "tag admin-action";
      edit.type = "button";
      edit.dataset.edit = record.id;
      edit.textContent = "Edit";
      const del = document.createElement("button");
      del.className = "tag admin-action danger-button";
      del.type = "button";
      del.dataset.delete = record.id;
      del.textContent = "Delete";
      actions.append(edit, del);

      row.append(algorithm, attack, rounds, complexities, source, actions);
      table.append(row);
    }
  }

  async function loadRecords() {
    const data = await api("/api/data", { method: "GET" });
    state.records = data.attacks || [];
    renderTable();
  }

  async function checkSession() {
    try {
      const result = await api("/api/admin/session", { method: "GET" });
      const authenticated = Boolean(result.admin);
      setAuthenticated(authenticated);
      if (authenticated) await loadRecords();
    } catch {
      setAuthenticated(false);
    }
  }

  function setupPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = button.closest(".password-row")?.querySelector("input");
        if (!input) return;
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.classList.toggle("is-visible", !showing);
        button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      });
    });
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    const data = new FormData(loginForm);
    setMessage(loginMessage, "Signing in...");
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: String(data.get("username") || "").trim(),
          password: String(data.get("password") || "")
        })
      });
      loginForm.reset();
      setMessage(loginMessage, "");
      setAuthenticated(true);
      await loadRecords();
    } catch (error) {
      setMessage(loginMessage, error.message || "Sign-in failed.", "error");
    }
  });

  logoutButton.addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    setAuthenticated(false);
    resetForm();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!activeStructureValue()) {
      setMessage(message, "Select a structure before saving.", "error");
      structureSelect.focus();
      return;
    }
    const record = formRecord();
    setMessage(message, "Saving...");
    try {
      await api("/api/admin/records", {
        method: "POST",
        body: JSON.stringify(record)
      });
      resetForm();
      setMessage(message, `Saved "${record.id}".`);
      await loadRecords();
    } catch (error) {
      setMessage(message, `Save failed: ${error.message}`, "error");
    }
  });

  cancelEdit.addEventListener("click", () => {
    resetForm();
    setMessage(message, "");
  });

  table.addEventListener("click", async (event) => {
    const editId = event.target.closest("[data-edit]")?.dataset.edit;
    if (editId) {
      const record = state.records.find((item) => item.id === editId);
      if (record) fillForm(record);
      return;
    }

    const deleteId = event.target.closest("[data-delete]")?.dataset.delete;
    if (!deleteId) return;
    const record = state.records.find((item) => item.id === deleteId);
    const label = record ? `${record.algorithm} / ${record.attack}` : deleteId;
    if (!confirm(`Delete attack record "${label}"?`)) return;
    setMessage(message, "Deleting...");
    try {
      await api(`/api/admin/records/${encodeURIComponent(deleteId)}`, { method: "DELETE" });
      if (form.elements.editingId.value === deleteId) resetForm();
      setMessage(message, `Deleted "${deleteId}".`);
      await loadRecords();
    } catch (error) {
      setMessage(message, `Delete failed: ${error.message}`, "error");
    }
  });

  recordTagPicker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-record-tag]");
    if (!button) return;
    const tag = button.dataset.recordTag;
    if (state.tags.has(tag)) state.tags.delete(tag);
    else state.tags.add(tag);
    renderTagPicker();
  });

  structureSelect.addEventListener("change", () => {
    if (structureSelect.value === "__custom__") {
      structureCustomWrap.hidden = false;
      structureCustomInput.required = true;
      structureCustomInput.focus();
      return;
    }
    syncStructureUi(structureSelect.value);
  });

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    renderTable();
  });

  refreshButton.addEventListener("click", async () => {
    setMessage(message, "Refreshing...");
    try {
      await loadRecords();
      setMessage(message, "Records refreshed.");
    } catch (error) {
      setMessage(message, `Refresh failed: ${error.message}`, "error");
    }
  });

  populateStructureOptions();
  renderTagPicker();
  setupPasswordToggles();
  checkSession();
})();
