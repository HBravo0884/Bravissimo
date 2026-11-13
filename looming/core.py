"""Settings, mouse tracking, zone geometry and trigger rules for the looming test.

Nothing in this module opens a window or a camera, so all of it can be tested
without hardware.
"""
from __future__ import annotations

import copy
import csv
import datetime
import json
import math
import os
import sys
import time
from dataclasses import dataclass

import cv2
import numpy as np

# time.perf_counter() is shared between processes everywhere except on Windows
# with Python older than 3.10, where each process has its own zero.
_PERF_IS_SYSTEM_WIDE = not (sys.platform == "win32" and sys.version_info < (3, 10))


def now() -> float:
    """Seconds on a clock that the tracking and stimulus processes share."""
    return time.perf_counter() if _PERF_IS_SYSTEM_WIDE else time.time()


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------

DEFAULTS = {
    "camera": {
        "source": 0,           # camera index, or the path of a video file
        "width": 1280,
        "height": 720,
        "fps": 30,
        "backend": "auto",     # auto | any | dshow | msmf | v4l2 | avfoundation
        "fourcc": None,        # e.g. "MJPG" if the camera is slow at high resolution
    },
    "tracking": {
        "method": "background",      # background | dark | light
        "polarity": "any",           # background method only: any | darker | lighter
        "diff_threshold": 30,        # background method: grey-level change that counts as mouse
        "intensity_threshold": 70,   # dark / light methods: grey level that separates mouse and floor
        "blur_px": 5,
        "morph_px": 5,
        "min_area_px": 200,
        "max_area_px": 40000,
        "background_frames": 30,
    },
    "session": {
        "duration_min": 60,          # length of one animal's session
        "acclimation_min": 0,        # no loom during the first minutes of a session
        # What to ask about each animal. The first one names the session folder.
        "animal_fields": ["Animal ID", "Sex", "Age", "Genotype", "Group", "Weight (g)", "Experimenter", "Notes"],
    },
    "trigger": {
        "dwell_s": 0.1,              # how long the animal must be in the zone before a loom starts
        "downtime_s": 180.0,         # no new loom for this long after one was triggered
        "max_looms": 0,              # per session; 0 = no limit
        "entry_rule": "in_zone",     # in_zone | left_since_last | fresh_entry
        "lost_counts_as_outside_after_s": 2.0,   # null = never
    },
    "stimulus": {
        "mode": "loom",              # loom | movie | images
        "display": 1,                # 0 = laptop screen, 1 = second monitor, ...
        "fullscreen": True,
        "window_size": [960, 540],   # used when fullscreen is false
        "background_color": [128, 128, 128],
        "refresh_hz": 60,            # only used if the real rate cannot be measured
        "screen_width_cm": 53.0,
        "viewing_distance_cm": 30.0,
        "loom": {
            "units": "deg",          # deg (visual angle) | px
            "start_size": 2.0,       # disc DIAMETER at the start
            "end_size": 20.0,        # disc DIAMETER at the end
            "expand_s": 0.25,
            "hold_s": 0.25,
            "isi_s": 0.5,
            "repeats": 15,
            "profile": "linear",     # linear | approach
            "disc_color": [0, 0, 0],
            "center": [0.5, 0.5],    # fraction of screen width / height
        },
        "movie": {"path": "", "fit": "contain", "repeats": 1, "isi_s": 0.5},
        "images": {
            "dir": "",
            "fps": 60,
            "hold_last_s": 0.0,
            "fit": "contain",
            "repeats": 1,
            "isi_s": 0.5,
        },
        "sync_patch": {"enabled": False, "size_px": 60, "corner": "bottom_left"},
    },
    "output": {
        "dir": "sessions",
        "record_video": True,
        "zones_file": "zones.json",
    },
}

