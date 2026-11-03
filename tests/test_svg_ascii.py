import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import svg_ascii  # noqa: E402

SVG = ('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">'
       '<text x="0" y="0">Sample · board</text><text x="0" y="20">Per day → per second ★ × 10 ≈ ÷ …</text>'
       '</svg>').encode("utf-8")


class SvgAscii(unittest.TestCase):
    def test_output_has_no_non_ascii_bytes_and_the_same_text(self):
        out = svg_ascii.convert(SVG)
        self.assertTrue(all(b < 128 for b in out))
        self.assertEqual(svg_ascii.texts(out), svg_ascii.texts(SVG))
        self.assertTrue(out.startswith(b'<?xml version="1.0" encoding="UTF-8"?>'))

    def test_the_misread_that_motivated_it_cannot_happen(self):
        original, converted = SVG, svg_ascii.convert(SVG)
        self.assertIn("Â·", original.decode("cp1252"))          # a middle dot read as cp1252 is garbled
        for encoding in ("utf-8", "latin-1", "cp1252", "mac_roman"):
            self.assertEqual(converted.decode(encoding), converted.decode("utf-8"))

    def test_an_existing_declaration_is_kept_once(self):
        with_decl = b'<?xml version="1.0" encoding="UTF-8"?>\n' + SVG
        out = svg_ascii.convert(with_decl)
        self.assertEqual(out.count(b"<?xml"), 1)

    def test_invalid_utf8_is_refused(self):
        with self.assertRaises(UnicodeDecodeError):
            svg_ascii.convert(b"<svg>\xff\xfe</svg>")


if __name__ == "__main__":
    unittest.main()
