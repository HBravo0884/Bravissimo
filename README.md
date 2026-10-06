# Bravissimo

The studio companion for Bravo Piano Studio. It keeps one dated record per
student, built on the studio's own system: the weekly sheet with four cards and
their Done when, the R and T ladders, threads and lessons, promises, the
family loop. Level Up sits on top as a mapping, not the backbone.

The record lives in **Notion**, in the existing Student tracker. The app reads
and writes the tracker's Students, Lessons, Threads and Songs, and keeps its own
tables (Weeks, Promises, Progress, Challenges, Practice, Repertoire, Reports,
Rungs, Skills Check, Resources) on a Bravissimo page inside the tracker.

## What it does

| Screen | Who | What |
|---|---|---|
| Today | teacher, phone in the room | The day in slot order with Ask first, the Done when lines and Check before you teach (promises owed, retests, flags, what the family wrote). One tap starts a lesson and stamps the time for the room recording. |
| Lesson capture | teacher, one hand | Met, not yet or not tried per card; quick adds for a win, a promise, a parent ask, a recital piece, a criterion, a note. |
| Week editor | teacher, Mac | Four cards, the routine, Keep it alive, wins, song, codes, the note to the adult. Copies last week forward with carried-over tags in the sheet's language. Runs the build script's checks (four cards, codes in the fifteen, no item under five minutes, totals 15/20/25/30, no dash, no exclamation mark, no emoji, no level). |
| Records file | teacher | Exports `students_<day><ddmon>.json` exactly as the Python sheet generator reads it. Opt-outs get no codes, no points and no challenges block. |
| Board | teacher | Never reported, then stale, then fresh, with flags: no current piece, no open challenge, promises owed, no lesson record, practice days trending down, threads untouched for three weeks. |
| Student record | teacher | Week, ladders with the Skills Check (prompt sets A and B, retest queue, 60 and 40 point credits), challenges (templates, criterion, blocks, app minutes), repertoire, lesson history, profile and the family link. |
| Lessons, threads, promises, reports | teacher | The lesson record review, threads with What we are watching and Next move, promises until kept, and the reports desk (who is due, drafts from lesson records only, the voice check, copy for Opus1, a posted tick only the teacher sets). |
| Family page | student and adult, any phone | Opened from a private link behind the sheet's code, no account. This week's checked sheet in the family's language: tick a practice day, "I think I've got it", the listening log, Write to me, the codes, the note to the adult, the current sheet with only the one before and the next. Never a level, a rank, a points quantity or another student. |
| Practice games | student | Note names, Subdivide (12 levels, three modes), How far apart, Key signatures (to six sharps and flats, as in the book). No points, badges, emoji or clock; a plain summary, and the minutes go to the open ET or TH app packet as Reported. |

Every fact carries its evidence mark. Anything from a family's device is
Reported until it is checked in the lesson.

## Setting it up

1. **Notion integration.** In Notion, Settings, Connections, Develop or manage
   integrations: make an internal integration called Bravissimo and copy its secret.
2. **Share the tracker.** On the Student tracker page, open the menu, choose
   Connections and add Bravissimo. That covers the tracker and everything under it.
3. **Netlify.** Connect this repository. `netlify.toml` sets the build, the
   publish folder and the function. In Site configuration, Environment
   variables, add:

   | Variable | Value |
   |---|---|
   | `NOTION_TOKEN` | the integration secret |
   | `NOTION_ROOT_PAGE` | the Student tracker page id (the 32 characters at the end of its link) |
   | `STUDIO_KEY` | a long passphrase only the teacher knows |

   Optional: `NOTION_DB_<NAME>` (for example `NOTION_DB_STUDENTS`) pins a
   database by id instead of finding it by title.
4. **Set up.** Open the site, go to Settings, choose Notion, type the studio
   key, and choose Set up Notion. Setup only adds: the Bravissimo page, the
   app's databases, and a few properties on Students (Display name, Language,
   Accent, Points, Flags, Age band, Family key...) and Lessons (Started at,
   Capture). It never removes or renames anything.

## How the data moves

```
browser (record cached on the device, outbox of changes)
   |  /api/pull, /api/push        studio key in a header
   |  /api/family                 a family's private link key
Netlify Function (netlify/functions/api.ts -> server/api.ts)
   |  Notion API, 2022-06-28
Notion: Student tracker + Bravissimo page
```

- Edits land on the device first and sync when there is a connection, so the
  room never waits on the network. A refused change shows on the sync badge and
  in Settings, where it can be retried or dropped.
- Family ticks, messages and listening entries are merged on the server, so a
  teacher's edit never overwrites them.
- Notion allows about three requests a second; the function retries when asked
  to slow down, and the app pulls only what changed since the last pull.

## Privacy

- No student data is in this repository. The demo studio uses invented names,
  and the studio's own content (the ladders, the Skills Check items, the
  checked tools) lives in Notion, not in the code.
- The family link shows one student's family-visible week and nothing else;
  resetting it stops the old link. The service worker never caches `/api/`.
- Keys live in Netlify environment variables.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173, demo studio (no server)
npm test           # rules, the Notion function against a fake Notion, end-to-end sync
npm run build      # type-check and production build into dist/
```

`npx netlify dev` runs the function locally with the environment variables.

## Layout

```
shared/    types, the sheet rules and records JSON, family view, board, ladders, Level Up, labels (en, es)
server/    the Notion client, the field mapping, discovery and setup, the API handler, a fake Notion for tests
netlify/   the function entry
src/
  data/       the local store and sync, actions, selectors, the demo studio
  pages/      Today, capture, board, students, student record, week editor, lessons, promises, threads, reports, export, settings, family page, games
  components/ UI pieces, the family week, staff and rhythm renderers, piano keyboard
  games/      the practice rounds and their question generators
  music/      pitch and staff geometry, the Subdivide port, Web Audio, Web MIDI, Bravura glyphs
```
