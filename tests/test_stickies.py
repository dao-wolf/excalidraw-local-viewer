import os
import shutil
import subprocess
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


@unittest.skipUnless(shutil.which("node"), "Node.js is not installed")
class Stickies(unittest.TestCase):
    def test_sticky_and_tag_rules(self):
        """viewer/stickies.js holds the rules for stickies and tags; its tests need only Node 18 or later, no packages."""
        done = subprocess.run(["node", "--test", os.path.join(HERE, "stickies.test.js")], capture_output=True, text=True, timeout=120)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)


class Page(unittest.TestCase):
    def test_the_page_loads_the_sticky_scripts_and_keeps_the_strict_policy(self):
        with open(os.path.join(HERE, "..", "viewer", "index.html"), encoding="utf-8") as fh:
            html = fh.read()
        self.assertIn("script-src 'self';", html)
        self.assertNotIn("script-src 'self' 'unsafe", html)
        self.assertLess(html.index("stickies.js"), html.index("stickies-ui.js"))
        self.assertLess(html.index("stickies-ui.js"), html.index("app.js"))
        self.assertNotIn("http://", html.replace("http://www.w3.org", ""))
        self.assertNotIn("https://", html)


if __name__ == "__main__":
    unittest.main()
