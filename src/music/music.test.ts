import { describe, expect, it } from "vitest";
import { midiOf, naturalRange, parsePitch, pitchName } from "./pitch";
import { intervalNumber, keySignatureSteps, keySignatureTip, ledgerSteps, MAJOR_KEYS, staffStep } from "./staff";
import { gradeTaps, makeBar, onsets, RHYTHM_LEVELS, sameSound, beats } from "./rhythm";
import { seededRng } from "../games/scoring";

describe("pitch", () => {
  it("parses and names pitches with accidentals", () => {
    expect(pitchName(parsePitch("F#5"))).toBe("F♯5");
    expect(pitchName(parsePitch("Bb3"))).toBe("B♭3");
    expect(midiOf(parsePitch("C4"))).toBe(60);
    expect(midiOf(parsePitch("A4"))).toBe(69);
    expect(midiOf(parsePitch("Cb4"))).toBe(59);
  });

  it("builds natural ranges", () => {
    expect(naturalRange("C4", "G4").map(pitchName)).toEqual(["C4", "D4", "E4", "F4", "G4"]);
  });
});

describe("staff geometry", () => {
  it("puts landmark notes on the right lines", () => {
    expect(staffStep(parsePitch("E4"), "treble")).toBe(0); // bottom line
    expect(staffStep(parsePitch("G4"), "treble")).toBe(2); // the line the G clef wraps
    expect(staffStep(parsePitch("F5"), "treble")).toBe(8); // top line
    expect(staffStep(parsePitch("F3"), "bass")).toBe(6); // between the F clef's dots
    expect(staffStep(parsePitch("C4"), "treble")).toBe(-2); // middle C, one ledger below
    expect(staffStep(parsePitch("C4"), "bass")).toBe(10); // middle C, one ledger above
  });

  it("draws ledger lines only where needed", () => {
    expect(ledgerSteps(-2)).toEqual([-2]);
    expect(ledgerSteps(-3)).toEqual([-2]);
    expect(ledgerSteps(-4)).toEqual([-2, -4]);
    expect(ledgerSteps(4)).toEqual([]);
    expect(ledgerSteps(12)).toEqual([10, 12]);
  });

  it("places key signatures in the standard order", () => {
    // Sharps in treble: F5 top line first, then C5 third space.
    expect(keySignatureSteps("sharp", 2, "treble")).toEqual([8, 5]);
    // Flats in bass: B2 second line first.
    expect(keySignatureSteps("flat", 1, "bass")).toEqual([2]);
  });

  it("explains keys with the studio's shortcuts", () => {
    const d = MAJOR_KEYS.find((k) => k.id === "D")!;
    expect(keySignatureTip(d)).toContain("C♯");
    const eb = MAJOR_KEYS.find((k) => k.id === "Eb")!;
    expect(keySignatureTip(eb)).toContain("E♭");
  });

  it("counts intervals by letters", () => {
    expect(intervalNumber(parsePitch("C4"), parsePitch("E4"))).toBe(3);
    expect(intervalNumber(parsePitch("G4"), parsePitch("G5"))).toBe(8);
  });
});

describe("rhythm ladder", () => {
  it("always fills exactly four beats", () => {
    const rng = seededRng(3);
    RHYTHM_LEVELS.forEach((_, level) => {
      for (let i = 0; i < 40; i++) {
        const bar = makeBar(level, rng);
        expect(bar.reduce((s, n) => s + beats(n), 0)).toBeCloseTo(4, 5);
      }
    });
  });

  it("compares bars by sound, not spelling", () => {
    const quarterThenRest = [
      { r: false, v: 4, d: 0, t: null },
      { r: true, v: 4, d: 0, t: null },
      { r: false, v: 2, d: 0, t: null },
    ] as const;
    const halfThenHalf = [
      { r: false, v: 2, d: 0, t: null },
      { r: false, v: 2, d: 0, t: null },
    ] as const;
    expect(onsets([...quarterThenRest])).toEqual([0, 2]);
    expect(sameSound([...quarterThenRest], [...halfThenHalf])).toBe(true);
  });

  it("grades taps within the timing window and rejects extras", () => {
    const bar = [
      { r: false, v: 4, d: 0, t: null },
      { r: false, v: 4, d: 0, t: null },
      { r: false, v: 4, d: 0, t: null },
      { r: false, v: 4, d: 0, t: null },
    ] as const;
    const bpm = 60;
    const good = gradeTaps([...bar], [10.02, 11.0, 11.98, 13.05], 10, bpm);
    expect(good.ok).toBe(true);
    expect(good.meanAbsErrorMs).toBeLessThan(40);
    const extra = gradeTaps([...bar], [10, 10.5, 11, 12, 13], 10, bpm);
    expect(extra.ok).toBe(false);
    expect(extra.extra).toBe(1);
  });
});
