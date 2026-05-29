// =============================================================================
// send-eoi-notifications  (Condo Market SF / SV)  — v2 (no supabase-js)
// -----------------------------------------------------------------------------
// Pure fetch + Supabase REST API (PostgREST) to avoid npm:@supabase/supabase-js
// cold-start hang in the Edge Runtime.
//
// Fired by trigger offers_notify_eoi_on_insert via notify_eoi_received() in
// Postgres on every INSERT into public.offers. Sends two emails via Resend:
//   1. Buyer  — accurate "EOI received, agent will reach out within 24 hours"
//   2. Tim    — admin alert with building median, $/ft² range, buyer message
//
// Health check: GET or POST any URL with ?ping=1 returns 200 instantly.
// =============================================================================

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY     = Deno.env.get("RESEND_API_KEY")!;
const EOI_WEBHOOK_SECRET = Deno.env.get("EOI_WEBHOOK_SECRET")
  ?? "84b34b1830a621c93e902b54b0ad0446b6d1545e51ac93d055d47878735d8b9b";
const ADMIN_EMAIL = "tim@mcmullen.properties";

const MARKETS: Record<string, { tag: string; domain: string; brand: string }> = {
  "3cfba663-79af-4a6c-90ce-3d929c8351dd": {
    tag: "sf", domain: "sanfranciscocondomarket.com", brand: "Condo Market · SF",
  },
  "896e25bf-92ab-4325-a322-8c1a718e13dd": {
    tag: "sv", domain: "siliconvalleycondomarket.com", brand: "Condo Market · Silicon Valley",
  },
};
const DEFAULT_MARKET = MARKETS["3cfba663-79af-4a6c-90ce-3d929c8351dd"];

// ---------- Postgres REST helpers (no supabase-js needed) -------------------
const PG_HEADERS = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function pgSelect(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "GET", headers: PG_HEADERS,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`pgSelect ${path} → ${res.status}: ${t}`);
  }
  return await res.json();
}

async function pgRpc(rpcName: string, args: Record<string, any>): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: "POST", headers: PG_HEADERS, body: JSON.stringify(args),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`pgRpc ${rpcName} → ${res.status}: ${t}`);
  }
  return await res.json();
}

// ---------- formatting helpers ----------------------------------------------
function fmtUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(x);
}
function fmtPPSF(ppsf: number | null | undefined): string {
  if (ppsf == null) return "—";
  const x = Number(ppsf);
  if (!Number.isFinite(x)) return "—";
  return `$${Math.round(x).toLocaleString()}/ft²`;
}
function fmtRange(lo: number | null | undefined, hi: number | null | undefined): string {
  if (lo == null || hi == null) return "—";
  return `$${Math.round(Number(lo)).toLocaleString()} – $${Math.round(Number(hi)).toLocaleString()}/ft²`;
}
function fmtTimestampPT(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short",
    }) + " PT";
  } catch { return iso; }
}
function firstName(full: string | null | undefined): string | null {
  if (!full) return null;
  const t = String(full).trim().split(/\s+/)[0];
  return t || null;
}
function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function merge(template: string, vars: Record<string, string>): string {
  return (template || "").replace(/\{([a-z_]+)\}/g, (_m, k) => vars[k] ?? "");
}

