import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bootstrap-token"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const defaultEmailDomain = Deno.env.get("ADMIN_EMAIL_DOMAIN") ?? "attack-sota.local";

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function normalizeUsername(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEmail(value: unknown, username: string) {
  const email = String(value || "").trim().toLowerCase();
  return email || `${username}@${defaultEmailDomain}`;
}

function validatePassword(password: string) {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function requireAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { error: respond(401, { error: "Missing bearer token." }) };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }
  });

  const {
    data: { user },
    error: userError
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return { error: respond(401, { error: "Invalid session." }) };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: admin, error: adminError } = await serviceClient
    .from("admin_users")
    .select("user_id, username, email, display_name, role, is_active, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError || !admin) {
    return { error: respond(403, { error: "Administrator access required." }) };
  }

  return { user, admin, serviceClient };
}

async function createAdmin(
  serviceClient: ReturnType<typeof createClient>,
  actorId: string | null,
  payload: Record<string, unknown>
) {
  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "");
  const displayName = String(payload.displayName || username || "").trim() || null;
  const email = normalizeEmail(payload.email, username);

  if (!username) return { error: "Username is required." };
  if (!validatePassword(password)) {
    return { error: "Password must be at least 8 characters and include letters, digits, and symbols." };
  }

  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: displayName,
      role: "admin"
    }
  });

  if (error || !data.user) return { error: error?.message || "Failed to create auth user." };

  const adminRow = {
    user_id: data.user.id,
    username,
    email,
    display_name: displayName,
    role: "admin",
    is_active: true,
    created_by: actorId,
    updated_at: new Date().toISOString()
  };

  const { error: insertError } = await serviceClient.from("admin_users").insert(adminRow);
  if (insertError) {
    await serviceClient.auth.admin.deleteUser(data.user.id);
    return { error: insertError.message || "Failed to create admin profile." };
  }

  return {
    admin: {
      user_id: data.user.id,
      username,
      email,
      display_name: displayName,
      role: "admin"
    }
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(500, { error: "Supabase environment is not configured." });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return respond(400, { error: "Expected JSON body." });
  }

  const action = String(body.action || "");
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  if (action === "session") {
    return respond(200, { ok: true, admin: auth.admin });
  }

  if (action === "list") {
    const { data, error } = await auth.serviceClient
      .from("admin_users")
      .select("user_id, username, email, display_name, role, is_active, created_at, updated_at")
      .order("username");
    if (error) return respond(500, { error: error.message });
    return respond(200, { ok: true, admins: data || [] });
  }

  if (action === "create") {
    const result = await createAdmin(auth.serviceClient, auth.user.id, body);
    if (result.error) return respond(400, { error: result.error });
    return respond(200, { ok: true, admin: result.admin });
  }

  if (action === "updatePassword") {
    const userId = String(body.userId || "");
    const password = String(body.password || "");
    if (!userId) return respond(400, { error: "Target user is required." });
    if (!validatePassword(password)) {
      return respond(400, { error: "Password must be at least 8 characters and include letters, digits, and symbols." });
    }

    const { error } = await auth.serviceClient.auth.admin.updateUserById(userId, { password });
    if (error) return respond(400, { error: error.message });

    const { error: updateError } = await auth.serviceClient
      .from("admin_users")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (updateError) return respond(500, { error: updateError.message });

    return respond(200, { ok: true });
  }

  if (action === "delete") {
    const userId = String(body.userId || "");
    if (!userId) return respond(400, { error: "Target user is required." });
    if (userId === auth.user.id) return respond(400, { error: "You cannot delete the account currently in use." });

    const { count, error: countError } = await auth.serviceClient
      .from("admin_users")
      .select("user_id", { head: true, count: "exact" })
      .eq("is_active", true);
    if (countError) return respond(500, { error: countError.message });
    if ((count || 0) <= 1) return respond(400, { error: "At least one administrator must remain." });

    const { error: deleteProfileError } = await auth.serviceClient.from("admin_users").delete().eq("user_id", userId);
    if (deleteProfileError) return respond(400, { error: deleteProfileError.message });

    const { error: deleteUserError } = await auth.serviceClient.auth.admin.deleteUser(userId);
    if (deleteUserError) return respond(400, { error: deleteUserError.message });

    return respond(200, { ok: true });
  }

  return respond(400, { error: "Unknown action." });
});
