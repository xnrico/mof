// Dialogue engine for the dashboard companions.
//
// Two characters with distinct voices:
//   • 小企鹅 (penguin)  — clumsy & caring; gives Babu/Mamu budget advice and
//                         scolds 戴许 for being naughty.
//   • 戴许   (kangaroo) — naughty & playful; mocks how Babu/Mamu spend money.
//                         Never addresses itself.
//
// Every conversational line opens by naming its target — Babu, Mamu or 戴许 —
// per the brief. Lines are drawn from shuffle-bags so a pool never repeats a
// line until it has been fully exhausted, then it reshuffles. A tiny event bus
// lets one character react to the other so the chatter reads like a back-and-forth.

export type CharacterId = 'penguin' | 'kangaroo';
export type Mood = 'idle' | 'hover' | 'panic' | 'ouch';

type TargetKey = 'babu' | 'mamu' | 'daixu';
const NAME: Record<TargetKey, string> = { babu: 'Babu', mamu: 'Mamu', daixu: '戴许' };
const HUMANS: TargetKey[] = ['babu', 'mamu'];

export interface Line {
  text: string;
  /** Which of the two personalities is scolding/mocking — used by the bus. */
  intent: 'advice' | 'scold' | 'mock' | 'retort' | 'panic' | 'ouch';
}

// ── Line banks ({t} is replaced with the target's display name) ───────────────

// 小企鹅 — caring budget advice, aimed at a human.
const PENGUIN_ADVICE = [
  "{t}, maybe brew coffee at home this week? ☕ Little savings add up!",
  "{t}, lots of takeout lately… how about a cozy home-cooked meal? 🍚",
  "{t}, let's tuck away 10% for savings before we spend, okay? 💪",
  "{t}, that subscription you forgot about is still charging you! 🧾",
  "{t}, want help building a budget? I adore a neat spreadsheet! 📊",
  "{t}, impulse buys sting later — sleep on it for a night first! 🛏️",
  "{t}, tracking every penny sounds dull, but it really works! 🔍",
  "{t}, an emergency fund keeps you warm when things go wrong. 🧣",
  "{t}, cooking together is cheaper AND cosier than delivery! 🍳",
  "{t}, you spent less this month — I'm so proud of you! 🥰",
  "{t}, compare prices before the big buys — future-you says thanks! 🛒",
  "{t}, round up spare change into savings, it grows quietly! 🪙",
];

// 小企鹅 — scolding the kangaroo (target is always 戴许).
const PENGUIN_SCOLD = [
  "戴许, stop teasing Babu and Mamu about their money! So naughty. 🙄",
  "戴许, being loud won't make you clever, you silly roo! 😤",
  "戴许, hop off and count your carrots instead of causing trouble! 🥕",
  "戴许, apologise this instant — that was rude! 😾",
  "戴许, why so dim about kindness? Watch and learn from me! 🐧",
  "戴许, leave everyone's wallets alone, you rascal! 💢",
  "戴许, mischief again? I'll waddle over there! 🐧💨",
];

// 戴许 — mocking how a human spends.
const KANGAROO_MOCK = [
  "{t}, ANOTHER online order?! Your wallet is sobbing! 😹",
  "{t}, ooh fancy coffee again? Big spender energy! 💸",
  "{t}, that's a LOT of shopping… buy me a snack too! 🦘",
  "{t}, did you really need that? Hah! Boing boing! 💰",
  "{t}, spending like money grows on trees, huh? 🌳😆",
  "{t}, I saw that little impulse buy. Busted! 🕵️",
  "{t}, your bank app called — it's scared of you! ☎️😂",
  "{t}, treat yourself, treat ME, treat EVERYONE! Wheee! 🎉",
  "{t}, another subscription? Gotta collect 'em all, eh? 📺",
  "{t}, delivery fees again? I'd have hopped there for free! 🦘",
];

// 戴许 — deflecting to a human after the penguin scolds it.
const KANGAROO_RETORT = [
  "{t}, don't listen to that grumpy penguin — spend it all! 😜",
  "{t}, 小企鹅 is soooo boring, I'm way more fun, right?! 🦘",
  "{t}, budgets are for penguins! Let's party instead! 🎊",
  "{t}, ignore the lecture — you only live once! 😎",
];

const PENGUIN_PANIC = [
  "Eeek! Put me down gently, {t}! 😱",
  "{t}! I'm not a toy, you know! 🐧💨",
  "Too high! Too high! My flippers can't fly! 🪽",
  "{t}, pleeease be careful with me! 😨",
];
const KANGAROO_PANIC = [
  "{t}! PUT ME DOWN right now! 😤",
  "Aaah! I'm gonna be sick! 🤢",
  "{t}, unhand me, this is kidnapping!! 🦘💢",
  "Boing— HELP! Somebody help meee! 😵",
];

