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
// All lines are written in colloquial, meme-flavoured Chinese (打工人/剁手/吃土/
// 阴阳怪气 etc.) — jokes reworked to land natively rather than translated. Lines
// are grounded in Babu & Mamu's REAL transactions (fed in via setFinanceContext)
// whenever data is available, in the same spirit as the monthly PDF report's
// advice engine — top spending categories, amounts, savings rate. A recency
// guard guarantees no line repeats within an hour, and the procedural builders
// draw on real numbers + lore fragments so the space of lines is effectively
// unbounded.
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
    `${t}，${f.name} 这个月已经 ${money(f.amount)} 了，你的钱包已经瘪成我翅膀这么薄了。${sea()}`,
    `${t}，${f.name} 花 ${money(f.amount)}？这数字我用肚皮滑过去看了三遍，确认不是眼花。😵‍💫`,
    `${t}，${f.name} 少剁一次手，我当场给你转一整套爱心舞，包售后。${heart()}`,
    `${t}，${f.name} 荣登你本月最大开销榜首（${money(f.amount)}）🏆 建议颁个奖然后戒掉。`,
    `${t}，${f.name} 的钱要是存下来，我能把整片海洋的章鱼都包场。${sea()}${heart()}`,
    `${t}，${money(f.amount)} 呢！够养一只企鹅一整年 — 说的就是我，我很好养的。🐧`,
    `${t}，又双叒刷 ${f.name}？打住打住，我摇过来跟你促膝长谈一下。📊`,
    `${t}，${f.name} 又偷偷涨到 ${money(f.amount)} 了，它是不是背着你在偷偷长个儿？🐾`,
    `${t}，${f.name} 砍一半，剩下的钱交给我保管，我用肚子给你捂得热乎乎的。${heart()}`,
    `${t}，${f.name} 这花法，连我这种见了鱼就走不动道的都自愧不如。${sea()}`,
    `${t}，${f.name} ${money(f.amount)}… 消费主义的小陷阱又把你套住啦，我来把你拽出来！🪤`,
    `${t}，钱是省出来的不是省出来的… 呃总之 ${f.name} 先冷静，好不好嘛。💸`,
    `${t}，${f.name} 都 ${money(f.amount)} 了，确定不是手滑连点了好几次？我懂，我饿了也手滑。${sea()}`,
    `${t}，打工人的钱要花在刀刃上，${f.name} 这一刀… 感觉砍偏啦。🔪`,
  );
}

function penguinSavingsAdvice(t: string, rate: number): string {
  const heart = () => P('💗', '💙', '💕');
  if (rate < 0) return P(
    `${t}，这个月花得比赚得还多 — 我的肚子已经开始紧张到打摆子了。😟`,
    `${t}，收支倒挂了啊！月底吃土的名额，我陪你一起排队。🍂`,
    `${t}，钱包这个月是净流出，再这样下去我俩要一起去海边捡贝壳换饭吃了。😭`,
  );
  if (rate < 10) return P(
    `${t}，储蓄率才 ${Math.round(rate)}%，这跟没存有什么区别嘛 — 跟我扭个爱心舞冲一波 20%！${heart()}`,
    `${t}，只存了 ${Math.round(rate)}%… 再抠一点点，我跳舞的马力就给你翻倍！💃`,
    `${t}，${Math.round(rate)}% 这储蓄率，属于是给银行做慈善了，咱留一点给自己好不好。🥲`,
  );
  if (rate < 20) return P(
    `${t}，存了 ${Math.round(rate)}%，有进步！再迈过 20%，我原地起飞拍翅膀给你看！🐧✨`,
    `${t}，${Math.round(rate)}% 已经跑赢一大半打工人了，稳住，我们能赢！📈`,
  );
  return P(
    `${t}，储蓄率 ${Math.round(rate)}%？！这已经是理财大佬级别了，我给你磕一个！${heart()}`,
    `${t}，存下 ${Math.round(rate)}% — 我这大肚子骄傲得快要原地爆炸啦！🐧🎉`,
    `${t}，${Math.round(rate)}% 存款率，财务自由的曙光我都替你看见了！🌅`,
  );
}