// ---------- email send via Resend -------------------------------------------
async function sendEmail(opts: {
  from: string; to: string; replyTo: string; subject: string; html: string;
  tags?: { name: string; value: string }[];
}): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      reply_to: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
      tags: opts.tags ?? [],
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// ---------- main handler ----------------------------------------------------
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // 0. True health-check: ?ping=1 returns instantly with no auth/body checks
  if (url.searchParams.get("ping") === "1") {
    return new Response(JSON.stringify({ ok: true, pong: Date.now() }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Webhook secret check
  if (req.headers.get("x-webhook-secret") !== EOI_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Parse payload
  let payload: any;
  try { payload = await req.json(); }
  catch {
    return new Response(JSON.stringify({ ok: false, error: "bad_json" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Filter to offer_created only
  if (payload?.event_type !== "offer_created") {
    return new Response(JSON.stringify({
      ok: true, skipped: "wrong_event_type", got: payload?.event_type,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const offer = payload.offer;
  if (!offer || !offer.id || !offer.building_slug) {
    return new Response(JSON.stringify({ ok: false, error: "missing_offer_fields" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 4. Resolve market via buildings.city_id → cities.market_id (PostgREST embed)
    const slugFilter = encodeURIComponent(offer.building_slug);
    const bRows = await pgSelect(
      `buildings?select=slug,display_name,city_id,cities(market_id)&slug=eq.${slugFilter}&limit=1`
    );
    const bRow = bRows[0] ?? null;
    const marketId: string | null = bRow?.cities?.market_id ?? null;
    const market = (marketId && MARKETS[marketId]) || DEFAULT_MARKET;

    // 5. Fetch market brief
    const brief = (await pgRpc("building_market_brief", {
      p_building_slug: offer.building_slug,
    })) ?? {};
    const buildingName: string =
      brief.building_name || bRow?.display_name || offer.building_slug;

    // 6. Fetch both email templates
    const templates = await pgSelect(
      `email_templates?select=slug,subject,body_html,preview_text` +
      `&slug=in.(eoi_received_buyer_v1,admin_new_eoi_v1)&is_active=eq.true`
    );
    const buyerTpl = templates.find((t: any) => t.slug === "eoi_received_buyer_v1");
    const adminTpl = templates.find((t: any) => t.slug === "admin_new_eoi_v1");

    if (!buyerTpl || !adminTpl) {
      console.warn("EOI templates missing", { hasBuyer: !!buyerTpl, hasAdmin: !!adminTpl });
      return new Response(JSON.stringify({ ok: false, error: "templates_missing" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // 7. Compute display variables
    const fn = firstName(offer.buyer_name);
    const buyerDisplayName = offer.buyer_name?.trim() || offer.buyer_email || "Buyer";
    const offerAmountStr   = fmtUSD(offer.offer_amount);
    const unitLabelClean   = (offer.unit_label || "").trim();
    const submittedAtLocal = fmtTimestampPT(offer.created_at || new Date().toISOString());
    const dashboardUrl     = `https://www.${market.domain}/dashboard/?ref=eoi&offer=${offer.id}`;
    const adminOfferUrl    = `https://www.${market.domain}/admin/offers/?id=${offer.id}`;
    const messageHtmlBlock = offer.message
      ? `<div style="margin:16px 0;padding:14px 16px;background:#f6f4ee;border-left:3px solid #91a1ba;color:#353535;font-style:italic;font-size:14px;line-height:1.5;">${escapeHtml(offer.message)}</div>`
      : "";

    // 8a. Buyer email vars
    const buyerVars: Record<string, string> = {
      first_name_block: fn ? `Hi ${escapeHtml(fn)},` : "Hi there,",
      building_name:    escapeHtml(buildingName),
      unit_block:       unitLabelClean ? ` — Unit ${escapeHtml(unitLabelClean)}` : "",
      offer_amount:     offerAmountStr,
      message_block:    messageHtmlBlock,
      dashboard_url:    dashboardUrl,
      market_tag:       market.tag,
    };

    // 8b. Admin email vars
    const adminVars: Record<string, string> = {
      buyer_display_name:    escapeHtml(buyerDisplayName),
      buyer_email:           escapeHtml(offer.buyer_email || ""),
      building_name:         escapeHtml(buildingName),
      unit_block_inline:     unitLabelClean ? `Unit ${escapeHtml(unitLabelClean)} · ` : "",
      offer_amount:          offerAmountStr,
      building_median_price: fmtUSD(brief.median_12mo),
      building_median_ppsf:  fmtPPSF(brief.median_ppsf_12mo),
      building_ppsf_range:   fmtRange(brief.ppsf_low_12mo, brief.ppsf_high_12mo),
      buyer_message_or_dash: offer.message ? escapeHtml(offer.message) : "—",
      admin_offer_url:       adminOfferUrl,
      submitted_at_local:    submittedAtLocal,
    };

    // 9. Send buyer email
    const buyerResult = offer.buyer_email
      ? await sendEmail({
          from:    `${market.brand} <tim@${market.domain}>`,
          to:      offer.buyer_email,
          replyTo: ADMIN_EMAIL,
          subject: merge(buyerTpl.subject, buyerVars),
          html:    merge(buyerTpl.body_html, buyerVars),
          tags: [
            { name: "template", value: "eoi_received_buyer_v1" },
            { name: "market",   value: market.tag },
          ],
        })
      : { ok: false, status: 0, body: "no buyer_email" };

    // 10. Send admin email
    const adminResult = await sendEmail({
      from:    `Condo Market Alerts <alerts@${market.domain}>`,
      to:      ADMIN_EMAIL,
      replyTo: offer.buyer_email || ADMIN_EMAIL,
      subject: merge(adminTpl.subject, adminVars),
      html:    merge(adminTpl.body_html, adminVars),
      tags: [
        { name: "template", value: "admin_new_eoi_v1" },
        { name: "market",   value: market.tag },
      ],
    });

    return new Response(JSON.stringify({
      ok: true,
      market: market.tag,
      offer_id: offer.id,
      buyer: { ok: buyerResult.ok, status: buyerResult.status, body: buyerResult.body.slice(0, 200) },
      admin: { ok: adminResult.ok, status: adminResult.status, body: adminResult.body.slice(0, 200) },
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("send-eoi-notifications error", e);
    return new Response(JSON.stringify({
      ok: false, error: String(e?.message || e),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
