#!/usr/bin/env python3
"""Closed-loop looming-disc test.

Tracks a mouse from an overhead camera in real time, lets you draw a trigger
zone on the live image, and plays a looming stimulus (expanding disc, movie or
image sequence) on a second monitor when the mouse enters the zone.

    python looming_test.py --demo            try it with a fake mouse, no hardware
    python looming_test.py --camera 1        real camera, stimulus on display 1

See README.md for the full instructions.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime
import json
import math
import multiprocessing as mp
import os
import queue
import re
import sys
import threading
import time

import cv2
import numpy as np

import core
import stimulus
from core import now

HELP = [
    ("B", "capture background (arena EMPTY)"),
    ("Z", "draw the trigger zone"),
    ("A", "draw the arena boundary (optional)"),
    ("C", "clear both zones"),
    ("SPACE", "arm / disarm triggering"),
    ("T", "play the stimulus now"),
    ("X", "stop the stimulus"),
    ("M", "show what the tracker sees"),
    ("- +", "tracking threshold"),
    ("N", "next tracking method"),
    ("R", "video recording on / off"),
    ("H", "hide / show this help"),
    ("Q Q", "quit"),
]
DRAW_HELP = "Click each corner on the image. Enter or right-click = finish, Backspace = undo, Esc = cancel."
HELP_TEXT = "\n".join(f"  {key:<6} {text}" for key, text in HELP) + "\n  While drawing a zone: " + DRAW_HELP

# Colours are BGR.
WHITE, GREY, PANEL = (255, 255, 255), (170, 170, 170), (32, 32, 32)
GREEN, RED, ORANGE, YELLOW = (90, 230, 90), (70, 70, 255), (0, 165, 255), (0, 255, 255)
COL_ARENA, COL_ZONE, COL_ZONE_HOT = (0, 215, 255), (90, 230, 90), (70, 70, 255)
COL_MOUSE, COL_TRAIL = (255, 200, 0), (255, 160, 60)
FONT = cv2.FONT_HERSHEY_SIMPLEX

BACKENDS = {
    "any": cv2.CAP_ANY, "dshow": cv2.CAP_DSHOW, "msmf": cv2.CAP_MSMF,
    "v4l2": cv2.CAP_V4L2, "avfoundation": cv2.CAP_AVFOUNDATION,
}


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

    def read(self, timeout: float = 1.0):
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
    """One run of the program: a folder with tracking.csv, events.csv, video and settings."""

    def __init__(self, out_dir: str, name: str = ""):
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        label = re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_")
        self.dir = os.path.join(out_dir, stamp + ("_" + label if label else ""))
        os.makedirs(self.dir)
        self.t0 = now()
        self.started = datetime.datetime.now().isoformat(timespec="seconds")
        self._track_file = open(os.path.join(self.dir, "tracking.csv"), "w", newline="")
        self._track = csv.writer(self._track_file)
        self._track.writerow(["frame", "t_s", "detected", "x", "y", "area_px",
                              "in_zone", "armed", "stim_on", "video_frame"])
        self._event_file = open(os.path.join(self.dir, "events.csv"), "w", newline="")
        self._events = csv.writer(self._event_file)
        self._events.writerow(["t_s", "event", "stim_id", "x", "y", "details"])
        self._last_flush = self.t0

    def log_frame(self, frame_no, t, det, in_zone, armed, stim_on, video_frame) -> None:
        x = f"{det.x:.1f}" if det.found else ""
        y = f"{det.y:.1f}" if det.found else ""
        self._track.writerow([frame_no, f"{t:.4f}", int(det.found), x, y, f"{det.area:.0f}",
                              int(in_zone), int(armed), int(stim_on), video_frame])
        if now() - self._last_flush > 1.0:
            self._track_file.flush()
            self._last_flush = now()

    def log_event(self, event: str, stim_id="", det=None, details: dict | None = None, t=None) -> None:
        t = now() - self.t0 if t is None else t
        x = f"{det.x:.1f}" if det is not None and det.found else ""
        y = f"{det.y:.1f}" if det is not None and det.found else ""
        self._events.writerow([f"{t:.4f}", event, stim_id, x, y, json.dumps(details) if details else ""])
        self._event_file.flush()
        extra = "  " + ", ".join(f"{k}={v}" for k, v in details.items()) if details else ""
        print(f"[{t:8.2f} s] {event}{' #' + str(stim_id) if stim_id != '' else ''}{extra}")

    def close(self) -> None:
        self._track_file.close()
        self._event_file.close()


# --------------------------------------------------------------------------
# The program
# --------------------------------------------------------------------------

class App:
    WINDOW = "Looming test - tracking"

    def __init__(self, cfg: dict, name: str = ""):
        self.cfg = cfg
        self.name = name
        self.stim = self.cam = self.session = self.writer = None
        self.zones = {"arena": None, "trigger": None}
        self.arena_mask = None
        self.drawing = None          # {"kind": "arena" | "trigger", "pts": [...]} while a zone is being drawn
        self.cursor = (0, 0)
        self.bg_frames = None        # list being filled while a background is captured
        self.trail = collections.deque(maxlen=60)
        self.show_help = True
        self.show_mask = False
        self.recording = False
        self.video_frames = 0
        self.frame_no = 0
        self.stim_count = 0
        self.fps = 0.0
        self.quit = False
        self._last_frame_t = None
        self._quit_pressed = -math.inf
        self._message = ("", 0.0)
        self._window_seen = 0

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
        self.ui_scale = max(1.0, self.cam.height / 720)             # text size follows the image size
        self.panel_w = int(400 * self.ui_scale)                     # side panel next to the camera image
        self.canvas_size = (self.cam.width + self.panel_w, max(self.cam.height, int(660 * self.ui_scale)))
        print(f"Camera: {self.cam.width} x {self.cam.height} at {self.cam.fps:.0f} fps")

        self.tracker = core.MouseTracker(self.cfg["tracking"])
        self.trig = core.TriggerLogic(**self.cfg["trigger"])
        self.session = Session(out["dir"], self.name)
        print(f"Saving this session in: {os.path.abspath(self.session.dir)}")
        try:
            self.zones = core.load_zones(out["zones_file"], self.frame_size)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            print(f"WARNING: could not read {out['zones_file']} ({exc}); draw the zones again.")
        self._rebuild_masks()
        if out["record_video"]:
            self.recording = self._open_writer()
        self._write_session_file()

        cv2.namedWindow(self.WINDOW, cv2.WINDOW_NORMAL | cv2.WINDOW_KEEPRATIO | cv2.WINDOW_GUI_NORMAL)
        shrink = min(1.0, 1400 / self.canvas_size[0], 800 / self.canvas_size[1])
        cv2.resizeWindow(self.WINDOW, int(self.canvas_size[0] * shrink), int(self.canvas_size[1] * shrink))
        cv2.setMouseCallback(self.WINDOW, self._on_mouse)
        print("\nKeys (click the tracking window first):\n" + HELP_TEXT + "\n")

    def close(self) -> None:
        if self.session is not None:
            self._write_session_file()
        if self.stim is not None:
            self.stim.close()
        if self.cam is not None:
            self.cam.release()
        if self.writer is not None:
            self.writer.release()
        if self.session is not None:
            self.session.close()
            print(f"Session saved in: {os.path.abspath(self.session.dir)}")
        try:
            cv2.destroyAllWindows()
        except cv2.error:
            pass

    def _write_session_file(self) -> None:
        data = {
            "started": self.session.started,
            "name": self.name,
            "frame_size": list(self.frame_size),
            "camera_fps": self.cam.fps,
            "zones": self.zones,
            "stimulus_window": self.stim_info,
            "trials": self.trig.trials,
            "frames": self.frame_no,
            "config": self.cfg,
        }
        with open(os.path.join(self.session.dir, "session.json"), "w") as f:
            json.dump(data, f, indent=2)

    # ---- main loop -------------------------------------------------------

    def run(self) -> None:
        while not self.quit:
            ok, frame, t_frame = self.cam.read()
            if not ok:
                if not self.cam.live:
                    print("End of the video file.")
                    break
                self.say("No image from the camera", 2)
                self._keys(cv2.waitKey(50), now() - self.session.t0, now(), core.Detection())
                continue

            t = t_frame - self.session.t0
            if self._last_frame_t is not None and t_frame > self._last_frame_t:
                rate = 1.0 / (t_frame - self._last_frame_t)
                self.fps = rate if self.fps == 0 else 0.9 * self.fps + 0.1 * rate
            self._last_frame_t = t_frame

            self._collect_background(frame)
            det = self.tracker.detect(frame, self.arena_mask)
            zone = self.zones["trigger"]
            in_zone = bool(det.found and zone and core.point_in_polygon(det.x, det.y, zone))

            # Decide about the stimulus before doing anything slow (drawing, saving).
            self._poll_stimulus()
            if self.trig.update(t, det.found, in_zone, busy=self.stim.active is not None):
                self._fire("auto", t_frame, det)

            video_frame = ""
            if self.recording and self.writer is not None:
                self.writer.write(frame)
                video_frame = self.video_frames
                self.video_frames += 1
            self.session.log_frame(self.frame_no, t, det, in_zone, self.trig.armed, self.stim.on, video_frame)
            self.frame_no += 1
            if det.found:
                self.trail.append((int(det.x), int(det.y)))

            cv2.imshow(self.WINDOW, self.render(frame, det, in_zone, t))
            self._keys(cv2.waitKey(1), t, t_frame, det)
            self._check_window()

    def _check_window(self) -> None:
        """Quit when the tracking window is closed (on systems that can tell us)."""
        try:
            visible = cv2.getWindowProperty(self.WINDOW, cv2.WND_PROP_VISIBLE)
        except cv2.error:
            return
        if visible >= 1:
            self._window_seen += 1
        elif self._window_seen > 5:
            self.quit = True

    # ---- stimulus --------------------------------------------------------

    def _fire(self, label: str, t_frame: float, det) -> None:
        self.stim_count += 1
        t_sent = now()
        self.stim.send(cmd="trigger", stim_id=self.stim_count, label=label)
        duration = self.stim_info.get("duration_s") or 120.0
        self.stim.active = {"stim_id": self.stim_count, "t_sent": t_sent, "t_frame": t_frame,
                            "deadline": t_sent + duration + 5.0}
        self.session.log_event("trigger", self.stim_count, det,
                               {"label": label, "frame_age_ms": round((t_sent - t_frame) * 1000, 1)},
                               t=t_sent - self.session.t0)

    def _poll_stimulus(self) -> None:
        for event in self.stim.poll():
            kind = event["evt"]
            t = event["t"] - self.session.t0
            if kind == "onset":
                self.stim.on = True
                details = {"label": event["label"]}
                active = self.stim.active
                if active and active["stim_id"] == event["stim_id"]:
                    details["after_trigger_ms"] = round((event["t"] - active["t_sent"]) * 1000, 1)
                    details["after_frame_ms"] = round((event["t"] - active["t_frame"]) * 1000, 1)
                self.session.log_event("stim_onset", event["stim_id"], details=details, t=t)
            elif kind == "offset":
                self.stim.on = False
                self.stim.active = None
                self.session.log_event("stim_offset", event["stim_id"], t=t, details={
                    "frames": event["frames"], "long_frames": event["long_frames"], "aborted": event["aborted"]})
            elif kind == "closed":
                self.session.log_event("stimulus_window_closed", t=t)
            elif kind == "error":
                self.session.log_event("stimulus_error", t=t, details={"message": event["msg"]})
            elif kind == "busy":
                self.session.log_event("trigger_ignored", event.get("stim_id", ""), t=t)

        active = self.stim.active
        if active and (not self.stim.alive() or now() > active["deadline"]):
            self.stim.active, self.stim.on = None, False
        if self.trig.armed and not self.stim.alive():
            self.trig.disarm()
            self.session.log_event("disarmed", details={"reason": "stimulus window is not running"})
            self.say("Disarmed: the stimulus window is not running", 6)

    # ---- keys and mouse --------------------------------------------------

    def say(self, text: str, seconds: float = 3.0) -> None:
        self._message = (text, now() + seconds)

    def _keys(self, key: int, t: float, t_frame: float, det) -> None:
        if key < 0:
            return
        key &= 0xFF
        ch = chr(key).lower() if key < 128 else ""

        if self.drawing is not None:  # only drawing keys work while a zone is being drawn
            if key in (10, 13):
                self._finish_drawing()
            elif key == 27:
                self.drawing = None
                self.say("Drawing cancelled")
            elif key in (8, 127) and self.drawing["pts"]:
                self.drawing["pts"].pop()
            return

        if ch == "q":
            if now() - self._quit_pressed < 2.0:
                self.quit = True
            else:
                self._quit_pressed = now()
                self.say("Press Q again to quit", 2)
        elif ch == " ":
            self._toggle_armed()
        elif ch in ("z", "a"):
            self._start_drawing("trigger" if ch == "z" else "arena")
        elif ch == "c":
            self._disarm("zones cleared")
            self.zones = {"arena": None, "trigger": None}
            self._zones_changed("zones_cleared")
            self.say("Zones cleared")
        elif ch == "b":
            if self.trig.armed:
                self.say("Disarm (SPACE) before capturing a new background")
            else:
                self.cfg["tracking"]["method"] = "background"
                self.bg_frames = []
        elif ch == "n":
            methods = ("background", "dark", "light")
            current = self.cfg["tracking"]["method"]
            self.cfg["tracking"]["method"] = methods[(methods.index(current) + 1) % len(methods)]
            self.session.log_event("tracking_method", details={"method": self.cfg["tracking"]["method"]})
            self.say(f"Tracking method: {self.cfg['tracking']['method']}")
        elif ch == "t":
            self._manual_stimulus(t, t_frame, det)
        elif ch == "x":
            if self.stim.active:
                self.stim.send(cmd="abort")
        elif ch == "m":
            self.show_mask = not self.show_mask
        elif ch and ch in "+=]-_[":
            name = "diff_threshold" if self.cfg["tracking"]["method"] == "background" else "intensity_threshold"
            step = 2 if ch in "+=]" else -2
            self.cfg["tracking"][name] = int(min(254, max(1, self.cfg["tracking"][name] + step)))
            self.say(f"Threshold: {self.cfg['tracking'][name]}", 1.5)
        elif ch == "r":
            self._toggle_recording()
        elif ch == "h":
            self.show_help = not self.show_help

    def _on_mouse(self, event, x, y, flags, param) -> None:
        w, h = self.frame_size
        on_image = 0 <= x < w and 0 <= y < h
        self.cursor = (int(min(max(x, 0), w - 1)), int(min(max(y, 0), h - 1)))
        if self.drawing is None:
            return
        pts = self.drawing["pts"]
        if event == cv2.EVENT_LBUTTONDOWN and on_image:
            # Clicking on the first corner again closes the shape.
            if len(pts) >= 3 and math.hypot(x - pts[0][0], y - pts[0][1]) <= 12 * self.ui_scale:
                self._finish_drawing()
            else:
                pts.append([int(x), int(y)])
        elif event == cv2.EVENT_RBUTTONDOWN:
            self._finish_drawing()

    def _start_drawing(self, kind: str) -> None:
        self._disarm("drawing a zone")
        self.drawing = {"kind": kind, "pts": []}

    def _finish_drawing(self) -> None:
        kind, pts = self.drawing["kind"], self.drawing["pts"]
        if len(pts) < 3:
            self.say("A zone needs at least 3 corners - keep clicking, or Esc to cancel")
            return
        self.zones[kind] = [list(p) for p in pts]
        self.drawing = None
        self._zones_changed("zone_set", {"zone": kind, "points": self.zones[kind]})
        self.say("Trigger zone saved" if kind == "trigger" else "Arena boundary saved")

    def _zones_changed(self, event: str, details: dict | None = None) -> None:
        self._rebuild_masks()
        self.session.log_event(event, details=details)
        self._write_session_file()
        try:
            core.save_zones(self.cfg["output"]["zones_file"], self.zones, self.frame_size)
        except OSError as exc:
            print(f"WARNING: could not save the zones to {self.cfg['output']['zones_file']}: {exc}")

    def _rebuild_masks(self) -> None:
        arena = self.zones["arena"]
        self.arena_mask = core.polygon_mask(self.frame_size, arena) if arena else None

    def _toggle_armed(self) -> None:
        if self.trig.armed:
            self._disarm("key")
            return
        if not self.zones["trigger"]:
            self.say("Draw a trigger zone first (Z)")
        elif self.tracker.needs_background:
            self.say("Capture a background first (B, with the arena empty)")
        elif not self.stim.alive():
            self.say("The stimulus window is not running - restart the program")
        else:
            self.trig.arm()
            self.session.log_event("armed")

    def _disarm(self, reason: str) -> None:
        if self.trig.armed:
            self.trig.disarm()
            self.session.log_event("disarmed", details={"reason": reason})

    def _manual_stimulus(self, t: float, t_frame: float, det) -> None:
        if self.stim.active:
            self.say("A stimulus is already playing")
        elif not self.stim.alive():
            self.say("The stimulus window is not running - restart the program")
        elif self.trig.armed:  # a real presentation: counts as a trial and restarts the cooldown
            self.trig.note_stimulus(t)
            self._fire("manual", t_frame, det)
        else:
            self._fire("test", t_frame, det)

    def _collect_background(self, frame) -> None:
        if self.bg_frames is None:
            return
        self.bg_frames.append(frame)
        if len(self.bg_frames) >= int(self.cfg["tracking"]["background_frames"]):
            self.tracker.set_background(self.bg_frames)
            self.bg_frames = None
            cv2.imwrite(os.path.join(self.session.dir, "background.png"), self.tracker.background)
            self.session.log_event("background_captured")
            self.say("Background captured")

    # ---- recording -------------------------------------------------------

    def _open_writer(self) -> bool:
        for extension, code in ((".mp4", "mp4v"), (".avi", "MJPG")):
            path = os.path.join(self.session.dir, "video" + extension)
            writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*code), float(self.cam.fps), self.frame_size)
            if writer.isOpened():
                self.writer = writer
                return True
            writer.release()
        print("WARNING: could not start the video recording (no usable video codec).")
        return False

    def _toggle_recording(self) -> None:
        if self.recording:
            self.recording = False
            self.session.log_event("recording_paused")
        elif self.writer is not None or self._open_writer():
            self.recording = True
            self.session.log_event("recording_started")
        else:
            self.say("Could not start the video recording")

    # ---- drawing the tracking window ---------------------------------------

    def _put(self, img, text, x, y, colour, scale=1.0, bold=False) -> None:
        cv2.putText(img, text, (int(x), int(y)), FONT, 0.5 * self.ui_scale * scale, colour,
                    max(1, round((2 if bold else 1) * self.ui_scale)), cv2.LINE_AA)

    def _wrap(self, text: str, width: float) -> list:
        """Split text into lines that fit in ``width`` pixels of the side panel."""
        lines, line = [], ""
        for word in text.split():
            longer = (line + " " + word).strip()
            if line and cv2.getTextSize(longer, FONT, 0.5 * self.ui_scale, 1)[0][0] > width:
                lines.append(line)
                line = word
            else:
                line = longer
        return lines + [line] if line else lines

    def render(self, frame, det, in_zone: bool, t: float):
        """The picture for the tracking window: the camera image with a text panel on its right."""
        w, h = self.frame_size
        canvas = np.full((self.canvas_size[1], self.canvas_size[0], 3), PANEL, np.uint8)
        img = canvas[:h, :w]   # a view: drawing on img draws on the canvas
        img[:] = cv2.cvtColor(det.mask, cv2.COLOR_GRAY2BGR) if self.show_mask and det.mask is not None else frame
        thick = max(1, round(2 * self.ui_scale))

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
            cv2.polylines(img, [np.int32(self.trail)], False, COL_TRAIL, 1, cv2.LINE_AA)
        if det.found:
            cv2.drawContours(img, [det.contour], -1, COL_MOUSE, thick)
            cv2.circle(img, (int(det.x), int(det.y)), round(5 * self.ui_scale), RED, -1, cv2.LINE_AA)

        if self.drawing is not None:
            colour = COL_ZONE if self.drawing["kind"] == "trigger" else COL_ARENA
            pts = self.drawing["pts"]
            if pts:
                cv2.polylines(img, [np.int32(pts + [list(self.cursor)])], False, colour, thick, cv2.LINE_AA)
            for p in pts:
                cv2.circle(img, tuple(p), round(5 * self.ui_scale), colour, -1, cv2.LINE_AA)

        self._draw_panel(canvas, det, t)
        return canvas

    def _draw_panel(self, canvas, det, t: float) -> None:
        s = self.ui_scale
        x = self.frame_size[0] + 16 * s
        width = self.panel_w - 32 * s
        tracking, trig = self.cfg["tracking"], self.trig

        if self.stim.on:
            title, colour = "STIMULUS ON", RED
        elif trig.armed:
            title, colour = "ARMED", GREEN
        else:
            title, colour = "NOT ARMED", GREY
        y = 40 * s
        self._put(canvas, title, x, y, colour, 1.8, bold=True)

        lines = [(trig.status(t) if trig.armed else "Press SPACE to start triggering", colour if trig.armed else GREY)]
        trials = f"Trials: {trig.trials}" + (f" of {trig.max_trials}" if trig.max_trials else "")
        if trig.last_stim_t is not None:
            trials += f"   (last stimulus {t - trig.last_stim_t:.0f} s ago)"
        lines.append((trials, WHITE))
        if det.found:
            lines.append((f"Mouse at ({det.x:.0f}, {det.y:.0f}), size {det.area:.0f} px", WHITE))
        else:
            lines.append(("Mouse NOT found", ORANGE))
        threshold = tracking["diff_threshold"] if tracking["method"] == "background" else tracking["intensity_threshold"]
        lines.append((f"Tracking: {tracking['method']}, threshold {threshold}", GREY))
        clock = f"{int(t) // 60}:{int(t) % 60:02d}"
        lines.append((f"{'RECORDING' if self.recording else 'Not recording'}   {clock}   {self.fps:.0f} fps",
                      RED if self.recording else GREY))
        legend = [name for name, zone in (("green (red when occupied) = trigger zone", self.zones["trigger"]),
                                          ("yellow = arena boundary", self.zones["arena"])) if zone]
        if legend:
            lines.append((", ".join(legend), GREY))
        if self.bg_frames is not None:
            lines.append(("Capturing the background...", ORANGE))
        elif self.tracker.needs_background:
            lines.append(("No background yet: empty the arena and press B", ORANGE))
        if not self.zones["trigger"] and self.drawing is None:
            lines.append(("No trigger zone yet: press Z", ORANGE))
        if not self.stim.alive():
            lines.append(("THE STIMULUS WINDOW IS NOT RUNNING - restart the program", RED))

        message, until = self._message
        if self.drawing is not None:
            what = "TRIGGER ZONE" if self.drawing["kind"] == "trigger" else "ARENA BOUNDARY"
            lines.append((f"Drawing the {what}. {DRAW_HELP}", YELLOW))
        if message and now() < until:
            lines.append((message, YELLOW))

        y += 10 * s
        for text, colour in lines:
            for part in self._wrap(text, width):
                y += 22 * s
                self._put(canvas, part, x, y, colour)
            y += 6 * s

        if self.show_help:
            y = canvas.shape[0] - len(HELP) * 20 * s + 6 * s
            for key, text in HELP:
                self._put(canvas, key, x, y, WHITE, 0.9)
                self._put(canvas, text, x + 62 * s, y, GREY, 0.9)
                y += 20 * s


# --------------------------------------------------------------------------
# Command line
# --------------------------------------------------------------------------

def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Closed-loop looming-disc test: track a mouse and show a looming stimulus "
                    "on a second monitor when it enters a zone you draw.",
        epilog="Keys in the tracking window:\n" + HELP_TEXT,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--config", metavar="FILE", help="settings file (JSON); see config.example.json")
    p.add_argument("--camera", metavar="N_OR_FILE", help="camera number (0, 1, ...) or a video file to use instead")
    p.add_argument("--display", type=int, metavar="N", help="display for the stimulus (0 = laptop screen, 1 = second monitor)")
    p.add_argument("--windowed", action="store_true", help="show the stimulus in a window instead of fullscreen")
    p.add_argument("--method", choices=("background", "dark", "light"),
                   help="how to find the mouse: difference from an empty-arena image, or a dark / light animal")
    p.add_argument("--movie", metavar="FILE", help="play this movie as the stimulus")
    p.add_argument("--images", metavar="FOLDER", help="play the images in this folder as the stimulus")
    p.add_argument("--name", default="", help="label added to the session folder, e.g. the mouse ID")
    p.add_argument("--no-record", action="store_true", help="do not record the camera video")
    p.add_argument("--demo", action="store_true", help="use a fake camera with a moving 'mouse' (no hardware needed)")
    p.add_argument("--list-cameras", action="store_true", help="show the cameras that can be opened, then exit")
    p.add_argument("--list-displays", action="store_true", help="show the connected displays, then exit")
    p.add_argument("--write-config", metavar="FILE", help="write the default settings to FILE, then exit")
    return p.parse_args(argv)


def build_config(args) -> dict:
    user = {}
    if args.config:
        with open(args.config) as f:
            user = json.load(f)
    cfg, unknown = core.merge_config(core.DEFAULTS, user)
    for key in unknown:
        print(f"WARNING: the setting '{key}' in {args.config} is not known and was ignored.")

    if args.demo:
        cfg["camera"]["source"] = "demo"
        if not args.method:
            cfg["tracking"]["method"] = "dark"
        if args.display is None:  # no second monitor asked for: preview in a window
            cfg["stimulus"]["display"] = 0
            cfg["stimulus"]["fullscreen"] = False
    if args.camera is not None:
        cfg["camera"]["source"] = int(args.camera) if args.camera.isdigit() else args.camera
    if args.display is not None:
        cfg["stimulus"]["display"] = args.display
    if args.windowed:
        cfg["stimulus"]["fullscreen"] = False
    if args.method:
        cfg["tracking"]["method"] = args.method
    if args.movie:
        cfg["stimulus"]["mode"] = "movie"
        cfg["stimulus"]["movie"]["path"] = args.movie
    if args.images:
        cfg["stimulus"]["mode"] = "images"
        cfg["stimulus"]["images"]["dir"] = args.images
    if args.no_record:
        cfg["output"]["record_video"] = False
    core.validate_config(cfg)
    return cfg


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.write_config:
        with open(args.write_config, "w") as f:
            json.dump(core.DEFAULTS, f, indent=2)
            f.write("\n")
        print(f"Default settings written to {args.write_config}")
        return 0
    if args.list_cameras or args.list_displays:
        if args.list_cameras:
            list_cameras()
        if args.list_displays:
            list_displays()
        return 0

    app = None
    try:
        app = App(build_config(args), args.name)
        app.start()
        app.run()
    except (RuntimeError, ValueError, OSError) as exc:
        print(f"\nERROR: {exc}")
        return 1
    except KeyboardInterrupt:
        pass
    finally:
        if app is not None:
            app.close()
    return 0


if __name__ == "__main__":
    mp.freeze_support()
    sys.exit(main())
