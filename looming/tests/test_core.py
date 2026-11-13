"""Tests of the tracking, zone, trigger and stimulus-timing logic (no camera or screen needed)."""
import json
import math
import os

import numpy as np
import pytest

import core
from stimulus import LoomSchedule, fit_rect, natural_key, size_to_px


def settings(**changes):
    cfg, unknown = core.merge_config(core.DEFAULTS["tracking"], changes)
    assert not unknown
    return cfg


# ---- settings -------------------------------------------------------------

def test_merge_keeps_defaults_and_reports_unknown_keys():
    cfg, unknown = core.merge_config(core.DEFAULTS, {
        "trigger": {"cooldown_s": 5, "cooldwn": 1}, "_comment": "ignored", "nonsense": 1})
    assert cfg["trigger"]["cooldown_s"] == 5
    assert cfg["trigger"]["dwell_s"] == core.DEFAULTS["trigger"]["dwell_s"]
    assert unknown == ["trigger.cooldwn", "nonsense"]
    assert core.DEFAULTS["trigger"]["cooldown_s"] == 60.0  # the defaults themselves are untouched


def test_example_config_matches_defaults():
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.example.json")
    with open(path) as f:
        assert json.load(f) == core.DEFAULTS


def test_validate_rejects_bad_choice():
    cfg, _ = core.merge_config(core.DEFAULTS, {"tracking": {"method": "magic"}})
    with pytest.raises(ValueError, match="tracking.method"):
        core.validate_config(cfg)
    core.validate_config(core.DEFAULTS)


# ---- tracking -------------------------------------------------------------

def test_dark_method_finds_the_mouse():
    cam = core.SyntheticCamera(realtime=False)
    tracker = core.MouseTracker(settings(method="dark"))
    for position in [(200, 150), (700, 600), (480, 360)]:
        det = tracker.detect(cam.render(position))
        assert det.found
        assert abs(det.x - position[0]) < 2 and abs(det.y - position[1]) < 2
    assert not tracker.detect(cam.render(None)).found


def test_background_method_needs_a_background_then_finds_the_mouse():
    cam = core.SyntheticCamera(realtime=False)
    tracker = core.MouseTracker(settings(method="background"))
    assert tracker.needs_background
    assert not tracker.detect(cam.render((300, 300))).found
    tracker.set_background([cam.render(None) for _ in range(10)])
    assert not tracker.needs_background
    det = tracker.detect(cam.render((300, 400)))
    assert det.found and abs(det.x - 300) < 2 and abs(det.y - 400) < 2
    assert not tracker.detect(cam.render(None)).found


def test_arena_mask_and_size_limits_exclude_blobs():
    cam = core.SyntheticCamera(realtime=False)
    frame = cam.render((200, 200))
    tracker = core.MouseTracker(settings(method="dark"))
    arena = core.polygon_mask((cam.width, cam.height), [[500, 100], [900, 100], [900, 600], [500, 600]])
    assert tracker.detect(frame).found
    assert not tracker.detect(frame, arena).found
    assert not core.MouseTracker(settings(method="dark", min_area_px=10000)).detect(frame).found
    assert not core.MouseTracker(settings(method="dark", max_area_px=500)).detect(frame).found


# ---- zones ----------------------------------------------------------------

def test_point_in_polygon():
    square = [[10, 10], [110, 10], [110, 110], [10, 110]]
    assert core.point_in_polygon(50, 50, square)
    assert not core.point_in_polygon(150, 50, square)


def test_zones_are_saved_loaded_and_rescaled(tmp_path):
    path = str(tmp_path / "zones.json")
    zones = {"arena": None, "trigger": [[100, 100], [300, 100], [300, 200]]}
    core.save_zones(path, zones, (640, 480))
    assert core.load_zones(path, (640, 480)) == zones
    assert core.load_zones(path, (1280, 960))["trigger"] == [[200, 200], [600, 200], [600, 400]]
    assert core.load_zones(str(tmp_path / "missing.json"), (640, 480)) == {"arena": None, "trigger": None}


# ---- trigger rules --------------------------------------------------------

def feed(trig, t0, seconds, found, in_zone, busy=False, dt=1 / 30):
    """Feed frames for a while; return the times at which a stimulus was started."""
    fired = []
    for i in range(int(round(seconds / dt))):
        t = t0 + i * dt
        if trig.update(t, found, in_zone, busy):
            fired.append(t)
    return fired


def make(**kw):
    args = dict(dwell_s=0.1, cooldown_s=10, max_trials=2, lost_counts_as_outside_after_s=2.0)
    args.update(kw)
    trig = core.TriggerLogic(**args)
    trig.arm()
    return trig


def test_not_armed_never_fires():
    trig = core.TriggerLogic()
    assert feed(trig, 0, 1, True, False) == [] and feed(trig, 1, 1, True, True) == []


def test_mouse_already_in_zone_when_armed_does_not_fire():
    trig = make()
    assert feed(trig, 0, 5, True, True) == []


def test_fires_once_on_entry_after_dwell():
    trig = make()
    feed(trig, 0, 1, True, False)
    fired = feed(trig, 1, 3, True, True)
    assert len(fired) == 1
    assert 0.1 <= fired[0] - 1 < 0.1 + 2 / 30
    assert trig.trials == 1


def test_brief_blip_shorter_than_dwell_does_not_fire():
    trig = make(dwell_s=0.2)
    feed(trig, 0, 1, True, False)
    assert feed(trig, 1, 0.1, True, True) == []
    assert feed(trig, 1.1, 1, True, False) == []