const PENGUIN_OUCH = [
  "OUCH! My little bottom! 😵",
  "Owie… that really hurt, {t}! 😢",
  "Oof! I'm okay… I think. 🌀",
];
const KANGAROO_OUCH = [
  "OUCH! You'll pay for that, {t}! 😠",
  "Owww, my tail! Not cool! 😾",
  "Oof! Rude! I'm telling everyone! 😤",
];

// ── Shuffle-bag: draw without replacement, reshuffle when empty ────────────────

const bags: Record<string, string[]> = {};
function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
function draw(key: string, pool: string[]): string {
  if (!bags[key] || bags[key].length === 0) bags[key] = shuffle(pool);
  return bags[key].pop() as string;
}
function pickHuman(key: string): TargetKey {
  const t = draw(key, HUMANS as unknown as string[]);
  return t as TargetKey;
}
function fill(tpl: string, t?: TargetKey): string {
  return t ? tpl.replace('{t}', NAME[t]) : tpl;
}

// ── Public line getters ───────────────────────────────────────────────────────

export function idleLine(who: CharacterId): Line {
  if (who === 'penguin') {
    // Mostly caring advice; sometimes a scold aimed at the kangaroo.
    if (Math.random() < 0.3) return { text: draw('p_scold', PENGUIN_SCOLD), intent: 'scold' };
    return { text: fill(draw('p_adv', PENGUIN_ADVICE), pickHuman('p_adv_t')), intent: 'advice' };
  }
  return { text: fill(draw('k_mock', KANGAROO_MOCK), pickHuman('k_mock_t')), intent: 'mock' };
}

export function hoverLine(who: CharacterId): Line {
  // Same voice as idle, but the penguin leans more into advice while dancing.
  if (who === 'penguin') {
    if (Math.random() < 0.2) return { text: draw('p_scold', PENGUIN_SCOLD), intent: 'scold' };
    return { text: fill(draw('p_adv', PENGUIN_ADVICE), pickHuman('p_adv_t')), intent: 'advice' };
  }
  return { text: fill(draw('k_mock', KANGAROO_MOCK), pickHuman('k_mock_t')), intent: 'mock' };
}

export function panicLine(who: CharacterId): Line {
  const pool = who === 'penguin' ? PENGUIN_PANIC : KANGAROO_PANIC;
  return { text: fill(draw(who + '_panic', pool), pickHuman(who + '_panic_t')), intent: 'panic' };
}

export function ouchLine(who: CharacterId): Line {
  const pool = who === 'penguin' ? PENGUIN_OUCH : KANGAROO_OUCH;
  return { text: fill(draw(who + '_ouch', pool), pickHuman(who + '_ouch_t')), intent: 'ouch' };
}

/** Penguin scold aimed at 戴许 (used when reacting to the kangaroo's mockery). */
export function scoldLine(): Line {
  return { text: draw('p_scold', PENGUIN_SCOLD), intent: 'scold' };
}
/** Kangaroo retort deflecting to a human (used after being scolded). */
export function retortLine(): Line {
  return { text: fill(draw('k_retort', KANGAROO_RETORT), pickHuman('k_retort_t')), intent: 'retort' };
}

// ── Cross-talk bus: let the two characters answer each other ───────────────────

type BusEvent = 'scold' | 'mock';
type BusHandler = (e: BusEvent) => void;
const handlers = new Set<BusHandler>();
export const talkBus = {
  emit(e: BusEvent) { handlers.forEach((h) => h(e)); },
  on(h: BusHandler) { handlers.add(h); return () => { handlers.delete(h); }; },
};

// ── Speaking floor: only one companion may hold an idle bubble at a time, so
//    their speech bubbles never overlap while both are walking. A holder claims
//    the floor, then releases it when its bubble clears. Interaction bubbles
//    (hover/drag/fall) bypass the floor — those are user-driven and take
//    priority — but they still park the floor so idle chatter waits its turn.
let floorHolder: CharacterId | null = null;
let floorUntil = 0;
export const speakFloor = {
  /** Try to claim the idle speaking floor. Returns false if someone else holds it. */
  claim(who: CharacterId, ms: number, now: number): boolean {
    if (floorHolder && floorHolder !== who && now < floorUntil) return false;
    floorHolder = who;
    floorUntil = now + ms;
    return true;
  },
  /** Force-hold the floor (interaction bubbles) so the other stays quiet. */
  hold(who: CharacterId, ms: number, now: number): void {
    floorHolder = who;
    floorUntil = now + ms;
  },
  release(who: CharacterId): void {
    if (floorHolder === who) { floorHolder = null; floorUntil = 0; }
  },
  busy(who: CharacterId, now: number): boolean {
    return !!floorHolder && floorHolder !== who && now < floorUntil;
  },
};

/** How long a bubble stays up: enough to comfortably finish reading,
 *  scaled by length (roughly a relaxed reading pace + a base dwell). */
export function bubbleMs(text: string): number {
  return Math.min(9000, 4000 + text.length * 75);
}
