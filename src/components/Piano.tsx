import { useEffect, useRef, useState } from "react";
import { isBlackKey, letterOfWhiteKey } from "../music/pitch";

export type KeyMark = "good" | "bad" | "hint";

interface Props {
  /** Lowest C shown (MIDI). */
  startC: number;
  /** Most octaves to show when there is room; narrows to fit small screens. */
  maxOctaves?: number;
  marks?: Record<number, KeyMark>;
  onKey: (midi: number) => void;
  disabled?: boolean;
  /** Letter names on the white keys. */
  labels?: boolean;
}

const WHITE_W = 40;
const WHITE_H = 150;
const BLACK_W = 24;
const BLACK_H = 94;
/** Black keys sit slightly off-centre between their whites, like a real keyboard. */
const BLACK_OFFSET: Record<number, number> = { 1: -3, 3: 3, 6: -4, 8: 0, 10: 4 };

/**
 * A responsive on-screen keyboard. It shows one octave on phones and more on
 * wider screens, so keys never shrink below a comfortable touch size (~44px).
 * Keys respond on pointerdown, with no tap delay.
 */
export function Piano({ startC, maxOctaves = 2, marks = {}, onKey, disabled, labels = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [octaves, setOctaves] = useState(1);
  const [pressed, setPressed] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      setOctaves(Math.max(1, Math.min(maxOctaves, Math.floor(w / (7 * 46)))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxOctaves]);

  const keys: { midi: number; black: boolean; x: number }[] = [];
  let wx = 0;
  for (let m = startC; m < startC + 12 * octaves; m++) {
    if (isBlackKey(m)) keys.push({ midi: m, black: true, x: wx - BLACK_W / 2 + (BLACK_OFFSET[m % 12] ?? 0) });
    else {
      keys.push({ midi: m, black: false, x: wx });
      wx += WHITE_W;
    }
  }
  const width = wx;

  const down = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    setPressed(midi);
    onKey(midi);
  };

  const cls = (k: { midi: number; black: boolean }) =>
    ["key", k.black ? "key-black" : "key-white", marks[k.midi] ? `key-${marks[k.midi]}` : "", pressed === k.midi ? "key-down" : ""].join(" ");

  return (
    <div className="piano" ref={ref}>
      <svg viewBox={`0 0 ${width} ${WHITE_H}`} role="group" aria-label="Piano keyboard" onPointerUp={() => setPressed(null)} onPointerLeave={() => setPressed(null)}>
        {keys
          .filter((k) => !k.black)
          .map((k) => (
            <g key={k.midi} className={cls(k)} onPointerDown={down(k.midi)} role="button" aria-label={letterOfWhiteKey(k.midi) ?? ""}>
              <rect x={k.x + 1} y={0} width={WHITE_W - 2} height={WHITE_H} rx={5} />
              {labels && (
                <text x={k.x + WHITE_W / 2} y={WHITE_H - 12} textAnchor="middle" className="key-label">
                  {letterOfWhiteKey(k.midi)}
                </text>
              )}
            </g>
          ))}
        {keys
          .filter((k) => k.black)
          .map((k) => (
            <g key={k.midi} className={cls(k)} onPointerDown={down(k.midi)} role="button" aria-label="black key">
              <rect x={k.x} y={0} width={BLACK_W} height={BLACK_H} rx={4} />
            </g>
          ))}
      </svg>
    </div>
  );
}
