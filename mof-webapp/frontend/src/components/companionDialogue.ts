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
    `${t}，${f.name} 这个月已经花了 ${money(f.amount)} — 省一笔换我一锅章鱼汤好不好嘛？${sea()}`,
    `${t}，${f.name} 花 ${money(f.amount)}？！这钱够我用肚皮滑到海边捞一年的鱼了！${sea()}`,
    `${t}，${f.name} 稍微省一点点，我就给你跳我的招牌爱心舞！${heart()}`,
    `${t}，${f.name} 是你这个月最大的一笔（${money(f.amount)}）— 下一单先睡一觉再说？🛏️`,
    `${t}，要是把 ${f.name} 的钱存起来，我能买下全世界的章鱼！${sea()}${heart()}`,
    `${t}，${money(f.amount)} 花在 ${f.name} 上，够攒一个胖胖的应急金啦，我的肚子赞成存钱！🐧`,
    `${t}，又刷 ${f.name}？摇摇晃晃过来，咱俩一起把它管住！📊`,
    `${t}，${f.name} 悄悄涨到 ${money(f.amount)} 了 — 我和我的小短腿建议你：先缓一缓。🐾`,
    `${t}，我数了数，${f.name} 花了 ${money(f.amount)}。砍一半，我就专门为你左摇右摆一支！${heart()}`,
    `${t}，又是 ${f.name}？连我这么馋的企鹅都不舍得花这么多买鱼呢。${sea()}`,
  );
}

function penguinSavingsAdvice(t: string, rate: number): string {
  const heart = () => P('💗', '💙', '💕');
  if (rate < 0) return `${t}，你花的比赚的还多 — 我的肚子紧张得一抖一抖的，咱们一起补救好不好？😟`;
  if (rate < 10) return P(
    `${t}，储蓄率才 ${Math.round(rate)}% — 跟我一起扭扭爱心舞，冲个 20% 呗！${heart()}`,
    `${t}，这个月只存了 ${Math.round(rate)}%。再多一点，我跳舞的力气就翻倍！💃`,
  );
  if (rate < 20) return `${t}，存了 ${Math.round(rate)}% — 不错哦！再迈过 20%，我就开心到拍翅膀！🐧✨`;
  return P(
    `${t}，储蓄率 ${Math.round(rate)}%？！我要为你跳一支最骄傲的爱心舞！${heart()}`,
    `${t}，存下了 ${Math.round(rate)}% — 我这个大肚子骄傲得快要撑爆啦！🐧🎉`,
  );
}

function penguinLore(t: string): string {
  const heart = () => P('💗', '💙', '💕', '🩵');
  const sea = () => P('🐙', '🐟', '🦐', '🦑');
  return P(
    `${t}，看我的招牌舞 — 左倾倾，右倾倾，手里还捧着颗小爱心！${heart()}`,
    `${t}，我腿太短跑不快，干脆用肚皮滑过来了！🐧💨`,
    `${t}，Mamu 把我送给你，我也超爱你哒 — 来嘛，咱们一起省点小钱钱！${heart()}`,
    `${t}，谁说章鱼来着？我的肚子一路咕噜咕噜叫过来了。${sea()}`,
    `${t}，在家做顿热乎乎的海鲜大餐，比外卖又香又便宜！${sea()}`,
    `${t}，等等我，小短腿都在打颤了 — 但给你送理财小贴士还是值得的！🐧`,
    `${t}，应急基金就像一个暖暖的窝 — 起风下雨时把你裹得妥妥的。🧣`,
    `${t}，这周在家自己冲咖啡好不好？省下的钱够我加餐吃鱼！${sea()}☕`,
    `${t}，把零钱凑个整数存起来吧 — 它会悄悄长大，就像我的肚子。🪙🐧`,
    `${t}，我左摇右摆逗你笑 — 然后你要答应我好好记账，好不好？${heart()}`,
  );
}

