import { useEffect, useState } from 'react';
import type { CharacterId } from './companionDialogue';
import { subscribeRecords, type DayRecord } from './altitudeRecords';

// Dashboard card: today's best launch altitude for 戴许 and 小企鹅. Records live
// in localStorage keyed by date, so this resets each day. Updates live as you
// fling a companion into the air.
const META: Record<CharacterId, { emoji: string; name: string; color: string }> = {
  kangaroo: { emoji: '🦘', name: '戴许', color: '#b4772e' },
  penguin: { emoji: '🐧', name: '小企鹅', color: '#6b7280' },
};
const ORDER: CharacterId[] = ['kangaroo', 'penguin'];

export default function FlightRecords() {
  const [rec, setRec] = useState<DayRecord | null>(null);
  useEffect(() => subscribeRecords(setRec), []);

  const best = ORDER.reduce((m, w) => Math.max(m, rec?.meters[w] ?? 0), 0);

  return (
    <div className="sov-card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">今日飞行纪录 · Today's Flights</h2>
      <p className="text-xs text-gray-400 mb-4">
        把小伙伴甩到空中试试 — 轻的戴许比重的小企鹅飞得高得多。每天午夜清零。
      </p>
      <div className="grid grid-cols-2 gap-4">
        {ORDER.map((w) => {
          const m = META[w];
          const meters = rec?.meters[w] ?? 0;
          const share = best > 0 ? (meters / best) * 100 : 0;
          return (
            <div key={w} className="rounded-2xl p-4" style={{ background: `${m.color}0f` }}>
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none">{m.emoji}</span>
                <span className="text-sm font-semibold" style={{ color: m.color }}>{m.name}</span>
              </div>
              <p className="text-3xl font-black tabular-nums mt-2" style={{ color: m.color }}>
                {meters.toFixed(1)}<span className="text-lg font-bold">m</span>
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-black/5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${share}%`, background: m.color }} />
              </div>
            </div>
          );
        })}
      </div>
      {best === 0 && (
        <p className="text-sm text-gray-500 text-center mt-4">
          还没有起飞记录 — 用手指把戴许或小企鹅往上一甩就开始啦！
        </p>
      )}
    </div>
  );
}