_CHOICES = {
    ("camera", "backend"): ("auto", "any", "dshow", "msmf", "v4l2", "avfoundation"),
    ("tracking", "method"): ("background", "dark", "light"),
    ("tracking", "polarity"): ("any", "darker", "lighter"),
    ("trigger", "entry_rule"): ("in_zone", "left_since_last", "fresh_entry"),
    ("stimulus", "mode"): ("loom", "movie", "images"),
    ("stimulus", "loom", "units"): ("deg", "px"),
    ("stimulus", "loom", "profile"): ("linear", "approach"),
    ("stimulus", "movie", "fit"): ("contain", "cover", "stretch", "none"),
    ("stimulus", "images", "fit"): ("contain", "cover", "stretch", "none"),
    ("stimulus", "sync_patch", "corner"): ("bottom_left", "bottom_right", "top_left", "top_right"),
}


# Numbers that can be changed on the control page: (path, smallest, largest).
_RANGES = [
    (("session", "duration_min"), 0.01, 1440),
    (("session", "acclimation_min"), 0, 1440),
    (("trigger", "dwell_s"), 0, 60),
    (("trigger", "downtime_s"), 0, 86400),
    (("trigger", "max_looms"), 0, 10000),
    (("tracking", "diff_threshold"), 1, 254),
    (("tracking", "intensity_threshold"), 1, 254),
    (("tracking", "min_area_px"), 1, 10_000_000),
    (("tracking", "max_area_px"), 1, 100_000_000),
    (("stimulus", "screen_width_cm"), 1, 1000),
    (("stimulus", "viewing_distance_cm"), 1, 1000),
    (("stimulus", "loom", "start_size"), 0.01, 10000),
    (("stimulus", "loom", "end_size"), 0.01, 10000),
    (("stimulus", "loom", "expand_s"), 0.01, 60),
    (("stimulus", "loom", "hold_s"), 0, 60),
    (("stimulus", "loom", "isi_s"), 0, 600),
    (("stimulus", "loom", "repeats"), 1, 1000),
]


def merge_config(base: dict, override: dict | None, _path: str = ""):
    """Return (base updated with override, list of keys in override that base does not know).

    Keys starting with "_" are treated as comments and skipped.
    """
    out = copy.deepcopy(base)
    unknown = []
    for key, value in (override or {}).items():
        if key.startswith("_"):
            continue
        if key not in out:
            unknown.append(_path + key)
        elif isinstance(out[key], dict) and isinstance(value, dict):
            out[key], more = merge_config(out[key], value, _path + key + ".")
            unknown += more
        else:
            out[key] = value
    return out, unknown


