(function () {
  const localData = window.attackData || { attacks: [], sources: [], meta: {} };
  const cloudflareConfig = window.CLOUDFLARE_CONFIG || {};
  const cloudflareEnabled = Boolean(cloudflareConfig.enabled);
  const cloudflarePublicMode = cloudflareConfig.publicMode || "live";

  function mergeById(records) {
    const map = new Map();
    for (const record of records) map.set(record.id, record);
    return [...map.values()];
  }

  function apiUrl(path) {
    return `${String(cloudflareConfig.apiBase || "").replace(/\/$/, "")}${path}`;
  }

  async function cloudflareRequest(path, options = {}) {
    if (!cloudflareEnabled) throw new Error("Cloudflare D1 backend is not configured.");
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

  async function loadCloudflareRecords() {
    const data = await cloudflareRequest("/api/data", { method: "GET" });
    return mergeById(data.attacks || []);
  }

  async function loadLiveRecords() {
    if (!cloudflareEnabled) return mergeById(localData.attacks);
    try {
      return await loadCloudflareRecords();
    } catch (error) {
      console.warn("Cloudflare read failed, falling back to local data.", error);
      return mergeById(localData.attacks);
    }
  }

  async function loadPublishedRecords() {
    if (cloudflareEnabled && cloudflarePublicMode === "static") return mergeById(localData.attacks);
    return loadLiveRecords();
  }

  async function loadPublicDataset() {
    return {
      attacks: await loadPublishedRecords(),
      sources: localData.sources,
      meta: localData.meta,
      mode: cloudflareEnabled ? "cloudflare" : "local"
    };
  }

  async function hasAdminSession() {
    if (!cloudflareEnabled) return false;
    try {
      const result = await cloudflareRequest("/api/admin/session", { method: "GET" });
      return Boolean(result?.admin);
    } catch {
      return false;
    }
  }

  async function loginAdmin(username, password) {
    if (!cloudflareEnabled) return { mode: "local", ok: false };
    try {
      await cloudflareRequest("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      return { mode: "cloudflare", ok: true, error: null };
    } catch (error) {
      return { mode: "cloudflare", ok: false, error };
    }
  }

  async function logoutAdmin() {
    if (cloudflareEnabled) await cloudflareRequest("/api/admin/logout", { method: "POST" });
  }

  async function saveRecord(record) {
    const result = await cloudflareRequest("/api/records", {
      method: "POST",
      body: JSON.stringify(record)
    });
    return result.id;
  }

  async function deleteRecord(id) {
    await cloudflareRequest(`/api/records/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async function listAdminUsers() {
    const result = await cloudflareRequest("/api/admin/users", { method: "GET" });
    return result.admins || [];
  }

  async function createAdminUser(payload) {
    const result = await cloudflareRequest("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return result.admin;
  }

  async function updateAdminPassword(userId, password) {
    await cloudflareRequest(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
      method: "PUT",
      body: JSON.stringify({ password })
    });
  }

  async function deleteAdminUser(userId) {
    await cloudflareRequest(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  }

  window.attackBackend = {
    isCloudflareEnabled: () => cloudflareEnabled,
    isRemoteEnabled: () => cloudflareEnabled,
    backendName: () => (cloudflareEnabled ? "Cloudflare D1" : "Local drafts"),
    loadPublicDataset,
    loadPublishedRecords,
    loadLiveRecords,
    hasAdminSession,
    loginAdmin,
    logoutAdmin,
    listAdminUsers,
    createAdminUser,
    updateAdminPassword,
    deleteAdminUser,
    saveRecord,
    deleteRecord,
    mergeById
  };
})();
