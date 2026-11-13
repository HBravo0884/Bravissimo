"""The experiment itself: camera, tracking, the stimulus window and the sessions.

There is no user interface in this module. The control page (webui.py) asks the
engine to do things with ``request()`` and reads what is going on with
``snapshot()`` and ``preview()``.
"""
from __future__ import annotations

import collections
import csv
import datetime
import json
import math
import multiprocessing as mp
import os
import queue
import subprocess
import sys
import threading
import time
import traceback

import cv2
import numpy as np

import core
import stimulus
from core import fmt_elapsed, now

# Colours are BGR.
RED = (70, 70, 255)
COL_ARENA, COL_ZONE, COL_ZONE_HOT = (0, 215, 255), (90, 230, 90), (70, 70, 255)
COL_MOUSE, COL_TRAIL = (255, 200, 0), (255, 160, 60)

BACKENDS = {
    "any": cv2.CAP_ANY, "dshow": cv2.CAP_DSHOW, "msmf": cv2.CAP_MSMF,
    "v4l2": cv2.CAP_V4L2, "avfoundation": cv2.CAP_AVFOUNDATION,
}


class Refused(Exception):
    """Something the user asked for cannot be done right now; the message is shown to them."""


def backends_to_try(name: str):
    if name != "auto":
        return [BACKENDS[name]]
    # DirectShow opens faster and with less lag than the Windows default.
    return [cv2.CAP_DSHOW, cv2.CAP_ANY] if sys.platform == "win32" else [cv2.CAP_ANY]


# --------------------------------------------------------------------------
# Cameras
# --------------------------------------------------------------------------

class LiveCamera:
    """A camera read by a background thread, so read() always returns the newest frame."""

    live = True

    def __init__(self, settings: dict):
        index = settings["source"]
        for backend in backends_to_try(settings["backend"]):
            self.cap = cv2.VideoCapture(index, backend)
            if self.cap.isOpened():
                break
            self.cap.release()
        else:
            raise RuntimeError(
                f"Could not open camera {index}. Check that it is plugged in and not used by another "
                "program, or find its number with:  python looming_test.py --list-cameras"
            )
        if settings.get("fourcc"):
            self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*settings["fourcc"]))
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, settings["width"])
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, settings["height"])
        self.cap.set(cv2.CAP_PROP_FPS, settings["fps"])
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        ok, frame = self.cap.read()
        if not ok:
            self.cap.release()
            raise RuntimeError(f"Camera {index} opened but did not return an image.")
        self.height, self.width = frame.shape[:2]
        fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.fps = fps if 1 <= fps <= 1000 else float(settings["fps"])
        self.dropped = 0
        self._frame, self._t, self._count, self._taken = frame, now(), 1, 0
        self._stop = False
        self._cond = threading.Condition()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        while not self._stop:
            ok, frame = self.cap.read()
            t = now()
            if not ok:
                time.sleep(0.01)
                continue
            with self._cond:
                self._frame, self._t = frame, t
                self._count += 1
                self._cond.notify_all()

    def read(self, timeout: float = 0.25):
        """Wait for a frame that has not been returned yet: (ok, frame, time it was grabbed)."""
        with self._cond:
            if not self._cond.wait_for(lambda: self._count != self._taken, timeout):
                return False, None, now()
            self.dropped += self._count - self._taken - 1
            self._taken = self._count
            return True, self._frame, self._t

    def release(self) -> None:
        self._stop = True
        self._thread.join(timeout=2.0)
        self.cap.release()


class FileCamera:
    """A video file played at its own frame rate, as if it were a camera."""

    live = False

    def __init__(self, path: str):
        if not os.path.isfile(path):
            raise RuntimeError(f"Video file not found: {path}")
        self.cap = cv2.VideoCapture(path)
        if not self.cap.isOpened():
            raise RuntimeError(f"Could not open the video file {path}")
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.dropped = 0
        self._n = 0
        self._t_start = None

    def read(self):
        ok, frame = self.cap.read()
        if not ok:
            return False, None, now()
        if self._t_start is None:
            self._t_start = now()
        delay = self._t_start + self._n / self.fps - now()
        if delay > 0:
            time.sleep(delay)
        self._n += 1
        return True, frame, now()

    def release(self) -> None:
        self.cap.release()


def open_camera(settings: dict):
    source = settings["source"]
    if source == "demo":
        return core.SyntheticCamera(fps=settings["fps"])
    if isinstance(source, str):
        return FileCamera(source)
    return LiveCamera(settings)


