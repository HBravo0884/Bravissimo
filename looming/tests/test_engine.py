"""The engine run with a fake camera and no real screen: sessions, looms and the files that are saved."""
import csv
import json
import os

import cv2
import numpy as np
import pytest

import core
import engine as engine_module

RIGHT_PART = [[560, 60], [940, 60], [940, 660], [560, 660]]   # the demo mouse walks into this after about 0.8 s
FAR_CORNER = [[10, 10], [100, 10], [100, 100], [10, 100]]     # ...and never comes here during a test
ANIMAL = {"Animal ID": "M 01/a", "Sex": "F", "Genotype": "C57BL/6J", "Notes": "first run"}


def make_engine(tmp_path, **changes):
    overrides = {
        "camera": {"source": "demo"},
        "tracking": {"method": "dark"},
        "session": {"duration_min": 0.06},                    # 3.6 s
        "trigger": {"downtime_s": 1.5},
        "stimulus": {"display": 0, "fullscreen": False,
                     "loom": {"expand_s": 0.1, "hold_s": 0.1, "isi_s": 0.1, "repeats": 2}},   # 0.5 s
        "output": {"dir": str(tmp_path / "sessions"), "zones_file": str(tmp_path / "zones.json")},
    }
    for section, values in changes.items():
        overrides.setdefault(section, {}).update(values)
    cfg, unknown = core.merge_config(core.DEFAULTS, overrides)
    assert not unknown
    core.validate_config(cfg)
    engine = engine_module.Engine(cfg, str(tmp_path / "settings.json"))
    engine.start()
    return engine


@pytest.fixture
def make(tmp_path):
    engines = []

    def build(**changes):
        engines.append(make_engine(tmp_path, **changes))
        return engines[-1]

    yield build
    for engine in engines:
        engine.close()


def steps(engine, n):
    for _ in range(n):
        engine.step()


def run_until(engine, condition, limit=400):
    for _ in range(limit):
        if condition():
            return
        engine.step()
    raise AssertionError("the expected situation was not reached")


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def refused(result, text):
    assert result["ok"] is False and text in result["error"], result


def test_a_session_saves_loom_times_and_ends_by_itself(make, tmp_path):
    engine = make()
    steps(engine, 3)
    assert engine.snapshot()["mode"] == "setup"

    refused(engine.execute("start_session", {"animal": ANIMAL}), "Draw a trigger zone first")
    assert engine.execute("set_zone", {"kind": "trigger", "points": RIGHT_PART}) == {"ok": True}
    refused(engine.execute("start_session", {"animal": {"Sex": "F"}}), "Enter the Animal ID first")
    assert engine.execute("start_session", {"animal": ANIMAL}) == {"ok": True}
    refused(engine.execute("start_session", {"animal": ANIMAL}), "already running")
    refused(engine.execute("set_zone", {"kind": "trigger", "points": RIGHT_PART}), "Pause triggering")

    steps(engine, 20)
    state = engine.snapshot()
    assert state["mode"] == "running" and state["session"]["animal_id"] == "M 01/a"
    assert state["session"]["duration_s"] == pytest.approx(3.6) and 0.4 < state["session"]["t"] < 1.0
    folder = engine.session.dir
    run_until(engine, lambda: engine.session is None)

    # The animal walks into the zone after about 0.7 s of session and stays: a loom then, and
    # another one 1.5 s later when the downtime is over. A third would come after the session's end.
    assert os.path.basename(folder).endswith("_M_01_a")
    looms = read_csv(os.path.join(folder, "looms.csv"))
    assert [row["loom"] for row in looms] == ["1", "2"] and {row["type"] for row in looms} == {"auto"}
    first, second = (float(row["onset_s"]) for row in looms)
    assert 0.5 < first < 1.2 and second - first == pytest.approx(1.5, abs=0.15)
    assert looms[0]["onset_mm_ss"] == core.format_clock(first)
    assert looms[0]["clock_time"].startswith(os.path.basename(folder)[:10])     # the date
    assert all(float(row["x"]) >= 560 for row in looms)
    assert all(0 <= float(row["delay_ms"]) < 100 for row in looms)

    events = [row["event"] for row in read_csv(os.path.join(folder, "events.csv"))]
    assert events == ["session_started", "trigger", "stim_onset", "stim_offset",
                      "trigger", "stim_onset", "stim_offset", "session_ended"]

    rows = read_csv(os.path.join(folder, "tracking.csv"))
    assert 100 <= len(rows) <= 112                          # 3.6 s at 30 frames per second
    assert float(rows[-1]["t_s"]) < 3.6 + 0.6               # ended on time (after the loom that was playing)
    assert rows[0]["in_zone"] == "0" and rows[-1]["in_zone"] == "1" and rows[0]["armed"] == "1"
    assert any(row["stim_on"] == "1" for row in rows)
    assert [row["video_frame"] for row in rows] == [str(i) for i in range(len(rows))]
    video = cv2.VideoCapture(os.path.join(folder, "video.mp4"))
    assert int(video.get(cv2.CAP_PROP_FRAME_COUNT)) == len(rows)

    saved = json.loads(open(os.path.join(folder, "session.json")).read())
    assert saved["animal"]["Animal ID"] == "M 01/a" and saved["animal"]["Age"] == ""
    assert list(saved["animal"]) == core.DEFAULTS["session"]["animal_fields"]
    assert saved["ended"] == "completed" and len(saved["looms"]) == 2 and saved["zones"]["trigger"] == RIGHT_PART

    sessions = read_csv(str(tmp_path / "sessions" / "all_sessions.csv"))
    assert len(sessions) == 1
    assert sessions[0]["Animal ID"] == "M 01/a" and sessions[0]["Genotype"] == "C57BL/6J"
    assert sessions[0]["looms"] == "2" and sessions[0]["ended"] == "completed"
    assert sessions[0]["planned_min"] == "0.06" and sessions[0]["ran_min"] == "0.06"
    assert sessions[0]["loom_onsets_s"] == f"{first:.1f}; {second:.1f}"
    assert sessions[0]["folder"] == os.path.basename(folder)
    all_looms = read_csv(str(tmp_path / "sessions" / "all_looms.csv"))
    assert [(row["Animal ID"], row["loom"], row["onset_s"]) for row in all_looms] == \
        [("M 01/a", "1", looms[0]["onset_s"]), ("M 01/a", "2", looms[1]["onset_s"])]

    state = engine.snapshot()
    assert state["mode"] == "setup" and state["session"] is None
    assert state["completed"] == [{"animal_id": "M 01/a", "start_time": state["completed"][0]["start_time"],
                                   "ran_min": 0.1, "looms": 2, "ended": "completed",
                                   "folder": os.path.basename(folder)}]
    assert "Session saved" in state["message"]["text"]


