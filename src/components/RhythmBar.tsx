import { GLYPHS, type GlyphName } from "../music/glyphs";
import { beats, type Bar, type RNote } from "../music/rhythm";

const S = 10;
const K = S / 250;
const W = 420;
const H = 104;
const MID = 66;
const PAD_L = 30;
const PAD_R = 24;
const STEM = 34;

function Glyph({ name, x, y }: { name: GlyphName; x: number; y: number }) {
  return <path d={GLYPHS[name].d} transform={`translate(${x} ${y}) scale(${K} ${-K})`} />;
}

const headFor = (n: RNote): GlyphName => (n.v === 1 ? "noteheadWhole" : n.v === 2 ? "noteheadHalf" : "noteheadBlack");
const restFor = (n: RNote): GlyphName =>
  n.v === 1 ? "restWhole" : n.v === 2 ? "restHalf" : n.v === 4 ? "restQuarter" : n.v === 8 ? "rest8th" : "rest16th";

/** One bar of rhythm on a single line, stems up, beamed by the beat (as in Subdivide). */
export function RhythmBar({ bar, label = "Rhythm notation" }: { bar: Bar; label?: string }) {
  const span = W - PAD_L - PAD_R;
  let t = 0;
  const xs = bar.map((n) => {
    const x = PAD_L + (t / 4) * span;
    t += beats(n);
    return x;
  });

  // Beam groups: consecutive sounding eighths/sixteenths inside the same beat and tuplet.
  const groups: { tup: RNote["t"]; ix: number[] }[] = [];
  let cur: { beat: number; tup: RNote["t"]; ix: number[] } | null = null;
  let acc = 0;
  bar.forEach((n, i) => {
    const beat = Math.floor(acc + 1e-6);
    if (!n.r && n.v >= 8) {
      if (cur && cur.beat === beat && cur.tup === n.t) cur.ix.push(i);
      else {
        cur = { beat, tup: n.t, ix: [i] };
        groups.push(cur);
      }
    } else cur = null;
    acc += beats(n);
  });
  const beamed = new Set(groups.filter((g) => g.ix.length > 1).flatMap((g) => g.ix));
  const headW = (n: RNote) => GLYPHS[headFor(n)].w * K;
  const stemX = (i: number) => xs[i] + headW(bar[i]) - 0.65;
  const top = MID - STEM;

  return (
    <svg className="rhythm-bar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line x1={10} x2={W - 10} y1={MID} y2={MID} className="staff-line" />
      <line x1={PAD_L - 16} x2={PAD_L - 16} y1={MID - 16} y2={MID + 16} className="bar-line" />
      <line x1={W - 12} x2={W - 12} y1={MID - 16} y2={MID + 16} className="bar-line" />
      <g className="ink">
        {bar.map((n, i) => {
          const x = xs[i];
          if (n.r) return <Glyph key={i} name={restFor(n)} x={x - 2} y={MID} />;
          return (
            <g key={i}>
              <Glyph name={headFor(n)} x={x} y={MID} />
              {n.d === 1 && <Glyph name="augmentationDot" x={x + headW(n) + 4} y={MID - S / 2} />}
              {n.v >= 2 && <line x1={stemX(i)} x2={stemX(i)} y1={MID - 2} y2={top} className="stem" />}
              {n.v >= 8 && !beamed.has(i) && <Glyph name={n.v === 16 ? "flag16thUp" : "flag8thUp"} x={stemX(i) - 0.6} y={top} />}
            </g>
          );
        })}
        {groups
          .filter((g) => g.ix.length > 1)
          .map((g, gi) => {
            const x1 = stemX(g.ix[0]) - 0.6;
            const x2 = stemX(g.ix[g.ix.length - 1]) + 0.6;
            const levels = g.ix.some((i) => bar[i].v === 16) ? 2 : 1;
            return (
              <g key={gi}>
                {Array.from({ length: levels }, (_, b) => (
                  <rect key={b} x={x1} y={top + b * 7.5} width={x2 - x1} height={5} />
                ))}
                {g.tup && (
                  <g className="tuplet">
                    <path d={`M${x1 - 2} ${top - 6} v-6 H${(x1 + x2) / 2 - 8} M${(x1 + x2) / 2 + 8} ${top - 12} H${x2 + 2} v6`} fill="none" />
                    <text x={(x1 + x2) / 2} y={top - 8} textAnchor="middle">
                      {g.tup}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
      </g>
    </svg>
  );
}

/** A small glyph for the rung list. */
export function RhythmGlyph({ note }: { note: RNote }) {
  const name = note.r ? restFor(note) : headFor(note);
  const k = 0.06;
  return (
    <svg viewBox="0 0 30 40" width="22" height="30" aria-hidden="true" className="rhythm-glyph">
      <path d={GLYPHS[name].d} transform={`translate(${note.r ? 8 : 6} 26) scale(${k} ${-k})`} />
      {!note.r && note.v >= 2 && <line x1={6 + GLYPHS[name].w * k - 1} x2={6 + GLYPHS[name].w * k - 1} y1={25} y2={6} className="stem" />}
      {!note.r && note.v >= 8 && (
        <path d={GLYPHS[note.v === 16 ? "flag16thUp" : "flag8thUp"].d} transform={`translate(${6 + GLYPHS[name].w * k - 1.6} 6) scale(${k} ${-k})`} />
      )}
      {note.d === 1 && <circle cx={27} cy={23} r={1.8} />}
      {note.t && (
        <text x={14} y={39} fontSize="9" textAnchor="middle" fontWeight="700">
          {note.t}
        </text>
      )}
    </svg>
  );
}