def test_cooldown_and_max_trials():
    trig = make()
    feed(trig, 0, 1, True, False)
    assert len(feed(trig, 1, 1, True, True)) == 1          # first stimulus at about t = 1.1
    feed(trig, 2, 1, True, False)
    assert feed(trig, 3, 5, True, True) == []              # back in the zone during the cooldown
    fired = feed(trig, 8, 5, True, True)                   # still there when the cooldown ends
    assert len(fired) == 1 and 11.0 < fired[0] < 11.3
    feed(trig, 13, 1, True, False)
    assert feed(trig, 14, 30, True, True) == []            # max_trials reached
    assert trig.exhausted and trig.status(50) == "all trials done"


def test_require_fresh_entry_ignores_entries_made_during_cooldown():
    trig = make(require_fresh_entry=True)
    feed(trig, 0, 1, True, False)
    assert len(feed(trig, 1, 1, True, True)) == 1
    feed(trig, 2, 1, True, False)
    assert feed(trig, 3, 20, True, True) == []             # entered during the cooldown and stayed
    feed(trig, 23, 1, True, False)
    assert len(feed(trig, 24, 1, True, True)) == 1         # left and came back: fires


def test_busy_stimulus_blocks_firing():
    trig = make()
    feed(trig, 0, 1, True, False)
    assert feed(trig, 1, 1, True, True, busy=True) == []
    assert len(feed(trig, 2, 1, True, True)) == 1


def test_short_tracking_dropout_is_not_an_exit_but_a_long_one_is():
    trig = make()
    assert feed(trig, 0, 1, True, True) == []              # armed with the mouse inside
    assert feed(trig, 1, 0.5, False, False) == []          # lost for 0.5 s
    assert feed(trig, 1.5, 2, True, True) == []            # ...is not treated as having left
    assert feed(trig, 3.5, 2.5, False, False) == []        # hidden (e.g. in the shelter) for 2.5 s
    assert len(feed(trig, 6, 1, True, True)) == 1          # comes out into the zone: fires


def test_manual_stimulus_restarts_cooldown():
    trig = make()
    feed(trig, 0, 1, True, False)
    trig.note_stimulus(1.0)
    assert trig.trials == 1 and trig.cooldown_remaining(2.0) == pytest.approx(9.0)
    assert feed(trig, 1, 5, True, True) == []


# ---- stimulus geometry and timing ------------------------------------------

LOOM = dict(core.DEFAULTS["stimulus"]["loom"], repeats=3)


def test_degrees_to_pixels():
    # 20 degrees at 30 cm is 2 * 30 * tan(10 deg) = 10.58 cm; at 40 px/cm that is 423 px.
    assert size_to_px(20, "deg", 40.0, 30.0) == pytest.approx(423.2, abs=0.1)
    assert size_to_px(77, "px", 40.0, 30.0) == 77


def test_loom_schedule_timing():
    sched = LoomSchedule(LOOM, px_per_cm=40.0, distance_cm=30.0)
    assert sched.cycle_s == pytest.approx(1.0)
    assert sched.duration_s == pytest.approx(2.5)           # 3 looms, no gap after the last
    assert sched.diameter_px(0.0) == pytest.approx(sched.start_px)
    assert sched.diameter_px(0.125) == pytest.approx(size_to_px(11, "deg", 40.0, 30.0))
    assert sched.diameter_px(0.3) == pytest.approx(sched.end_px)   # holding
    assert sched.diameter_px(0.6) is None                          # gap
    assert sched.diameter_px(1.0) == pytest.approx(sched.start_px)  # second loom
    assert sched.diameter_px(2.4) == pytest.approx(sched.end_px)
    assert sched.diameter_px(2.5) is None and sched.diameter_px(-0.1) is None


def test_loom_never_shrinks_while_expanding():
    for profile in ("linear", "approach"):
        sched = LoomSchedule(dict(LOOM, profile=profile), 40.0, 30.0)
        sizes = [sched.diameter_px(t) for t in np.linspace(0, 0.2499, 60)]
        assert all(b >= a for a, b in zip(sizes, sizes[1:]))
        assert sizes[0] == pytest.approx(sched.start_px)
        assert sizes[-1] == pytest.approx(sched.end_px, rel=0.02)
    # an approaching object grows slowly at first: smaller than linear half way through
    assert LoomSchedule(dict(LOOM, profile="approach"), 40.0, 30.0).diameter_px(0.125) < \
        LoomSchedule(LOOM, 40.0, 30.0).diameter_px(0.125)


def test_fit_rect_and_natural_sorting():
    assert fit_rect((100, 100), (400, 200), "contain") == (100, 0, 200, 200)
    assert fit_rect((100, 100), (400, 200), "cover") == (0, -100, 400, 400)
    assert fit_rect((100, 100), (400, 200), "stretch") == (0, 0, 400, 200)
    assert fit_rect((100, 100), (400, 200), "none") == (150, 50, 100, 100)
    assert sorted(["f10.png", "f2.png", "f1.png"], key=natural_key) == ["f1.png", "f2.png", "f10.png"]


def test_synthetic_camera_moves_the_mouse():
    cam = core.SyntheticCamera(realtime=False)
    tracker = core.MouseTracker(settings(method="dark"))
    xs = []
    for _ in range(60):
        ok, frame, _t = cam.read()
        det = tracker.detect(frame)
        assert ok and det.found
        xs.append(det.x)
    assert max(xs) - min(xs) > 50 and not math.isnan(xs[0])
