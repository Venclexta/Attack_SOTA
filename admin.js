const draftKey = "attack-sota-drafts";
const deletedKey = "attack-sota-deleted";
const sessionKey = "attack-sota-admin-session";
const lockKey = "attack-sota-admin-lock";
const maxAttempts = 5;
const lockMinutes = 5;
const sessionMinutes = 30;
const adminUser = "admin";
const adminPasswordHash = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

const loginSection = document.querySelector("#login-section");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const sessionActions = document.querySelector("#session-actions");
const logoutExistingSession = document.querySelector("#logout-existing-session");
const adminOnly = [...document.querySelectorAll("[data-admin-only]")];
const form = document.querySelector("#admin-form");
const submitRecord = document.querySelector("#submit-record");
const cancelEdit = document.querySelector("#cancel-edit");
const draftTable = document.querySelector("#draft-table");
const draftCount = document.querySelector("#draft-count");
const message = document.querySelector("#admin-message");
const backendMode = document.querySelector("#backend-mode");
const editingId = document.querySelector("#editing-id");
const adminUserForm = document.querySelector("#admin-user-form");
const adminUserMessage = document.querySelector("#admin-user-message");
const adminUserCount = document.querySelector("#admin-user-count");
const adminUsersTable = document.querySelector("#admin-users-table");
const adminPasswordForm = document.querySelector("#admin-password-form");
const adminPasswordMessage = document.querySelector("#admin-password-message");
const adminPasswordEmpty = document.querySelector("#admin-password-empty");
const cancelPasswordEdit = document.querySelector("#cancel-password-edit");
const structureSelect = document.querySelector("#structure-select");
const structureCustomWrap = document.querySelector("#structure-custom-wrap");
const structureCustomInput = document.querySelector("#structure-custom");
const recordTagsInput = document.querySelector("#record-tags-input");
const recordTagPicker = document.querySelector("#record-tag-picker");
const baseData = window.attackData;
const onLoginPage = Boolean(loginForm);
const onManagePage = Boolean(form);
let adminDirectory = [];
const selectedRecordTags = new Set();

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
    label: "Standards",
    options: ["National Standard", "ISO/IEC", "3GPP", "Legacy standard"]
  },
  {
    label: "Competition solicitations",
    options: [
      "AES candidate",
      "AES finalist",
      "AES selected standard",
      "CAESAR competition",
      "CAESAR-related",
      "NIST LWC candidate",
      "NIST LWC finalist",
      "NIST LWC selected standard",
      "NIST LWC-related",
      "SHA-3 candidate",
      "SHA-3 finalist",
      "SHA-3 selected standard"
    ]
  },
  {
    label: "Research labels",
    options: ["Lightweight", "Low-data", "Message authentication", "Related-key", "NSA design", "Certificate attacks"]
  }
];

const MANUAL_TAG_OPTIONS = new Set(TAG_GROUPS.flatMap((group) => group.options));

function now() {
  return Date.now();
}

