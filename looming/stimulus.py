"""The stimulus window (pygame). It runs in its own process so that the screen
keeps refreshing at the monitor's rate whatever the camera and tracker are doing.

The tracking program sends commands on ``cmd_q`` ({"cmd": "trigger" | "abort" | "quit"})
and receives events on ``evt_q`` ({"evt": "ready" | "onset" | "offset" | "busy" |
"closed" | "error", "t": time on core.now()}).
"""
from __future__ import annotations

import math
import os
import queue
import re
import sys
import time

os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
import pygame  # noqa: E402

from core import now  # noqa: E402

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".gif")


# --------------------------------------------------------------------------
# Looming disc geometry (no pygame needed)
# --------------------------------------------------------------------------

def size_to_px(size: float, units: str, px_per_cm: float, distance_cm: float) -> float:
    """Diameter on the screen, in pixels, of a disc of the given size."""
    if units == "px":
        return float(size)
    return 2.0 * distance_cm * math.tan(math.radians(size) / 2.0) * px_per_cm


class LoomSchedule:
    """Disc diameter as a function of time for a train of looming discs."""

    def __init__(self, loom: dict, px_per_cm: float, distance_cm: float):
        self.units = loom["units"]
        self.profile = loom["profile"]
        self.start = float(loom["start_size"])
        self.end = float(loom["end_size"])
        self.expand_s = max(float(loom["expand_s"]), 1e-6)
        self.hold_s = max(float(loom["hold_s"]), 0.0)
        self.isi_s = max(float(loom["isi_s"]), 0.0)
        self.repeats = max(int(loom["repeats"]), 1)
        self.cycle_s = self.expand_s + self.hold_s + self.isi_s
        self.duration_s = self.repeats * self.cycle_s - self.isi_s
        self._px = lambda size: size_to_px(size, self.units, px_per_cm, distance_cm)
        self.start_px = self._px(self.start)
        self.end_px = self._px(self.end)

    def diameter_px(self, t: float) -> float | None:
        """Diameter t seconds after onset; None between discs and after the last one."""
        if t < 0 or t >= self.duration_s:
            return None
        t_cycle = t - int(t // self.cycle_s) * self.cycle_s
        if t_cycle >= self.expand_s + self.hold_s:
            return None
        if t_cycle >= self.expand_s:
            return self.end_px
        if self.profile == "approach" and self.end_px > self.start_px:
            # An object of fixed size approaching at constant speed.
            t_collision = self.expand_s * self.end_px / (self.end_px - self.start_px)
            return self.start_px * t_collision / (t_collision - t_cycle)
        return self._px(self.start + (self.end - self.start) * t_cycle / self.expand_s)


def fit_rect(src_size, dst_size, mode: str):
    """(x, y, w, h) at which to draw something of src_size on a surface of dst_size."""
    sw, sh = src_size
    dw, dh = dst_size
    if mode == "stretch":
        return 0, 0, dw, dh
    if mode == "none":
        tw, th = sw, sh
    else:
        scale = min(dw / sw, dh / sh) if mode == "contain" else max(dw / sw, dh / sh)
        tw, th = max(1, round(sw * scale)), max(1, round(sh * scale))
    return (dw - tw) // 2, (dh - th) // 2, tw, th


def natural_key(name: str):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", name)]


# --------------------------------------------------------------------------
# Things that can be shown.  draw(screen, t) returns (visible, finished).
# --------------------------------------------------------------------------

class LoomStimulus:
    def __init__(self, cfg: dict, screen):
        w, h = screen.get_size()
        loom = cfg["loom"]
        self.schedule = LoomSchedule(loom, w / float(cfg["screen_width_cm"]), float(cfg["viewing_distance_cm"]))
        self.color = tuple(loom["disc_color"])
        self.center = (round(loom["center"][0] * w), round(loom["center"][1] * h))
        self.duration_s = self.schedule.duration_s
        unit = "deg" if loom["units"] == "deg" else "px"
        self.description = (
            f"looming disc {loom['start_size']:g}->{loom['end_size']:g} {unit} "
            f"({self.schedule.start_px:.0f}->{self.schedule.end_px:.0f} px) x{self.schedule.repeats}"
        )

    def start(self) -> None:
        pass

    def draw(self, screen, t: float):
        if t >= self.duration_s:
            return False, True
        diameter = self.schedule.diameter_px(t)
        if diameter is None:
            return False, False
        pygame.draw.circle(screen, self.color, self.center, max(1, round(diameter / 2)))
        return True, False


class ImageClip:
    """A folder of images shown one after the other."""

    def __init__(self, settings: dict, screen):
        folder = settings["dir"]
        names = sorted((n for n in os.listdir(folder) if n.lower().endswith(IMAGE_EXTENSIONS)), key=natural_key)
        if not names:
            raise RuntimeError(f"No image files found in {folder!r}")
        self.fps = float(settings["fps"])
        self.hold_last_s = float(settings["hold_last_s"])
        self.frames = []
        for name in names:
            image = pygame.image.load(os.path.join(folder, name))
            image = image.convert_alpha() if image.get_flags() & pygame.SRCALPHA else image.convert()
            x, y, w, h = fit_rect(image.get_size(), screen.get_size(), settings["fit"])
            if (w, h) != image.get_size():
                image = pygame.transform.smoothscale(image, (w, h))
            self.frames.append((image, (x, y)))
        self.duration_s = len(self.frames) / self.fps + self.hold_last_s
        self.description = f"{len(self.frames)} images at {self.fps:g} fps"

    def rewind(self) -> None:
        pass

    def draw(self, screen, t: float) -> bool:
        if t >= self.duration_s:
            return False
        image, position = self.frames[min(int(t * self.fps), len(self.frames) - 1)]
        screen.blit(image, position)
        return True


class MovieClip:
    """A video file, decoded as it plays. The first frame is always ready in advance."""

    def __init__(self, settings: dict, screen):
        import cv2

        self._cv2 = cv2
        self.path = settings["path"]
        self.fit = settings["fit"]
        self.screen_size = screen.get_size()
        self.cap = cv2.VideoCapture(self.path)
        if not self.cap.isOpened():
            raise RuntimeError(f"Could not open the movie {self.path!r}")
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        count = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.duration_s = count / self.fps if count > 0 else None
        self.description = f"movie {os.path.basename(self.path)} ({self.fps:g} fps)"
        self._index = -1
        self._current = None
        self.rewind()

    def _read(self) -> bool:
        ok, frame = self.cap.read()
        if not ok:
            self._current = None
            return False
        cv2 = self._cv2
        x, y, w, h = fit_rect((frame.shape[1], frame.shape[0]), self.screen_size, self.fit)
        if (w, h) != (frame.shape[1], frame.shape[0]):
            frame = cv2.resize(frame, (w, h), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        self._current = (pygame.image.frombuffer(rgb.tobytes(), (w, h), "RGB"), (x, y))
        self._index += 1
        return True

    def rewind(self) -> None:
        if self._index == 0 and self._current is not None:
            return
        if self._index >= 0:
            self.cap.release()
            self.cap = self._cv2.VideoCapture(self.path)
        self._index = -1
        if not self._read():
            raise RuntimeError(f"Could not read a frame from the movie {self.path!r}")

    def draw(self, screen, t: float) -> bool:
        target = int(t * self.fps)
        while self._index < target:
            if self._index + 1 < target:  # behind schedule: skip without converting
                if not self.cap.grab():
                    self._current = None
                    break
                self._index += 1
            elif not self._read():
                break
        if self._current is None:
            return False
        screen.blit(*self._current)
        return True


class Repeating:
    """Plays a clip ``repeats`` times with ``isi_s`` of plain background in between."""

    def __init__(self, clip, repeats: int, isi_s: float):
        self.clip = clip
        self.repeats = max(int(repeats), 1)
        self.isi_s = max(float(isi_s), 0.0)
        one = clip.duration_s
        self.duration_s = None if one is None else self.repeats * (one + self.isi_s) - self.isi_s
        self.description = clip.description + (f" x{self.repeats}" if self.repeats > 1 else "")

    def start(self) -> None:
        self._done = 0
        self._t0 = 0.0
        self._gap_end = None
        self.clip.rewind()

    def draw(self, screen, t: float):
        if self._gap_end is not None:
            if t < self._gap_end:
                return False, False
            self._t0, self._gap_end = self._gap_end, None
        while True:
            if self.clip.draw(screen, t - self._t0):
                return True, False
            self._done += 1
            if self._done >= self.repeats:
                return False, True
            self.clip.rewind()  # decode the next first frame now, not at its onset
            if self.isi_s > 0:
                self._gap_end = t + self.isi_s
                return False, False
            self._t0 = t


def build_stimulus(cfg: dict, screen):
    mode = cfg["mode"]
    if mode == "loom":
        return LoomStimulus(cfg, screen)
    if mode == "movie":
        settings = cfg["movie"]
        return Repeating(MovieClip(settings, screen), settings["repeats"], settings["isi_s"])
    settings = cfg["images"]
    return Repeating(ImageClip(settings, screen), settings["repeats"], settings["isi_s"])


# --------------------------------------------------------------------------
# The window
# --------------------------------------------------------------------------

def _make_dpi_aware() -> None:
    """Stop Windows from scaling (and blurring) the stimulus window."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def _open_window(cfg: dict):
    # Keep a fullscreen stimulus on screen when the tracking window is clicked.
    os.environ.setdefault("SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS", "0")
    _make_dpi_aware()
    pygame.display.init()
    count = pygame.display.get_num_displays()
    index = int(cfg["display"])
    if not 0 <= index < count and not cfg["fullscreen"]:
        index = 0  # a preview window can go on whatever screen there is
    if not 0 <= index < count:
        raise RuntimeError(
            f"Display {index} was not found: this computer reports {count} display(s), numbered from 0. "
            "Connect the stimulus monitor and set it to 'Extend' (not 'Duplicate'), "
            "choose another one with --display, or try it in a window with --windowed."
        )
    vsync_requested = False
    if cfg["fullscreen"]:
        size = pygame.display.get_desktop_sizes()[index]
        try:  # SCALED at the native resolution is what gives vertical sync
            screen = pygame.display.set_mode(size, pygame.FULLSCREEN | pygame.SCALED, display=index, vsync=1)
            vsync_requested = True
        except pygame.error:
            screen = pygame.display.set_mode(size, pygame.FULLSCREEN, display=index)
        pygame.mouse.set_visible(False)
    else:
        screen = pygame.display.set_mode(tuple(cfg["window_size"]), 0, display=index)
    pygame.display.set_caption("Looming stimulus")
    return screen, vsync_requested


def _measure_refresh(screen, background, nominal_hz: float, vsync_requested: bool):
    """Return (seconds per frame, whether flips wait for the monitor)."""
    if not vsync_requested:
        return 1.0 / float(nominal_hz), False
    stamps = []
    for _ in range(45):
        screen.fill(background)
        pygame.display.flip()
        stamps.append(time.perf_counter())
        pygame.event.pump()
    gaps = sorted(b - a for a, b in zip(stamps[10:], stamps[11:]))
    median = gaps[len(gaps) // 2]
    if not 1 / 400 <= median <= 1 / 20:  # not a believable monitor rate: sync is not really on
        return 1.0 / float(nominal_hz), False
    return median, True


def _patch_rect(settings: dict, screen_size):
    size = int(settings["size_px"])
    w, h = screen_size
    x = 0 if settings["corner"].endswith("left") else w - size
    y = 0 if settings["corner"].startswith("top") else h - size
    return pygame.Rect(x, y, size, size)


def _next_command(cmd_q, timeout: float):
    try:
        return cmd_q.get(timeout=timeout) if timeout > 0 else cmd_q.get_nowait()
    except queue.Empty:
        return None


def _sleep_until(deadline: float) -> None:
    while True:
        remaining = deadline - now()
        if remaining <= 0:
            return
        time.sleep(remaining - 0.001 if remaining > 0.002 else 0)


def _run(cfg: dict, cmd_q, evt_q) -> None:
    screen, vsync_requested = _open_window(cfg)
    background = tuple(cfg["background_color"])
    frame_s, vsync = _measure_refresh(screen, background, cfg["refresh_hz"], vsync_requested)
    stimulus = build_stimulus(cfg, screen)
    patch = _patch_rect(cfg["sync_patch"], screen.get_size()) if cfg["sync_patch"]["enabled"] else None

    evt_q.put({
        "evt": "ready", "t": now(),
        "screen_size": list(screen.get_size()),
        "refresh_hz": round(1.0 / frame_s, 2),
        "vsync": vsync,
        "description": stimulus.description,
        "duration_s": stimulus.duration_s,
    })

    pending = None   # trigger command waiting for the next frame
    active = None    # the stimulus being shown
    last_flip = flip_started = now()
    running = True
    while running:
        # Commands. While idle, wait for one for most of the frame, so that a
        # trigger is drawn on the very next refresh instead of the one after.
        idle = active is None and pending is None
        command = _next_command(cmd_q, max(frame_s - 0.004 - (now() - last_flip), 0.0) if idle else 0.0)
        abort = False
        while command is not None:
            name = command.get("cmd")
            if name == "trigger":
                if active is None and pending is None:
                    pending = dict(command, t_received=now())
                else:
                    evt_q.put({"evt": "busy", "t": now(), "stim_id": command.get("stim_id")})
            elif name == "abort":
                abort = True
            elif name == "quit":
                running = False
            command = _next_command(cmd_q, 0.0)

        for event in pygame.event.get():
            if event.type == pygame.QUIT or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                evt_q.put({"evt": "closed", "t": now()})
                running = False

        screen.fill(background)
        visible = finished = False
        if pending is not None:
            stimulus.start()
            active = {"stim_id": pending.get("stim_id"), "label": pending.get("label"),
                      "t_received": pending["t_received"], "t_onset": None, "frames": 0, "long_frames": 0}
            pending = None
        if active is not None:
            if abort or not running:
                finished = True
            else:
                # Time at which the frame being drawn will actually be on screen.
                t = 0.0 if active["t_onset"] is None else last_flip - active["t_onset"] + frame_s
                visible, finished = stimulus.draw(screen, t)
        if patch is not None:
            screen.fill((255, 255, 255) if visible else (0, 0, 0), patch)

        if not vsync and active is not None and active["t_onset"] is not None:
            _sleep_until(flip_started + frame_s)   # no vertical sync: keep our own steady pace
        flip_started = now()
        pygame.display.flip()
        t_flip = now()

        if active is not None:
            if active["t_onset"] is None and not finished:
                active["t_onset"] = t_flip
                evt_q.put({"evt": "onset", "t": t_flip, "stim_id": active["stim_id"], "label": active["label"],
                           "wait_ms": round((t_flip - active["t_received"]) * 1000, 2)})
            elif active["t_onset"] is not None:
                active["frames"] += 1
                if t_flip - last_flip > 1.5 * frame_s:
                    active["long_frames"] += 1
            if finished:
                evt_q.put({"evt": "offset", "t": t_flip, "stim_id": active["stim_id"], "label": active["label"],
                           "frames": active["frames"], "long_frames": active["long_frames"], "aborted": abort or not running})
                active = None
        last_flip = t_flip


def run(cfg: dict, cmd_q, evt_q) -> None:
    """Entry point of the stimulus process. ``cfg`` is the "stimulus" section of the config."""
    try:
        _run(cfg, cmd_q, evt_q)
    except KeyboardInterrupt:
        pass
    except Exception as exc:  # report it to the tracking program instead of dying silently
        evt_q.put({"evt": "error", "t": now(), "msg": f"{type(exc).__name__}: {exc}"})
    finally:
        pygame.quit()
