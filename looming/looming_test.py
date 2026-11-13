#!/usr/bin/env python3
"""Closed-loop looming-disc test.

Tracks a mouse from an overhead camera in real time and plays a looming
stimulus (expanding disc, movie or image sequence) on a second monitor when the
mouse is in a zone you draw. You operate it from a control page that opens in
your web browser: live camera view, buttons, a form for each animal's details,
and the settings. Each animal gets a timed session; the loom times, the position
trace and the video are saved.

    python looming_test.py --demo            try it with a fake mouse, no hardware
    python looming_test.py --camera 1        real camera, stimulus on display 1

See README.md for the full instructions.
"""
from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import sys
import webbrowser

import core
import engine as engine_module
import webui

DEFAULT_SETTINGS_FILE = "settings.json"


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Closed-loop looming-disc test: track a mouse and show a looming stimulus on a second "
                    "monitor when it is in a zone you draw. Operated from a control page in your browser.")
    p.add_argument("--config", metavar="FILE",
                   help=f"settings file to read, and to save changes made on the control page in "
                        f"(default: {DEFAULT_SETTINGS_FILE}); see config.example.json")
    p.add_argument("--camera", metavar="N_OR_FILE", help="camera number (0, 1, ...) or a video file to use instead")
    p.add_argument("--display", type=int, metavar="N", help="display for the stimulus (0 = laptop screen, 1 = second monitor)")
    p.add_argument("--windowed", action="store_true", help="show the stimulus in a window instead of fullscreen")
    p.add_argument("--method", choices=("background", "dark", "light"),
                   help="how to find the mouse: difference from an empty-arena image, or a dark / light animal")
    p.add_argument("--movie", metavar="FILE", help="play this movie as the stimulus")
    p.add_argument("--images", metavar="FOLDER", help="play the images in this folder as the stimulus")
    p.add_argument("--duration-min", type=float, metavar="MIN", help="length of a session in minutes (default 60)")
    p.add_argument("--downtime-s", type=float, metavar="S", help="seconds without a new loom after each loom (default 180)")
    p.add_argument("--no-record", action="store_true", help="do not record the camera video")
    p.add_argument("--demo", action="store_true", help="use a fake camera with a moving 'mouse' (no hardware needed)")
    p.add_argument("--port", type=int, default=8765, metavar="N", help="port of the control page (default 8765)")
    p.add_argument("--no-browser", action="store_true", help="do not open the control page automatically")
    p.add_argument("--list-cameras", action="store_true", help="show the cameras that can be opened, then exit")
    p.add_argument("--list-displays", action="store_true", help="show the connected displays, then exit")
    p.add_argument("--write-config", metavar="FILE", help="write the default settings to FILE, then exit")
    return p.parse_args(argv)


def settings_file(args) -> str | None:
    """The file that settings are read from and saved to; None in the demo, which saves nothing."""
    if args.demo and not args.config:
        return None
    return args.config or DEFAULT_SETTINGS_FILE


def build_config(args) -> dict:
    user = {}
    path = settings_file(args)
    if path and os.path.isfile(path):
        with open(path) as f:
            user = json.load(f)
    elif args.config:
        raise ValueError(f"Settings file not found: {args.config}")
    cfg, unknown = core.merge_config(core.DEFAULTS, user)
    for key in unknown:
        print(f"WARNING: the setting '{key}' in {path} is not known and was ignored.")

    if args.demo:
        cfg["camera"]["source"] = "demo"
        if not args.method:
            cfg["tracking"]["method"] = "dark"
        if args.display is None:  # no second monitor asked for: preview in a window
            cfg["stimulus"]["display"] = 0
            cfg["stimulus"]["fullscreen"] = False
        # A short session so the whole sequence can be seen in a few minutes.
        if "duration_min" not in user.get("session", {}):
            cfg["session"]["duration_min"] = 3
        if "downtime_s" not in user.get("trigger", {}):
            cfg["trigger"]["downtime_s"] = 20
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
    if args.duration_min is not None:
        cfg["session"]["duration_min"] = args.duration_min
    if args.downtime_s is not None:
        cfg["trigger"]["downtime_s"] = args.downtime_s
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
            engine_module.list_cameras()
        if args.list_displays:
            engine_module.list_displays()
        return 0

    engine = server = None
    try:
        engine = engine_module.Engine(build_config(args), settings_file(args))
        engine.start()
        server, address = webui.serve(engine, args.port)
        print(f"\nControl page: {address}")
        print("Keep this window open while you work. To stop: 'Quit program' on the page, or Ctrl+C here.\n")
        if not args.no_browser:
            webbrowser.open(address)
        engine.run()
    except (RuntimeError, ValueError, OSError) as exc:
        print(f"\nERROR: {exc}")
        return 1
    except KeyboardInterrupt:
        pass
    finally:
        if engine is not None:
            engine.close()
        if server is not None:
            server.shutdown()
    return 0


if __name__ == "__main__":
    mp.freeze_support()
    sys.exit(main())
