/**
 * Shashki Royale · Admin API — Cloudflare Pages Function (catch-all)
 *
 * Runs under same domain as the admin SPA (shashki-royale-admin.pages.dev/api/*)
 * → no CORS, single deploy, shared env vars.
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE: string;
  JWT_SECRET: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD_HASH: string;
  SESSION_TTL_SECONDS?: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};
const b64urlDecode = (s: string) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(sig);
}

async function jwtSign(payload: object, secret: string): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  return `${data}.${await hmacSign(secret, data)}`;
}

async function jwtVerify(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = await hmacSign(secret, `${parts[0]}.${parts[1]}`);
  if (expected !== parts[2]) return null;
  try {
    const payload = JSON.parse(dec.decode(b64urlDecode(parts[1]))) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function verifyPassword(input: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iter = parseInt(parts[1], 10);
  const salt = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const expected = Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(input),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const got = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
      keyMaterial,
      expected.length * 8,
    ),
  );
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init.headers ?? {}) },
  });

async function sb(env: Env, path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      "content-type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
}

async function audit(env: Env, data: Record<string, unknown>) {
  try {
    await sb(env, "/rest/v1/admin_audit_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "success", ...data }),
    });
  } catch {
    /* table may not exist yet */
  }
}

async function getAuth(req: Request, env: Env): Promise<{ email: string } | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const p = await jwtVerify(h.slice(7), env.JWT_SECRET);
  if (!p || typeof p.sub !== "string") return null;
  return { email: p.sub };
}

