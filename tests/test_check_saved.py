import contextlib
import io
import json
import os
import struct
import sys
import tempfile
import time
import unittest
import zlib

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import check_saved  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 0) + b"IHDR" + zlib.crc32(b"IHDR").to_bytes(4, "big")


def run(args):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = check_saved.main(args)
    return code, out.getvalue()


class CheckSaved(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name
        self.since = "2000-01-01T00:00"

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, data):
        path = os.path.join(self.dir, name)
        with open(path, "wb" if isinstance(data, bytes) else "w") as fh:
            fh.write(data)
        return path

    def board(self, n):
        return json.dumps({"type": "excalidraw", "elements": [{}] * n})

    def test_nothing_new_fails(self):
        self.assertEqual(run(["--since", self.since, self.dir])[0], 1)

    def test_a_valid_board_passes_and_the_element_count_is_checked(self):
        self.write("b.excalidraw", self.board(5))
        self.assertEqual(run(["--since", self.since, "--expect-elements", "5", self.dir])[0], 0)
        self.assertEqual(run(["--since", self.since, "--expect-elements", "6", self.dir])[0], 1)

    def test_bad_files_fail(self):
        self.write("a.excalidraw", "not json")
        self.write("b.excalidraw", json.dumps({"type": "other", "elements": []}))
        self.write("c.png", b"GIF89a")
        self.write("d.svg", "<html></html>")
        self.write("e.png", b"")
        code, out = run(["--since", self.since, self.dir])
        self.assertEqual(code, 1)
        self.assertEqual(out.count("FAIL"), 5)

    def test_require_means_each_kind_needs_its_own_valid_file(self):
        self.write("b.excalidraw", self.board(3))
        code, out = run(["--since", self.since, "--require", "excalidraw,png,svg", self.dir])
        self.assertEqual(code, 1)
        self.assertIn("MISSING a valid file for: png, svg", out)
        self.write("b.png", PNG)
        self.write("b.svg", '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
        self.assertEqual(run(["--since", self.since, "--require", "excalidraw,png,svg", self.dir])[0], 0)

    def test_old_files_are_ignored(self):
        path = self.write("old.excalidraw", self.board(2))
        old = time.time() - 3600
        os.utime(path, (old, old))
        recent = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - 60))
        self.assertEqual(run(["--since", recent, self.dir])[0], 1)

    def test_name_filter(self):
        self.write("keep-me.excalidraw", self.board(2))
        self.assertEqual(run(["--since", self.since, "--name-contains", "other", self.dir])[0], 1)
        self.assertEqual(run(["--since", self.since, "--name-contains", "keep", self.dir])[0], 0)

    def test_a_bare_home_wide_search_is_refused(self):
        code, out = run(["--since", self.since])
        self.assertEqual(code, 2)
        self.assertIn("refusing", out)

    def test_wait_polls_for_a_late_file(self):
        import threading
        threading.Timer(1.2, lambda: self.write("late.excalidraw", self.board(2))).start()
        code, _ = run(["--since", self.since, "--wait", "6", self.dir])
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