def list_cameras(backend_name: str = "auto", limit: int = 6) -> None:
    print("Looking for cameras (messages about cameras that do not exist can be ignored)...")
    found = False
    for index in range(limit):
        cap = cv2.VideoCapture(index, backends_to_try(backend_name)[0])
        ok, frame = cap.read() if cap.isOpened() else (False, None)
        cap.release()
        if ok:
            found = True
            print(f"  camera {index}: {frame.shape[1]} x {frame.shape[0]}")
    if not found:
        print("  no camera found")


def list_displays() -> None:
    import pygame

    pygame.display.init()
    for index, (w, h) in enumerate(pygame.display.get_desktop_sizes()):
        print(f"  display {index}: {w} x {h}")
    pygame.display.quit()


# --------------------------------------------------------------------------
# Stimulus process
# --------------------------------------------------------------------------

class StimulusClient:
    """Starts the stimulus window in its own process and talks to it."""

    def __init__(self, settings: dict):
        ctx = mp.get_context("spawn")
        self.cmd_q = ctx.Queue()
        self.evt_q = ctx.Queue()
        self.proc = ctx.Process(target=stimulus.run, args=(settings, self.cmd_q, self.evt_q), daemon=True)
        self.proc.start()
        self.active = None   # the stimulus that has been requested and has not ended yet
        self.on = False      # between its onset and its offset

    def wait_ready(self, timeout: float = 30.0) -> dict:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                event = self.evt_q.get(timeout=0.2)
            except queue.Empty:
                if not self.proc.is_alive():
                    raise RuntimeError("The stimulus window stopped while starting up.")
                continue
            if event["evt"] == "ready":
                return event
            if event["evt"] == "error":
                raise RuntimeError("Stimulus window: " + event["msg"])
        raise RuntimeError("The stimulus window did not start in time.")

    def alive(self) -> bool:
        return self.proc.is_alive()

    def send(self, **command) -> None:
        self.cmd_q.put(command)

    def poll(self) -> list:
        events = []
        while True:
            try:
                events.append(self.evt_q.get_nowait())
            except queue.Empty:
                return events

    def close(self) -> None:
        if self.proc.is_alive():
            self.send(cmd="quit")
            self.proc.join(timeout=3.0)
        if self.proc.is_alive():
            self.proc.terminate()
        self.cmd_q.cancel_join_thread()


# --------------------------------------------------------------------------
# Session files
# --------------------------------------------------------------------------

class Session:
    """One animal's session: a folder with looms.csv, tracking.csv, events.csv, the video and the settings."""

    LOOM_COLUMNS = ["loom", "type", "onset_s", "onset_mm_ss", "clock_time", "trigger_s", "delay_ms", "x", "y"]

    def __init__(self, out_dir: str, animal: dict, duration_s: float):
        self.animal = dict(animal)
        self.animal_id = next(iter(self.animal.values()))
        self.duration_s = duration_s
        self.started = datetime.datetime.now()
        base = os.path.join(out_dir, f"{self.started:%Y-%m-%d_%H-%M-%S}_{core.safe_name(self.animal_id)}")
        self.dir, attempt = base, 1
        while os.path.exists(self.dir):
            attempt += 1
            self.dir = f"{base}_{attempt}"
        os.makedirs(self.dir)
        self.t0 = now()              # session time zero
        self.looms = []              # one row (dict) per loom that was shown
        self.loom_count = 0          # looms triggered, including one not on screen yet
        self.frames = 0
        self.video_frames = 0

        self._loom_file = open(os.path.join(self.dir, "looms.csv"), "w", newline="")
        self._looms = csv.DictWriter(self._loom_file, self.LOOM_COLUMNS)
        self._looms.writeheader()
        self._loom_file.flush()
        self._track_file = open(os.path.join(self.dir, "tracking.csv"), "w", newline="")
        self._track = csv.writer(self._track_file)
        self._track.writerow(["frame", "t_s", "detected", "x", "y", "area_px",
                              "in_zone", "armed", "stim_on", "video_frame"])
        self._event_file = open(os.path.join(self.dir, "events.csv"), "w", newline="")
        self._events = csv.writer(self._event_file)
        self._events.writerow(["t_s", "event", "loom", "x", "y", "details"])
        self._last_flush = self.t0

    def log_frame(self, t, det, in_zone, armed, stim_on, video_frame) -> None:
        x = f"{det.x:.1f}" if det.found else ""
        y = f"{det.y:.1f}" if det.found else ""
        self._track.writerow([self.frames, f"{t:.4f}", int(det.found), x, y, f"{det.area:.0f}",
                              int(in_zone), int(armed), int(stim_on), video_frame])
        self.frames += 1
        if now() - self._last_flush > 1.0:
            self._track_file.flush()
            self._last_flush = now()

    def log_event(self, event: str, loom="", det=None, details: dict | None = None, t=None) -> None:
        t = now() - self.t0 if t is None else t
        x = f"{det.x:.1f}" if det is not None and det.found else ""
        y = f"{det.y:.1f}" if det is not None and det.found else ""
        self._events.writerow([f"{t:.4f}", event, loom, x, y, json.dumps(details) if details else ""])
        self._event_file.flush()
        extra = "  " + ", ".join(f"{k}={v}" for k, v in details.items()) if details else ""
        print(f"[{fmt_elapsed(t):>6}] {event}{' ' + str(loom) if loom != '' else ''}{extra}")

    def add_loom(self, stim: dict, t_onset: float) -> dict:
        """Save the time at which a loom appeared on the screen."""
        onset_s = t_onset - self.t0
        clock = self.started + datetime.timedelta(seconds=onset_s)
        row = {
            "loom": stim["loom"],
            "type": stim["label"],
            "onset_s": round(onset_s, 3),
            "onset_mm_ss": core.format_clock(onset_s),
            "clock_time": clock.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
            "trigger_s": round(stim["t_sent"] - self.t0, 3),
            "delay_ms": round((t_onset - stim["t_frame"]) * 1000, 1),
            "x": stim["x"],
            "y": stim["y"],
        }
        self.looms.append(row)
        self._looms.writerow(row)
        self._loom_file.flush()
        return row

    def close(self) -> None:
        for f in (self._loom_file, self._track_file, self._event_file):
            f.close()


