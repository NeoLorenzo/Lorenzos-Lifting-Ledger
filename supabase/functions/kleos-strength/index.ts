import { createClient } from "npm:@supabase/supabase-js@2.56.0";

const AUTHORIZED_EMAIL = "theneolorenzo@gmail.com";
const KLEOS_SUPABASE_URL = "https://jhpsggjphoqyygthqfki.supabase.co";
// Publishable keys are intentionally public credentials. This key is used only to
// ask Kleos Auth to validate the caller's Kleos access token.
const KLEOS_PUBLISHABLE_KEY = "sb_publishable_-r71Jkgx3TiyY_2_RtMUqQ_XWdW3Beh";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function authenticateKleosCaller(authorization: string) {
  const response = await fetch(`${KLEOS_SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: authorization,
      apikey: KLEOS_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) return null;

  const user = await response.json().catch(() => null) as { email?: string } | null;
  const email = String(user?.email ?? "").trim().toLowerCase();
  return email === AUTHORIZED_EMAIL ? user : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  let caller;
  try {
    caller = await authenticateKleosCaller(authorization);
  } catch (_error) {
    return json({ error: "AUTHENTICATION_UNAVAILABLE" }, 503);
  }

  if (!caller) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
  }

  const heracles = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: usersPage, error: usersError } = await heracles.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersError) {
    return json({ error: "HERACLES_OWNER_LOOKUP_FAILED" }, 500);
  }

  const owner = usersPage.users.find(
    (user) => String(user.email ?? "").trim().toLowerCase() === AUTHORIZED_EMAIL,
  );
  if (!owner) {
    return json({ error: "HERACLES_OWNER_NOT_FOUND" }, 500);
  }

  const { data, error } = await heracles.rpc("get_kleos_strength_snapshot", {
    p_owner_id: owner.id,
  });
  if (error) {
    return json({ error: "STRENGTH_SNAPSHOT_UNAVAILABLE" }, 500);
  }

  return json({
    contract_version: "1.0.0",
    source: "heracles",
    window_days: 30,
    minimum_sessions: 3,
    estimation_basis: "observed_e1rm_high",
    generated_at: new Date().toISOString(),
    lifts: Array.isArray(data) ? data : [],
  });
});
