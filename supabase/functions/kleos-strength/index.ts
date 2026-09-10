import { createClient } from "npm:@supabase/supabase-js@2.56.0";

const AUTHORIZED_EMAIL = "theneolorenzo@gmail.com";
const KLEOS_CALLER_VERIFIER_URL =
  "https://jhpsggjphoqyygthqfki.supabase.co/functions/v1/verify-heracles-caller";

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
  const response = await fetch(KLEOS_CALLER_VERIFIER_URL, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!response.ok) return false;
  const payload = await response.json().catch(() => null) as { authorized?: boolean } | null;
  return payload?.authorized === true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  let callerAuthorized = false;
  try {
    callerAuthorized = await authenticateKleosCaller(authorization);
  } catch (_error) {
    return json({ error: "AUTHENTICATION_UNAVAILABLE" }, 503);
  }

  if (!callerAuthorized) {
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

  const [strengthResult, bodyWeightResult] = await Promise.all([
    heracles.rpc("get_kleos_strength_snapshot", { p_owner_id: owner.id }),
    heracles.rpc("get_kleos_current_body_weight", { p_owner_id: owner.id }),
  ]);

  if (strengthResult.error || bodyWeightResult.error) {
    return json({ error: "PHYSICAL_SNAPSHOT_UNAVAILABLE" }, 500);
  }

  const bodyWeightRow = Array.isArray(bodyWeightResult.data) && bodyWeightResult.data.length
    ? bodyWeightResult.data[0]
    : null;
  const currentBodyWeight = bodyWeightRow
    ? {
      weight_kg: bodyWeightRow.weight_kg,
      measured_on: bodyWeightRow.measured_on,
    }
    : null;

  return json({
    contract_version: "1.2.0",
    source: "heracles",
    window_days: 30,
    minimum_sessions: 3,
    estimation_basis: "observed_e1rm_high",
    generated_at: new Date().toISOString(),
    current_body_weight: currentBodyWeight,
    lifts: Array.isArray(strengthResult.data) ? strengthResult.data : [],
  });
});
