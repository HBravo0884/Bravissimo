"""End-to-end run of the program with a fake camera, a scripted user and no real screen."""
import csv
import json
import os

import cv2

import looming_test as lt

ZONE = [[560, 60], [940, 60], [940, 660], [560, 660]]    # the right-hand part of the 960 x 720 demo image


class ScriptedUser:
    """Stands in for OpenCV's window functions: presses keys and clicks at given frame numbers."""

    def __init__(self, keys, clicks):
        self.keys, self.clicks = keys, clicks
        self.frame = 0
        self.images = []
        self.on_mouse = None

    def install(self, monkeypatch):
        monkeypatch.setattr(cv2, "namedWindow", lambda *a, **k: None)
        monkeypatch.setattr(cv2, "resizeWindow", lambda *a, **k: None)
        monkeypatch.setattr(cv2, "destroyAllWindows", lambda *a, **k: None)
        monkeypatch.setattr(cv2, "getWindowProperty", lambda *a, **k: 1.0)
        monkeypatch.setattr(cv2, "setMouseCallback", lambda name, callback: setattr(self, "on_mouse", callback))
        monkeypatch.setattr(cv2, "imshow", lambda name, image: self.images.append(image))
        monkeypatch.setattr(cv2, "waitKey", self.wait_key)

    def wait_key(self, delay):
        self.frame += 1
        for x, y in self.clicks.get(self.frame, []):
            self.on_mouse(cv2.EVENT_MOUSEMOVE, x, y, 0, None)
            self.on_mouse(cv2.EVENT_LBUTTONDOWN, x, y, 0, None)
        key = self.keys.get(self.frame, -1)
        return ord(key) if isinstance(key, str) else key


def read_csv(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def test_draw_zone_arm_and_trigger_on_entry(tmp_path, monkeypatch):
    config = {
        "stimulus": {"loom": {"expand_s": 0.1, "hold_s": 0.1, "isi_s": 0.1, "repeats": 2}},   # 0.5 s
        "output": {"dir": str(tmp_path / "sessions"), "zones_file": str(tmp_path / "zones.json")},
    }
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps(config))

    # The demo mouse starts in the middle moving right and crosses x = 560 after about 0.8 s (frame 25).
    user = ScriptedUser(
        keys={1: "t",            # test the stimulus before arming
              2: "z", 4: 13,     # draw the trigger zone, Enter to finish
              5: " ",            # arm
              85: "q", 86: "q"},
        clicks={3: ZONE},
    )
    user.install(monkeypatch)

    app = lt.App(lt.build_config(lt.parse_args(["--demo", "--config", str(config_path), "--name", "mouse 01"])), "mouse 01")
    try:
        app.start()
        app.run()
    finally:
        app.close()

    folder = app.session.dir
    assert folder.endswith("_mouse_01")
    events = read_csv(os.path.join(folder, "events.csv"))
    names = [e["event"] for e in events]
    assert names == ["trigger", "stim_onset", "zone_set", "armed", "stim_offset",
                     "trigger", "stim_onset", "stim_offset"], names

    test_trigger, auto_trigger = [e for e in events if e["event"] == "trigger"]
    assert json.loads(test_trigger["details"])["label"] == "test"
    assert json.loads(auto_trigger["details"])["label"] == "auto"
    assert 560 <= float(auto_trigger["x"]) < 620          # fired just inside the zone...
    assert 0.8 < float(auto_trigger["t_s"]) < 1.3         # ...shortly after the mouse crossed into it
    auto_onset, auto_offset = events[-2], events[-1]
    assert auto_onset["stim_id"] == auto_offset["stim_id"] == auto_trigger["stim_id"] == "2"
    assert json.loads(auto_onset["details"])["after_trigger_ms"] < 100
    assert 0.4 < float(auto_offset["t_s"]) - float(auto_onset["t_s"]) < 0.6

    rows = read_csv(os.path.join(folder, "tracking.csv"))
    assert len(rows) == 86 and all(r["detected"] == "1" for r in rows)
    first_inside = next(r for r in rows if r["in_zone"] == "1")
    assert rows[10]["in_zone"] == "0" and rows[-1]["in_zone"] == "1"
    assert float(auto_trigger["t_s"]) - float(first_inside["t_s"]) < 0.25    # dwell 0.1 s plus a few frames
    assert any(r["stim_on"] == "1" for r in rows) and rows[-1]["stim_on"] == "0"
    assert [r["video_frame"] for r in rows] == [str(i) for i in range(86)]

    session = json.loads(open(os.path.join(folder, "session.json")).read())
    assert session["trials"] == 1 and session["zones"]["trigger"] == ZONE and session["frames"] == 86
    assert json.loads((tmp_path / "zones.json").read_text())["trigger"] == ZONE

    video = cv2.VideoCapture(os.path.join(folder, "video.mp4"))
    assert int(video.get(cv2.CAP_PROP_FRAME_COUNT)) == 86
    assert len(user.images) == 86 and user.images[0].shape == (720, 960 + 400, 3)


