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
 * Booking link for the dashboard "Schedule a call with Tim" button.
 *
 * Currently wired to Tim's Google Calendar appointment scheduler — every
 * dashboard "Schedule a call" button picks this up on next page load. If
 * the scheduler URL ever changes (new Acuity, Calendly, etc.), update only
 * this constant; no other file changes needed.
 * ========================================================================== */

export const SCHEDULE_URL = 'https://calendar.app.google/X5VcPeFS3qc3NfwD6';
