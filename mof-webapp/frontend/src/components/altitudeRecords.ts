// Flight physics + daily altitude records for the dashboard companions.
//
// When you flick a companion into the air, the same gesture delivers the same
// IMPULSE to both. Newton says v = impulse / mass, so the light kangaroo (戴许,
// ~2 kg) leaves the hand far faster than the heavy penguin (小企鹅, ~10 kg).
// Gravity is the same for both (acceleration is mass-independent), so the launch
// speed alone decides who climbs higher — and since height ∝ v², 戴许's 5×
// speed becomes a ~25× ceiling. That's the whole point of the meter.

import type { CharacterId } from './companionDialogue';

// ── Physics constants (shared by Companion + the meter) ───────────────────────
export const MASS: Record<CharacterId, number> = { penguin: 10, kangaroo: 2 }; // kg
/** Reference mass the flick impulse is normalised against (tunes overall feel). */
export const REF_MASS = 4;
/** Downward gravity in px/s² — identical for both, as real gravity is. */
export const GRAVITY_PX = 2800;
/** Pixels per real-world metre on the altitude scale. */
export const PX_PER_METER = 90;

// Same flick → launch speed scales by REF_MASS / mass (lighter = faster). The
// Companion applies this with the mass prop it's given (戴许 2kg, 小企鹅 10kg).
export function pxToMeters(px: number): number {
  return Math.max(0, px) / PX_PER_METER;
}

// ── Live airborne altitude (drives the on-screen gauge) ───────────────────────
export type LiveState = Record<CharacterId, number | null>; // metres, or null on ground
const live: LiveState = { penguin: null, kangaroo: null };
const liveSubs = new Set<(s: LiveState) => void>();

/** Publish the current altitude while airborne; pass null once back on ground. */
export function pushLive(who: CharacterId, metres: number | null): void {
  live[who] = metres;
  liveSubs.forEach((fn) => fn({ ...live }));
}
export function subscribeLive(fn: (s: LiveState) => void): () => void {
  liveSubs.add(fn);
  fn({ ...live });
  return () => { liveSubs.delete(fn); };
}

// ── Per-day best altitude, persisted in localStorage ──────────────────────────
// Keyed by local date so it naturally resets at midnight. Stored in metres.
export interface DayRecord { date: string; meters: Record<CharacterId, number> }
const KEY = 'mof.altitudeRecords.v1';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function empty(): DayRecord {
  return { date: today(), meters: { penguin: 0, kangaroo: 0 } };
}
function load(): DayRecord {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const r = JSON.parse(raw) as DayRecord;
      if (r.date === today() && r.meters) return r; // stale → new day resets it
    }
  } catch { /* ignore corrupt/unavailable storage */ }
  return empty();
}
let record = load();
const recSubs = new Set<(r: DayRecord) => void>();

export function getRecords(): DayRecord {
  if (record.date !== today()) record = empty(); // rolled over since last read
  return { date: record.date, meters: { ...record.meters } };
}
export function subscribeRecords(fn: (r: DayRecord) => void): () => void {
  recSubs.add(fn);
  fn(getRecords());
  return () => { recSubs.delete(fn); };
}
function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(record)); } catch { /* ignore */ }
  const snap = getRecords();
  recSubs.forEach((fn) => fn(snap));
}

/** Today's best for one character (metres), rolling over at midnight. */
export function recordFor(who: CharacterId): number {
  return getRecords().meters[who];
}

/** Live-update the day's best as a flight climbs; returns true if it grew. */
export function reportAltitude(who: CharacterId, metres: number): boolean {
  if (record.date !== today()) record = empty();
  if (metres > record.meters[who]) {
    record.meters[who] = metres;
    persist();
    return true;
  }
  return false;
}

// ── "New record!" celebration event ───────────────────────────────────────────
// Fired once per flight (on landing) when the peak beat the day's prior best.
export interface Celebration { who: CharacterId; meters: number }
const celebSubs = new Set<(c: Celebration) => void>();
export function celebrate(c: Celebration): void {
  celebSubs.forEach((fn) => fn(c));
}
export function subscribeCelebration(fn: (c: Celebration) => void): () => void {
  celebSubs.add(fn);
  return () => { celebSubs.delete(fn); };
}
