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

  async function cloudflareRequest(path) {
    if (!cloudflareEnabled) throw new Error("Cloudflare D1 backend is not configured.");
    const response = await fetch(apiUrl(path), {
      method: "GET",
      headers: { accept: "application/json" }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}.`);
    return data;
  }

  async function loadCloudflareRecords() {
    const data = await cloudflareRequest("/api/data");
    return mergeById(data.attacks || []);
  }

  async function loadPublishedRecords() {
    if (!cloudflareEnabled || cloudflarePublicMode === "static") return mergeById(localData.attacks);
    try {
      return await loadCloudflareRecords();
    } catch (error) {
      console.warn("Cloudflare read failed, falling back to local data.", error);
      return mergeById(localData.attacks);
    }
  }

  async function loadPublicDataset() {
    return {
      attacks: await loadPublishedRecords(),
      sources: localData.sources,
      meta: localData.meta,
      mode: cloudflareEnabled ? "cloudflare" : "local"
    };
  }

  window.attackBackend = {
    isCloudflareEnabled: () => cloudflareEnabled,
    backendName: () => (cloudflareEnabled ? "Cloudflare D1" : "Local data"),
    loadPublicDataset,
    loadPublishedRecords,
    mergeById
  };
})();