def test_pause_manual_loom_early_end_and_a_second_animal(make, tmp_path):
    engine = make(session={"duration_min": 5})
    steps(engine, 2)
    engine.execute("set_zone", {"kind": "trigger", "points": FAR_CORNER})
    assert engine.execute("start_session", {"animal": {"Animal ID": "A1", "Sex": "M"}})["ok"]
    steps(engine, 15)
    assert engine.session.looms == []                       # the animal is nowhere near the zone

    assert engine.execute("pause")["ok"]
    assert engine.snapshot()["mode"] == "paused" and engine.snapshot()["session"]["status"] == "triggering is paused"
    steps(engine, 1)
    assert engine.snapshot()["mode"] == "paused"
    assert engine.execute("set_zone", {"kind": "arena", "points": [[0, 0], [959, 0], [959, 719], [0, 719]]})["ok"]
    refused(engine.execute("settings", {"session": {"duration_min": 10}}), "during a session")
    assert engine.execute("settings", {"tracking": {"intensity_threshold": 80}})["ok"]
    assert engine.execute("resume")["ok"]

    assert engine.execute("test_stimulus")["ok"]            # during a session this is a manual loom
    refused(engine.execute("test_stimulus"), "already playing")
    run_until(engine, lambda: engine.session.looms)
    assert engine.session.looms[0]["type"] == "manual"
    assert engine.trig.looms == 1 and engine.trig.downtime_remaining(engine.session.looms[0]["onset_s"]) > 1.0
    assert engine.execute("stop_stimulus")["ok"]
    run_until(engine, lambda: engine.stim.active is None)

    folder_a = engine.session.dir
    assert engine.execute("end_session")["ok"] and engine.session is None
    refused(engine.execute("end_session"), "No session is running")
    events = read_csv(os.path.join(folder_a, "events.csv"))
    assert [row["event"] for row in events] == [
        "session_started", "triggering_paused", "zone_set", "triggering_resumed",
        "trigger", "stim_onset", "stim_offset", "session_ended"]
    assert json.loads(events[6]["details"])["aborted"] is True
    assert json.loads(events[7]["details"]) == {"reason": "stopped early", "looms": 1}

    # Next animal, same program run.
    assert engine.execute("start_session", {"animal": {"Animal ID": "A2", "Sex": "F"}})["ok"]
    steps(engine, 10)
    assert engine.execute("end_session")["ok"]
    sessions = read_csv(str(tmp_path / "sessions" / "all_sessions.csv"))
    assert [(row["Animal ID"], row["Sex"], row["looms"], row["ended"]) for row in sessions] == \
        [("A1", "M", "1", "stopped early"), ("A2", "F", "0", "stopped early")]
    assert sessions[1]["loom_onsets_s"] == ""
    all_looms = read_csv(str(tmp_path / "sessions" / "all_looms.csv"))
    assert [(row["Animal ID"], row["type"]) for row in all_looms] == [("A1", "manual")]
    assert [done["animal_id"] for done in engine.snapshot()["completed"]] == ["A1", "A2"]
    assert json.loads((tmp_path / "settings.json").read_text()) == {"tracking": {"intensity_threshold": 80}}


