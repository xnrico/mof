import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CharacterId, idleLine, hoverLine, panicLine, ouchLine, scoldLine, retortLine, hopLine,
  talkBus, speakFloor, bubbleMs, registerBubbleClearer,
} from './companionDialogue';

// Sprite sheet geometry (see scripts that generated public/sprites/*.png).
const COLS = 14;
const ROW = { walk: 0, panic: 1, dance: 2, fall: 3 } as const;

// Per-row playback speed (ms per frame).
const FRAME_MS = { walk: 110, panic: 70, dance: 95, fall: 85 };

type Mode = 'walk' | 'dance' | 'panic' | 'fall';

// ── Shared stage ──────────────────────────────────────────────────────────────
// Both companions publish their live footprint here every frame so each can see
// the other and never overlap. 戴许 (the hopper) leaps clear over 小企鹅 when it
// closes in; a hard separation guard is the fallback for everyone else (the
// penguin, reduced-motion, near-wall cases).
interface Footprint { x: number; px: number; w: number; h: number; hopping: boolean }
const stage: Partial<Record<CharacterId, Footprint>> = {};

interface Props {
  who: CharacterId;
  /** Chinese display name shown above the character while walking. */
  name: string;
  /** Bubble tint, roughly matching the character's colour. */
  bubble: { bg: string; border: string; text: string };
  /** Initial horizontal fraction (0..1) so the two don't overlap. */
  startFrac: number;
  /** Walk speed in px/s. */
  speed: number;
  /** Sprite cell aspect ratio (frame width / height); differs per character. */
  aspect: number;
}

