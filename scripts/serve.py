"""Serve the viewer on this machine only.

Usage: python3 scripts/serve.py [--port 4342] [--boards DIR]

- Binds to 127.0.0.1. There is no option to bind anywhere else.
- Serves only two folders: viewer/ (the page and vendor/) and one boards folder (default: boards/),
  which appears at /boards/. Nothing else on disk can be reached: a path that leaves its folder
  (.., encoded dots, a symlink pointing out) gets a 404, and a folder gets a 404, never a listing.
- Only GET and HEAD are accepted.
- Point --boards at a folder that holds only boards: everything in it is readable by any page that can
  reach localhost:<port>.
"""
import argparse
import functools
import os
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIEWER = os.path.join(ROOT, "viewer")
DEFAULT_BOARDS = os.path.join(ROOT, "boards")
HOST = "127.0.0.1"
NOT_FOUND = os.path.join(ROOT, "__not_found__")  # never exists


def resolve(url_path, viewer_dir, boards_dir):
    """Map a URL path to a file inside viewer_dir or boards_dir, or to a path that does not exist."""
    path = urllib.parse.unquote(urllib.parse.urlsplit(url_path).path)
    if "\x00" in path or "\\" in path:
        return NOT_FOUND
    if path.startswith("/boards/"):
        base, rel = boards_dir, path[len("/boards/"):]
    else:
        base, rel = viewer_dir, path.lstrip("/") or "index.html"
    if any(part == ".." for part in rel.split("/")):
        return NOT_FOUND
    base_real = os.path.realpath(base)
    target = os.path.realpath(os.path.join(base_real, rel))
    if target != base_real and not target.startswith(base_real + os.sep):
        return NOT_FOUND  # a symlink or an odd path leading out of the folder
    if os.path.isdir(target):
        return NOT_FOUND  # no listings
    return target


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".excalidraw": "application/json", ".woff2": "font/woff2", ".js": "text/javascript"}

    def __init__(self, *args, viewer_dir=VIEWER, boards_dir=DEFAULT_BOARDS, **kwargs):
        self.viewer_dir, self.boards_dir = viewer_dir, boards_dir
        super().__init__(*args, **kwargs)

    def translate_path(self, path):
        return resolve(path, self.viewer_dir, self.boards_dir)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)

    def log_message(self, fmt, *args):
        sys.stdout.write("%s %s\n" % (self.log_date_time_string(), fmt % args))
        sys.stdout.flush()


def make_server(port=4342, boards_dir=DEFAULT_BOARDS, viewer_dir=VIEWER):
    handler = functools.partial(Handler, viewer_dir=viewer_dir, boards_dir=boards_dir)
    return ThreadingHTTPServer((HOST, port), handler)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--port", type=int, default=4342)
    ap.add_argument("--boards", default=DEFAULT_BOARDS, help="folder that holds only boards (default: boards/)")
    args = ap.parse_args(argv)
    boards = os.path.abspath(os.path.expanduser(args.boards))
    if not os.path.isdir(boards):
        print(f"not a folder: {boards}", file=sys.stderr)
        return 2
    server = make_server(args.port, boards)
    print(f"serving viewer/ and {boards} at http://{HOST}:{args.port}/ (this machine only). Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
