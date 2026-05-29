(function () {
  const localData = window.attackData || { attacks: [], sources: [], meta: {} };
  const config = window.SUPABASE_CONFIG || {};
  const cloudflareConfig = window.CLOUDFLARE_CONFIG || {};
  const hasSupabaseLibrary = Boolean(window.supabase && typeof window.supabase.createClient === "function");
  const supabaseEnabled = Boolean(config.enabled && config.url && config.anonKey && hasSupabaseLibrary);
  const cloudflareEnabled = Boolean(cloudflareConfig.enabled);
  const cloudflarePublicMode = cloudflareConfig.publicMode || "live";
  let client;

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function getClient() {
    if (!supabaseEnabled) return null;
    if (!client) {
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return client;
  }

  async function getSession() {
    if (!supabaseEnabled) return null;
    const {
      data: { session }
    } = await getClient().auth.getSession();
    return session;
  }

  async function invokeAdminAction(action, payload = {}) {
    if (!supabaseEnabled) throw new Error("Supabase is not configured.");
    const session = await getSession();
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    const { data, error } = await getClient().functions.invoke("admin-users", {
      body: { action, ...payload },
      headers
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function apiUrl(path) {
    return `${String(cloudflareConfig.apiBase || "").replace(/\/$/, "")}${path}`;
  }

  async function cloudflareRequest(path, options = {}) {
    if (!cloudflareEnabled) throw new Error("Cloudflare backend is not configured.");
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

  function numbers(value) {
    return String(value).match(/\d+(\.\d+)?/g)?.map(Number) || [];
  }

  function roundCoverage(totalRounds, attackedRounds) {
    const totals = numbers(totalRounds);
    const attacked = numbers(attackedRounds);
    if (!totals.length || !attacked.length) return null;
    return Number(Math.min(1, Math.max(...attacked) / Math.max(...totals)).toFixed(4));
  }

  function sourceKey(record) {
    return slug(`${record.venue}-${record.year}-${record.paper}`);
  }

  function mergeById(records) {
    const map = new Map();
    for (const record of records) map.set(record.id, record);
    return [...map.values()];
  }

  function mapJoinedRow(row) {
    const algorithm = row.algorithm || {};
    const publication = row.publication || {};
    return {
      id: row.id,
      algorithm: algorithm.name,
      type: algorithm.type,
      totalRounds: algorithm.total_rounds,
      attackedRounds: row.attacked_rounds,
      attack: row.attack,
      model: row.model,
      data: row.data_complexity,
      time: row.time_complexity,
      memory: row.memory_complexity,
      venue: publication.venue,
      year: publication.year,
      paper: publication.title,
      url: publication.url,
      tags: algorithm.tags || [],
      structure: algorithm.structure,
      algorithmYear: algorithm.algorithm_year,
      designPaper: algorithm.design_paper || "",
      designVenue: algorithm.design_venue || "",
      designUrl: algorithm.design_url || "",
      standard: algorithm.standard || "Research primitive",
      algorithmKey: algorithm.id || slug(algorithm.name),
      sourceKey: publication.id || sourceKey({ venue: publication.venue, year: publication.year, paper: publication.title }),
      roundCoverage: row.round_coverage ?? roundCoverage(algorithm.total_rounds, row.attacked_rounds),
      publication
    };
  }

  async function loadSupabaseRecords() {
    const supabase = getClient();
    if (!supabase) return mergeById(localData.attacks);

    const { data, error } = await supabase
      .from("attacks")
      .select(`
        id,
        attack,
        model,
        attacked_rounds,
        round_coverage,
        data_complexity,
        time_complexity,
        memory_complexity,
        algorithm:algorithms!attacks_algorithm_id_fkey(
          id,
          name,
          structure,
          algorithm_year,
          design_paper,
          design_venue,
          design_url,
          standard,
          type,
          total_rounds,
          tags
        ),
        publication:publications!attacks_publication_id_fkey(
          id,
          venue,
          year,
          title,
          url
        )
      `);

    if (error) throw error;
    return mergeById((data || []).map(mapJoinedRow));
  }

  async function loadCloudflareRecords() {
    const data = await cloudflareRequest("/api/data", { method: "GET" });
    return mergeById(data.attacks || []);
  }

  async function loadLiveRecords() {
    if (cloudflareEnabled) {
      try {
        return await loadCloudflareRecords();
      } catch (error) {
        console.warn("Cloudflare read failed, falling back to local data.", error);
        return mergeById(localData.attacks);
      }
    }
    if (!supabaseEnabled) return mergeById(localData.attacks);
    try {
      return await loadSupabaseRecords();
    } catch (error) {
      console.warn("Supabase read failed, falling back to local data.", error);
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
      mode: cloudflareEnabled ? "cloudflare" : supabaseEnabled ? "supabase" : "local"
    };
  }

  async function hasAdminSession() {
    if (cloudflareEnabled) {
      try {
        const result = await cloudflareRequest("/api/admin/session", { method: "GET" });
        return Boolean(result?.admin);
      } catch {
        return false;
      }
    }
    if (!supabaseEnabled) return false;
    const session = await getSession();
    if (!session) return false;
    try {
      const result = await invokeAdminAction("session");
      return Boolean(result?.admin);
    } catch {
      return false;
    }
  }

  async function loginAdmin(username, password) {
    if (cloudflareEnabled) {
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
    if (!supabaseEnabled) return { mode: "local", ok: false };
    const supabase = getClient();
    const email = username.includes("@") ? username : `${username}@${config.adminDomain || "attack-sota.local"}`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { mode: "supabase", ok: false, error };
    const isAdmin = await hasAdminSession();
    if (!isAdmin) {
      await supabase.auth.signOut();
      return { mode: "supabase", ok: false, error: new Error("This account is not an administrator.") };
    }
    return { mode: "supabase", ok: true, error: null };
  }

  async function logoutAdmin() {
    if (cloudflareEnabled) {
      await cloudflareRequest("/api/admin/logout", { method: "POST" });
      return;
    }
    if (!supabaseEnabled) return;
    await getClient().auth.signOut();
  }

  function buildAlgorithmRow(record) {
    return {
      id: record.algorithmKey || slug(record.algorithm),
      name: record.algorithm,
      structure: record.structure,
      algorithm_year: Number(record.algorithmYear) || null,
      design_paper: record.designPaper || null,
      design_venue: record.designVenue || null,
      design_url: record.designUrl || null,
      standard: record.standard || "Research primitive",
      type: record.type,
      total_rounds: record.totalRounds,
      tags: record.tags || []
    };
  }

  function buildPublicationRow(record) {
    return {
      id: record.sourceKey || sourceKey(record),
      venue: record.venue,
      year: Number(record.year),
      title: record.paper,
      url: record.url
    };
  }

  function buildAttackRow(record) {
    return {
      id: record.id,
      algorithm_id: record.algorithmKey || slug(record.algorithm),
      publication_id: record.sourceKey || sourceKey(record),
      attack: record.attack,
      model: record.model,
      attacked_rounds: record.attackedRounds,
      round_coverage: record.roundCoverage ?? roundCoverage(record.totalRounds, record.attackedRounds),
      data_complexity: record.data,
      time_complexity: record.time,
      memory_complexity: record.memory
    };
  }

  async function saveRecord(record) {
    if (cloudflareEnabled) {
      const result = await cloudflareRequest("/api/records", {
        method: "POST",
        body: JSON.stringify(record)
      });
      return result.id;
    }
    if (!supabaseEnabled) throw new Error("Supabase is not configured.");
    const supabase = getClient();

    const algorithmRow = buildAlgorithmRow(record);
    const publicationRow = buildPublicationRow(record);
    const attackRow = buildAttackRow(record);

    const algorithmResult = await supabase.from("algorithms").upsert(algorithmRow, { onConflict: "id" });
    if (algorithmResult.error) throw algorithmResult.error;

    const publicationResult = await supabase.from("publications").upsert(publicationRow, { onConflict: "id" });
    if (publicationResult.error) throw publicationResult.error;

    const attackResult = await supabase.from("attacks").upsert(attackRow, { onConflict: "id" });
    if (attackResult.error) throw attackResult.error;
    return attackRow.id;
  }

  async function deleteRecord(id) {
    if (cloudflareEnabled) {
      await cloudflareRequest(`/api/records/${encodeURIComponent(id)}`, { method: "DELETE" });
      return;
    }
    if (!supabaseEnabled) throw new Error("Supabase is not configured.");
    const supabase = getClient();
    const result = await supabase.from("attacks").delete().eq("id", id);
    if (result.error) throw result.error;
  }

  async function listAdminUsers() {
    if (cloudflareEnabled) {
      const result = await cloudflareRequest("/api/admin/users", { method: "GET" });
      return result.admins || [];
    }
    if (!supabaseEnabled) return [];
    const result = await invokeAdminAction("list");
    return result.admins || [];
  }

  async function createAdminUser(payload) {
    if (cloudflareEnabled) {
      const result = await cloudflareRequest("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return result.admin;
    }
    if (!supabaseEnabled) throw new Error("Supabase is not configured.");
    const result = await invokeAdminAction("create", payload);
    return result.admin;
  }

  async function updateAdminPassword(userId, password) {
    if (cloudflareEnabled) {
      await cloudflareRequest(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
        method: "PUT",
        body: JSON.stringify({ password })
      });
      return;
    }
    if (!supabaseEnabled) throw new Error("Supabase is not configured.");
    await invokeAdminAction("updatePassword", { userId, password });
  }

  async function deleteAdminUser(userId) {
    if (cloudflareEnabled) {
      await cloudflareRequest(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
      return;
    }
    if (!supabaseEnabled) throw new Error("Supabase is not configured.");
    await invokeAdminAction("delete", { userId });
  }

  window.attackBackend = {
    isSupabaseEnabled: () => supabaseEnabled,
    isCloudflareEnabled: () => cloudflareEnabled,
    isRemoteEnabled: () => cloudflareEnabled || supabaseEnabled,
    backendName: () => (cloudflareEnabled ? "Cloudflare D1" : supabaseEnabled ? "Supabase" : "Local drafts"),
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
