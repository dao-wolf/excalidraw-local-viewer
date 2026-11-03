import http.client
import os
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))
import serve  # noqa: E402


class ServerRoots(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.boards = os.path.join(cls.tmp.name, "boards")
        os.makedirs(cls.boards)
        with open(os.path.join(cls.boards, "mine.excalidraw"), "w") as fh:
            fh.write('{"type": "excalidraw", "elements": []}')
        with open(os.path.join(cls.tmp.name, "secret.txt"), "w") as fh:
            fh.write("outside the boards folder")
        os.symlink(os.path.join(cls.tmp.name, "secret.txt"), os.path.join(cls.boards, "link.excalidraw"))
        cls.server = serve.make_server(0, cls.boards)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def get(self, path, method="GET"):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request(method, path)  # http.client sends the path as written, without tidying ".."
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        return resp.status, body, resp

    def test_binds_to_loopback_only(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")

    def test_the_page_and_vendored_files_are_served(self):
        self.assertEqual(self.get("/")[0], 200)
        self.assertEqual(self.get("/vendor/dist/excalidraw.production.min.js")[0], 200)
        self.assertEqual(self.get("/vendor/excalidraw-assets/vendor-677e88ca78c86bddf13d.js")[0], 200)

    def test_boards_come_from_the_boards_folder(self):
        status, body, resp = self.get("/boards/mine.excalidraw")
        self.assertEqual(status, 200)
        self.assertIn(b"excalidraw", body)
        self.assertEqual(resp.getheader("Cache-Control"), "no-store")

    def test_paths_outside_the_two_folders_are_404(self):
        for path in ("/../README.md", "/boards/../../secret.txt", "/%2e%2e/README.md", "/boards/%2e%2e/secret.txt",
                     "/..%2fREADME.md", "/boards/..%2fsecret.txt", "/%5c..%5cREADME.md", "/boards/link.excalidraw",
                     "/package.json", "/scripts/serve.py", "/README.md", "/tests/test_serve.py", "/.git/config"):
            self.assertEqual(self.get(path)[0], 404, path)

    def test_a_folder_is_404_not_a_listing(self):
        for path in ("/vendor/", "/vendor", "/boards/", "/boards", "/vendor/dist/"):
            self.assertEqual(self.get(path)[0], 404, path)

    def test_only_get_and_head(self):
        self.assertEqual(self.get("/", method="HEAD")[0], 200)
        for method in ("POST", "PUT", "DELETE"):
            self.assertIn(self.get("/", method=method)[0], (404, 405, 501), method)

    def test_resolve_never_returns_a_path_outside_its_folders(self):
        viewer, boards = serve.VIEWER, self.boards
        for url in ("/a/../../x", "/boards/../x", "/%2e%2e/x", "/boards/%2e%2e/x"):
            target = serve.resolve(url, viewer, boards)
            self.assertFalse(os.path.exists(target), url)


if __name__ == "__main__":
    unittest.main()