def validate_config(cfg: dict) -> None:
    """Raise ValueError with a readable message if a setting has an unusable value."""
    for path, allowed in _CHOICES.items():
        value = cfg
        for key in path:
            value = value[key]
        if value not in allowed:
            raise ValueError(
                f"Setting {'.'.join(path)} is {value!r}; it must be one of: {', '.join(allowed)}"
            )
    for path, low, high in _RANGES:
        value = cfg
        for key in path:
            value = value[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
            raise ValueError(f"Setting {'.'.join(path)} must be a number from {low:g} to {high:g} (it is {value!r})")
    stim = cfg["stimulus"]
    if stim["mode"] == "movie" and not os.path.isfile(stim["movie"]["path"]):
        raise ValueError(f"Movie file not found: {stim['movie']['path']!r}")
    if stim["mode"] == "images" and not os.path.isdir(stim["images"]["dir"]):
        raise ValueError(f"Image folder not found: {stim['images']['dir']!r}")
    fields = cfg["session"]["animal_fields"]
    if (not isinstance(fields, list) or not fields or len(set(fields)) != len(fields)
            or not all(isinstance(f, str) and f.strip() for f in fields)):
        raise ValueError("session.animal_fields must be a list of different, non-empty names")


# --------------------------------------------------------------------------
# Tracking
# --------------------------------------------------------------------------

@dataclass
class Detection:
    found: bool = False
    x: float = math.nan
    y: float = math.nan
    area: float = 0.0
    contour: np.ndarray | None = None
    mask: np.ndarray | None = None


class MouseTracker:
    """Finds the mouse as the largest blob that differs from the floor.

    ``settings`` is the "tracking" section of the config. It is read on every
    frame, so thresholds can be changed while running.
    """

    def __init__(self, settings: dict):
        self.settings = settings
        self.background: np.ndarray | None = None

    @property
    def needs_background(self) -> bool:
        return self.settings["method"] == "background" and self.background is None

    def _grey(self, frame: np.ndarray) -> np.ndarray:
        grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
        k = int(self.settings["blur_px"])
        if k > 1:
            k |= 1  # the kernel size must be odd
            grey = cv2.GaussianBlur(grey, (k, k), 0)
        return grey

    def set_background(self, frames: list) -> None:
        """Use the median of some frames of the EMPTY arena as the reference image."""
        stack = np.stack([self._grey(f) for f in frames])
        self.background = np.median(stack, axis=0).astype(np.uint8)

    def detect(self, frame: np.ndarray, roi_mask: np.ndarray | None = None) -> Detection:
        s = self.settings
        grey = self._grey(frame)
        method = s["method"]
        if method == "background":
            if self.background is None or self.background.shape != grey.shape:
                return Detection()
            if s["polarity"] == "darker":
                diff = cv2.subtract(self.background, grey)
            elif s["polarity"] == "lighter":
                diff = cv2.subtract(grey, self.background)
            else:
                diff = cv2.absdiff(grey, self.background)
            _, mask = cv2.threshold(diff, int(s["diff_threshold"]), 255, cv2.THRESH_BINARY)
        else:
            kind = cv2.THRESH_BINARY_INV if method == "dark" else cv2.THRESH_BINARY
            _, mask = cv2.threshold(grey, int(s["intensity_threshold"]), 255, kind)

        if roi_mask is not None:
            mask = cv2.bitwise_and(mask, roi_mask)
        k = int(s["morph_px"])
        if k > 1:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best, best_area = None, 0.0
        for contour in contours:
            area = cv2.contourArea(contour)
            if s["min_area_px"] <= area <= s["max_area_px"] and area > best_area:
                best, best_area = contour, area
        if best is None:
            return Detection(mask=mask)
        m = cv2.moments(best)
        return Detection(True, m["m10"] / m["m00"], m["m01"] / m["m00"], best_area, best, mask)


# --------------------------------------------------------------------------
# Zones
# --------------------------------------------------------------------------

def polygon_mask(frame_size, polygon) -> np.ndarray:
    """White-inside mask (uint8) for a polygon; frame_size is (width, height)."""
    w, h = frame_size
    mask = np.zeros((h, w), np.uint8)
    cv2.fillPoly(mask, [np.asarray(polygon, np.int32)], 255)
    return mask


def point_in_polygon(x: float, y: float, polygon) -> bool:
    pts = np.asarray(polygon, np.float32)
    return cv2.pointPolygonTest(pts, (float(x), float(y)), False) >= 0


def save_zones(path: str, zones: dict, frame_size) -> None:
    data = {"frame_size": list(frame_size), "arena": zones.get("arena"), "trigger": zones.get("trigger")}
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def load_zones(path: str, frame_size) -> dict:
    """Read zones saved by save_zones, rescaled if the camera resolution changed."""
    zones = {"arena": None, "trigger": None}
    if not os.path.isfile(path):
        return zones
    with open(path) as f:
        data = json.load(f)
    saved_w, saved_h = data.get("frame_size") or frame_size
    sx, sy = frame_size[0] / saved_w, frame_size[1] / saved_h
    for name in zones:
        pts = data.get(name)
        if pts and len(pts) >= 3:
            zones[name] = [[int(round(x * sx)), int(round(y * sy))] for x, y in pts]
    return zones


# --------------------------------------------------------------------------
# Trigger rules
# --------------------------------------------------------------------------

class TriggerLogic:
    """Decides when the animal being in the trigger zone should start a loom.

    While armed, a loom starts when the animal has been in the zone continuously
    for ``dwell_s``, the acclimation period and the downtime since the previous
    loom are over, and looms remain. ``entry_rule`` adds a condition:

    - "in_zone": none. If the animal is still in the zone when the downtime
      ends, the next loom starts then.
    - "left_since_last": the animal must have been outside the zone at some
      point since the previous loom (or since arming).
    - "fresh_entry": as above, and it must have entered after the downtime ended.
    """

    def __init__(self, dwell_s=0.1, downtime_s=180.0, max_looms=0, entry_rule="in_zone",
                 lost_counts_as_outside_after_s=2.0, acclimation_s=0.0):
        self.dwell_s = float(dwell_s)
        self.downtime_s = float(downtime_s)
        self.max_looms = int(max_looms or 0)
        self.entry_rule = entry_rule
        self.lost_after_s = lost_counts_as_outside_after_s
        self.acclimation_s = float(acclimation_s)
        self.armed = False
        self.looms = 0
        self.last_loom_t: float | None = None
        self._was_outside = False
        self._enter_t: float | None = None
        self._lost_since: float | None = None

    def arm(self) -> None:
        self.armed = True
        self._was_outside = False
        self._enter_t = None
        self._lost_since = None

    def disarm(self) -> None:
        self.armed = False

    @property
    def exhausted(self) -> bool:
        return self.max_looms > 0 and self.looms >= self.max_looms

    def downtime_remaining(self, t: float) -> float:
        if self.last_loom_t is None:
            return 0.0
        return max(0.0, self.downtime_s - (t - self.last_loom_t))

    def note_loom(self, t: float) -> None:
        """Record that a loom was triggered at time t (also used for manual ones)."""
        self.last_loom_t = t
        self.looms += 1
        self._was_outside = False
        self._enter_t = None

    def status(self, t: float) -> str:
        if self.exhausted:
            return "all looms for this session have been shown"
        if t < self.acclimation_s:
            return f"acclimation: {fmt_time(self.acclimation_s - t)} left"
        remaining = self.downtime_remaining(t)
        if remaining > 0:
            return f"downtime: next loom possible in {fmt_time(remaining)}"
        if self.entry_rule != "in_zone" and not self._was_outside:
            return "waiting for the animal to leave the zone first"
        return "ready: a loom plays when the animal is in the zone"

    def update(self, t: float, found: bool, in_zone: bool, busy: bool = False) -> bool:
        """Feed one tracked frame; returns True when a loom should start now."""
        if not self.armed:
            return False
        if found:
            self._lost_since = None
            if in_zone:
                if self._enter_t is None:
                    self._enter_t = t
            else:
                self._was_outside = True
                self._enter_t = None
        else:
            if self._lost_since is None:
                self._lost_since = t
            if self.lost_after_s is not None and t - self._lost_since >= self.lost_after_s:
                self._was_outside = True
            self._enter_t = None

        blocked = busy or t < self.acclimation_s or self.downtime_remaining(t) > 0
        if blocked and self.entry_rule == "fresh_entry" and self._enter_t is not None:
            # An entry made while a loom could not start does not count later.
            self._was_outside = False
        if blocked or self.exhausted or self._enter_t is None:
            return False
        if self.entry_rule != "in_zone" and not self._was_outside:
            return False
        if t - self._enter_t < self.dwell_s:
            return False
        self.note_loom(t)
        return True


# --------------------------------------------------------------------------
# Times and results tables
# --------------------------------------------------------------------------

def fmt_time(seconds: float) -> str:
    """Whole seconds as m:ss, rounded up so a countdown never shows 0:00 early."""
    whole = max(0, math.ceil(seconds - 1e-9))
    return f"{whole // 60}:{whole % 60:02d}"


def fmt_elapsed(seconds: float) -> str:
    """Whole seconds as m:ss, rounded down (for a clock that counts up)."""
    whole = int(max(0.0, seconds))
    return f"{whole // 60}:{whole % 60:02d}"


def format_clock(seconds: float) -> str:
    """Seconds as mm:ss.s, e.g. 125.34 -> "02:05.3"."""
    tenths = int(round(max(0.0, seconds) * 10))
    return f"{tenths // 600:02d}:{tenths % 600 // 10:02d}.{tenths % 10}"


def safe_name(text: str) -> str:
    """Text made safe for use in a file or folder name."""
    cleaned = "".join(c if c.isalnum() or c in "-_" else "_" for c in str(text).strip())
    return cleaned.strip("_") or "animal"


def append_rows(path: str, rows: list) -> str:
    """Add rows (dicts with the same keys) to a CSV table and return the file written.

    A table whose columns differ is set aside under another name rather than
    rewritten, and if the table cannot be written (for example because it is
    open in Excel) the rows go to a separate file next to it.
    """
    if not rows:
        return path
    columns = list(rows[0].keys())
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    base, extension = os.path.splitext(path)
    try:
        if os.path.isfile(path) and os.path.getsize(path) > 0:
            with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
                header = next(csv.reader(f), [])
            if header != columns:
                os.replace(path, f"{base}_until_{stamp}{extension}")
        is_new = not os.path.isfile(path) or os.path.getsize(path) == 0
        # The byte-order mark at the start lets Excel read accented characters.
        with open(path, "a", newline="", encoding="utf-8-sig" if is_new else "utf-8") as f:
            writer = csv.DictWriter(f, columns)
            if is_new:
                writer.writeheader()
            writer.writerows(rows)
        return path
    except OSError:
        fallback = f"{base}_not_merged_{stamp}{extension}"
        with open(fallback, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, columns)
            writer.writeheader()
            writer.writerows(rows)
        return fallback


# --------------------------------------------------------------------------
# Fake camera (for --demo and for tests)
# --------------------------------------------------------------------------

class SyntheticCamera:
    """An overhead view of a light floor with a dark mouse-sized blob wandering on it."""

    live = False

    def __init__(self, width=960, height=720, fps=30, realtime=True, seed=0):
        self.width, self.height, self.fps = width, height, fps
        self.realtime = realtime
        self.dropped = 0
        self._n = 0
        self._t_start: float | None = None
        rng = np.random.default_rng(seed)
        ramp = np.linspace(-12, 12, width, dtype=np.float32)[None, :]  # uneven lighting
        self._floors = [
            np.clip(190 + ramp + rng.normal(0, 4, (height, width)), 0, 255).astype(np.uint8)
            for _ in range(6)
        ]

    def mouse_position(self, t: float):
        x = self.width / 2 + 0.38 * self.width * math.sin(2 * math.pi * t / 23.0)
        y = self.height / 2 + 0.36 * self.height * math.sin(2 * math.pi * t / 17.0 + 1.0)
        return x, y

    def render(self, position=None, heading_deg=0.0) -> np.ndarray:
        grey = self._floors[self._n % len(self._floors)].copy()
        if position is not None:
            axes = (int(self.width * 0.035), int(self.width * 0.018))
            centre = (int(round(position[0])), int(round(position[1])))
            cv2.ellipse(grey, centre, axes, heading_deg, 0, 360, 45, -1, cv2.LINE_AA)
        return cv2.cvtColor(grey, cv2.COLOR_GRAY2BGR)

    def read(self):
        if self._t_start is None:
            self._t_start = now()
        t = self._n / self.fps
        if self.realtime:
            delay = self._t_start + t - now()
            if delay > 0:
                time.sleep(delay)
        x0, y0 = self.mouse_position(t - 0.05)
        x1, y1 = self.mouse_position(t)
        frame = self.render((x1, y1), math.degrees(math.atan2(y1 - y0, x1 - x0)))
        self._n += 1
        return True, frame, (now() if self.realtime else self._t_start + t)

    def release(self) -> None:
        pass