function penguinLore(t: string): string {
  const heart = () => P('💗', '💙', '💕', '🩵');
  const sea = () => P('🐙', '🐟', '🦐', '🦑');
  return P(
    `${t}，看我招牌舞 — 左倾三十度，右倾三十度，手里的爱心不能掉！${heart()}`,
    `${t}，我腿短跑不动，但我可以贴地飞行（其实就是用肚皮滑）。🐧💨`,
    `${t}，Mamu 把我送给你的时候我就发誓：这辈子帮你守好钱包！${heart()}`,
    `${t}，家人们谁懂啊，我又闻到章鱼的味道了，肚子已经开始咕噜了。${sea()}`,
    `${t}，在家做顿海鲜大餐吧 — 又香又便宜，外卖费都省下来给我买小鱼干。${sea()}`,
    `${t}，别嫌我啰嗦 — 短腿都跑颤了也要爬过来给你送理财贴士，感动不。🐧`,
    `${t}，应急基金就像我的肚子 — 平时看着占地方，关键时刻是真能救命。🧣`,
    `${t}，这周自己冲咖啡好不好？一杯奶茶钱，够我加好几顿鱼了。${sea()}☕`,
    `${t}，零钱别嫌少，攒着攒着就厚了 — 就像我的肚子，一口一口鼓起来的。🪙🐧`,
    `${t}，我左摇右摆卖力逗你笑 — 作为回报，今晚记个账好不好嘛？${heart()}`,
    `${t}，钱不是省出来的？不，我坚定地认为就是省出来的，跟我一起省！💪`,
    `${t}，别冲动消费，把购物车放三天，它自己就凉了，屡试不爽。🛒`,
    `${t}，我虽然不会飞，但我会理财 — 这年头后者更值钱，你说是不是。📚`,
    `${t}，你只管好好上班，钱包交给我看着，我肚子大，藏得住。🐧💰`,
  );
}

