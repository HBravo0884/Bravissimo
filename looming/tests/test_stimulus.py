"""Tests of the stimulus window process, run on SDL's 'dummy' screen (see conftest.py)."""
import multiprocessing as mp
import queue
import time

import cv2
import numpy as np
import pygame
import pytest

import core
import stimulus

FAST_LOOM = {"expand_s": 0.1, "hold_s": 0.1, "isi_s": 0.1, "repeats": 2}   # 0.5 s in total


class Window:
    """A stimulus process plus helpers to talk to it."""

    def __init__(self, **changes):
        changes.setdefault("display", 0)
        changes.setdefault("fullscreen", False)
        self.cfg, unknown = core.merge_config(core.DEFAULTS["stimulus"], changes)
        assert not unknown
        ctx = mp.get_context("spawn")
        self.cmd, self.evt = ctx.Queue(), ctx.Queue()
        self.proc = ctx.Process(target=stimulus.run, args=(self.cfg, self.cmd, self.evt), daemon=True)
        self.proc.start()

    def expect(self, kind, timeout=15.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                event = self.evt.get(timeout=0.1)
            except queue.Empty:
                continue
            assert event["evt"] == kind, f"expected {kind}, got {event}"
            return event
        raise AssertionError(f"no '{kind}' event within {timeout} s")

    def close(self):
        self.cmd.put({"cmd": "quit"})
        self.proc.join(timeout=5)
        assert not self.proc.is_alive()


@pytest.fixture
def window(request):
    made = []

    def make(**changes):
        made.append(Window(**changes))
        return made[-1]

    yield make
    for w in made:
        if w.proc.is_alive():
            w.proc.terminate()


def test_loom_is_shown_for_the_configured_time(window):
    w = window(loom=FAST_LOOM)
    ready = w.expect("ready")
    assert ready["screen_size"] == [960, 540]
    assert ready["duration_s"] == pytest.approx(0.5)
    assert "looming disc" in ready["description"]

    t_sent = core.now()
    w.cmd.put({"cmd": "trigger", "stim_id": 7, "label": "auto"})
    onset = w.expect("onset")
    offset = w.expect("offset")
    assert onset["stim_id"] == 7 and onset["label"] == "auto"
    assert 0 <= onset["t"] - t_sent < 0.1            # first frame within 100 ms even on a busy test machine
    assert offset["t"] - onset["t"] == pytest.approx(0.5, abs=0.08)
    assert offset["frames"] == pytest.approx(0.5 * ready["refresh_hz"], abs=4)
    assert offset["aborted"] is False

    # a second trigger works the same way
    w.cmd.put({"cmd": "trigger", "stim_id": 8, "label": "manual"})
    assert w.expect("onset")["stim_id"] == 8
    assert w.expect("offset")["stim_id"] == 8
    w.close()


def test_trigger_during_a_stimulus_is_refused_and_abort_stops_it(window):
    w = window(loom=dict(FAST_LOOM, repeats=40), sync_patch={"enabled": True, "corner": "top_right"})
    w.expect("ready")
    w.cmd.put({"cmd": "trigger", "stim_id": 1, "label": "auto"})
    onset = w.expect("onset")
    w.cmd.put({"cmd": "trigger", "stim_id": 2, "label": "auto"})
    assert w.expect("busy")["stim_id"] == 2
    w.cmd.put({"cmd": "abort"})
    offset = w.expect("offset")
    assert offset["stim_id"] == 1 and offset["aborted"] is True
    assert offset["t"] - onset["t"] < 2.0
    w.close()


def test_new_settings_are_taken_while_running(window):
    w = window(loom=FAST_LOOM)
    assert w.expect("ready")["duration_s"] == pytest.approx(0.5)
    changed, _ = core.merge_config(w.cfg, {"loom": dict(FAST_LOOM, repeats=4, end_size=30)})
    w.cmd.put({"cmd": "configure", "cfg": changed})
    configured = w.expect("configured")
    assert configured["duration_s"] == pytest.approx(1.1) and "2->30 deg" in configured["description"]

    w.cmd.put({"cmd": "trigger", "stim_id": 1, "label": "auto"})
    onset = w.expect("onset")
    w.cmd.put({"cmd": "configure", "cfg": w.cfg})          # not while a stimulus is playing
    assert "a stimulus is playing" in w.expect("config_error")["msg"]
    offset = w.expect("offset")
    assert offset["t"] - onset["t"] == pytest.approx(1.1, abs=0.1)
    w.close()


def test_missing_display_is_an_error_in_fullscreen_but_not_for_a_preview_window(window):
    w = window(display=5, fullscreen=True)
    error = w.expect("error")
    assert "Display 5 was not found" in error["msg"]
    w.proc.join(timeout=5)
    assert not w.proc.is_alive()

    preview = window(display=5, fullscreen=False)      # falls back to the screen that exists
    assert preview.expect("ready")["screen_size"] == [960, 540]
    preview.close()


def test_image_sequence(window, tmp_path):
    for i in range(1, 13):    # 12 frames of a growing disc, named so that plain sorting would get it wrong
        img = np.full((120, 160, 3), 128, np.uint8)
        cv2.circle(img, (80, 60), 4 * i, (0, 0, 0), -1)
        cv2.imwrite(str(tmp_path / f"loom{i}.png"), img)
    w = window(mode="images", images={"dir": str(tmp_path), "fps": 30, "hold_last_s": 0.1, "repeats": 2, "isi_s": 0.2})
    ready = w.expect("ready")
    assert "12 images" in ready["description"]
    assert ready["duration_s"] == pytest.approx(2 * (12 / 30 + 0.1) + 0.2)
    w.cmd.put({"cmd": "trigger", "stim_id": 1, "label": "auto"})
    onset, offset = w.expect("onset"), w.expect("offset")
    assert offset["t"] - onset["t"] == pytest.approx(ready["duration_s"], abs=0.1)
    w.close()


def test_movie(window, tmp_path):
    path = str(tmp_path / "loom.mp4")
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 30.0, (160, 120))
    assert writer.isOpened()
    for i in range(15):       # half a second
        img = np.full((120, 160, 3), 128, np.uint8)
        cv2.circle(img, (80, 60), 4 * i, (0, 0, 0), -1)
        writer.write(img)
    writer.release()
    w = window(mode="movie", movie={"path": path, "repeats": 2, "isi_s": 0.1})
    ready = w.expect("ready")
    assert ready["duration_s"] == pytest.approx(1.1)
    for stim_id in (1, 2):    # the second play checks that the movie rewinds
        w.cmd.put({"cmd": "trigger", "stim_id": stim_id, "label": "auto"})
        onset, offset = w.expect("onset"), w.expect("offset")
        assert offset["t"] - onset["t"] == pytest.approx(1.1, abs=0.12)
    w.close()


