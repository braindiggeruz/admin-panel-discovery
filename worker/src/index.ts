/**
 * Cloudflare Worker entry — Shashki Royale Admin API
 *
 * Phase 1 status:  ⏸ NOT DEPLOYED YET
 *
 * To deploy you need to:
 *   1. Apply supabase/admin.sql migration
 *   2. Put secrets via `wrangler secret put` (see worker/README.md)
 *   3. Create first owner row in admin_users
 *   4. Run `wrangler deploy`
 *
 * Designed so that until deploy, the admin panel keeps working with the
 * passphrase soft-gate, no breaking change.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  ARGON2_PEPPER: string;
  ALLOW_ORIGIN: string;
  SESSION_TTL_SECONDS: string;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });

function cors(env: Env, req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const ok = origin === env.ALLOW_ORIGIN;
  return {
    "access-control-allow-origin": ok ? origin : env.ALLOW_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type, authorization, idempotency-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    vary: "Origin",
  };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const corsHeaders = cors(env, req);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // Public health check
      if (url.pathname === "/health") {
        return json(
          {
            ok: true,
            phase: "1-prepared",
            timestamp: new Date().toISOString(),
            ready_for_service_role: !!env.SUPABASE_SERVICE_ROLE_KEY,
          },
          { headers: corsHeaders },
        );
      }

      // POST /auth/login  — Phase 2 stub
      if (url.pathname === "/auth/login" && req.method === "POST") {
        return json(
          { error: "not_implemented", phase: "Sprint 2 — coming next" },
          { status: 501, headers: corsHeaders },
        );
      }

      // GET /admin/* — privileged endpoints (Phase 3+)
      if (url.pathname.startsWith("/admin/")) {
        // TODO Sprint 2: verify JWT, check role, write audit_log, then proxy to Supabase.
        return json(
          { error: "not_implemented", phase: "Sprint 2 — coming next" },
          { status: 501, headers: corsHeaders },
        );
      }

      return json({ error: "not_found" }, { status: 404, headers: corsHeaders });
    } catch (e) {
      console.error(e);
      return json({ error: "internal" }, { status: 500, headers: corsHeaders });
    }
  },
};
