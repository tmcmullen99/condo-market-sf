/* =============================================================================
 * Condo Market SF - Supabase Config
 * -----------------------------------------------------------------------------
 * This file exports your Supabase project URL and public anon key.
 *
 * The anon key is SAFE to ship to the browser by design.
 * Row Level Security policies on the database enforce all access.
 * ========================================================================== */

export const SUPABASE_URL      = 'https://kfqphwerygccpzntbbif.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXBod2VyeWdjY3B6bnRiYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTgxODQsImV4cCI6MjA5MTk3NDE4NH0.FGQD3BMLVLD9lE8LUBUjD3SqKhsCxjdnCiGV8MMnqpg';

/* =============================================================================
 * Booking link for the dashboard "Schedule a call with Tim" button (v20).
 *
 * Default is a mailto: fallback. When you set up an Acuity scheduler for
 * Condo Market consultations (or wire a Google Calendar appointment URL),
 * replace the value below — every dashboard button will pick up the new
 * URL on the next page load. No other file changes needed.
 *
 * Example future value:
 *   export const SCHEDULE_URL = 'https://condomarketsf.as.me/consult';
 * ========================================================================== */

export const SCHEDULE_URL = 'mailto:tim@mcmullen.properties?subject=Schedule%20a%20Condo%20Market%20consultation';