# --------------------------------------------------------------------------
# The engine
# --------------------------------------------------------------------------

# Settings that can be changed while the program runs. Everything else is read
# from the settings file when the program starts.
_EDITABLE = {
    "session": {"duration_min", "acclimation_min"},
    "trigger": {"dwell_s", "downtime_s", "max_looms", "entry_rule"},
    "tracking": {"method", "polarity", "diff_threshold", "intensity_threshold", "min_area_px", "max_area_px"},
    "stimulus": {"screen_width_cm", "viewing_distance_cm", "background_color", "loom"},
    "output": {"record_video"},
}


def _deep_update(target: dict, patch: dict) -> None:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_update(target[key], value)
        else:
            target[key] = value


class Engine:
    def __init__(self, cfg: dict, settings_path: str | None = None):
        self.cfg = cfg
        self.settings_path = settings_path   # where changes made on the control page are saved
        self.session = None          # the running Session, if any
        self.trig = None             # its TriggerLogic
        self.completed = []          # summaries of the sessions finished since the program started
        self.stim = self.cam = self.writer = None
        self.zones = {"arena": None, "trigger": None}
        self.arena_mask = None
        self.bg_frames = None        # list being filled while a background is captured
        self.trail = collections.deque(maxlen=60)
        self.mask_view = False
        self.recording = False
        self.stim_count = 0
        self.fps = 0.0
        self.running = True
        self._camera_ok = True
        self._last_frame_t = None
        self._det = core.Detection()
        self._commands = queue.Queue()
        self._message = {"id": 0, "text": "", "level": "info"}
        self._state = {}
        self._preview = (0, b"")
        self._preview_cond = threading.Condition()
        self._preview_wanted = -math.inf
        self._preview_made = -math.inf

    # ---- start / stop ----------------------------------------------------

    def start(self) -> None:
        out = self.cfg["output"]
        self.stim = StimulusClient(self.cfg["stimulus"])
        ready = self.stim.wait_ready()
        self.stim_info = {k: v for k, v in ready.items() if k not in ("evt", "t")}
        w, h = self.stim_info["screen_size"]
        print(f"Stimulus window: {w} x {h} at {self.stim_info['refresh_hz']:.1f} Hz"
              f"{'' if self.stim_info['vsync'] else ' (no vertical sync)'}, {self.stim_info['description']}")

        self.cam = open_camera(self.cfg["camera"])
        self.frame_size = (self.cam.width, self.cam.height)
        print(f"Camera: {self.cam.width} x {self.cam.height} at {self.cam.fps:.0f} fps")
        print(f"Plan: {self.plan()}. Results go in: {os.path.abspath(out['dir'])}")

        self.tracker = core.MouseTracker(self.cfg["tracking"])
        try:
            self.zones = core.load_zones(out["zones_file"], self.frame_size)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            print(f"WARNING: could not read {out['zones_file']} ({exc}); draw the zones again.")
        self._rebuild_masks()
        self._publish_state(0.0)

    def close(self) -> None:
        self.running = False
        if self.session is not None:
            try:
                self._end_session("program closed")
            except Exception as exc:  # keep shutting down: the per-session files are already on disk
                print(f"WARNING: the session could not be closed cleanly: {exc}")
        if self.stim is not None:
            self.stim.close()
        if self.cam is not None:
            self.cam.release()
        with self._preview_cond:
            self._preview_cond.notify_all()

    def plan(self) -> str:
        text = (f"{self.cfg['session']['duration_min']:g}-minute session, "
                f"{self.cfg['trigger']['downtime_s']:g} s downtime after each loom")
        if self.cfg["session"]["acclimation_min"]:
            text += f", {self.cfg['session']['acclimation_min']:g} min acclimation"
        return text

    # ---- the loop --------------------------------------------------------

    def run(self) -> None:
        while self.running:
            self.step()

    def step(self) -> None:
        """Handle requests from the control page, then one camera frame."""
        self._run_commands()
        if not self.running:
            return
        ok, frame, t_frame = self.cam.read()
        if not ok:
            if not self.cam.live:
                print("End of the video file.")
                self.running = False
                return
            self._camera_ok = False
            self._poll_stimulus()
            self._check_session_end(self._session_time(now()))
            self._publish_state(self._session_time(now()))
            return
        self._camera_ok = True
        if self._last_frame_t is not None and t_frame > self._last_frame_t:
            rate = 1.0 / (t_frame - self._last_frame_t)
            self.fps = rate if self.fps == 0 else 0.9 * self.fps + 0.1 * rate
        self._last_frame_t = t_frame

        self._collect_background(frame)
        det = self.tracker.detect(frame, self.arena_mask)
        zone = self.zones["trigger"]
        in_zone = bool(det.found and zone and core.point_in_polygon(det.x, det.y, zone))
        t = self._session_time(t_frame)

        # Decide about the stimulus before doing anything slow (saving, drawing).
        self._poll_stimulus()
        if self.session is not None and t < self.session.duration_s:
            if self.trig.update(t, det.found, in_zone, busy=self.stim.active is not None):
                self._fire("auto", t_frame, det)
        self._check_session_end(t)

        session = self.session
        if session is not None:
            video_frame = ""
            if self.recording and self.writer is not None:
                self.writer.write(frame)
                video_frame = session.video_frames
                session.video_frames += 1
            session.log_frame(t, det, in_zone, self.trig.armed, self.stim.on, video_frame)
        if det.found:
            self.trail.append((int(det.x), int(det.y)))
        self._det = det
        self._publish_state(t)
        self._make_preview(frame, det, in_zone)

    def _session_time(self, t_abs: float) -> float:
        return max(0.0, t_abs - self.session.t0) if self.session is not None else 0.0

    def _check_session_end(self, t: float) -> None:
        """End the session once its time is up (after a loom that is still playing)."""
        if self.session is not None and t >= self.session.duration_s and self.stim.active is None:
            self._end_session("completed")

    # ---- requests from the control page ---------------------------------------

    def request(self, action: str, data: dict | None = None, timeout: float = 5.0) -> dict:
        """Ask the engine to do something, from any thread; returns {"ok": ..., "error": ...}."""
        done, box = threading.Event(), {}
        self._commands.put((action, data or {}, box, done))
        if not done.wait(timeout):
            return {"ok": False, "error": "The program did not answer in time"}
        return box["result"]

    def execute(self, action: str, data: dict | None = None) -> dict:
        """Do something now. Only call this from the thread that runs step()."""
        handler = getattr(self, "do_" + action, None)
        if handler is None:
            return {"ok": False, "error": f"Unknown action: {action}"}
        try:
            return {"ok": True, **(handler(data or {}) or {})}
        except Refused as exc:
            return {"ok": False, "error": str(exc)}
        except Exception as exc:
            traceback.print_exc()
            return {"ok": False, "error": f"Something went wrong: {exc}"}
        finally:
            # So that the page sees the result as soon as it has its answer.
            self._publish_state(self._session_time(now()))

    def _run_commands(self) -> None:
        while True:
            try:
                action, data, box, done = self._commands.get_nowait()
            except queue.Empty:
                return
            box["result"] = self.execute(action, data)
            done.set()

    def say(self, text: str, level: str = "info") -> None:
        """A short notice for the control page."""
        self._message = {"id": self._message["id"] + 1, "text": text, "level": level}

    def _triggering(self) -> bool:
        return self.session is not None and self.trig.armed

    def _require_ready(self) -> None:
        if not self.zones["trigger"]:
            raise Refused("Draw a trigger zone first")
        if self.tracker.needs_background:
            raise Refused("Capture a background first, with the arena empty")
        if not self.stim.alive():
            raise Refused("The stimulus window is not running. Restart the program.")

    def do_capture_background(self, data: dict) -> None:
        if self._triggering():
            raise Refused("Pause triggering before capturing a new background")
        self.cfg["tracking"]["method"] = "background"
        self.bg_frames = []

    def do_set_zone(self, data: dict) -> None:
        kind = data.get("kind")
        points = data.get("points")
        if kind not in ("trigger", "arena"):
            raise Refused("Unknown kind of zone")
        if self._triggering():
            raise Refused("Pause triggering before changing a zone")
        try:
            w, h = self.frame_size
            zone = [[int(min(max(round(float(x)), 0), w - 1)), int(min(max(round(float(y)), 0), h - 1))]
                    for x, y in points]
        except (TypeError, ValueError):
            raise Refused("The zone could not be read")
        if len(zone) < 3:
            raise Refused("A zone needs at least 3 corners")
        self.zones[kind] = zone
        self._zones_changed("zone_set", {"zone": kind, "points": zone})
        self.say("Trigger zone saved" if kind == "trigger" else "Arena boundary saved")

    def do_clear_zones(self, data: dict) -> None:
        if self._triggering():
            raise Refused("Pause triggering before changing a zone")
        self.zones = {"arena": None, "trigger": None}
        self._zones_changed("zones_cleared")
        self.say("Zones cleared")

    def do_start_session(self, data: dict) -> None:
        if self.session is not None:
            raise Refused("A session is already running")
        fields = self.cfg["session"]["animal_fields"]
        given = data.get("animal")
        if not isinstance(given, dict):
            given = {}
        animal = {field: str(given.get(field) or "").strip()[:200] for field in fields}
        if not animal[fields[0]]:
            raise Refused(f"Enter the {fields[0]} first")
        self._require_ready()
        if self.stim.active is not None:
            raise Refused("Wait for the stimulus to finish")

        duration_s = float(self.cfg["session"]["duration_min"]) * 60.0
        self.session = Session(self.cfg["output"]["dir"], animal, duration_s)
        self.trig = core.TriggerLogic(**self.cfg["trigger"],
                                      acclimation_s=float(self.cfg["session"]["acclimation_min"]) * 60.0)
        self.trig.arm()
        self.trail.clear()
        if self.tracker.background is not None:
            cv2.imwrite(os.path.join(self.session.dir, "background.png"), self.tracker.background)
        self.recording = bool(self.cfg["output"]["record_video"]) and self._open_writer()
        self._write_session_file()
        print()
        self.session.log_event("session_started", t=0.0, details={"animal": self.session.animal_id,
                                                                 "plan": self.plan()})

    def do_pause(self, data: dict) -> None:
        if self.session is None:
            raise Refused("No session is running")
        self._pause("button")

    def do_resume(self, data: dict) -> None:
        if self.session is None:
            raise Refused("No session is running")
        self._require_ready()
        if not self.trig.armed:
            self.trig.arm()
            self.session.log_event("triggering_resumed")

    def do_end_session(self, data: dict) -> None:
        if self.session is None:
            raise Refused("No session is running")
        self._end_session("stopped early")

    def do_test_stimulus(self, data: dict) -> None:
        """Play the stimulus now. During a session it is a (manual) loom."""
        if self.stim.active:
            raise Refused("A stimulus is already playing")
        if not self.stim.alive():
            raise Refused("The stimulus window is not running. Restart the program.")
        t_frame = now()
        if self.session is not None:  # shown to the animal: a loom, and the downtime restarts
            self.trig.note_loom(self._session_time(t_frame))
            self._fire("manual", t_frame, self._det)
        else:
            self._fire("test", t_frame, self._det)

    def do_stop_stimulus(self, data: dict) -> None:
        if self.stim.active:
            self.stim.send(cmd="abort")

    def do_mask_view(self, data: dict) -> None:
        self.mask_view = bool(data.get("on"))

    def do_settings(self, patch: dict) -> None:
        if not isinstance(patch, dict) or not patch:
            raise Refused("Nothing to change")
        for section, values in patch.items():
            allowed = _EDITABLE.get(section)
            if allowed is None or not isinstance(values, dict) or not set(values) <= allowed:
                raise Refused("That setting can only be changed in the settings file (then restart the program)")
        if self.session is not None and set(patch) != {"tracking"}:
            raise Refused("Only the tracking settings can be changed during a session")
        new_cfg, unknown = core.merge_config(self.cfg, patch)
        if unknown:
            raise Refused(f"Unknown setting: {unknown[0]}")
        try:
            core.validate_config(new_cfg)
        except (ValueError, TypeError, KeyError) as exc:
            raise Refused(str(exc))
        stimulus_changed = new_cfg["stimulus"] != self.cfg["stimulus"]
        if stimulus_changed and self.stim.active is not None:
            raise Refused("Wait for the stimulus to finish")

        self.cfg = new_cfg
        self.tracker.settings = new_cfg["tracking"]
        if stimulus_changed:
            self.stim.send(cmd="configure", cfg=new_cfg["stimulus"])
        saved = self._save_settings(patch)
        if set(patch) != {"tracking"} or len(patch["tracking"]) > 1:
            self.say("Settings applied" if saved else "Settings applied for this run (not saved)")

    def _save_settings(self, patch: dict) -> bool:
        if not self.settings_path:
            return False
        try:
            stored = {}
            if os.path.isfile(self.settings_path):
                with open(self.settings_path) as f:
                    stored = json.load(f)
            _deep_update(stored, patch)
            with open(self.settings_path, "w") as f:
                json.dump(stored, f, indent=2)
                f.write("\n")
            return True
        except (OSError, ValueError) as exc:
            print(f"WARNING: could not save the settings to {self.settings_path}: {exc}")
            return False

    def do_open_results(self, data: dict) -> None:
        path = os.path.abspath(self.cfg["output"]["dir"])
        os.makedirs(path, exist_ok=True)
        try:
            if sys.platform == "win32":
                os.startfile(path)  # noqa: only exists on Windows
            else:
                subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", path])
        except OSError:
            raise Refused(f"Could not open the folder. It is: {path}")

    def do_quit(self, data: dict) -> None:
        self.running = False

    # ---- sessions --------------------------------------------------------

    def _pause(self, reason: str) -> None:
        """Stop automatic looms; the session clock keeps running."""
        if self._triggering():
            self.trig.disarm()
            self.session.log_event("triggering_paused", details={"reason": reason})

    def _end_session(self, reason: str) -> None:
        session = self.session
        ran_s = now() - session.t0
        if reason == "completed":
            ran_s = min(ran_s, session.duration_s)
        if self.stim.active is not None:
            self.stim.send(cmd="abort")
        self.trig.disarm()
        session.log_event("session_ended", details={"reason": reason, "looms": len(session.looms)})
        if self.writer is not None:
            self.writer.release()
            self.writer = None
        self.recording = False
        self._write_session_file(ended=reason, ran_s=ran_s)
        session.close()
        self.session = self.trig = None

        # Add this session to the tables that collect all animals.
        out_dir = self.cfg["output"]["dir"]
        folder = os.path.basename(session.dir)
        common = dict(session.animal, date=f"{session.started:%Y-%m-%d}")
        summary = dict(common, start_time=f"{session.started:%H:%M:%S}",
                       planned_min=round(session.duration_s / 60.0, 2), ran_min=round(ran_s / 60.0, 2),
                       ended=reason, looms=len(session.looms),
                       loom_onsets_s="; ".join(f"{row['onset_s']:.1f}" for row in session.looms),
                       downtime_s=self.cfg["trigger"]["downtime_s"], folder=folder)
        shown = ("loom", "type", "onset_s", "onset_mm_ss", "clock_time", "x", "y")
        loom_rows = [dict(common, folder=folder, **{k: row[k] for k in shown}) for row in session.looms]
        warning = ""
        for name, rows in (("all_sessions.csv", [summary]), ("all_looms.csv", loom_rows)):
            path = os.path.join(out_dir, name)
            written = core.append_rows(path, rows)
            if written != path:
                warning = (f"{name} could not be written (is it open in Excel?). "
                           f"This session's rows are in {os.path.basename(written)} instead.")
                print("WARNING: " + warning)

        times = ", ".join(fmt_elapsed(row["onset_s"]) for row in session.looms) or "none"
        print(f"\nSession ended ({reason}) - {session.animal_id}: {len(session.looms)} loom(s) at: {times}")
        print(f"Saved in: {os.path.abspath(session.dir)}\n")
        self.completed.append({
            "animal_id": session.animal_id, "start_time": f"{session.started:%H:%M}",
            "ran_min": round(ran_s / 60.0, 1), "looms": len(session.looms), "ended": reason, "folder": folder,
        })
        if warning:
            self.say(warning, "warn")
        else:
            self.say(f"Session saved: {session.animal_id}, {len(session.looms)} loom(s)")

    def _write_session_file(self, ended: str = "", ran_s: float | None = None) -> None:
        session = self.session
        data = {
            "animal": session.animal,
            "started": session.started.isoformat(timespec="seconds"),
            "ended": ended or "still running",
            "planned_s": session.duration_s,
            "ran_s": None if ran_s is None else round(ran_s, 1),
            "looms": session.looms,
            "frames": session.frames,
            "frame_size": list(self.frame_size),
            "camera_fps": self.cam.fps,
            "zones": self.zones,
            "stimulus_window": self.stim_info,
            "config": self.cfg,
        }
        with open(os.path.join(session.dir, "session.json"), "w") as f:
            json.dump(data, f, indent=2)

    def _open_writer(self) -> bool:
        for extension, code in ((".mp4", "mp4v"), (".avi", "MJPG")):
            path = os.path.join(self.session.dir, "video" + extension)
            writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*code), float(self.cam.fps), self.frame_size)
            if writer.isOpened():
                self.writer = writer
                return True
            writer.release()
        print("WARNING: could not start the video recording (no usable video codec).")
        self.say("The video could not be recorded (no usable video codec)", "warn")
        return False

    # ---- stimulus --------------------------------------------------------

    def _fire(self, label: str, t_frame: float, det) -> None:
        """Start the stimulus. During a session it is a loom and its time is saved."""
        self.stim_count += 1
        t_sent = now()
        self.stim.send(cmd="trigger", stim_id=self.stim_count, label=label)
        duration = self.stim_info.get("duration_s") or 120.0
        stim = {"stim_id": self.stim_count, "label": label, "t_sent": t_sent, "t_frame": t_frame,
                "deadline": t_sent + duration + 5.0, "loom": None,
                "x": round(det.x, 1) if det.found else "", "y": round(det.y, 1) if det.found else ""}
        if self.session is not None:
            self.session.loom_count += 1
            stim["loom"] = self.session.loom_count
            self.session.log_event("trigger", stim["loom"], det, t=t_sent - self.session.t0, details={
                "type": label, "frame_age_ms": round((t_sent - t_frame) * 1000, 1)})
        self.stim.active = stim

    def _poll_stimulus(self) -> None:
        session = self.session
        for event in self.stim.poll():
            kind = event["evt"]
            stim = self.stim.active
            mine = stim is not None and stim["stim_id"] == event.get("stim_id")
            is_loom = mine and stim["loom"] is not None and session is not None
            if kind == "onset":
                self.stim.on = True
                if is_loom:
                    row = session.add_loom(stim, event["t"])
                    session.log_event("stim_onset", row["loom"], t=row["onset_s"], details={
                        "type": stim["label"], "after_frame_ms": row["delay_ms"],
                        "after_trigger_ms": round((event["t"] - stim["t_sent"]) * 1000, 1)})
            elif kind == "offset":
                self.stim.on = False
                if is_loom:
                    session.log_event("stim_offset", stim["loom"], t=event["t"] - session.t0, details={
                        "frames": event["frames"], "long_frames": event["long_frames"], "aborted": event["aborted"]})
                if mine:
                    self.stim.active = None
            elif kind == "busy":
                if mine:
                    self.stim.active = None
            elif kind == "configured":
                self.stim_info["description"] = event["description"]
                self.stim_info["duration_s"] = event["duration_s"]
            elif kind == "config_error":
                self.say("The stimulus settings could not be applied: " + event["msg"], "warn")
            elif kind == "closed":
                self._note("stimulus_window_closed")
            elif kind == "error":
                self._note("stimulus_error", {"message": event["msg"]})

        stim = self.stim.active
        if stim and (not self.stim.alive() or now() > stim["deadline"]):
            self.stim.active, self.stim.on = None, False
        if self._triggering() and not self.stim.alive():
            self._pause("stimulus window is not running")
            self.say("Triggering paused: the stimulus window is not running", "warn")

    def _note(self, event: str, details: dict | None = None) -> None:
        """Record something that happened: in the session's event list, or on the console."""
        if self.session is not None:
            self.session.log_event(event, details=details)
        elif event.startswith("stimulus"):
            print(f"{event}{': ' + str(details) if details else ''}")

    # ---- zones and background ----------------------------------------------

    def _zones_changed(self, event: str, details: dict | None = None) -> None:
        self._rebuild_masks()
        self._note(event, details)
        if self.session is not None:
            self._write_session_file()
        try:
            core.save_zones(self.cfg["output"]["zones_file"], self.zones, self.frame_size)
        except OSError as exc:
            print(f"WARNING: could not save the zones to {self.cfg['output']['zones_file']}: {exc}")

    def _rebuild_masks(self) -> None:
        arena = self.zones["arena"]
        self.arena_mask = core.polygon_mask(self.frame_size, arena) if arena else None

    def _collect_background(self, frame) -> None:
        if self.bg_frames is None:
            return
        self.bg_frames.append(frame)
        if len(self.bg_frames) >= int(self.cfg["tracking"]["background_frames"]):
            self.tracker.set_background(self.bg_frames)
            self.bg_frames = None
            if self.session is not None:
                cv2.imwrite(os.path.join(self.session.dir, "background.png"), self.tracker.background)
            self._note("background_captured")
            self.say("Background captured")

    # ---- what the control page shows ------------------------------------------

    def snapshot(self) -> dict:
        """The current situation, as plain data (read-only: a new one is made for every frame)."""
        return self._state

    def _publish_state(self, t: float) -> None:
        tracking, det, session = self.cfg["tracking"], self._det, self.session
        state = {
            "mode": "setup" if session is None else ("running" if self.trig.armed else "paused"),
            "stimulus_on": self.stim.on,
            "message": self._message,
            "plan": self.plan(),
            "frame_size": list(self.frame_size),
            "camera_ok": self._camera_ok,
            "zones": self.zones,
            "checks": {
                "stimulus": self.stim.alive(),
                "background": None if tracking["method"] != "background" else not self.tracker.needs_background,
                "capturing_background": self.bg_frames is not None,
                "zone": bool(self.zones["trigger"]),
                "mouse": bool(det.found),
            },
            "tracking": {
                "found": bool(det.found),
                "x": round(det.x) if det.found else None,
                "y": round(det.y) if det.found else None,
                "area": round(det.area) if det.found else None,
                "fps": round(self.fps, 1),
                "mask_view": self.mask_view,
            },
            "stimulus": dict(self.stim_info, display=self.cfg["stimulus"]["display"],
                             fullscreen=self.cfg["stimulus"]["fullscreen"], mode=self.cfg["stimulus"]["mode"]),
            "session": None,
            "completed": self.completed,
            "results_dir": os.path.abspath(self.cfg["output"]["dir"]),
            "settings": self.cfg,
            "settings_saved": bool(self.settings_path),
        }
        if session is not None:
            state["session"] = {
                "animal_id": session.animal_id,
                "animal": session.animal,
                "t": round(t, 1),
                "duration_s": session.duration_s,
                "looms": session.looms,
                "status": self.trig.status(t) if self.trig.armed else "triggering is paused",
                "recording": self.recording,
                "folder": os.path.basename(session.dir),
            }
        self._state = state

    def preview(self, after: int, timeout: float = 1.0):
        """Wait for a camera picture newer than number ``after``: (number, JPEG bytes)."""
        self._preview_wanted = now()
        with self._preview_cond:
            self._preview_cond.wait_for(lambda: self._preview[0] != after or not self.running, timeout)
            return self._preview

    def _make_preview(self, frame, det, in_zone: bool) -> None:
        """Draw the zones and the animal on the camera image for the control page."""
        t = now()
        if t - self._preview_wanted > 3.0 or t - self._preview_made < 0.05:
            return   # nobody is watching, or the last picture is recent enough (20 per second at most)
        self._preview_made = t
        if self.mask_view and det.mask is not None:
            img = cv2.cvtColor(det.mask, cv2.COLOR_GRAY2BGR)
        else:
            img = frame.copy()
        scale = max(1.0, img.shape[0] / 720)
        thick = max(1, round(2 * scale))

        zone = self.zones["trigger"]
        if zone:
            colour = COL_ZONE_HOT if (in_zone or self.stim.on) else COL_ZONE
            pts = np.int32(zone)
            tint = img.copy()
            cv2.fillPoly(tint, [pts], colour)
            cv2.addWeighted(tint, 0.2, img, 0.8, 0, img)
            cv2.polylines(img, [pts], True, colour, thick, cv2.LINE_AA)
        if self.zones["arena"]:
            cv2.polylines(img, [np.int32(self.zones["arena"])], True, COL_ARENA, thick, cv2.LINE_AA)
        if len(self.trail) > 1:
            cv2.polylines(img, [np.int32(self.trail)], False, COL_TRAIL, max(1, round(scale)), cv2.LINE_AA)
        if det.found:
            cv2.drawContours(img, [det.contour], -1, COL_MOUSE, thick)
            cv2.circle(img, (int(det.x), int(det.y)), round(5 * scale), RED, -1, cv2.LINE_AA)

        if img.shape[1] > 1280:   # a smaller picture is enough for the page
            img = cv2.resize(img, (1280, round(img.shape[0] * 1280 / img.shape[1])), interpolation=cv2.INTER_AREA)
        ok, jpeg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if ok:
            with self._preview_cond:
                self._preview = (self._preview[0] + 1, jpeg.tobytes())
                self._preview_cond.notify_all()
