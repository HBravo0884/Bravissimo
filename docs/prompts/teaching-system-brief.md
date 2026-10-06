# Prompt: describe the Bravo Studio teaching system for Bravissimo

Paste everything inside the box into the **AIS Claude Drafter** project in Claude Cowork. Paste its full answer back into the Bravissimo session (or save it as `docs/teaching-system.md` in the repo).

```text
I'm rebuilding Bravissimo, my piano-studio web app (React + TypeScript, deployed on Netlify, Supabase later), and I want it built on MY teaching system, not just the academy's Level Up points. Over the past few months, in this project and in my studio runs, I've built a much more nuanced system with my ~30 students. Pull it all together into one complete, accurate brief that a developer can build from.

Use everything you can reach: this project's knowledge and files, my Notion Student Tracker (Students, Lessons, Threads, Songs), the Desktop/Piano_Studio folders (week folders, students_*.json, handouts, day sheets, run logs, report drafts, Weekly issues), Library/Quiz_Bank (Theory Quizzes T00–T10, Ear Response Sheets R00–R10, Resource Cards), the bravo-studio-theory site (T01–T11, TE1), Studio Curriculum, Level Up Report Engine, Bravo Lesson Studio scripts, Subdivide, Keyboard Diagram Builder, Distance Degrees and Chords, the Resource Shelf, and Points_Recalibration_28Aug2026. Where sources disagree, say which one is current and why.

Write the brief in Markdown with exactly these sections:

1. The philosophy in one page. What I believe about how kids and adults learn piano, what I'm trying to grow (habits, ear, reading, creativity, confidence), and what I refuse to do (e.g. grades, comparing students, restating hardship). Quote my own phrasing where it exists.

2. The framework, every moving part, with exact names, codes and definitions:
   - curriculum lanes and levels (Technique, Literacy, Theory, Ear, Repertoire, Creation, Performance) and the rotation rule
   - FERN focus, ACE balance, Practice Prescriptions, Triggers, Entry Points, Wellness/Mood, and how I use each in a lesson
   - the studio ladders: rhythm rungs (R00–R10), theory modules (T00–T11, TE1), and any others, with what "done" means for each rung
   - weekly cards: code, task, "Done when", routine minutes, the 7 day boxes, "minimum day", carried-over cards, Keep It Alive
   - repertoire: NOW piece, goal piece, keep-alive pieces, recital pieces, song bank levels, how a piece moves through statuses
   - Threads and Lessons: what a thread is, its kinds and statuses, how lessons feed it
   - Level Up as I actually run it: categories, codes, points, the recalibration, opt-outs, and how it relates to everything above (is it the backbone or one layer?)
   - reports and the family loop: report anatomy, cadence, voice rules, playlists, piece kits, LessonMate makeups, "promises owed"

3. The weekly workflow, step by step: before a teaching day, in the lesson, after the lesson, the weekend studio run. Who does what (me, the student, the parent, Claude). Which artifacts each step produces.

4. The data model. Every entity I track (student, lesson, thread, card, routine, challenge, piece, quiz/rung result, report, promise, resource...), its fields with types and allowed values, and how they relate. Note which fields are teacher-only and which a student or parent may see.

5. Evidence and mastery. How I decide a student has really learned something ("Done when", in-lesson testing, recordings, rung clears, quiz gates). What a game or app result should and should NOT count as. How practice time should be credited.

6. What's working and what isn't. Pain points: what takes me the most time each week, what falls through the cracks, what students and parents don't use, where data is duplicated across Notion, Drive, Opus1 and paper.

7. Bravissimo's job. Given all of the above, what should this app be for me, for students at home, and for parents? Rank the features that would help most, from "must have" to "later". For each: who uses it, on what device, and which existing artifact or workflow it replaces or connects to (handout pack, day sheet, Weekly board, Notion, Opus1, YouTube playlists, the theory site). Say what the games should practice and how their results should flow into cards, rungs and challenges. Flag anything that should stay on paper or in Notion.

8. Cohesion with my other projects. List each existing project/artifact/site, what it does, and how Bravissimo should share its vocabulary, codes, design (fonts, colors) and data with it instead of duplicating it.

9. Open decisions I still need to make, phrased as short questions with the options.

Rules for the brief:
- Be specific and complete. Quote definitions, codes, enum values and numbers verbatim; mark anything you're inferring as "(inferred)".
- No student or parent names, ages, contact details or transcripts. Use invented examples like "Student A, age 9" — the app's code is public on GitHub.
- Prefer tables for codes, ladders, fields and enums.
- End with a one-paragraph summary of the system in plain words, as I'd explain it to a new teacher.
```

## What happens next

Bravissimo currently has a working foundation: four games (Note Rush, Rhythm Ladder from Subdivide, Interval Detective, Key Signatures), per-student scores, streaks, badges, a skills map, and a Level Up challenge tracker. The brief above decides what the app becomes on top of that, for example the weekly cards and "Done when" gates, the R and T ladders, threads, and the family loop.