async function sha256(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readJson(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isStrongPassword(value) {
  return (
    String(value || "").length >= 8 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value)
  );
}

function isRemoteBackend() {
  return Boolean(window.attackBackend?.isRemoteEnabled?.());
}

function backendName() {
  return window.attackBackend?.backendName?.() || "Local drafts";
}

function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function activeStructureValue() {
  if (!structureSelect) return "";
  if (structureSelect.value === "__custom__") return String(structureCustomInput?.value || "").trim();
  return structureSelect.value;
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

function defaultTags(record) {
  const structure = activeStructureValue() || String(record.structure || "").trim();
  const tags = new Set(splitTags(record.tags));
  if (structure) tags.add(structure);
  if (/nist|nbs|national|cryptrec/i.test(record.standard)) tags.add("National Standard");
  tags.add(record.type === "block" ? "Block cipher" : "Hash function");
  return [...tags].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function formRecord(formData) {
  const record = Object.fromEntries(formData.entries());
  const year = Number(record.year);
  const algorithmYear = Number(record.algorithmYear);
  const structure = activeStructureValue();
  const tags = defaultTags(record);
  const id = slug(record.editingId || record.id);
  return {
    id,
    algorithm: record.algorithm.trim(),
    structure,
    algorithmYear,
    designPaper: record.designPaper.trim(),
    designVenue: record.designVenue.trim(),
    designUrl: record.designUrl.trim(),
    standard: record.standard.trim() || "Research primitive",
    type: record.type,
    totalRounds: record.totalRounds.trim(),
    attackedRounds: record.attackedRounds.trim(),
    attack: record.attack.trim(),
    model: record.model.trim(),
    data: record.data.trim(),
    time: record.time.trim(),
    memory: record.memory.trim(),
    venue: record.venue.trim(),
    year,
    paper: record.paper.trim(),
    url: record.url.trim(),
    tags,
    algorithmKey: slug(record.algorithm),
    sourceKey: slug(`${record.venue}-${record.year}-${record.paper}`),
    roundCoverage: roundCoverage(record)
  };
}

function lockState() {
  return readJson(lockKey, { attempts: 0, lockedUntil: 0 });
}

function writeLock(state) {
  localStorage.setItem(lockKey, JSON.stringify(state));
}

function clearLock() {
  localStorage.removeItem(lockKey);
}

function isLocked() {
  const state = lockState();
  return state.lockedUntil && state.lockedUntil > now();
}

function lockedMessage() {
  const minutes = Math.ceil((lockState().lockedUntil - now()) / 60000);
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function sessionState() {
  return readJson(sessionKey, null);
}

function isLocalAuthenticated() {
  const session = sessionState();
  return Boolean(session?.expiresAt && session.expiresAt > now());
}

function startLocalSession() {
  writeJson(sessionStorage, sessionKey, {
    user: adminUser,
    issuedAt: now(),
    expiresAt: now() + sessionMinutes * 60000
  });
}

function endLocalSession() {
  sessionStorage.removeItem(sessionKey);
}

async function isAuthenticated() {
  if (isRemoteBackend()) return window.attackBackend.hasAdminSession();
  return isLocalAuthenticated();
}

async function requireAuth() {
  if (await isAuthenticated()) return true;
  if (onManagePage) window.location.href = "admin.html";
  return false;
}

function readDrafts() {
  return readJson(draftKey, []);
}

function writeDrafts(drafts) {
  writeJson(localStorage, draftKey, drafts);
}

function readDeletedIds() {
  return readJson(deletedKey, []);
}

function writeDeletedIds(ids) {
  writeJson(localStorage, deletedKey, ids);
}

function clearLocalOverrides() {
  localStorage.removeItem(draftKey);
  localStorage.removeItem(deletedKey);
}

function localMergedRecords() {
  const drafts = readDrafts();
  const deletedIds = new Set(readDeletedIds());
  const map = new Map(baseData.attacks.map((record) => [record.id, record]));
  for (const draft of drafts) map.set(draft.id, draft);
  for (const id of deletedIds) map.delete(id);
  return [...map.values()];
}

function exportDatabase(records) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    meta: baseData.meta,
    sources: baseData.sources,
    records
  };
}

function triggerFile(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function recordsForManage() {
  if (isRemoteBackend()) {
    return window.attackBackend.loadLiveRecords?.() || window.attackBackend.loadPublishedRecords();
  }
  return localMergedRecords();
}

function fillForm(record) {
  if (!form) return;
  editingId.value = record.id || "";
  form.elements.algorithm.value = record.algorithm || "";
  form.elements.type.value = record.type || "block";
  syncStructureUi(record.structure || "");
  form.elements.algorithmYear.value = record.algorithmYear || "";
  form.elements.designPaper.value = record.designPaper || "";
  form.elements.designVenue.value = record.designVenue || "";
  form.elements.designUrl.value = record.designUrl || "";
  form.elements.standard.value = record.standard || "";
  form.elements.id.value = record.id || "";
  form.elements.attack.value = record.attack || "";
  form.elements.model.value = record.model || "";
  form.elements.totalRounds.value = record.totalRounds || "";
  form.elements.attackedRounds.value = record.attackedRounds || "";
  form.elements.data.value = record.data || "";
  form.elements.time.value = record.time || "";
  form.elements.memory.value = record.memory || "";
  form.elements.venue.value = record.venue || "";
  form.elements.year.value = record.year || "";
  form.elements.paper.value = record.paper || "";
  form.elements.url.value = record.url || "";
  selectedRecordTags.clear();
  (record.tags || []).filter((tag) => MANUAL_TAG_OPTIONS.has(tag)).forEach((tag) => selectedRecordTags.add(tag));
  renderRecordTagPicker();
  submitRecord.textContent = "Update record";
}

function resetFormState() {
  if (!form) return;
  form.reset();
  editingId.value = "";
  selectedRecordTags.clear();
  syncStructureUi("");
  renderRecordTagPicker();
  submitRecord.textContent = "Save record";
}

async function removeRecord(id) {
  if (isRemoteBackend()) {
    await window.attackBackend.deleteRecord(id);
    return;
  }

  const drafts = readDrafts().filter((record) => record.id !== id);
  writeDrafts(drafts);
  const deleted = new Set(readDeletedIds());
  deleted.add(id);
  writeDeletedIds([...deleted]);
}

async function saveRecord(record) {
  if (isRemoteBackend()) {
    await window.attackBackend.saveRecord(record);
    return;
  }

  const drafts = readDrafts().filter((item) => item.id !== record.id);
  drafts.push(record);
  writeDrafts(drafts);
  const deleted = new Set(readDeletedIds());
  deleted.delete(record.id);
  writeDeletedIds([...deleted]);
}

async function renderManageTable() {
  if (!draftTable || !draftCount) return;
  const records = await recordsForManage();
  draftCount.textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
  draftTable.innerHTML =
    records
      .sort((a, b) => a.algorithm.localeCompare(b.algorithm, "en", { numeric: true, sensitivity: "base" }))
      .map(
        (record) => `
          <tr>
            <td>
              <strong>${record.algorithm}</strong>
              <span class="subtle">${record.structure} · ${record.algorithmYear || ""}</span>
            </td>
            <td>
              <strong>${record.attack}</strong>
              <span class="subtle">${record.model}</span>
            </td>
            <td>${record.attackedRounds} / ${record.totalRounds}</td>
            <td>
              <span class="subtle">D: ${record.data}</span>
              <span class="subtle">T: ${record.time}</span>
              <span class="subtle">M: ${record.memory}</span>
            </td>
            <td>
              <a href="${record.url}" target="_blank" rel="noreferrer">${record.venue} ${record.year}</a>
              <span class="subtle">${record.paper}</span>
            </td>
            <td>
              <button class="tag admin-action" type="button" data-edit="${record.id}">Edit</button>
              <button class="tag admin-action danger-button" type="button" data-delete="${record.id}">Delete</button>
            </td>
          </tr>
        `
      )
      .join("") || '<tr><td colspan="6" class="empty">No records yet.</td></tr>';
}

function resetPasswordForm() {
  if (!adminPasswordForm) return;
  adminPasswordForm.reset();
  adminPasswordForm.hidden = true;
  if (adminPasswordEmpty) adminPasswordEmpty.hidden = false;
  if (adminPasswordMessage) adminPasswordMessage.textContent = "";
}

function populateStructureOptions() {
  if (!structureSelect) return;
  structureSelect.innerHTML = [
    '<option value="">Select structure</option>',
    ...STRUCTURE_OPTIONS.map((value) => `<option value="${value}">${value}</option>`),
    '<option value="__custom__">Other / custom</option>'
  ].join("");
}

function syncStructureUi(value = "") {
  if (!structureSelect || !structureCustomWrap || !structureCustomInput) return;
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

function syncRecordTagsInput() {
  if (!recordTagsInput) return;
  recordTagsInput.value = [...selectedRecordTags].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })).join(", ");
}

function renderRecordTagPicker() {
  if (!recordTagPicker) return;
  recordTagPicker.innerHTML = TAG_GROUPS.map(
    (group) => `
      <section class="tag-picker-group">
        <p class="subtle tag-picker-title">${group.label}</p>
        <div class="tags">
          ${group.options
            .map((tag) => {
              const active = selectedRecordTags.has(tag) ? " active" : "";
              return `<button class="tag${active}" type="button" data-record-tag="${tag}">${tag}</button>`;
            })
            .join("")}
        </div>
      </section>
    `
  ).join("");
  syncRecordTagsInput();
}

function setupPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest(".password-row");
      const input = row?.querySelector("input");
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.classList.toggle("is-visible", !showing);
      button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
  });
}