interface Ctx {
  request: Request;
  env: Env;
  params: { path?: string[] };
}

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const { request: req, env } = ctx;
  const url = new URL(req.url);
  // pathname: /api/...   actual route after /api/
  const route = url.pathname.replace(/^\/api/, "");

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "GET, POST, OPTIONS",
      },
    });
  }

  try {
    // ── Health ────────────────────────────────
    if (route === "/health") {
      return json({
        ok: true,
        ts: new Date().toISOString(),
        supabase: env.SUPABASE_URL,
        admin_email: env.ADMIN_EMAIL,
        has_service_role: !!env.SUPABASE_SERVICE_ROLE,
        has_jwt_secret: !!env.JWT_SECRET,
        has_pwd_hash: !!env.ADMIN_PASSWORD_HASH,
      });
    }

    // ── Login ─────────────────────────────────
    if (route === "/auth/login" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";
      const ip = req.headers.get("cf-connecting-ip") ?? undefined;

      if (!email || !password) {
        return json({ error: "missing_credentials" }, { status: 400 });
      }
      if (email !== env.ADMIN_EMAIL.toLowerCase()) {
        await audit(env, { actor_email: email, actor_ip: ip, action: "login_failed", status: "failed" });
        await new Promise((r) => setTimeout(r, 250));
        return json({ error: "invalid_credentials" }, { status: 401 });
      }
      const ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
      if (!ok) {
        await audit(env, { actor_email: email, actor_ip: ip, action: "login_failed", status: "failed" });
        return json({ error: "invalid_credentials" }, { status: 401 });
      }
      const ttl = parseInt(env.SESSION_TTL_SECONDS || "28800", 10);
      const now = Math.floor(Date.now() / 1000);
      const token = await jwtSign(
        { sub: email, role: "owner", iat: now, exp: now + ttl },
        env.JWT_SECRET,
      );
      await audit(env, { actor_email: email, actor_ip: ip, action: "login_success" });
      return json({ token, email, role: "owner", expiresIn: ttl });
    }

    // ── Everything below requires auth ────────
    const auth = await getAuth(req, env);
    if (!auth) return json({ error: "unauthorized" }, { status: 401 });

    if (route === "/auth/me" && req.method === "GET") {
      return json({ email: auth.email, role: "owner" });
    }

    // ── Player 360 ────────────────────────────
    const playerMatch = route.match(/^\/admin\/players\/([^/]+)$/);
    if (playerMatch && req.method === "GET") {
      const pid = playerMatch[1];
      const [pr, wr, tr, sk] = await Promise.all([
        sb(env, `/rest/v1/profiles?id=eq.${pid}&limit=1`),
        sb(env, `/rest/v1/wallets?profile_id=eq.${pid}&limit=1`),
        sb(env, `/rest/v1/wallet_transactions?profile_id=eq.${pid}&order=created_at.desc&limit=50`),
        sb(env, `/rest/v1/game_stakes?or=(white_profile_id.eq.${pid},black_profile_id.eq.${pid})&order=created_at.desc&limit=25`),
      ]);
      const profile = ((await pr.json().catch(() => [])) as unknown[])[0] ?? null;
      const wallet = ((await wr.json().catch(() => [])) as unknown[])[0] ?? null;
      const transactions = (await tr.json().catch(() => [])) as unknown[];
      const stakes = (await sk.json().catch(() => [])) as unknown[];
      await audit(env, { actor_email: auth.email, action: "view_player", target_kind: "player", target_id: pid });
      return json({ profile, wallet, transactions, stakes });
    }

    // ── Player audit history ──────────────────
    const auditMatch = route.match(/^\/admin\/players\/([^/]+)\/audit$/);
    if (auditMatch && req.method === "GET") {
      const pid = auditMatch[1];
      const r = await sb(
        env,
        `/rest/v1/admin_audit_log?target_kind=eq.player&target_id=eq.${pid}&order=created_at.desc&limit=50`,
      );
      const rows = (await r.json().catch(() => [])) as unknown[];
      return json({ rows });
    }

    // ── ACTION: grant Coin ────────────────────
    const grantMatch = route.match(/^\/admin\/players\/([^/]+)\/grant-coin$/);
    if (grantMatch && req.method === "POST") {
      const pid = grantMatch[1];
      const body = (await req.json().catch(() => ({}))) as {
        amount?: number;
        reason?: string;
        idempotency_key?: string;
      };
      const amount = Number(body.amount);
      const reason = (body.reason || "").trim();
      if (!Number.isFinite(amount) || amount === 0) {
        return json({ error: "amount_required" }, { status: 400 });
      }
      if (Math.abs(amount) > 1_000_000) {
        return json({ error: "amount_too_large" }, { status: 400 });
      }
      if (reason.length < 3) {
        return json({ error: "reason_required" }, { status: 400 });
      }
      const idem = body.idempotency_key || crypto.randomUUID();

      // Idempotency: refuse if already used
      const dup = await sb(
        env,
        `/rest/v1/admin_audit_log?idempotency_key=eq.${idem}&select=id&limit=1`,
      );
      if ((await dup.json().catch(() => [])).length > 0) {
        return json({ error: "duplicate_request" }, { status: 409 });
      }

      const before = await sb(env, `/rest/v1/wallets?profile_id=eq.${pid}&select=*&limit=1`);
      const beforeRow = ((await before.json().catch(() => [])) as unknown[])[0] ?? null;

      const rpc = await sb(env, "/rest/v1/rpc/admin_grant_coin", {
        method: "POST",
        body: JSON.stringify({
          p_profile_id: pid,
          p_amount: amount,
          p_reason: reason,
          p_actor: auth.email,
        }),
      });
      const result = await rpc.json().catch(() => ({}));
      if (!rpc.ok) {
        await audit(env, {
          actor_email: auth.email,
          action: "grant_coin",
          target_kind: "player",
          target_id: pid,
          reason,
          idempotency_key: idem,
          status: "failed",
          error: JSON.stringify(result),
          before: beforeRow,
        });
        return json({ error: "rpc_failed", detail: result }, { status: 400 });
      }

      const after = await sb(env, `/rest/v1/wallets?profile_id=eq.${pid}&select=*&limit=1`);
      const afterRow = ((await after.json().catch(() => [])) as unknown[])[0] ?? null;

      await audit(env, {
        actor_email: auth.email,
        action: "grant_coin",
        target_kind: "player",
        target_id: pid,
        reason,
        idempotency_key: idem,
        before: beforeRow,
        after: afterRow,
      });
      return json({ ok: true, result });
    }

    // ── ACTION: refund stake ──────────────────
    const refundMatch = route.match(/^\/admin\/stakes\/([^/]+)\/refund$/);
    if (refundMatch && req.method === "POST") {
      const sid = refundMatch[1];
      const body = (await req.json().catch(() => ({}))) as {
        reason?: string;
        idempotency_key?: string;
      };
      const reason = (body.reason || "").trim();
      if (reason.length < 3) {
        return json({ error: "reason_required" }, { status: 400 });
      }
      const idem = body.idempotency_key || crypto.randomUUID();
      const dup = await sb(
        env,
        `/rest/v1/admin_audit_log?idempotency_key=eq.${idem}&select=id&limit=1`,
      );
      if ((await dup.json().catch(() => [])).length > 0) {
        return json({ error: "duplicate_request" }, { status: 409 });
      }

      const before = await sb(env, `/rest/v1/game_stakes?id=eq.${sid}&select=*&limit=1`);
      const beforeRow = ((await before.json().catch(() => [])) as unknown[])[0] ?? null;

      const rpc = await sb(env, "/rest/v1/rpc/admin_refund_stake", {
        method: "POST",
        body: JSON.stringify({
          p_stake_id: sid,
          p_reason: reason,
          p_actor: auth.email,
        }),
      });
      const result = await rpc.json().catch(() => ({}));
      if (!rpc.ok) {
        await audit(env, {
          actor_email: auth.email,
          action: "refund_stake",
          target_kind: "stake",
          target_id: sid,
          reason,
          idempotency_key: idem,
          status: "failed",
          error: JSON.stringify(result),
          before: beforeRow,
        });
        return json({ error: "rpc_failed", detail: result }, { status: 400 });
      }

      const after = await sb(env, `/rest/v1/game_stakes?id=eq.${sid}&select=*&limit=1`);
      const afterRow = ((await after.json().catch(() => [])) as unknown[])[0] ?? null;

      await audit(env, {
        actor_email: auth.email,
        action: "refund_stake",
        target_kind: "stake",
        target_id: sid,
        reason,
        idempotency_key: idem,
        before: beforeRow,
        after: afterRow,
      });
      return json({ ok: true, result });
    }

    // ── ACTION: suspend / unsuspend player ────
    const suspendMatch = route.match(/^\/admin\/players\/([^/]+)\/suspend$/);
    if (suspendMatch && req.method === "POST") {
      const pid = suspendMatch[1];
      const body = (await req.json().catch(() => ({}))) as {
        hours?: number;
        reason?: string;
        idempotency_key?: string;
      };
      const hours = Number(body.hours ?? 0) | 0;
      const reason = (body.reason || "").trim();
      if (hours > 0 && reason.length < 3) {
        return json({ error: "reason_required" }, { status: 400 });
      }
      if (hours > 24 * 365) {
        return json({ error: "hours_too_large" }, { status: 400 });
      }
      const idem = body.idempotency_key || crypto.randomUUID();
      const dup = await sb(
        env,
        `/rest/v1/admin_audit_log?idempotency_key=eq.${idem}&select=id&limit=1`,
      );
      if ((await dup.json().catch(() => [])).length > 0) {
        return json({ error: "duplicate_request" }, { status: 409 });
      }

      const before = await sb(
        env,
        `/rest/v1/profiles?id=eq.${pid}&select=id,suspended_until,suspension_reason,suspended_by&limit=1`,
      );
      const beforeRow = ((await before.json().catch(() => [])) as unknown[])[0] ?? null;

      const rpc = await sb(env, "/rest/v1/rpc/admin_set_suspension", {
        method: "POST",
        body: JSON.stringify({
          p_profile_id: pid,
          p_hours: hours,
          p_reason: reason || null,
          p_actor: auth.email,
        }),
      });
      const result = await rpc.json().catch(() => ({}));
      if (!rpc.ok) {
        await audit(env, {
          actor_email: auth.email,
          action: hours > 0 ? "suspend_player" : "unsuspend_player",
          target_kind: "player",
          target_id: pid,
          reason,
          idempotency_key: idem,
          status: "failed",
          error: JSON.stringify(result),
          before: beforeRow,
        });
        return json({ error: "rpc_failed", detail: result }, { status: 400 });
      }

      const after = await sb(
        env,
        `/rest/v1/profiles?id=eq.${pid}&select=id,suspended_until,suspension_reason,suspended_by&limit=1`,
      );
      const afterRow = ((await after.json().catch(() => [])) as unknown[])[0] ?? null;

      await audit(env, {
        actor_email: auth.email,
        action: hours > 0 ? "suspend_player" : "unsuspend_player",
        target_kind: "player",
        target_id: pid,
        reason,
        idempotency_key: idem,
        before: beforeRow,
        after: afterRow,
      });
      return json({ ok: true, result });
    }

    // ── Wallets summary ───────────────────────
    if (route === "/admin/wallets/summary" && req.method === "GET") {
      const [topR, allR] = await Promise.all([
        sb(env, "/rest/v1/wallets?select=profile_id,crypto_balance,locked_balance,total_won,total_lost,total_deposited,total_withdrawn&order=crypto_balance.desc&limit=20"),
        sb(env, "/rest/v1/wallets?select=crypto_balance,locked_balance,total_won,total_lost"),
      ]);
      const top = (await topR.json().catch(() => [])) as Array<{ profile_id: string; crypto_balance: number; locked_balance: number; total_won: number; total_lost: number; total_deposited: number; total_withdrawn: number }>;
      const all = (await allR.json().catch(() => [])) as Array<{ crypto_balance: number; locked_balance: number; total_won: number; total_lost: number }>;
      const totals = all.reduce(
        (acc, w) => ({
          balance: acc.balance + Number(w.crypto_balance || 0),
          locked: acc.locked + Number(w.locked_balance || 0),
          won: acc.won + Number(w.total_won || 0),
          lost: acc.lost + Number(w.total_lost || 0),
        }),
        { balance: 0, locked: 0, won: 0, lost: 0 },
      );
      // Fetch nicknames for the top 20
      const ids = top.map((t) => t.profile_id).filter(Boolean);
      let profMap: Record<string, { nickname: string; avatar_index: number }> = {};
      if (ids.length > 0) {
        const profR = await sb(env, `/rest/v1/public_profiles?select=id,nickname,avatar_index&id=in.(${ids.join(",")})`);
        const profs = (await profR.json().catch(() => [])) as Array<{ id: string; nickname: string; avatar_index: number }>;
        for (const p of profs) profMap[p.id] = { nickname: p.nickname, avatar_index: p.avatar_index };
      }
      const top2 = top.map((t) => ({
        ...t,
        nickname: profMap[t.profile_id]?.nickname ?? null,
        avatar_index: profMap[t.profile_id]?.avatar_index ?? 0,
      }));
      await audit(env, { actor_email: auth.email, action: "view_wallets_summary" });
      return json({ top: top2, totals, walletCount: all.length });
    }

    // ── Recent transactions ───────────────────
    if (route === "/admin/transactions/recent" && req.method === "GET") {
      const limit = url.searchParams.get("limit") ?? "50";
      const r = await sb(
        env,
        `/rest/v1/wallet_transactions?select=*&order=created_at.desc&limit=${encodeURIComponent(limit)}`,
      );
      const rows = (await r.json().catch(() => [])) as Array<{ profile_id: string }>;
      // Bulk-fetch nicknames
      const ids = Array.from(new Set(rows.map((r) => r.profile_id).filter(Boolean)));
      let profMap: Record<string, { nickname: string; avatar_index: number }> = {};
      if (ids.length > 0) {
        const profR = await sb(env, `/rest/v1/public_profiles?select=id,nickname,avatar_index&id=in.(${ids.join(",")})`);
        const profs = (await profR.json().catch(() => [])) as Array<{ id: string; nickname: string; avatar_index: number }>;
        for (const p of profs) profMap[p.id] = { nickname: p.nickname, avatar_index: p.avatar_index };
      }
      const enriched = rows.map((r) => ({
        ...r,
        nickname: profMap[r.profile_id]?.nickname ?? null,
        avatar_index: profMap[r.profile_id]?.avatar_index ?? 0,
      }));
      await audit(env, { actor_email: auth.email, action: "view_transactions_recent" });
      return json({ rows: enriched });
    }

    // ── Transactions by type ──────────────────
    if (route === "/admin/transactions/by-type" && req.method === "GET") {
      const r = await sb(env, "/rest/v1/wallet_transactions?select=type,amount&limit=10000");
      const rows = (await r.json().catch(() => [])) as Array<{ type: string; amount: string | number }>;
      const map = new Map<string, { count: number; sum: number }>();
      for (const x of rows) {
        const k = x.type ?? "unknown";
        const cur = map.get(k) ?? { count: 0, sum: 0 };
        cur.count += 1;
        cur.sum += Number(x.amount || 0);
        map.set(k, cur);
      }
      const out = Array.from(map.entries())
        .map(([type, v]) => ({ type, ...v }))
        .sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));
      return json({ rows: out });
    }

    return json({ error: "not_found", route }, { status: 404 });
  } catch (err) {
    console.error(err);
    return json({ error: "internal", message: String(err) }, { status: 500 });
  }
};
