// =============================================================================
// send-eoi-notifications  (Condo Market SF / SV)
// -----------------------------------------------------------------------------
// Fired by trigger offers_notify_eoi_on_insert via notify_eoi_received() in
// Postgres on every INSERT into public.offers. Sends two emails via Resend:
//
//   1. Buyer  — accurate "EOI received, agent will reach out within 24 hours"
//   2. Tim    — admin alert with building median, $/ft² range, buyer message
//
// Multi-market (resolves SF vs SV via buildings.city_id → cities.market_id).
// Tolerant: any failure is logged but never returns 500 — pg_net just records
// the response; the offer INSERT always succeeds regardless.
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY     = Deno.env.get("RESEND_API_KEY")!;
const EOI_WEBHOOK_SECRET = Deno.env.get("EOI_WEBHOOK_SECRET")
  ?? "84b34b1830a621c93e902b54b0ad0446b6d1545e51ac93d055d47878735d8b9b";
const ADMIN_EMAIL = "tim@mcmullen.properties";

// market_id (UUID from public.markets) → branding/sender config
const MARKETS: Record<string, { tag: string; domain: string; brand: string }> = {
  "3cfba663-79af-4a6c-90ce-3d929c8351dd": {
    tag: "sf", domain: "sanfranciscocondomarket.com", brand: "Condo Market · SF",
  },
  "896e25bf-92ab-4325-a322-8c1a718e13dd": {
    tag: "sv", domain: "siliconvalleycondomarket.com", brand: "Condo Market · Silicon Valley",
  },
};
const DEFAULT_MARKET = MARKETS["3cfba663-79af-4a6c-90ce-3d929c8351dd"];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

// ---------- template merge (single-brace {var} syntax) ----------------------
function merge(template: string, vars: Record<string, string>): string {
  return (template || "").replace(/\{([a-z_]+)\}/g, (_m, k) => vars[k] ?? "");
}

// ---------- email send via Resend -------------------------------------------
async function sendEmail(opts: {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
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
  // 1. Auth
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
    // 4. Resolve market via buildings.city_id → cities.market_id
    const { data: bRow } = await supabase
      .from("buildings")
      .select("slug, display_name, city_id, cities(market_id)")
      .eq("slug", offer.building_slug)
      .maybeSingle();

    const marketId: string | null = (bRow as any)?.cities?.market_id ?? null;
    const market = (marketId && MARKETS[marketId]) || DEFAULT_MARKET;

    // 5. Fetch building market brief
    const { data: briefRaw } = await supabase.rpc("building_market_brief", {
      p_building_slug: offer.building_slug,
    });
    const brief = (briefRaw as any) ?? {};
    const buildingName: string =
      brief.building_name || (bRow as any)?.display_name || offer.building_slug;

    // 6. Fetch both email templates
    const { data: templates } = await supabase
      .from("email_templates")
      .select("slug, subject, body_html, preview_text")
      .in("slug", ["eoi_received_buyer_v1", "admin_new_eoi_v1"])
      .eq("is_active", true);

    const buyerTpl = (templates ?? []).find((t: any) => t.slug === "eoi_received_buyer_v1");
    const adminTpl = (templates ?? []).find((t: any) => t.slug === "admin_new_eoi_v1");

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
      buyer: { ok: buyerResult.ok, status: buyerResult.status },
      admin: { ok: adminResult.ok, status: adminResult.status },
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("send-eoi-notifications error", e);
    return new Response(JSON.stringify({
      ok: false, error: String(e?.message || e),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
