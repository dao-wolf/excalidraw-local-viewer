import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))
import vendor  # noqa: E402


class VendorManifest(unittest.TestCase):
    def test_vendored_files_match_the_manifest(self):
        self.assertEqual(vendor.check(), [])

    def test_the_manifest_covers_the_files_notice_names(self):
        listed = set(vendor.read_manifest(vendor.VENDOR))
        for rel in ("dist/excalidraw.production.min.js", "react.production.min.js", "react-dom.production.min.js",
                    "excalidraw/LICENSE", "LICENSE-react", "LICENSE-react-dom",
                    "excalidraw-assets/vendor-677e88ca78c86bddf13d.js"):
            self.assertIn(rel, listed)

    def test_a_changed_file_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = os.path.join(tmp, "vendor")
            shutil.copytree(vendor.VENDOR, copy)
            with open(os.path.join(copy, "react.production.min.js"), "ab") as fh:
                fh.write(b"\n/* tampered */")
            self.assertIn("changed: react.production.min.js", vendor.check(copy))
            self.assertEqual(vendor.check(), [])  # the real vendor/ folder is untouched

    def test_a_missing_and_an_extra_file_are_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = os.path.join(tmp, "vendor")
            shutil.copytree(vendor.VENDOR, copy)
            os.remove(os.path.join(copy, "LICENSE-react"))
            with open(os.path.join(copy, "extra.js"), "w") as fh:
                fh.write("alert(1)")
            problems = vendor.check(copy)
            self.assertIn("missing: LICENSE-react", problems)
            self.assertIn("not in the manifest: extra.js", problems)

    def test_a_wrong_excalidraw_licence_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = os.path.join(tmp, "vendor")
            shutil.copytree(vendor.VENDOR, copy)
            lic = os.path.join(copy, "excalidraw", "LICENSE")
            with open(lic, "a") as fh:
                fh.write("changed")
            vendor.write_manifest(copy)  # the manifest now agrees, so only the pinned blob hash can catch it
            self.assertTrue(any("blob hash" in p for p in vendor.check(copy)))

    def test_the_lockfile_pins_the_three_exact_versions(self):
        self.assertEqual(vendor.lock_entry("@excalidraw/excalidraw")[0], "0.17.6")
        self.assertEqual(vendor.lock_entry("react")[0], "18.2.0")
        self.assertEqual(vendor.lock_entry("react-dom")[0], "18.2.0")


if __name__ == "__main__":
    unittest.main()