def test_arming_is_refused_without_a_zone(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps({"output": {
        "dir": str(tmp_path / "sessions"), "zones_file": str(tmp_path / "zones.json"), "record_video": False}}))
    user = ScriptedUser(keys={2: " ", 6: "q", 7: "q"}, clicks={})
    user.install(monkeypatch)
    app = lt.App(lt.build_config(lt.parse_args(["--demo", "--config", str(config_path)])))
    try:
        app.start()
        app.run()
    finally:
        app.close()
    assert not app.trig.armed
    assert read_csv(os.path.join(app.session.dir, "events.csv")) == []
    assert not os.path.exists(os.path.join(app.session.dir, "video.mp4"))


def test_other_keys_arena_threshold_method_recording_and_stop(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps({
        "stimulus": {"loom": {"repeats": 30}},     # long enough that only X ends it
        "output": {"dir": str(tmp_path / "sessions"), "zones_file": str(tmp_path / "zones.json")}}))
    left_half = [[10, 10], [300, 10], [300, 700], [10, 700]]
    user = ScriptedUser(
        keys={2: "a", 4: 8, 6: 13,            # arena: 5 clicks, Backspace removes the last, Enter finishes
              8: "z", 10: 27,                 # start a trigger zone, then Esc cancels it
              12: "+", 13: "+", 14: "-",      # threshold 70 -> 74 -> 72
              15: "m", 16: "h", 17: "R",      # tracker view, hide help, pause recording (capital: Caps Lock)
              20: "r",                        # resume recording
              22: "t", 30: "x",               # play the stimulus, stop it
              40: "n", 41: "n", 42: "n",      # tracking method: dark -> light -> background -> dark
              44: "c",                        # clear the zones
              46: 200,                        # a key code that is not a character is ignored
              50: "q", 51: "q"},
        clicks={3: left_half + [[500, 500]], 9: [[600, 100], [700, 100]]},
    )
    user.install(monkeypatch)
    app = lt.App(lt.build_config(lt.parse_args(["--demo", "--config", str(config_path)])))
    try:
        app.start()
        app.run()
    finally:
        app.close()

    events = read_csv(os.path.join(app.session.dir, "events.csv"))
    names = [e["event"] for e in events]
    assert names == ["zone_set", "recording_paused", "recording_started", "trigger", "stim_onset", "stim_offset",
                     "tracking_method", "tracking_method", "tracking_method", "zones_cleared"], names
    assert json.loads(events[0]["details"]) == {"zone": "arena", "points": left_half}
    assert json.loads(events[5]["details"])["aborted"] is True
    assert float(events[5]["t_s"]) - float(events[4]["t_s"]) < 1.0       # stopped long before its 29.5 s
    assert app.cfg["tracking"]["intensity_threshold"] == 72
    assert app.cfg["tracking"]["method"] == "dark"
    assert app.show_mask and not app.show_help
    assert app.zones == {"arena": None, "trigger": None} and app.arena_mask is None

    rows = read_csv(os.path.join(app.session.dir, "tracking.csv"))
    # The demo mouse is on the right; with the arena limited to the left strip it must not be found.
    assert rows[2]["detected"] == "1" and all(r["detected"] == "0" for r in rows[8:40])
    assert rows[-1]["detected"] == "1"                                   # found again once the zones are cleared
    assert [r["video_frame"] for r in rows[15:21]] == ["15", "16", "", "", "", "17"]   # paused for three frames


def test_live_camera_reader_thread(tmp_path):
    """The threaded reader, fed from a video file because the test machine has no camera."""
    path = str(tmp_path / "clip.mp4")
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 30.0, (320, 240))
    synthetic = lt.core.SyntheticCamera(width=320, height=240, realtime=False)
    for _ in range(40):
        writer.write(synthetic.read()[1])
    writer.release()

    settings = dict(lt.core.DEFAULTS["camera"], source=path, backend="any")
    cam = lt.LiveCamera(settings)
    try:
        assert (cam.width, cam.height) == (320, 240) and cam.fps == 30
        got = 0
        stamps = []
        while True:
            ok, frame, t = cam.read(timeout=0.5)
            if not ok:
                break                                    # the file has ended: no new frame arrives
            assert frame.shape == (240, 320, 3)
            got += 1
            stamps.append(t)
        assert got >= 1 and got + cam.dropped == 40      # every frame was either delivered or counted as skipped
        assert stamps == sorted(stamps)
    finally:
        cam.release()