export default function Companion({ who, name, bubble, startFrac, speed, aspect }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const [say, setSay] = useState<string | null>(null);
  const [showName, setShowName] = useState(true);

  // All simulation state lives in a ref so the rAF loop never triggers React
  // re-renders (only the speech bubble + name label use state).
  const S = useRef({
    mode: 'walk' as Mode | 'hop',
    x: 0, y: 0,             // top-left position, px (viewport coords)
    dir: 1 as 1 | -1,       // 1 = moving/ facing right, -1 = left
    vx: 0, vy: 0,           // velocity px/s (used by the fall physics)
    frame: 0,
    frameT: 0,              // ms accumulated toward next frame
    dw: 0, dh: 0,           // display size px
    ground: 0,              // resting top position
    // fall bookkeeping
    fallStart: 0, landed: false, landedT: 0,
    // drag bookkeeping
    dragging: false, grabDX: 0, grabDY: 0,
    samples: [] as { x: number; y: number; t: number }[],
    // idle chatter timer
    nextTalk: 0,
    // hop-over bookkeeping (kangaroo leaping across the penguin)
    hopFromX: 0, hopToX: 0, hopStart: 0, hopDur: 0, hopArc: 0, hopCooldown: 0,
    // responding to the other character (bounded, no re-emit)
    reduced: false,
    alive: true,
  }).current;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    S.reduced = reduced;

    function measure() {
      const vw = window.innerWidth;
      // ~76px tall on phones, up to ~104px on desktop.
      const dh = Math.round(Math.max(72, Math.min(104, vw * 0.09)));
      const dw = Math.round(aspect * dh);
      S.dw = dw; S.dh = dh;
      // Sit on the bottom, clear of the mobile tab bar (~64px) on small screens.
      const bottomPad = vw < 640 ? 64 : 12;
      S.ground = window.innerHeight - dh - bottomPad;
      if (!S.dragging && S.mode !== 'fall') S.y = S.ground;
      S.x = Math.max(0, Math.min(S.x, vw - dw));
      const el = spriteRef.current;
      if (el) {
        el.style.width = `${dw}px`;
        el.style.height = `${dh}px`;
        el.style.backgroundSize = `${dw * COLS}px ${dh * 4}px`;
      }
    }
    // First-time placement.
    S.x = Math.round((window.innerWidth - 100) * startFrac);
    measure();
    S.y = S.ground;
    S.nextTalk = performance.now() + 2500 + Math.random() * 4000;
    window.addEventListener('resize', measure);

    // Cross-talk: the penguin scolds when the kangaroo mocks; the kangaroo
    // retorts when the penguin scolds. A response never re-emits, so it stops.
    const off = talkBus.on((e) => {
      if (S.mode === 'panic' || S.mode === 'fall') return;
      // Wait for the other's bubble to clear, then reply holding the floor.
      if (who === 'penguin' && e === 'mock') {
        setTimeout(() => { if (S.mode === 'walk') speakNow(scoldLine().text); }, 2600);
      } else if (who === 'penguin' && e === 'hop') {
        // 小企鹅 grumbles after being leapt over.
        setTimeout(() => { if (S.mode === 'walk') speakNow(scoldLine().text); }, 1400);
      } else if (who === 'kangaroo' && e === 'scold') {
        setTimeout(() => { if (S.mode === 'walk') speakNow(retortLine().text); }, 2600);
      }
    });

    let bubbleTimer: number | undefined;
    function speak(text: string) {
      setSay(text);
      window.clearTimeout(bubbleTimer);
      const ms = bubbleMs(text);
      bubbleTimer = window.setTimeout(() => {
        setSay(null);
        speakFloor.release(who);
      }, ms);
    }
    // Interaction bubbles (hover/drag/fall) take priority and hold the floor so
    // the other companion won't start idle chatter over them.
    function speakNow(text: string) {
      speakFloor.hold(who, bubbleMs(text) + 500, performance.now());
      speak(text);
    }
    // When the OTHER companion preempts (interaction/hop bubble), hide ours at
    // once so two bubbles are never visible together and can't overlap.
    const offClear = registerBubbleClearer(who, () => {
      window.clearTimeout(bubbleTimer);
      setSay(null);
    });

    function setMode(m: Mode | 'hop') {
      if (S.mode === m) return;
      S.mode = m;
      S.frame = 0; S.frameT = 0;
      setShowName(m === 'walk' || m === 'hop');
      const el = spriteRef.current;
      // A hop reuses the walk animation row (legs pumping) while the physics
      // arc carries the body up and over.
      if (el) el.style.backgroundPositionY = `${-ROW[m === 'hop' ? 'walk' : m] * S.dh}px`;
    }

    // ── requestAnimationFrame loop ────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    function tick(now: number) {
      if (!S.alive) return;
      const dt = Math.min(50, now - last) / 1000; // clamp big gaps (tab switch)
      last = now;
      const vw = window.innerWidth;
      const maxX = vw - S.dw;

      // Advance sprite frame.
      const fms = FRAME_MS[S.mode === 'hop' ? 'walk' : S.mode];
      S.frameT += dt * 1000;
      if (S.frameT >= fms) {
        S.frameT -= fms;
        if (S.mode === 'fall') {
          S.frame = Math.min(COLS - 1, S.frame + 1); // play once, hold last
        } else {
          S.frame = (S.frame + 1) % COLS;
        }
      }

      // Behaviour per mode.
      if (S.mode === 'walk') {
        const other = stage[who === 'penguin' ? 'kangaroo' : 'penguin'];
        // While 戴许 is airborne, 小企鹅 freezes so it stays a still target and
        // never wanders into the landing spot (which used to defeat the jump).
        const freeze = !!other && other.hopping && who === 'penguin';

        if (!S.reduced && !freeze) {
          // Turn around before the edge so the centred speech bubble (which
          // extends beyond the sprite) doesn't get clipped by the viewport.
          const bubbleReach = Math.max(0, (110 - S.dw / 2));
          const loBound = Math.min(bubbleReach, maxX / 2);
          const hiBound = Math.max(maxX - bubbleReach, maxX / 2);
          S.x += S.dir * speed * dt;
          if (S.x <= loBound) { S.x = loBound; S.dir = 1; }
          else if (S.x >= hiBound) { S.x = hiBound; S.dir = -1; }
        }
        S.y = S.ground;

        // ── Never overlap the other companion ──────────────────────────────
        // Skip entirely while the other is mid-hop: don't shove an airborne
        // companion, and let it complete its arc over a stationary target.
        if (other && !S.reduced && !other.hopping) {
          const myC = S.x + S.dw / 2;
          const otherC = other.x + other.w / 2;
          const gap = Math.abs(myC - otherC);
          // Minimum breathing room between body centres (plus a little air).
          const minGap = S.dw / 2 + other.w / 2 + 14;
          // Predict where the moving target will be by the time we land, so the
          // hop clears it even when 小企鹅 is walking (not just when hovered).
          const HOP_DUR = 620;
          const otherVX = (other.x - other.px) / Math.max(dt, 1 / 120); // px/s

          if (who === 'kangaroo' && now >= S.hopCooldown
              && gap < minGap + 40 && (myC < otherC ? S.dir === 1 : S.dir === -1)) {
            // 戴许 hops clean over 小企鹅, landing on the far side with clearance,
            // aiming past where the penguin will have walked to on touchdown.
            const dir: 1 | -1 = myC < otherC ? 1 : -1;
            const otherLandC = otherC + otherVX * (HOP_DUR / 1000);
            const landC = otherLandC + dir * (minGap + 26);
            const landX = Math.max(0, Math.min(maxX, landC - S.dw / 2));
            // Only commit if we truly end up clear of the target on landing.
            if (Math.abs((landX + S.dw / 2) - otherLandC) >= minGap) {
              S.hopFromX = S.x;
              S.hopToX = landX;
              S.hopStart = now;
              S.hopDur = HOP_DUR;
              // Peak must lift the roo's feet above the penguin's head: since
              // both are bottom-aligned on the same ground, the arc height has
              // to exceed the taller of the two bodies (plus margin) to clear.
              S.hopArc = Math.max(S.dh, other.h) + 22;
              S.dir = dir;
              setMode('hop');
              // A quick hop quip, only if it won't stomp on the other's bubble.
              if (!speakFloor.busy(who, now)) {
                speakNow(hopLine().text);
                talkBus.emit('hop');
              }
            } else {
              // No room to clear it — just turn away instead.
              S.dir = (dir === 1 ? -1 : 1) as 1 | -1;
            }
          } else if (gap < minGap) {
            // Fallback guard (penguin, cooldown, reduced-motion): push apart and
            // turn away so bodies — and their name labels — never overlap.
            const push = (minGap - gap) / 2 + 0.5;
            S.x += (myC < otherC ? -push : push);
            S.x = Math.max(0, Math.min(S.x, maxX));
            S.dir = (myC < otherC ? -1 : 1) as 1 | -1;
          }
        }

        // Idle chatter — but take turns: only speak if the other companion
        // isn't currently holding the speaking floor, so bubbles never overlap.
        if (now >= S.nextTalk) {
          if (speakFloor.busy(who, now)) {
            // Someone else is talking; check back shortly and let them finish.
            S.nextTalk = now + 800;
          } else {
            const line = idleLine(who);
            const dur = bubbleMs(line.text);
            // Hold the floor for the bubble plus a short beat, so the reply
            // (scold/mock cross-talk) lands after this one clears.
            speakFloor.claim(who, dur + 900, now);
            speak(line.text);
            if (line.intent === 'scold') talkBus.emit('scold');
            if (line.intent === 'mock') talkBus.emit('mock');
            S.nextTalk = now + dur + 5000 + Math.random() * 7000;
          }
        }
      } else if (S.mode === 'dance') {
        // Dancing "left" in place; nudge slightly left for a shuffle feel.
        S.dir = -1;
        S.y = S.ground;
      } else if (S.mode === 'hop') {
        // Parabolic leap from hopFromX → hopToX, arcing hopArc px above ground.
        const p = Math.min(1, (now - S.hopStart) / S.hopDur);
        S.x = S.hopFromX + (S.hopToX - S.hopFromX) * p;
        S.y = S.ground - S.hopArc * 4 * p * (1 - p); // parabola peaking at p=0.5
        if (p >= 1) {
          S.x = S.hopToX;
          S.y = S.ground;
          S.hopCooldown = now + 2600; // don't immediately hop back
          setMode('walk');
        }
      } else if (S.mode === 'panic') {
        // Position is driven by pointer in the move handler; nothing here.
      } else if (S.mode === 'fall') {
        const g = 2800;
        S.vy += g * dt;
        S.y += S.vy * dt;
        S.x += S.vx * dt;
        S.vx *= 0.92; // horizontal friction
        if (S.x < 0) { S.x = 0; S.vx = Math.abs(S.vx) * 0.4; }
        if (S.x > maxX) { S.x = maxX; S.vx = -Math.abs(S.vx) * 0.4; }
        if (S.y >= S.ground) {
          S.y = S.ground;
          if (S.vy > 500 && !S.reduced) {
            S.vy = -S.vy * 0.28;             // rubber-band bounce on impact
          } else if (!S.landed) {
            S.landed = true; S.landedT = now;
            S.vy = 0;
            speakNow(ouchLine(who).text);    // OUCH! on the frame it lands
            if (navigator.vibrate) navigator.vibrate(30);
          }
        }
        // Recovery: after the standup plays out, return to strolling.
        if (S.landed && now - S.landedT > 950) {
          S.dir = S.x < maxX / 2 ? 1 : -1;
          setMode('walk');
          S.nextTalk = now + 4000 + Math.random() * 5000;
        }
      }

      // Publish footprint so the other companion can avoid / hop over us.
      // `px` is last frame's x, giving the other its horizontal velocity.
      stage[who] = { x: S.x, px: stage[who]?.x ?? S.x, w: S.dw, h: S.dh, hopping: S.mode === 'hop' };

      // Commit transform (position + facing). Art faces left; flip when dir=1.
      const el = rootRef.current;
      if (el) {
        el.style.transform = `translate3d(${S.x}px, ${S.y}px, 0)`;
      }
      const sp = spriteRef.current;
      if (sp) {
        sp.style.backgroundPositionX = `${-S.frame * S.dw}px`;
        // Art faces RIGHT by default: flip only when moving/facing left.
        sp.style.transform = S.dir === -1 ? 'scaleX(-1)' : 'scaleX(1)';
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // ── Pointer interaction (attached to the sprite element) ──────────────────
    const node = rootRef.current!;
    const DRAG_THRESHOLD = 8;
    let downX = 0, downY = 0, pending = false;

    function onDown(e: PointerEvent) {
      if (S.mode === 'fall') return;
      pending = true;
      downX = e.clientX; downY = e.clientY;
      S.grabDX = e.clientX - S.x;
      S.grabDY = e.clientY - S.y;
      S.samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
      node.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!pending && !S.dragging) return;
      const dxTot = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
      if (pending && dxTot > DRAG_THRESHOLD) {
        pending = false;
        S.dragging = true;
        setMode('panic');
        speakNow(panicLine(who).text);
        if (navigator.vibrate) navigator.vibrate(15);
      }
      if (S.dragging) {
        S.x = e.clientX - S.grabDX;
        S.y = e.clientY - S.grabDY;
        S.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
        if (S.samples.length > 6) S.samples.shift();
      }
    }
    function onUp(e: PointerEvent) {
      try { node.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (pending) {
        // A tap (no real drag) → dance & speak. Great for touch, where there
        // is no hover.
        pending = false;
        toggleDance();
        return;
      }
      if (S.dragging) {
        S.dragging = false;
        // Release velocity from the recent samples → hand off into the fall.
        const s = S.samples;
        if (s.length >= 2) {
          const a = s[0], b = s[s.length - 1];
          const dtS = Math.max(0.001, (b.t - a.t) / 1000);
          S.vx = (b.x - a.x) / dtS;
          S.vy = (b.y - a.y) / dtS;
        } else { S.vx = 0; S.vy = 0; }
        S.landed = false;
        S.fallStart = performance.now();
        setMode('fall');
      }
    }
    function toggleDance() {
      if (S.mode === 'dance') { setMode('walk'); setSay(null); speakFloor.release(who); }
      else { setMode('dance'); speakNow(hoverLine(who).text); }
    }

    // Desktop hover (mouse only) → dance & speak; leaving → walk.
    function onEnter(e: PointerEvent) {
      if (e.pointerType !== 'mouse') return;
      if (S.mode === 'walk') { setMode('dance'); speakNow(hoverLine(who).text); }
    }
    function onLeave(e: PointerEvent) {
      if (e.pointerType !== 'mouse') return;
      if (S.mode === 'dance') { setMode('walk'); setSay(null); speakFloor.release(who); }
    }
    // Refresh the bubble every few seconds while the mouse lingers.
    const danceTalk = window.setInterval(() => {
      if (S.mode === 'dance') speakNow(hoverLine(who).text);
    }, 4200);

    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', onLeave);

    return () => {
      S.alive = false;
      delete stage[who];
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.clearInterval(danceTalk);
      window.clearTimeout(bubbleTimer);
      off();
      offClear();
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render into document.body via a portal. `position: fixed` resolves against
  // the nearest transformed ancestor, and <main> carries a mount-fade transform
  // that would otherwise trap the companion and make it scroll with the page.
  // Portalling to body guarantees the character stays glued to the viewport.
  return createPortal(
    <div
      ref={rootRef}
      className="fixed left-0 top-0 z-40 select-none"
      style={{ touchAction: 'none', willChange: 'transform', cursor: 'grab' }}
      aria-hidden="true"
    >
      {/* Speech bubble — anchored above the character, tinted to its colour. */}
      {say && (
        <div
          className="companion-bubble absolute left-1/2 -translate-x-1/2 bottom-full mb-1
                     px-3 py-1.5 rounded-2xl text-[12px] leading-snug font-medium
                     shadow-md pointer-events-none whitespace-normal text-center"
          style={{
            width: 'max-content',
            maxWidth: 'min(70vw, 220px)',
            background: bubble.bg,
            border: `1px solid ${bubble.border}`,
            color: bubble.text,
          }}
        >
          {say}
          <span
            className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
            style={{
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `7px solid ${bubble.bg}`,
            }}
          />
        </div>
      )}

      {/* Name label — only while walking, and never behind a bubble. */}
      {showName && !say && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-0.5
                     text-[11px] font-semibold pointer-events-none whitespace-nowrap"
          style={{ color: bubble.border, textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}
        >
          {name}
        </div>
      )}

      {/* The sprite frame. */}
      <div
        ref={spriteRef}
        style={{
          backgroundImage: `url(/sprites/${who}.png)`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'auto',
        }}
      />
    </div>,
    document.body,
  );
}
