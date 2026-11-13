# Closed-loop looming-disc test

A small Python program for the looming assay:

- it tracks one mouse in real time from an overhead camera,
- you draw a **trigger zone** on the live image with the computer mouse,
- when the animal enters the zone it plays a **looming stimulus** on a second
  monitor: an expanding disc drawn by the program, a movie file, or a folder of images,
- it saves the position trace, the stimulus times and the camera video.

> **Status:** written and tested with a simulated mouse and a virtual screen.
> It has not yet been run with a real camera, a real second monitor or an
> animal, and only on Linux. See [What has been tested](#what-has-been-tested).

## Install

Python 3.9 or newer.

```bash
pip install -r requirements.txt
```

Run every command below from inside this `looming` folder.

## Try it first, without any equipment

```bash
python looming_test.py --demo
```

Two windows open: the tracking window with a fake mouse walking around, and a
grey preview of the stimulus. Then:

1. Click the tracking window once so that it receives the keyboard.
2. Press `Z`, click the corners of a zone on the image, press `Enter`.
3. Press `SPACE` to arm. The disc plays when the fake mouse walks into the zone.

To try your laptop's built-in webcam (normally camera 0) with the stimulus in a window:

```bash
python looming_test.py --camera 0 --windowed
```

Point the camera at a plain surface, press `B` with nothing on it, then move a
dark object into view and it will be tracked like a mouse.

## Running an experiment

1. Connect the stimulus monitor and set the desktop to **Extend** (not Duplicate).
2. Find the camera and monitor numbers:

   ```bash
   python looming_test.py --list-cameras
   ```

   ```bash
   python looming_test.py --list-displays
   ```

3. Copy `config.example.json` to e.g. `my_settings.json` and set at least
   `stimulus.screen_width_cm` (width of the lit part of the monitor) and
   `stimulus.viewing_distance_cm` (from the animal's head to the screen). The
   disc size in degrees is computed from these two numbers.
4. Start:

   ```bash
   python looming_test.py --camera 1 --display 1 --config my_settings.json --name mouse01
   ```

5. In the tracking window:
   - `B` with the arena **empty**, to store the background image.
   - `Z` and click the corners of the trigger zone; `Enter` to finish.
   - Optionally `A` to outline the arena, so that nothing outside it is tracked.
   - `T` to check the stimulus on the monitor.
   - Put the animal in. If it is not outlined reliably, press `M` to see what
     the tracker sees and adjust the threshold with `-` and `+`.
   - `SPACE` to arm.
6. `Q` twice to finish. The zones are remembered for the next run (`zones.json`).

## Keys

| Key | Action |
| --- | --- |
| `B` | Capture the background (arena must be empty) |
| `Z` | Draw the trigger zone |
| `A` | Draw the arena boundary (optional) |
| `C` | Clear both zones |
| `SPACE` | Arm / disarm automatic triggering |
| `T` | Play the stimulus now |
| `X` | Stop the stimulus |
| `M` | Show what the tracker sees (white = detected) |
| `-` `+` | Lower / raise the tracking threshold |
| `N` | Switch tracking method |
| `R` | Pause / resume the video recording |
| `H` | Hide / show the key list |
| `Q` `Q` | Quit |

While drawing a zone: click = add a corner; `Enter`, right-click, or a click on
the first corner = finish; `Backspace` = remove the last corner; `Esc` = cancel.

`Esc` in the stimulus window closes it. Use that if it ever covers the wrong
screen; then quit and restart with the right `--display`.

`T` while armed counts as a trial and restarts the cooldown. While not armed it
is only a test and changes nothing.

## When the stimulus starts

While armed, a stimulus starts when **all** of these hold:

- the animal has been seen **outside** the zone since arming or since the last stimulus,
- it has then been **inside** the zone continuously for `trigger.dwell_s`,
- `trigger.cooldown_s` has passed since the last stimulus,
- fewer than `trigger.max_trials` stimuli have been shown,
- no stimulus is playing.

"Inside" means that the centre of the tracked blob is inside the zone. An
animal that entered during the cooldown and is still there when it ends does
trigger; set `trigger.require_fresh_entry` to `true` if it should have to leave
and come back. If the animal is invisible for more than
`trigger.lost_counts_as_outside_after_s` (e.g. in an opaque shelter) it counts
as having left; shorter tracking dropouts do not.

## Stimulus

**Expanding disc** (default). A dark disc on a grey screen grows from
`start_size` to `end_size` (diameters, in degrees of visual angle) in
`expand_s`, stays for `hold_s`, disappears for `isi_s`, and this repeats
`repeats` times. The defaults (2° to 20° in 0.25 s, 0.25 s hold, 0.5 s gap,
15 repeats) are modelled on the widely used Yilmaz & Meister (2013) protocol;
check them against the protocol you are following before collecting data.
`profile: "approach"` makes the disc grow like an object approaching at
constant speed instead of linearly. `units: "px"` gives sizes in pixels.

**Movie:**

```bash
python looming_test.py --movie my_loom.mp4
```

**Image sequence** (files are played in numeric order, e.g. `loom1.png`, `loom2.png`, ...):

```bash
python looming_test.py --images my_loom_frames
```

Movies and images are centred and scaled to fit the screen (`fit`: `contain`,
`cover`, `stretch`, or `none` for their own pixel size), and can be repeated
with a gap (`repeats`, `isi_s`). Between stimuli the screen shows
`background_color`.

## Settings

Everything in `config.example.json` can be changed; pass your copy with
`--config`. A file only needs the settings you want to change. The main ones:

| Setting | Meaning |
| --- | --- |
| `camera.source`, `width`, `height`, `fps` | Camera number and the image format to ask it for |
| `tracking.method` | `background`: anything that differs from the empty-arena image. `dark` / `light`: a dark animal on a light floor, or the reverse; no empty-arena image needed |
| `tracking.diff_threshold` | `background` method: how much a pixel must differ (0-255) |
| `tracking.intensity_threshold` | `dark` / `light` methods: grey level separating animal and floor |
| `tracking.min_area_px`, `max_area_px` | Blobs outside this size are ignored. The panel shows the current blob size |
| `trigger.*` | See [When the stimulus starts](#when-the-stimulus-starts) |
| `stimulus.display`, `fullscreen` | Which monitor; fullscreen or a window |
| `stimulus.screen_width_cm`, `viewing_distance_cm` | Geometry used to convert degrees to pixels |
| `stimulus.loom`, `movie`, `images` | See [Stimulus](#stimulus) |
| `stimulus.sync_patch` | A square in a screen corner that is white while the stimulus is visible, for a photodiode |
| `output.dir`, `record_video` | Where sessions are saved; whether to record |

## What is saved

Each run creates `sessions/<date>_<time>_<name>/` with:

- `tracking.csv` - one row per camera frame: `t_s` (seconds since start), `x`,
  `y` (pixels), `area_px`, `detected`, `in_zone`, `armed`, `stim_on`, and
  `video_frame` (the matching frame in the video).
- `events.csv` - `armed`, `trigger`, `stim_onset`, `stim_offset`, zone changes
  and so on, with times on the same clock. `stim_onset` gives
  `after_frame_ms`: the time from the camera frame that caused the trigger to
  the first stimulus frame being sent to the screen. `stim_offset` gives the
  number of stimulus frames and how many were late (`long_frames`).
- `video.mp4` - the raw camera image. It is written at a fixed frame rate, so
  use `t_s` in `tracking.csv` for timing, not the video's own clock.
- `background.png`, `session.json` (all settings and zones used).

## Practical notes

- **Lighting.** The monitor changes the light in the arena when the disc
  appears, which can upset tracking during the stimulus. The usual solution is
  infrared lighting with a camera that only sees infrared. Fixed camera
  exposure (no auto-exposure) also helps the `background` method.
- **Latency.** The logged latency does not include the camera's own delay or
  the monitor's. To measure the true delay, enable `sync_patch`, put a
  photodiode on it and compare with the animal's position or an LED in view.
- **One animal.** The tracker follows the single largest blob.

## What has been tested

Automated tests (`python -m pytest tests`) cover the tracker, the trigger
rules, the disc geometry and timing, the stimulus window with disc, movie and
image stimuli, and complete runs of the program with a simulated camera and a
scripted user. The real windows were also run on a virtual screen: drawing
zones by clicking, background capture, arming, automatic triggering, fullscreen
mode and a 1080p video file as the camera.

Not tested: a physical camera, a physical second monitor (including vertical
sync and real display timing), Windows and macOS, and real animals. Expect to
tune the tracking thresholds for your arena, and please check the stimulus
timing on your own monitor before relying on it.
