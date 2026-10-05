import { GLYPHS, type GlyphName } from "../music/glyphs";
import { keySignatureSteps, ledgerSteps, staffStep, type Clef } from "../music/staff";
import type { StaffSpec } from "../games/flash";

/** One staff space in SVG units; glyphs are 250 font units per space. */
const S = 10;
const K = S / 250;
const HEAD_W = GLYPHS.noteheadWhole.w * K;
/** Bottom line of the top staff. Leaves room for ledger lines and the treble clef above. */
const TOP_BOTTOM_Y = 8 * S;
const STAFF_GAP = 10 * S;
const CLEF_X = 9;
const AFTER_CLEF = 44;

export type NoteState = "correct" | "wrong" | undefined;

function Glyph({ name, x, y, className }: { name: GlyphName; x: number; y: number; className?: string }) {
  return <path d={GLYPHS[name].d} transform={`translate(${x} ${y}) scale(${K} ${-K})`} className={className} />;
}

function staffLines(bottomY: number, x1: number, x2: number) {
  return [0, 1, 2, 3, 4].map((i) => (
    <line key={i} x1={x1} x2={x2} y1={bottomY - i * S} y2={bottomY - i * S} className="staff-line" />
  ));
}

interface Props {
  spec: StaffSpec;
  state?: NoteState;
  /** Shown to screen readers. */
  label?: string;
}

/** Renders a staff (treble, bass or grand) with clef, optional key signature, and whole notes. */
export function Staff({ spec, state, label }: Props) {
  const staves: Clef[] = spec.clef === "grand" ? ["treble", "bass"] : [spec.clef];
  const bottomOf = (clef: Clef) => (spec.clef === "grand" && clef === "bass" ? TOP_BOTTOM_Y + STAFF_GAP : TOP_BOTTOM_Y);
  const yOf = (clef: Clef, step: number) => bottomOf(clef) - (step * S) / 2;

  const ks = spec.keySig;
  const ksWidth = ks ? ks.count * 11 + 6 : 0;
  const area = spec.notes.length === 0 ? 28 : spec.layout === "melodic" ? 96 : 64;
  const width = AFTER_CLEF + ksWidth + area + 10;
  const height = bottomOf(staves[staves.length - 1]) + 5 * S;
  const noteStart = AFTER_CLEF + ksWidth;

  const xs =
    spec.layout === "melodic" && spec.notes.length === 2
      ? [noteStart + area * 0.3, noteStart + area * 0.72]
      : spec.notes.map(() => noteStart + area / 2);

  // Stacked seconds can't share a column: nudge the upper note right, as engravers do.
  if (spec.layout === "harmonic" && spec.notes.length === 2) {
    const [a, b] = spec.notes.map((n) => staffStep(n.pitch, n.staff));
    if (Math.abs(a - b) === 1) {
      const upper = a > b ? 0 : 1;
      xs[upper] += HEAD_W - 1;
    }
  }

  const noteClass = state === "correct" ? "note note-good" : state === "wrong" ? "note note-bad" : "note";
  const where = spec.clef === "grand" ? "grand staff" : `${spec.clef} staff`;
  const aria = label ?? (spec.notes.length ? `${spec.notes.length === 1 ? "A note" : "Two notes"} on the ${where}` : `Key signature on the ${where}`);

  return (
    <svg className="staff" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria} preserveAspectRatio="xMidYMid meet">
      {staves.map((clef) => (
        <g key={clef}>
          {staffLines(bottomOf(clef), 2, width - 2)}
          <Glyph name={clef === "treble" ? "gClef" : "fClef"} x={CLEF_X} y={yOf(clef, clef === "treble" ? 2 : 6)} className="ink" />
          {ks &&
            keySignatureSteps(ks.type, ks.count, clef).map((step, i) => (
              <Glyph
                key={i}
                name={ks.type === "sharp" ? "accidentalSharp" : "accidentalFlat"}
                x={AFTER_CLEF + i * 11}
                y={yOf(clef, step)}
                className="ink"
              />
            ))}
        </g>
      ))}
      {spec.clef === "grand" && (
        <>
          <line x1={2} x2={2} y1={bottomOf("treble") - 4 * S} y2={bottomOf("bass")} className="staff-bar" />
          <line x1={width - 2} x2={width - 2} y1={bottomOf("treble") - 4 * S} y2={bottomOf("bass")} className="staff-line" />
        </>
      )}
      {spec.notes.map((n, i) => {
        const step = staffStep(n.pitch, n.staff);
        const x = xs[i];
        const y = yOf(n.staff, step);
        return (
          <g key={i} className={noteClass}>
            {ledgerSteps(step).map((ls) => (
              <line key={ls} x1={x - HEAD_W / 2 - 4} x2={x + HEAD_W / 2 + 4} y1={yOf(n.staff, ls)} y2={yOf(n.staff, ls)} className="ledger" />
            ))}
            <Glyph name="noteheadWhole" x={x - HEAD_W / 2} y={y} />
          </g>
        );
      })}
    </svg>
  );
}