def test_background_method_needs_a_background_before_a_session(make):
    engine = make(tracking={"method": "background", "background_frames": 5})
    steps(engine, 2)
    engine.execute("set_zone", {"kind": "trigger", "points": FAR_CORNER})
    assert engine.snapshot()["checks"]["background"] is False
    refused(engine.execute("start_session", {"animal": ANIMAL}), "Capture a background first")
    assert engine.execute("capture_background")["ok"]
    steps(engine, 2)
    assert engine.snapshot()["checks"]["capturing_background"] is True
    steps(engine, 5)
    state = engine.snapshot()
    assert state["checks"]["background"] is True and state["message"]["text"] == "Background captured"
    assert engine.execute("start_session", {"animal": ANIMAL})["ok"]
    assert os.path.isfile(os.path.join(engine.session.dir, "background.png"))


def test_settings_are_checked_applied_and_saved(make, tmp_path):
    engine = make()
    steps(engine, 2)
    refused(engine.execute("settings", {"stimulus": {"loom": {"repeats": 0}}}), "stimulus.loom.repeats")
    refused(engine.execute("settings", {"camera": {"source": 3}}), "settings file")
    refused(engine.execute("settings", {"stimulus": {"display": 0}}), "settings file")
    refused(engine.execute("settings", {}), "Nothing to change")
    assert not os.path.exists(tmp_path / "settings.json")

    patch = {"session": {"duration_min": 45}, "trigger": {"downtime_s": 120, "entry_rule": "fresh_entry"},
             "stimulus": {"loom": {"repeats": 3, "end_size": 30}}}
    assert engine.execute("settings", patch) == {"ok": True}
    assert engine.plan() == "45-minute session, 120 s downtime after each loom"
    run_until(engine, lambda: "x3" in engine.stim_info["description"])     # the stimulus window took the change
    assert "2->30 deg" in engine.stim_info["description"]
    assert engine.stim_info["duration_s"] == pytest.approx(3 * 0.3 - 0.1)
    assert json.loads((tmp_path / "settings.json").read_text()) == patch    # only what was changed is stored
    assert engine.snapshot()["settings"]["trigger"]["entry_rule"] == "fresh_entry"

    engine.execute("set_zone", {"kind": "trigger", "points": FAR_CORNER})
    engine.execute("start_session", {"animal": ANIMAL})
    assert engine.session.duration_s == 45 * 60 and engine.trig.downtime_s == 120
    assert engine.trig.entry_rule == "fresh_entry"


def test_a_test_stimulus_outside_a_session_saves_nothing(make, tmp_path):
    engine = make()
    steps(engine, 2)
    assert engine.execute("test_stimulus")["ok"]
    run_until(engine, lambda: engine.stim.on)
    assert engine.snapshot()["stimulus_on"] is True
    run_until(engine, lambda: engine.stim.active is None)
    assert engine.snapshot()["stimulus_on"] is False
    assert not os.path.exists(tmp_path / "sessions")


def test_the_camera_picture_for_the_page(make):
    engine = make()
    assert engine.preview(0, timeout=0.01) == (0, b"")      # asking for one makes the engine produce them
    engine.execute("set_zone", {"kind": "trigger", "points": RIGHT_PART})
    steps(engine, 3)
    number, jpeg = engine.preview(0)
    picture = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    assert number >= 1 and picture.shape == (720, 960, 3)
    assert picture[300, 100].mean() > 150                   # light floor outside the zone
    blue, green, red = picture[100, 750].astype(int)
    assert green > red + 5 and green > blue + 5             # the trigger zone is tinted green

    engine.execute("mask_view", {"on": True})
    steps(engine, 3)
    mask = cv2.imdecode(np.frombuffer(engine.preview(number)[1], np.uint8), cv2.IMREAD_COLOR)
    assert mask[300, 100].mean() < 40                       # the tracker view is black where there is no animal


def test_unknown_actions_and_bad_zones_are_refused(make):
    engine = make()
    steps(engine, 1)
    refused(engine.execute("explode"), "Unknown action")
    refused(engine.execute("set_zone", {"kind": "trigger", "points": [[1, 2], [3, 4]]}), "at least 3 corners")
    refused(engine.execute("set_zone", {"kind": "trigger", "points": "nonsense"}), "could not be read")
    refused(engine.execute("set_zone", {"kind": "roof", "points": RIGHT_PART}), "Unknown kind")
    assert engine.execute("set_zone", {"kind": "trigger", "points": [[-50, 5], [5000, 5], [300, 9000]]})["ok"]
    assert engine.zones["trigger"] == [[0, 5], [959, 5], [300, 719]]         # kept inside the picture
    assert engine.execute("clear_zones")["ok"] and engine.zones == {"arena": None, "trigger": None}
