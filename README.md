# Bravissimo

Music-reading games with student score tracking, built for Bravo Piano Studio.
Students practice note reading, rhythm, intervals and key signatures on a phone,
tablet or the studio iPad. The teacher sees every student's progress, streaks,
weak spots and Level Up challenges on one dashboard.

## What's in it

**Games** (each one adapts: notes a student misses come back more often until they stick)

| Game | Practices | Stages |
|---|---|---|
| Note Rush | Naming notes on treble, bass or grand staff; answer with letters, on-screen keys, or a real piano over MIDI | First ten (Level Up 1's ten pitches) · Landmarks · Whole staff · Ledger lines |
| Rhythm Ladder | The Subdivide ladder: Listen & match, Read & tap, Hear & tap (call and response) | 12 rungs, quarter notes to quintuplets; five in a row clears a rung |
| Interval Detective | Counting intervals, melodic and stacked | Steps & skips · 2nd to 5th · Up to the octave |
| Key Signatures | Naming major keys from sharps and flats | C, G and F · Up to three · All fifteen |

Sprint rounds (60 seconds, speed bonus) or Steady rounds (20 questions, no clock, "Show me" to learn instead of guess).
Streak multipliers up to ×4, personal bests, practice-day streaks and 13 badges. No leaderboards: students only ever compete with themselves.

**Teacher dashboard**
- Weekly studio numbers: who practiced, games, minutes, accuracy.
- Roster with streaks, last played, an accuracy sparkline, and flags: *No practice in N days*, *Accuracy down*, *New personal best*, *Ready to level up*.
- Per student: accuracy and score charts (scores only compared within the same stage and format), a skills map showing accuracy for every note, interval, key and rung, full history, CSV export.
- **Level Up tracker** that follows the studio's rules: 15 categories, codes like `ET 1b`, 40–150 points in tens, 1,000 points a level, points land once when a challenge is finished, notebook carry-in, per-student opt-out. Games carry no points of their own; their minutes feed linked challenges (e.g. ET 1b, 250 minutes).

**Home practice without a server**
The teacher sends a *home practice link* that sets up a student's own device. The student taps *Send scores* and pastes the link back into their lesson messages. Opening it on the teacher's device merges the games in.

**Built for phones first:** every control is at least 44px, keys respond on touch-down, the game screen fits one hand, light and dark themes, works offline after the first visit (installable to the home screen).

## Privacy

All data stays in the browser on the device where it was entered (localStorage). Nothing is uploaded, and no student data lives in this repository: the demo studio uses made-up names. Settings → *Export backup* saves everything to a file; *Restore or merge* brings it back or combines devices. An optional teacher PIN keeps students on a shared tablet out of the dashboard.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (music theory, scoring, store, Level Up rules)
npm run build      # type-check + production build into dist/
```

Settings → *Load demo studio* fills the app with eight fictional students and a month of practice.

## Deploy (Netlify)

Connect the GitHub repo in Netlify. `netlify.toml` already sets the build command (`npm run build`) and publish folder (`dist`). The app uses hash routes (`#/teacher`), so no redirect rules are needed.

## Layout

```
src/
  music/      pitch, staff and key-signature geometry, rhythm ladder, Web Audio, Web MIDI, Bravura glyphs
  games/      question generators, scoring and adaptive picking, the round screens
  data/       data model, local store, stats, badges, Level Up rules, share links, demo studio
  components/ staff and rhythm renderers, piano keyboard, charts, UI pieces
  pages/      student picker, student hub, play, results, teacher dashboard, student detail, settings
docs/         planning notes and prompts
```

## Roadmap

1. Rebuild around the studio's full teaching system (weekly cards with "Done when" gates, the R and T ladders, threads, the family loop). See `docs/prompts/teaching-system-brief.md`.
2. Supabase sync: teacher sign-in, students join with a code, scores appear on the dashboard automatically.
3. Multi-studio accounts if Bravissimo is offered to other teachers.

## Credits and licence

Music glyphs are outlines from [Bravura](https://github.com/steinbergmedia/bravura) © Steinberg Media Technologies, SIL Open Font License 1.1 (`public/licenses/Bravura-OFL.txt`).
Level Up is the Expressions Music Academy program; its codes and point rules are used as the studio runs them.
No licence has been chosen for Bravissimo itself yet, so all rights are reserved.