function openPasswordForm(admin) {
  if (!adminPasswordForm) return;
  adminPasswordForm.hidden = false;
  if (adminPasswordEmpty) adminPasswordEmpty.hidden = true;
  adminPasswordForm.elements.userId.value = admin.user_id;
  adminPasswordForm.elements.username.value = admin.username;
  adminPasswordForm.elements.password.value = "";
  if (adminPasswordMessage) adminPasswordMessage.textContent = "";
}

async function renderAdminTable() {
  if (!adminUsersTable || !adminUserCount) return;
  if (!isRemoteBackend()) {
    adminUserCount.textContent = "Local fallback";
    adminUsersTable.innerHTML =
      '<tr><td colspan="5" class="empty">Administrator account management requires a live database backend.</td></tr>';
    resetPasswordForm();
    return;
  }

  try {
    adminDirectory = await window.attackBackend.listAdminUsers();
    adminUserCount.textContent = `${adminDirectory.length} admin${adminDirectory.length === 1 ? "" : "s"}`;
    adminUsersTable.innerHTML =
      adminDirectory
        .map(
          (admin) => `
            <tr>
              <td>
                <strong>${admin.username}</strong>
                <span class="subtle">${admin.display_name || "Administrator"}</span>
              </td>
              <td>${admin.email}</td>
              <td>${admin.role}</td>
              <td>${new Date(admin.updated_at || admin.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td>
                <button class="tag admin-action" type="button" data-password-user="${admin.user_id}">Set password</button>
                <button class="tag admin-action danger-button" type="button" data-delete-admin="${admin.user_id}">Delete</button>
              </td>
            </tr>
          `
        )
        .join("") || '<tr><td colspan="5" class="empty">No administrators found.</td></tr>';
  } catch (error) {
    adminUserCount.textContent = "Unavailable";
    adminUsersTable.innerHTML = `<tr><td colspan="5" class="empty">Failed to load administrators: ${error.message}</td></tr>`;
  }
}

