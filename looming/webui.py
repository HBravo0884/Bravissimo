"""Serves the control page (ui.html) to a browser on this computer.

The server only listens on 127.0.0.1, so the page cannot be reached from other
computers. The page reads ``/api/state`` a few times a second, shows the camera
picture from ``/stream.mjpg`` and sends button presses to ``/api/<action>``.
"""
from __future__ import annotations

import json
import os
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui.html")
SUMMARY_FILES = ("all_sessions.csv", "all_looms.csv")
SESSION_FILES = ("looms.csv", "tracking.csv", "events.csv", "session.json")
LOCAL_HOSTS = ("127.0.0.1", "localhost")


def _host(value: str) -> str:
    """The host name in a Host or Origin header, without scheme and port."""
    return value.split("//")[-1].split(":")[0].strip().lower()


def make_handler(engine):
    class Handler(BaseHTTPRequestHandler):
        server_version = "LoomingTest"

        def log_message(self, *args) -> None:
            pass  # keep the terminal for the experiment's own messages

        def _send(self, status: int, body: bytes, content_type: str, headers: dict | None = None) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status: int, data: dict) -> None:
            self._send(status, json.dumps(data).encode(), "application/json")

        def _refuse(self, status: int, text: str) -> None:
            self._json(status, {"ok": False, "error": text})

        def _from_this_computer(self) -> bool:
            # The browser must have been pointed at this computer by name (not through another site's address).
            return _host(self.headers.get("Host") or "") in LOCAL_HOSTS

        def do_GET(self) -> None:
            if not self._from_this_computer():
                return self._refuse(403, "This page can only be used on the computer that runs the program")
            path = self.path.split("?")[0]
            if path in ("/", "/index.html"):
                with open(PAGE, "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            elif path == "/api/state":
                self._json(200, engine.snapshot())
            elif path == "/stream.mjpg":
                self._stream()
            elif path.startswith("/results/"):
                self._result_file(path[len("/results/"):])
            else:
                self._refuse(404, "Not found")

        def do_POST(self) -> None:
            origin = self.headers.get("Origin")
            if not self._from_this_computer() or (origin and _host(origin) not in LOCAL_HOSTS):
                return self._refuse(403, "This page can only be used on the computer that runs the program")
            # Requiring JSON keeps other web pages from sending commands here behind the user's back.
            if not (self.headers.get("Content-Type") or "").startswith("application/json"):
                return self._refuse(415, "Expected JSON")
            if not self.path.startswith("/api/"):
                return self._refuse(404, "Not found")
            try:
                length = int(self.headers.get("Content-Length") or 0)
                data = json.loads(self.rfile.read(length) or b"{}") if 0 <= length <= 1_000_000 else None
            except ValueError:
                data = None
            if not isinstance(data, dict):
                return self._refuse(400, "The request could not be read")
            self._json(200, engine.request(self.path[len("/api/"):], data))

        def _stream(self) -> None:
            """The camera picture as a never-ending series of JPEG images (MJPEG)."""
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            number = 0
            try:
                while engine.running:
                    new_number, jpeg = engine.preview(number)
                    if new_number == number or not jpeg:
                        continue
                    number = new_number
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                     + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")
            except OSError:
                pass  # the browser tab was closed

        def _result_file(self, relative: str) -> None:
            """Download one of the results tables; nothing else in the folder can be fetched."""
            parts = [urllib.parse.unquote(part) for part in relative.split("/")]
            out_dir = os.path.abspath(engine.cfg["output"]["dir"])
            if len(parts) == 1 and parts[0] in SUMMARY_FILES:
                path, name = os.path.join(out_dir, parts[0]), parts[0]
            elif (len(parts) == 2 and parts[1] in SESSION_FILES and parts[0] not in ("", ".", "..")
                  and parts[0] == os.path.basename(parts[0]) and "\\" not in parts[0]):
                path, name = os.path.join(out_dir, parts[0], parts[1]), f"{parts[0]}_{parts[1]}"
            else:
                return self._refuse(404, "Not found")
            if not os.path.isfile(path):
                return self._refuse(404, "That file does not exist yet")
            with open(path, "rb") as f:
                body = f.read()
            kind = "application/json" if name.endswith(".json") else "text/csv; charset=utf-8"
            self._send(200, body, kind, {"Content-Disposition": f'attachment; filename="{name}"'})

    return Handler


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    # On Windows "reuse address" would let two programs share the port; elsewhere it only
    # allows a quick restart.
    allow_reuse_address = sys.platform != "win32"


def serve(engine, port: int = 8765, tries: int = 20):
    """Start the server on the first free port from ``port`` on; returns (server, address of the page)."""
    handler = make_handler(engine)
    for candidate in range(port, port + tries):
        try:
            server = _Server(("127.0.0.1", candidate), handler)
        except OSError:
            continue
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server, f"http://127.0.0.1:{candidate}/"
    raise RuntimeError(f"Could not start the control page: ports {port} to {port + tries - 1} are all in use.")
