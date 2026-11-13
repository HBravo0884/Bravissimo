"""The control page's server, talking to an engine that runs with a fake camera."""
import json
import threading
import urllib.error
import urllib.request

import pytest

import webui
from test_engine import FAR_CORNER, make_engine


@pytest.fixture
def page(tmp_path):
    engine = make_engine(tmp_path, session={"duration_min": 5})
    server, address = webui.serve(engine, port=8791)
    thread = threading.Thread(target=engine.run, daemon=True)
    thread.start()
    yield engine, address
    engine.request("quit")
    thread.join(timeout=5)
    engine.close()
    server.shutdown()
    server.server_close()


def get(url, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def post(url, data, headers=None):
    all_headers = {"Content-Type": "application/json"}
    all_headers.update(headers or {})
    request = urllib.request.Request(url, data=json.dumps(data).encode(), headers=all_headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def test_page_and_state(page):
    engine, address = page
    status, headers, body = get(address)
    assert status == 200 and headers["Content-Type"].startswith("text/html")
    assert b"<title>Looming test</title>" in body and b"/api/state" in body
    status, _, body = get(address + "api/state")
    state = json.loads(body)
    assert status == 200 and state["mode"] == "setup" and state["frame_size"] == [960, 720]
    assert state["settings"]["session"]["animal_fields"][0] == "Animal ID"
    assert get(address + "nothing-here")[0] == 404


def test_buttons_reach_the_engine(page):
    engine, address = page
    assert post(address + "api/set_zone", {"kind": "trigger", "points": FAR_CORNER}) == (200, {"ok": True})
    assert json.loads(get(address + "api/state")[2])["zones"]["trigger"] == FAR_CORNER
    status, result = post(address + "api/start_session", {"animal": {"Animal ID": ""}})
    assert status == 200 and result == {"ok": False, "error": "Enter the Animal ID first"}
    assert post(address + "api/start_session", {"animal": {"Animal ID": "W1"}})[1] == {"ok": True}
    assert json.loads(get(address + "api/state")[2])["session"]["animal_id"] == "W1"
    assert post(address + "api/explode", {})[1]["ok"] is False


def test_only_this_computer_and_only_json_are_accepted(page):
    engine, address = page
    assert get(address + "api/state", {"Host": "evil.example"})[0] == 403
    assert post(address + "api/clear_zones", {}, {"Host": "evil.example"})[0] == 403
    assert post(address + "api/clear_zones", {}, {"Origin": "https://evil.example"})[0] == 403
    assert post(address + "api/clear_zones", {}, {"Content-Type": "text/plain"})[0] == 415
    assert post(address + "api/clear_zones", {}, {"Origin": address.rstrip("/")})[0] == 200
    request = urllib.request.Request(address + "api/clear_zones", data=b"[1, 2]",
                                     headers={"Content-Type": "application/json"}, method="POST")
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(request, timeout=5)
    assert error.value.code == 400


def test_camera_stream_sends_jpeg_pictures(page):
    engine, address = page
    with urllib.request.urlopen(address + "stream.mjpg", timeout=5) as response:
        assert response.headers["Content-Type"] == "multipart/x-mixed-replace; boundary=frame"
        data = response.read(4000)
    assert data.startswith(b"--frame\r\nContent-Type: image/jpeg\r\n") and b"\xff\xd8\xff" in data


def test_results_can_be_downloaded_but_nothing_else(page, tmp_path):
    engine, address = page
    assert get(address + "results/all_sessions.csv")[0] == 404            # no session yet
    post(address + "api/set_zone", {"kind": "trigger", "points": FAR_CORNER})
    post(address + "api/start_session", {"animal": {"Animal ID": "W2"}})
    folder = json.loads(get(address + "api/state")[2])["session"]["folder"]
    assert post(address + "api/end_session", {})[1] == {"ok": True}

    status, headers, body = get(address + "results/all_sessions.csv")
    assert status == 200 and "attachment" in headers["Content-Disposition"] and b"W2" in body
    status, headers, body = get(address + f"results/{folder}/looms.csv")
    assert status == 200 and body.startswith(b"loom,type,onset_s")
    assert f'filename="{folder}_looms.csv"' in headers["Content-Disposition"]

    (tmp_path / "secret.txt").write_text("private")
    for path in ("results/../secret.txt", "results/..%2Fsecret.txt", "results/%2e%2e/secret.txt",
                 f"results/{folder}/video.mp4", f"results/{folder}/../../secret.txt", "results/zones.json"):
        assert get(address + path)[0] == 404, path
