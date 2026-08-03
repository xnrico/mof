// Dialogue engine for the dashboard companions.
//
// Two characters with distinct, richly-drawn voices:
//
//   • 小企鹅 (penguin)  — Mamu's gift to Babu, who adores it. Loves octopus and
//                         all seafood. Big belly, tiny legs, so it often slides
//                         on its belly instead of walking. Has a signature dance:
//                         leaning left and right while holding a little heart.
//                         Flaps both wings together when it gets cross. Caring;
//                         gives Babu/Mamu real budget advice and scolds 戴许.
//
//   • 戴许   (kangaroo) — Apples are its favourite food. A relentless attention
//                         seeker: turns naughty when everyone else behaves, and
//                         plays the perfect baby roo when everyone else misbehaves.
//                         Loves hopping about and joking about Babu, Mamu & co.
//                         Proudly believes it IS the Deliveroo logo, hard at work
//                         delivering food. Mocks how Babu/Mamu spend — never itself.
//
// Lines are grounded in Babu & Mamu's REAL transactions (fed in via
// setFinanceContext) whenever data is available, in the same spirit as the
// monthly PDF report's advice engine — top spending categories, amounts,
// savings rate. A recency guard guarantees no line repeats within an hour, and
// the procedural builders draw on real numbers + lore fragments so the space of
// possible lines is effectively unbounded.
//
// A tiny event bus lets one character react to the other (mock→scold, scold→
// retort, hop→scold) so the chatter reads like a back-and-forth.

export type CharacterId = 'penguin' | 'kangaroo';
export type Mood = 'idle' | 'hover' | 'panic' | 'ouch';

export interface Line {
  text: string;
  /** Which of the two personalities is scolding/mocking — used by the bus. */
  intent: 'advice' | 'scold' | 'mock' | 'retort' | 'panic' | 'ouch' | 'hop' | 'brag';
}

// ── Live finance context (Babu & Mamu's real numbers) ─────────────────────────
// Dashboard pushes the currently-displayed month summary in here. Builders read
// it to ground their lines in real spending. Null before data loads.

export interface CatFact { name: string; amount: number }
export interface FinanceCtx {
  currency: 'GBP' | 'USD';
  spending: number;
  income: number;
  savingsRate: number | null;
  /** Spending categories, largest first. */
  cats: CatFact[];
}
let FIN: FinanceCtx | null = null;
export function setFinanceContext(ctx: FinanceCtx | null): void {
  FIN = ctx;
}