function penguinScold(): string {
  const f = randTopCat();
  const dataJab = f
    ? P(
        `戴许，别再阴阳人家 ${f.name} 那笔账了 — 信不信我翅膀糊你脸上！🐧💢`,
        `戴许，笑人家 ${f.name} 花了 ${money(f.amount)}？就你会花是吧？双翅暴击！💢`,
      )
    : null;
  return P(
    ...(dataJab ? [dataJab] : []),
    `戴许，别再蹦跶了 — 你以为你在营业，其实你在惹人烦。😤`,
    `戴许，嗓门大 ≠ 有道理，懂？你个戏精皮袋鼠。🐧`,
    `戴许，赶紧道歉！你把我气得两只翅膀原地起飞。💢`,
    `戴许，一边数苹果去，别在这儿碍事，谢谢配合。🍎`,
    `戴许，再皮一下，信不信我用肚皮滑过去把你撞飞。🐧💨`,
    `戴许，别打大家钱包的主意 — Babu 心里的第一名永远是「我」。😾`,
    `戴许，你就是别人一乖你就作妖的那种，我看你很久了。🙄`,
    `戴许，再拿我小短腿开玩笑，今天这翅膀就不收回去了。🪽💢`,
    `戴许，你不是送外卖的吗？怎么天天在这儿摸鱼，我要举报了啊。📢`,
    `戴许，你的KPI是送餐，不是气企鹅，拎清楚啊你。😾`,
    `戴许，你再蹦我头上一次，我就把你今天偷吃的苹果账全抖出来。🍎🕵️`,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  戴许 (kangaroo) — mocking real spending, bragging, hopping
// ══════════════════════════════════════════════════════════════════════════════

function kangarooDataMock(t: string, f: CatFact): string {
  const laugh = () => P('😹', '😂', '🤣', '😆');
  return P(
    `${t}，${f.name} 花了 ${money(f.amount)}？我囤一整个冬天的苹果都没这么烧钱！🍎${laugh()}`,
    `${t}，${f.name} ${money(f.amount)} — 蹦！我听见你钱包在哭，声音还挺大。${laugh()}`,
    `${t}，又点 ${f.name}？这活儿交给我送，又快又免费，你图啥呢图啥呢。🦘`,
    `${t}，${f.name}：${money(f.amount)}。豪哥豪姐！顺手也给弟弟买两个苹果呗？🍎`,
    `${t}，${f.name} 花 ${money(f.amount)}，钱是大风刮来的还是苹果树上长的？🌳${laugh()}`,
    `${t}，你银行 App 因为 ${f.name} 这笔账连夜给我打电话 — 它说它压力好大。☎️${laugh()}`,
    `${t}，${f.name} ${money(f.amount)}？我蹦过来蹦过去核对了三遍，是真的，离谱。🦘`,
    `${t}，${f.name} 这笔（${money(f.amount)}）被我抓包了 — 我可是送餐袋鼠，谁点了啥我门儿清！🕵️`,
    `${t}，钞能力好强啊，${f.name} 说买就买，我的苹果自由什么时候能实现呀？🎉`,
    `${t}，又是 ${f.name}？我风里来雨里去送一天外卖，都不敢这么花，泪目。🦘💸`,
    `${t}，${f.name} ${money(f.amount)}，这波是给商家的年终奖发了吧？慷慨！${laugh()}`,
    `${t}，就这 ${f.name} 花钱速度，我建议你把银行卡交给小企鹅托管，救救孩子。🐧`,
    `${t}，${f.name} 又刷了？我怀疑你在用花钱当健身，一次比一次猛。💪${laugh()}`,
  );
}

function kangarooBrag(t: string): string {
  return P(
    `${t}，看我蹦！送餐袋鼠界的顶流，全城最快，风一样的男子。🦘🍎`,
    `${t}，看我这一跳！小企鹅那小短腿？它连助跑都费劲。😹`,
    `${t}，今天你的饭全是我送的，KPI 拉满了，我的苹果尾款该结了吧？🍎`,
    `${t}，大家都乖得没劲透了 — 于是我决定挺身而出，负责搞点节目效果！🦘`,
    `${t}，快看快看！我这一跳全是为了你，别的观众我不要，我只要你的关注！🎉`,
    `${t}，说出来你可能不信，你外卖 App 上那个 logo 的原型就是我。😎`,
    `${t}，苹果宇宙第一好吃，这是真理，不接受反驳，快贡献一个！🍎`,
    `${t}，蹦蹦蹦 — 有我这双腿在，电动车都得靠边站。🦘💨`,
    `${t}，看好了 — 别人一淘气，我立马切换乖宝宝模式，主打一个反差萌。😇`,
    `${t}，我能一边抛你的小票一边杂耍三个苹果，这么全能你还不夸夸我？🤹🍎`,
    `${t}，我不是在蹦，我是在做全身有氧，毕竟身材是袋鼠的第二张脸。💪`,
    `${t}，别的袋鼠还在草原躺平，就我卷生卷死送外卖，我图啥呀，图你夸我。🦘😤`,
    `${t}，我今天状态绝佳，一蹦一个准，建议给我颁个「最佳蹦跶奖」。🏆`,
  );
}

function kangarooRetort(t: string): string {
  return P(
    `${t}，别听那只气鼓鼓的企鹅唠叨 — 人生苦短，想花就花！😜`,
    `${t}，小企鹅慢吞吞的多没意思，还是我有意思对不对，说我有意思！🦘`,
    `${t}，预算这东西是给大肚子企鹅准备的，咱们年轻鼠只谈快乐！🎊`,
    `${t}，别理它那套爹味说教 — 尽管点，剩下的交给本鼠配送！🍎`,
    `${t}，它就是柠檬精，嫉妒我又能蹦又能飞，它只能贴地滑。😏`,
    `${t}，苹果面前无难事 — 对吧 ${t}？来，击个掌，蹦蹦！🍎`,
    `${t}，企鹅说的都是对的，但我的更好玩，你选好玩的对不对！😎`,
    `${t}，它管钱我管乐子，咱这个组合缺一不可，别听它一个人的！🦘`,
  );
}

function kangarooHop(): string {
  return P(
    `蹦！一个跨栏跳过小企鹅，动作行云流水，给我打几分？🦘`,
    `咻～小企鹅的肚子是官方指定跳台，弹性一流！🐧💨`,
    `借过借过 — 外卖配送中，前方企鹅请让一让！🦘`,
    `哈！就那小短腿，你这辈子都体会不到腾空的快乐！😹`,
    `送餐袋鼠专用快速通道 — 嘿哟，从你头顶潇洒略过！🍎`,
    `看好了 — 教科书级别的一跃飞鹅！满分收藏！🦘✨`,
    `企鹅挡路？不存在的，本鼠自带轻功水上漂（陆地版）。💨`,
    `一二三，起跳！小企鹅你就当没看见，我这就飞过去。🦘`,
  );
}

// ── Panic (being dragged) & ouch (landing) — flavoured with lore ──────────────

function penguinPanic(t: string): string {
  return P(
    `诶诶诶轻点！${t}！我的肚子是用来卖萌的，不是用来抛的！😱`,
    `${t}！我可是 Mamu 送的正品礼物，摔坏了没处保修啊！🐧💨`,
    `太高了太高了！我恐高！企鹅的字典里没有「飞」这个字！🪽`,
    `${t}，救命，我的小短腿在空中疯狂蹬，一点用都没有！😨`,
    `啊——这个高度我别说跳舞了，我魂儿都快没了！💗😵`,
    `放我下来！我承诺以后天天记账，别晃了别晃了！📉😵`,
  );
}
function kangarooPanic(t: string): string {
  return P(
    `${t}！放我下来 — 我这还有三十单外卖没送呢，要超时啦！😤`,
    `啊！轻点轻点！你把我兜里的苹果都颠成苹果泥了！🍎😵`,
    `${t}，放开我！这是绑架！我要打 12345 投诉你！🦘💢`,
    `蹦——救命啊！蹦跳运动员离开地面就是废鼠一只！😵`,
    `喂喂喂！正版 logo 是有肖像权的，不许拎着乱晃！😾`,
    `${t} 你冷静点！我们可以坐下来好好谈，先把我放地上行不行！🙏`,
  );
}
function penguinOuch(t: string): string {
  return P(
    `哎哟喂！我的大肚子当场弹了两下，减震效果拉满。😵`,
    `疼疼疼… ${t} 你过分了啊，我要拍翅膀严正抗议！🪽😢`,
    `噗！还好有这一身肥膘垫着，不然真得散架。🐧🌀`,
    `我… 我没事，就是脑子里的小鱼干都被摔飞了。🐟💫`,
    `摔得我眼冒金星，看见了三条章鱼在转圈。🐙😵`,
  );
}
function kangarooOuch(t: string): string {
  return P(
    `哎哟！${t}，这一摔你得用一整箱苹果赔偿本鼠精神损失！🍎😠`,
    `我的尾巴！我的招牌尾巴！送餐袋鼠哪能这么摔啊！😾`,
    `噗！太没礼貌了！我这就蹦去跟 Babu 和 Mamu 双双告状！🦘😤`,
    `啊我的老腰！明天这单我可跳不动了，工伤，绝对工伤！🩹`,
    `摔坏了摔坏了，我的五星好评率要保不住了，都怪你！⭐😭`,
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
  const h = `${meters.toFixed(1)} 米`;
  if (who === 'kangaroo') return P(
    `新纪录 ${h}！载入史册吧，最强外送袋鼠就是我！🦘🎉`,
    `${h}！小企鹅那对小翅膀，做梦都够不着这个高度！😹`,
    `冲上云霄 ${h}！今日份的天空，本鼠承包了！🍎🚀`,
    `${h}！这一跳我给自己颁个「离地最远配送员」金奖！🏆`,
    `破纪录啦 ${h}！建议 NASA 火速联系我谈合作。🚀😎`,
  );
  return P(
    `新纪录 ${h}！我这大肚子居然真的上天了，离谱又骄傲！🐧🎉`,
    `${h}！我的小翅膀今天超常发挥，快，掌声在哪里！🪽💗`,
    `${h} 高！谁说企鹅不会飞的，站出来，我今天就飞给你看！🐧✨`,
    `破纪录 ${h}！这波属于是短腿逆袭，励志企鹅本鹅了。💪🐧`,
    `${h}！我飞的时候还不忘惦记着帮你省钱，多贴心的企鹅呀。💰🐧`,
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
