import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterId } from './companionDialogue';
import {
  subscribeLive, subscribeRecords, subscribeCelebration,
  type LiveState, type DayRecord, type Celebration,
} from './altitudeRecords';

// A live vertical gauge that appears only while a companion is airborne, plus a
// "new record" celebration banner. 戴许 (kangaroo) is light so it launches far
// higher than 小企鹅 (penguin) from the same flick — each gauge auto-scales to
// its own record so both stay readable no matter the difference.
const META: Record<CharacterId, { emoji: string; name: string; color: string }> = {
  kangaroo: { emoji: '🦘', name: '戴许', color: '#b4772e' },
  penguin: { emoji: '🐧', name: '小企鹅', color: '#6b7280' },
};
const ORDER: CharacterId[] = ['kangaroo', 'penguin'];

function Gauge({ who, alt, record }: { who: CharacterId; alt: number; record: number }) {
  const m = META[who];
  // Scale the tube to comfortably fit both the current height and the record.
  const top = Math.max(alt, record, 3) * 1.1;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  const beating = alt >= record && record > 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[11px] font-bold tabular-nums" style={{ color: m.color }}>
        {alt.toFixed(1)}m
      </div>
      <div
        className="relative w-8 rounded-full overflow-hidden"
        style={{ height: 180, background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.08)' }}
      >
        {/* Filled column up to current altitude. */}
        <div
          className="absolute left-0 right-0 bottom-0 transition-[height] duration-100 ease-out"
          style={{ height: pct(alt), background: `${m.color}33` }}
        />
        {/* Today's record line. */}
        {record > 0 && (
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed"
            style={{ bottom: pct(record), borderColor: beating ? '#34c759' : m.color }}
          />
        )}
        {/* The flyer, riding at its current height. */}
        <div
          className="absolute left-1/2 -translate-x-1/2 text-base leading-none transition-[bottom] duration-100 ease-out"
          style={{ bottom: `calc(${pct(alt)} - 8px)` }}
        >
          {m.emoji}
        </div>
      </div>
      <div className="text-[10px] font-medium" style={{ color: m.color }}>{m.name}</div>
    </div>
  );
}

function Gauges({ airborne, live, records }: {
  airborne: CharacterId[]; live: LiveState; records: DayRecord | null;
}) {
  return (
    <div
      className="fixed z-40 right-3 top-1/2 -translate-y-1/2 flex gap-3 p-3 rounded-2xl
                 bg-white/85 backdrop-blur shadow-lg border border-black/5"
      aria-hidden="true"
    >
      {airborne.map((w) => (
        <Gauge key={w} who={w} alt={live[w] ?? 0} record={records?.meters[w] ?? 0} />
      ))}
    </div>
  );
}

function Banner({ celeb }: { celeb: Celebration }) {
  const m = META[celeb.who];
  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center">
      <div
        className="record-banner mt-24 px-6 py-4 rounded-3xl shadow-2xl text-center text-white"
        style={{ background: `linear-gradient(135deg, ${m.color}, #34c759)` }}
      >
        <div className="record-pop text-4xl leading-none mb-1">{m.emoji}🎉</div>
        <div className="text-lg font-extrabold tracking-wide">新纪录！NEW RECORD!</div>
        <div className="text-2xl font-black tabular-nums mt-0.5">{celeb.meters.toFixed(1)}m</div>
        <div className="text-xs font-medium opacity-90 mt-0.5">{m.name} 今日最高飞行</div>
      </div>
      {/* Confetti burst behind the badge. */}
      <div className="record-confetti absolute inset-x-0 top-20 flex justify-center gap-2 text-2xl">
        {['🎊', '✨', '🎉', '⭐', '🎊', '✨'].map((c, i) => (
          <span key={i} style={{ animationDelay: `${i * 60}ms` }}>{c}</span>
        ))}
      </div>
    </div>
  );
}

export default function AltitudeMeter() {
  const [live, setLive] = useState<LiveState>({ penguin: null, kangaroo: null });
  const [records, setRecords] = useState<DayRecord | null>(null);
  const [celeb, setCeleb] = useState<Celebration | null>(null);

  useEffect(() => {
    const offLive = subscribeLive(setLive);
    const offRec = subscribeRecords(setRecords);
    let hideTimer: number | undefined;
    const offCeleb = subscribeCelebration((c) => {
      setCeleb(c);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setCeleb(null), 3200);
    });
    return () => { offLive(); offRec(); offCeleb(); window.clearTimeout(hideTimer); };
  }, []);

  const airborne = ORDER.filter((w) => live[w] != null);
  const showMeter = airborne.length > 0;

  return createPortal(
    <>
      {showMeter && <Gauges airborne={airborne} live={live} records={records} />}
      {celeb && <Banner celeb={celeb} />}
    </>,
    document.body,
  );
}