const SYM: Record<string, string> = { GBP: '£', USD: '$' };
function money(n: number): string {
  const s = FIN ? SYM[FIN.currency] ?? '£' : '£';
  return `${s}${Math.round(n).toLocaleString()}`;
}
/** A random one of the top few spending categories (biased to the biggest). */
function randTopCat(): CatFact | null {
  if (!FIN || FIN.cats.length === 0) return null;
  const k = Math.min(FIN.cats.length, 3);
  // Weight toward index 0 (the biggest splurge) but let 2nd/3rd surface too.
  const r = Math.random();
  const idx = r < 0.5 ? 0 : r < 0.8 ? Math.min(1, k - 1) : k - 1;
  return FIN.cats[idx];
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

/** Pick a random element. */
function P<T>(...xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}
/** A human target — Babu or Mamu, chosen fresh each time for variety. */
const HUMAN = (): string => (Math.random() < 0.5 ? 'Babu' : 'Mamu');

// ── Recency guard: no line may repeat within an hour ──────────────────────────

const HOUR = 3600_000;
const shownAt = new Map<string, number>();
function seenRecently(text: string, now: number): boolean {
  const t = shownAt.get(text);
  return t !== undefined && now - t < HOUR;
}
function remember(text: string, now: number): void {
  shownAt.set(text, now);
  if (shownAt.size > 1200) {
    for (const [k, v] of shownAt) if (now - v > HOUR) shownAt.delete(k);
  }
}
/** Run a generator until it yields a line unseen in the last hour (bounded). */
function unique(gen: () => string): string {
  const now = Date.now();
  let last = '';
  for (let i = 0; i < 16; i++) {
    last = gen();
    if (!seenRecently(last, now)) { remember(last, now); return last; }
  }
  remember(last, now); // gave up — pools genuinely exhausted; return the last try
  return last;
}

// ══════════════════════════════════════════════════════════════════════════════
//  小企鹅 (penguin) — caring advice, grounded in real spending
// ══════════════════════════════════════════════════════════════════════════════

function penguinDataAdvice(t: string, f: CatFact): string {
  const heart = () => P('💗', '💙', '💕', '🩵');
  const sea = () => P('🐙', '🐟', '🦐', '🦑', '🌊');
  return P(
    `${t}, ${f.name} is already ${money(f.amount)} this month — trade one for my octopus stew? ${sea()}`,
    `${t}, ${money(f.amount)} on ${f.name}?! I'd sooner slide to the sea on my belly and save. ${sea()}`,
    `${t}, trim ${f.name} a smidge and I'll do my little heart dance for you! ${heart()}`,
    `${t}, ${f.name} is your biggest splurge (${money(f.amount)}) — sleep on the next one? 🛏️`,
    `${t}, if you tucked away what ${f.name} cost, I'd buy ALL the octopus. ${sea()}${heart()}`,
    `${t}, ${money(f.amount)} on ${f.name} could be a fat rainy-day fund. My belly approves of savings! 🐧`,
    `${t}, another ${f.name} charge? Waddle over, let's cap it together. 📊`,
    `${t}, ${f.name} crept up to ${money(f.amount)} — my short legs and I say: pause a beat. 🐾`,
    `${t}, I counted ${money(f.amount)} of ${f.name}. Halve it and I'll lean left-and-right just for you! ${heart()}`,
    `${t}, ${f.name} again? Even a hungry penguin like me doesn't spend that on fish. ${sea()}`,
  );
}

function penguinSavingsAdvice(t: string, rate: number): string {
  const heart = () => P('💗', '💙', '💕');
  if (rate < 0) return `${t}, you're spending more than you earn — my belly's doing worried little flips. Let's fix it? 😟`;
  if (rate < 10) return P(
    `${t}, savings rate is only ${Math.round(rate)}% — do my heart wiggle with me and aim for 20%! ${heart()}`,
    `${t}, ${Math.round(rate)}% saved this month. A little more and I'll dance twice as hard! 💃`,
  );
  if (rate < 20) return `${t}, ${Math.round(rate)}% saved — solid! Nudge past 20% and I'll flap with joy. 🐧✨`;
  return P(
    `${t}, a ${Math.round(rate)}% savings rate?! I'm doing my proudest heart dance for you! ${heart()}`,
    `${t}, ${Math.round(rate)}% tucked away — my big belly is bursting with pride! 🐧🎉`,
  );
}

function penguinLore(t: string): string {
  const heart = () => P('💗', '💙', '💕', '🩵');
  const sea = () => P('🐙', '🐟', '🦐', '🦑');
  return P(
    `${t}, watch my signature dance — lean left, lean right, little heart in hand! ${heart()}`,
    `${t}, my legs are too short to hurry, so I'm sliding over on my belly! 🐧💨`,
    `${t}, Mamu gave me to you and I adore you right back — now let's save some pennies! ${heart()}`,
    `${t}, did someone say octopus? My belly rumbled all the way over here. ${sea()}`,
    `${t}, a cosy home-cooked seafood dinner beats takeout — cheaper AND tastier! ${sea()}`,
    `${t}, hold on, my little legs are wobbling — worth it to bring you budget tips! 🐧`,
    `${t}, an emergency fund is like a warm nest — keeps you snug when storms come. 🧣`,
    `${t}, brew coffee at home this week? The savings buy me extra fish. ${sea()}☕`,
    `${t}, round up your spare change into savings — it grows quietly, like my belly. 🪙🐧`,
    `${t}, I'll lean left and right till you smile — then promise me you'll budget, okay? ${heart()}`,
  );
}

function penguinScold(): string {
  const f = randTopCat();
  const dataJab = f
    ? P(
        `戴许, quit teasing about the ${f.name} bill — I'm flapping my wings at you! 🐧💢`,
        `戴许, laughing at ${money(f.amount)} of ${f.name}? Rude! Both wings, flapping! 💢`,
      )
    : null;
  return P(
    ...(dataJab ? [dataJab] : []),
    `戴许, stop hopping about pestering Babu and Mamu for attention! 😤`,
    `戴许, being loud won't make you clever, you cheeky roo! 🐧`,
    `戴许, apologise this instant — you've made me flap both wings! 💢`,
    `戴许, hop off and count your apples instead of causing trouble! 🍎`,
    `戴许, mischief again? I'm sliding right over there on my belly! 🐧💨`,
    `戴许, leave everyone's wallets alone — Babu adores ME, remember? 😾`,
    `戴许, you're only sweet when others misbehave. I see you, roo! 🙄`,
    `戴许, one more joke about my short legs and the wings come out! 🪽💢`,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  戴许 (kangaroo) — mocking real spending, bragging, hopping
// ══════════════════════════════════════════════════════════════════════════════

function kangarooDataMock(t: string, f: CatFact): string {
  const laugh = () => P('😹', '😂', '🤣', '😆');
  return P(
    `${t}, ${f.name} hit ${money(f.amount)}?! Even my apple stash costs less! 🍎${laugh()}`,
    `${t}, ${money(f.amount)} on ${f.name} — boing! Your wallet is sobbing! ${laugh()}`,
    `${t}, ANOTHER ${f.name} order? I'd have Deliveroo'd it faster AND for free! 🦘`,
    `${t}, ${f.name}: ${money(f.amount)}. Big spender energy! Buy me apples too! 🍎`,
    `${t}, spending ${money(f.amount)} on ${f.name} like it grows on trees, huh? 🌳${laugh()}`,
    `${t}, your bank app called about the ${f.name} bill — it's scared of you! ☎️${laugh()}`,
    `${t}, ${money(f.amount)} on ${f.name}? I hopped past three times and still can't believe it! 🦘`,
    `${t}, that ${f.name} splurge (${money(f.amount)})… busted! I'm the delivery roo, I SEE the orders! 🕵️`,
    `${t}, treat yourself to ${f.name}, treat ME to apples, treat EVERYONE! Wheee! 🎉`,
    `${t}, ${f.name} again? I deliver food all day and even I don't spend that! 🦘💸`,
  );
}

function kangarooBrag(t: string): string {
  return P(
    `${t}, look at me hop! I'm the Deliveroo roo — fastest food in town! 🦘🍎`,
    `${t}, watch this jump! Bet 小企鹅 can't do THAT with those stubby legs! 😹`,
    `${t}, I delivered ALL your dinners today, so where are MY apples? 🍎`,
    `${t}, everyone's being good and boring — so I'm being extra naughty! Boing! 🦘`,
    `${t}, notice me! I hopped the highest just for your attention! 🎉`,
    `${t}, I'm basically the logo on your delivery app. Iconic, right? 😎`,
    `${t}, apples are the best food, don't @ me. Toss one my way! 🍎`,
    `${t}, hop hop HOP — who needs a scooter when you've got these legs? 🦘💨`,
    `${t}, when the others act up, I turn into the perfect angel baby roo. Love me! 😇`,
    `${t}, I'll juggle your receipts AND three apples at once — attention, please! 🤹🍎`,
  );
}

function kangarooRetort(t: string): string {
  return P(
    `${t}, don't listen to that grumpy flapping penguin — spend it all! 😜`,
    `${t}, 小企鹅 is sooo slow and boring, I'm way more fun, right?! 🦘`,
    `${t}, budgets are for penguins with big bellies! Let's party! 🎊`,
    `${t}, ignore the lecture — order the food, I'll deliver it! 🍎`,
    `${t}, that penguin's just jealous I can hop and it can only slide. 😏`,
    `${t}, apples over advice any day — right, ${t}? Hop hop! 🍎`,
  );
}

function kangarooHop(): string {
  return P(
    `Boing! Hopped clean over 小企鹅! Too slow, flippers! 🦘`,
    `Weeee! 小企鹅's belly is a great jumping ramp! 🐧💨`,
    `Hop hop — coming through, out of the way, little penguin! 🦘`,
    `Ha! Bet you can't jump like THAT with stubby legs! 😹`,
    `Deliveroo roo, express lane — HUP! Over you go! 🍎`,
    `Boing boing! Watch me clear the penguin in one leap! 🦘✨`,
  );
}

// ── Panic (being dragged) & ouch (landing) — flavoured with lore ──────────────

function penguinPanic(t: string): string {
  return P(
    `Eeek! Put me down gently, ${t}! My belly's not for tossing! 😱`,
    `${t}! I'm a gift, not a toy — careful! 🐧💨`,
    `Too high! My little wings can't fly, they only flap! 🪽`,
    `${t}, pleeease, my short legs are dangling! 😨`,
    `Aaah! I can't do my heart dance up HERE! 💗😵`,
  );
}
function kangarooPanic(t: string): string {
  return P(
    `${t}! PUT ME DOWN — I've got deliveries to make! 😤`,
    `Aaah! You'll bruise the apples I'm carrying! 🍎😵`,
    `${t}, unhand me, this is roo-napping!! 🦘💢`,
    `Boing— HELP! A hopper needs the GROUND! 😵`,
    `Hey! Real Deliveroo logos do NOT get dangled! 😾`,
  );
}
function penguinOuch(t: string): string {
  return P(
    `OUCH! My big belly bounced twice! 😵`,
    `Owie… that hurt, ${t}. I'm flapping in protest! 🪽😢`,
    `Oof! At least my belly cushioned it… I think. 🐧🌀`,
  );
}
function kangarooOuch(t: string): string {
  return P(
    `OUCH! You'll pay in apples for that, ${t}! 🍎😠`,
    `Owww, my tail! That's no way to treat the delivery roo! 😾`,
    `Oof! Rude! I'm hopping off to tell Babu AND Mamu! 🦘😤`,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Public line getters
// ══════════════════════════════════════════════════════════════════════════════

export function idleLine(who: CharacterId): Line {
  if (who === 'penguin') {
    const r = Math.random();
    if (r < 0.28) return { text: unique(penguinScold), intent: 'scold' };
    return { text: unique(() => penguinAdviceLine()), intent: 'advice' };
  }
  // kangaroo: mostly mock real spending, sometimes brag/attention-seek.
  if (Math.random() < 0.35) return { text: unique(() => kangarooBrag(HUMAN())), intent: 'brag' };
  return { text: unique(() => kangarooMockLine()), intent: 'mock' };
}

export function hoverLine(who: CharacterId): Line {
  if (who === 'penguin') {
    if (Math.random() < 0.2) return { text: unique(penguinScold), intent: 'scold' };
    return { text: unique(() => penguinAdviceLine()), intent: 'advice' };
  }
  if (Math.random() < 0.4) return { text: unique(() => kangarooBrag(HUMAN())), intent: 'brag' };
  return { text: unique(() => kangarooMockLine()), intent: 'mock' };
}

export function panicLine(who: CharacterId): Line {
  const t = HUMAN();
  return { text: who === 'penguin' ? penguinPanic(t) : kangarooPanic(t), intent: 'panic' };
}

export function ouchLine(who: CharacterId): Line {
  const t = HUMAN();
  return { text: who === 'penguin' ? penguinOuch(t) : kangarooOuch(t), intent: 'ouch' };
}

/** Penguin scold aimed at 戴许 (used when reacting to the kangaroo). */
export function scoldLine(): Line {
  return { text: unique(penguinScold), intent: 'scold' };
}
/** Kangaroo retort deflecting to a human (used after being scolded). */
export function retortLine(): Line {
  return { text: unique(() => kangarooRetort(HUMAN())), intent: 'retort' };
}
/** Kangaroo exclamation when it hops over the penguin. */
export function hopLine(): Line {
  return { text: unique(kangarooHop), intent: 'hop' };
}
/** Crowed on landing when a launch beats today's altitude record. */
export function recordLine(who: CharacterId, meters: number): string {
  const h = `${meters.toFixed(1)}m`;
  if (who === 'kangaroo') return P(
    `新纪录！${h}！我是史上跳最高的外送袋鼠！🦘🎉`,
    `${h}!! 小企鹅那对小翅膀这辈子都飞不到这么高！😹`,
    `WHEEE — ${h}! 今天没有谁比我跳得更高啦！🍎🚀`,
  );
  return P(
    `新纪录！我这个大肚子居然飞到了 ${h}！🐧🎉`,
    `${h}! 我的小翅膀今天超常发挥，快夸夸我！🪽💗`,
    `哇，${h} 高！别看腿短，飞起来也是很厉害的！🐧✨`,
  );
}

// Composite pickers that blend real data with lore.
function penguinAdviceLine(): string {
  const t = HUMAN();
  const f = randTopCat();
  // Prefer a savings-rate quip sometimes when we know it.
  if (FIN?.savingsRate != null && Math.random() < 0.25) {
    return penguinSavingsAdvice(t, FIN.savingsRate);
  }
  if (f && Math.random() < 0.65) return penguinDataAdvice(t, f);
  return penguinLore(t);
}
function kangarooMockLine(): string {
  const t = HUMAN();
  const f = randTopCat();
  if (f && Math.random() < 0.7) return kangarooDataMock(t, f);
  return kangarooBrag(t);
}

// ── Cross-talk bus: let the two characters answer each other ───────────────────

type BusEvent = 'scold' | 'mock' | 'hop';
type BusHandler = (e: BusEvent) => void;
const handlers = new Set<BusHandler>();
export const talkBus = {
  emit(e: BusEvent) { handlers.forEach((h) => h(e)); },
  on(h: BusHandler) { handlers.add(h); return () => { handlers.delete(h); }; },
};

// ── Speaking floor: only one companion may hold a bubble at a time, so their
//    speech bubbles never overlap. A holder claims the floor, then releases it
//    when its bubble clears. Interaction bubbles (hover/drag/fall/hop) force-hold
//    the floor so idle chatter waits its turn — and PREEMPT the other companion,
//    clearing its bubble immediately, so two bubbles are never on screen at once
//    (they'd overlap spatially even at the enforced body gap, since each bubble
//    is much wider than a character).
let floorHolder: CharacterId | null = null;
let floorUntil = 0;

// Each companion registers a callback that instantly hides its own bubble.
const clearers = new Map<CharacterId, () => void>();
export function registerBubbleClearer(who: CharacterId, fn: () => void): () => void {
  clearers.set(who, fn);
  return () => { if (clearers.get(who) === fn) clearers.delete(who); };
}

export const speakFloor = {
  claim(who: CharacterId, ms: number, now: number): boolean {
    if (floorHolder && floorHolder !== who && now < floorUntil) return false;
    floorHolder = who;
    floorUntil = now + ms;
    return true;
  },
  /** Force-hold the floor (interaction bubbles) and clear the other's bubble. */
  hold(who: CharacterId, ms: number, now: number): void {
    if (floorHolder && floorHolder !== who) clearers.get(floorHolder)?.();
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

/** How long a bubble stays up: enough to comfortably finish reading. */
export function bubbleMs(text: string): number {
  return Math.min(9000, 4000 + text.length * 75);
}