def test_disc_is_drawn_with_the_right_size_and_place():
    pygame.display.init()
    try:
        screen = pygame.display.set_mode((800, 600))
        cfg, _ = core.merge_config(core.DEFAULTS["stimulus"], {
            "screen_width_cm": 40.0, "viewing_distance_cm": 30.0,          # 20 px per cm
            "loom": {"center": [0.25, 0.5], "repeats": 1}})
        stim = stimulus.LoomStimulus(cfg, screen)

        def disc_width(t):
            screen.fill((128, 128, 128))
            visible, finished = stim.draw(screen, t)
            row = pygame.surfarray.array3d(screen)[:, 300, 0]              # the row through the centre
            dark = np.flatnonzero(row == 0)
            return visible, finished, (dark.size, dark.mean() if dark.size else None)

        visible, finished, (width, centre) = disc_width(0.3)               # holding at 20 degrees
        assert visible and not finished
        assert width == pytest.approx(2 * 30 * np.tan(np.radians(10)) * 20, abs=2)   # 211.6 px
        assert centre == pytest.approx(200, abs=1)
        assert disc_width(0.0)[2][0] == pytest.approx(2 * 30 * np.tan(np.radians(1)) * 20, abs=2)   # 2 degrees
        assert disc_width(0.5) == (False, True, (0, None))                 # finished: plain background

        patch = {"size_px": 60}
        assert stimulus._patch_rect(dict(patch, corner="bottom_left"), (800, 600)) == pygame.Rect(0, 540, 60, 60)
        assert stimulus._patch_rect(dict(patch, corner="top_right"), (800, 600)) == pygame.Rect(740, 0, 60, 60)
    finally:
        pygame.display.quit()