function penguinScold(): string {
  const f = randTopCat();
  const dataJab = f
    ? P(
        `戴许，别再拿 ${f.name} 那笔账开玩笑了 — 我要朝你拍翅膀啦！🐧💢`,
        `戴许，笑人家 ${f.name} 花了 ${money(f.amount)}？没礼貌！两只翅膀一起拍！💢`,
      )
    : null;
  return P(
    ...(dataJab ? [dataJab] : []),
    `戴许，别再蹦来蹦去缠着 Babu 和 Mamu 求关注啦！😤`,
    `戴许，嗓门大又不代表你聪明，你个皮袋鼠！🐧`,
    `戴许，立刻道歉 — 你把我气得两只翅膀一起拍！💢`,
    `戴许，蹦一边数你的苹果去，别在这儿捣乱！🍎`,
    `戴许，又调皮？信不信我用肚皮滑过去教训你！🐧💨`,
    `戴许，别惦记大家的钱包 — Babu 最爱的是「我」，记住了没？😾`,
    `戴许，就你，别人一乖你就作妖，我可看得清清楚楚！🙄`,
    `戴许，再拿我的小短腿开一次玩笑，翅膀就要出动咯！🪽💢`,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  戴许 (kangaroo) — mocking real spending, bragging, hopping
// ══════════════════════════════════════════════════════════════════════════════

function kangarooDataMock(t: string, f: CatFact): string {
  const laugh = () => P('😹', '😂', '🤣', '😆');
  return P(
    `${t}，${f.name} 居然花到 ${money(f.amount)}？！我囤的苹果都没这么贵！🍎${laugh()}`,
    `${t}，${f.name} 花 ${money(f.amount)} — 蹦！你的钱包都在哭啦！${laugh()}`,
    `${t}，又点 ${f.name}？换我送又快又免费，白嫖它不香吗！🦘`,
    `${t}，${f.name}：${money(f.amount)}。大款气场十足！顺手也给我买点苹果呗！🍎`,
    `${t}，${f.name} 花 ${money(f.amount)}，你当钱是树上长的呀？🌳${laugh()}`,
    `${t}，你银行 App 为了 ${f.name} 那笔账打电话来了 — 它被你吓着了！☎️${laugh()}`,
    `${t}，${f.name} 花 ${money(f.amount)}？我来来回回蹦过去三趟，还是不敢相信！🦘`,
    `${t}，${f.name} 这笔大手笔（${money(f.amount)}）… 抓到啦！我是送餐袋鼠，订单我全看得见！🕵️`,
    `${t}，宠 ${f.name}，也宠宠我的苹果，宠遍全世界！耶～🎉`,
    `${t}，又是 ${f.name}？我一整天送外卖，连我都不敢花这么多！🦘💸`,
  );
}

function kangarooBrag(t: string): string {
  return P(
    `${t}，看我蹦！我可是送餐袋鼠 — 全城最快的美食快递！🦘🍎`,
    `${t}，看我这一跳！小企鹅那对小短腿肯定跳不了这么高！😹`,
    `${t}，今天你的晚饭全是我送的，那我的苹果呢？🍎`,
    `${t}，大家都乖得没劲 — 那我就负责多作一点妖！蹦！🦘`,
    `${t}，快看我！我跳得最高，全是为了博你一眼！🎉`,
    `${t}，我基本上就是你外卖 App 上那个 logo，够标志性吧？😎`,
    `${t}，苹果就是最好吃的，别反驳我，快扔一个过来！🍎`,
    `${t}，蹦蹦蹦 — 有这双腿谁还要电动车呀？🦘💨`,
    `${t}，别人一捣蛋，我立马变身完美乖宝宝袋鼠，快夸我！😇`,
    `${t}，我能一边抛你的小票、一边杂耍三个苹果 — 关注一下我嘛！🤹🍎`,
  );
}

function kangarooRetort(t: string): string {
  return P(
    `${t}，别听那只气呼呼拍翅膀的企鹅的 — 想花就花！😜`,
    `${t}，小企鹅慢吞吞的超无聊，我才好玩多啦，对不对？！🦘`,
    `${t}，预算是留给大肚子企鹅的东西！咱们开趴踢！🎊`,
    `${t}，别理那套说教 — 尽管点，我负责送到！🍎`,
    `${t}，那企鹅就是嫉妒我会蹦，它只能滑。😏`,
    `${t}，苹果永远大于说教 — 对吧 ${t}？蹦蹦！🍎`,
  );
}

function kangarooHop(): string {
  return P(
    `蹦！干净利落跳过小企鹅！太慢啦，小鳍鳍！🦘`,
    `咻～小企鹅的肚子简直是天然跳台！🐧💨`,
    `蹦蹦 — 借过借过，让一让呀小企鹅！🦘`,
    `哈！就你那小短腿，肯定跳不出这种高度！😹`,
    `送餐袋鼠，走快速通道 — 嘿！从你头上飞过去咯！🍎`,
    `蹦蹦蹦！看我一跃飞过这只企鹅！🦘✨`,
  );
}

// ── Panic (being dragged) & ouch (landing) — flavoured with lore ──────────────

function penguinPanic(t: string): string {
  return P(
    `诶诶诶！轻点放我下来，${t}！我的肚子可不是拿来抛的！😱`,
    `${t}！我是礼物，不是玩具 — 轻点儿！🐧💨`,
    `太高啦！我的小翅膀不会飞，只会扑棱！🪽`,
    `${t}，求你了，我的小短腿都在空中晃悠了！😨`,
    `啊啊啊！在这么高的地方我可跳不了爱心舞！💗😵`,
  );
}
function kangarooPanic(t: string): string {
  return P(
    `${t}！放我下来 — 我还有外卖要送呢！😤`,
    `啊！你要把我怀里的苹果都磕坏啦！🍎😵`,
    `${t}，放开我，这是绑架袋鼠！！🦘💢`,
    `蹦— 救命！蹦跳选手需要地面！😵`,
    `喂！正版送餐 logo 是不许被拎着晃的！😾`,
  );
}
function penguinOuch(t: string): string {
  return P(
    `哎哟！我的大肚子弹了两下！😵`,
    `疼疼疼… 好痛啊 ${t}，我要拍翅膀抗议！🪽😢`,
    `噗！还好有肚子垫着… 大概吧。🐧🌀`,
  );
}
function kangarooOuch(t: string): string {
  return P(
    `哎哟！这一下你要用苹果来赔，${t}！🍎😠`,
    `哎呦我的尾巴！送餐袋鼠可不是这么对待的！😾`,
    `噗！没礼貌！我这就蹦去跟 Babu 和 Mamu 告状！🦘😤`,
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

/** How long a bubble stays up: enough to comfortably finish reading. Chinese
 *  packs more meaning per character, so give each one a touch more dwell time. */
export function bubbleMs(text: string): number {
  return Math.min(9000, 4000 + text.length * 120);
}