async function updateAuthUi() {
  const authenticated = await isAuthenticated();
  if (onManagePage && !authenticated) {
    window.location.href = "admin.html";
    return;
  }
  if (loginSection) loginSection.hidden = false;
  if (sessionActions) sessionActions.hidden = !authenticated;
  if (onLoginPage && authenticated && loginMessage && !loginMessage.textContent) {
    loginMessage.textContent = "An administrator session is already active.";
  }
  adminOnly.forEach((element) => {
    element.hidden = !authenticated;
  });
  if (backendMode) {
    backendMode.textContent = `Backend mode: ${backendName()}${isRemoteBackend() ? " live database" : " fallback"}`;
  }
  if (authenticated && onManagePage) {
    await renderManageTable();
    await renderAdminTable();
  }
}

function recordFailedLogin() {
  const state = lockState();
  const attempts = (state.attempts || 0) + 1;
  const lockedUntil = attempts >= maxAttempts ? now() + lockMinutes * 60000 : 0;
  writeLock({ attempts, lockedUntil });
  return { attempts, lockedUntil };
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(await requireAuth())) return;
    if (!activeStructureValue()) {
      message.textContent = "Select a structure before saving.";
      structureSelect?.focus();
      return;
    }
    const record = formRecord(new FormData(form));
    try {
      await saveRecord(record);
      resetFormState();
      message.textContent = `Saved record "${record.id}".`;
      await renderManageTable();
    } catch (error) {
      message.textContent = `Save failed: ${error.message}`;
    }
  });
}

cancelEdit?.addEventListener("click", () => {
  resetFormState();
  if (message) message.textContent = "";
});

draftTable?.addEventListener("click", async (event) => {
  const editId = event.target.closest("[data-edit]")?.dataset.edit;
  if (editId) {
    const records = await recordsForManage();
    const record = records.find((item) => item.id === editId);
    if (record) fillForm(record);
    return;
  }

  const deleteId = event.target.closest("[data-delete]")?.dataset.delete;
  if (deleteId) {
    if (!(await requireAuth())) return;
    try {
      await removeRecord(deleteId);
      if (editingId?.value === deleteId) resetFormState();
      message.textContent = `Deleted record "${deleteId}".`;
      await renderManageTable();
    } catch (error) {
      message.textContent = `Delete failed: ${error.message}`;
    }
  }
});

structureSelect?.addEventListener("change", () => {
  if (structureSelect.value === "__custom__") {
    if (structureCustomWrap) structureCustomWrap.hidden = false;
    if (structureCustomInput) {
      structureCustomInput.required = true;
      structureCustomInput.focus();
    }
    return;
  }
  syncStructureUi(structureSelect.value);
});

recordTagPicker?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-record-tag]");
  if (!button) return;
  const tag = button.dataset.recordTag;
  if (selectedRecordTags.has(tag)) selectedRecordTags.delete(tag);
  else selectedRecordTags.add(tag);
  renderRecordTagPicker();
});

adminUsersTable?.addEventListener("click", async (event) => {
  const passwordUserId = event.target.closest("[data-password-user]")?.dataset.passwordUser;
  if (passwordUserId) {
    const admin = adminDirectory.find((item) => item.user_id === passwordUserId);
    if (admin) openPasswordForm(admin);
    return;
  }

  const deleteUserId = event.target.closest("[data-delete-admin]")?.dataset.deleteAdmin;
  if (deleteUserId) {
    if (!(await requireAuth())) return;
    const admin = adminDirectory.find((item) => item.user_id === deleteUserId);
    if (!admin) return;
    try {
      await window.attackBackend.deleteAdminUser(deleteUserId);
      if (adminPasswordForm?.elements.userId.value === deleteUserId) resetPasswordForm();
      if (adminUserMessage) adminUserMessage.textContent = `Deleted administrator "${admin.username}".`;
      await renderAdminTable();
    } catch (error) {
      if (adminUserMessage) adminUserMessage.textContent = `Delete failed: ${error.message}`;
    }
  }
});

adminUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(await requireAuth())) return;
  if (!isRemoteBackend()) {
    adminUserMessage.textContent = "Administrator account creation requires a live database backend.";
    return;
  }

  const formData = new FormData(adminUserForm);
  const payload = {
    username: String(formData.get("username") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    displayName: String(formData.get("displayName") || "").trim(),
    password: String(formData.get("password") || "")
  };

  if (!isStrongPassword(payload.password)) {
    adminUserMessage.textContent =
      "Password must be at least 8 characters and include letters and digits.";
    return;
  }

  try {
    const admin = await window.attackBackend.createAdminUser(payload);
    adminUserForm.reset();
    adminUserMessage.textContent = `Created administrator "${admin.username}".`;
    await renderAdminTable();
  } catch (error) {
    adminUserMessage.textContent = `Create failed: ${error.message}`;
  }
});

adminPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(await requireAuth())) return;
  const formData = new FormData(adminPasswordForm);
  const userId = String(formData.get("userId") || "");
  const password = String(formData.get("password") || "");

  if (!isStrongPassword(password)) {
    adminPasswordMessage.textContent =
      "Password must be at least 8 characters and include letters and digits.";
    return;
  }

  try {
    await window.attackBackend.updateAdminPassword(userId, password);
    adminPasswordMessage.textContent = "Password updated.";
    await renderAdminTable();
    setTimeout(() => {
      resetPasswordForm();
    }, 1200);
  } catch (error) {
    adminPasswordMessage.textContent = `Update failed: ${error.message}`;
  }
});

cancelPasswordEdit?.addEventListener("click", () => {
  resetPasswordForm();
});

document.querySelector("#export-json")?.addEventListener("click", async () => {
  if (!(await requireAuth())) return;
  const records = await recordsForManage();
  triggerFile("attacks.json", `${JSON.stringify(exportDatabase(records), null, 2)}\n`, "application/json");
});

document.querySelector("#export-js")?.addEventListener("click", async () => {
  if (!(await requireAuth())) return;
  const records = await recordsForManage();
  const data = { ...baseData, attacks: records };
  triggerFile("data.js", `window.attackData = ${JSON.stringify(data, null, 2)};\n`, "text/javascript");
});

document.querySelector("#clear-drafts")?.addEventListener("click", async () => {
  if (!(await requireAuth())) return;
  if (isRemoteBackend()) {
    message.textContent = "Clear drafts is available only in local fallback mode.";
    return;
  }
  clearLocalOverrides();
  resetFormState();
  message.textContent = "Local overrides cleared.";
  await renderManageTable();
});

document.querySelector("#logout-admin")?.addEventListener("click", async () => {
  if (isRemoteBackend()) await window.attackBackend.logoutAdmin();
  endLocalSession();
  if (message) message.textContent = "";
  window.location.href = "admin.html";
});

logoutExistingSession?.addEventListener("click", async () => {
  if (isRemoteBackend()) await window.attackBackend.logoutAdmin();
  endLocalSession();
  if (loginMessage) loginMessage.textContent = "Signed out.";
  if (sessionActions) sessionActions.hidden = true;
});

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    if (isLocked()) {
      loginMessage.textContent = lockedMessage();
      return;
    }
    const formData = new FormData(loginForm);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");
    if (!username || !password) {
      loginMessage.textContent = "Enter both username and password.";
      return;
    }

    if (isRemoteBackend()) {
      const result = await window.attackBackend.loginAdmin(username, password);
      if (!result.ok) {
        loginMessage.textContent = result.error?.message || `${backendName()} sign-in failed.`;
        return;
      }
      loginForm.reset();
      window.location.href = "manage.html";
      return;
    }

    const passwordHash = await sha256(password);
    const valid = username === adminUser && passwordHash === adminPasswordHash;
    if (!valid) {
      const state = recordFailedLogin();
      loginMessage.textContent = state.lockedUntil
        ? lockedMessage()
        : `Invalid credentials. ${maxAttempts - state.attempts} attempt${
            maxAttempts - state.attempts === 1 ? "" : "s"
          } remaining.`;
      loginForm.reset();
      return;
    }

    clearLock();
    startLocalSession();
    loginForm.reset();
    loginMessage.textContent = "";
    window.location.href = "manage.html";
  });
}

setInterval(() => {
  updateAuthUi();
}, 15000);

updateAuthUi();
populateStructureOptions();
renderRecordTagPicker();
syncStructureUi("");
setupPasswordToggles();
