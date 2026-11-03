"""Make an exported SVG ASCII-only, so no viewer can misread its encoding.

Usage: python3 tools/svg_ascii.py <in.svg> <out.svg>

Excalidraw writes SVG as UTF-8 with no encoding declaration. A viewer that guesses the encoding (found 3 Nov
2026: a preview that runs through Inkscape) reads it as Windows-1252 and shows "Â·" for a middle dot and
"â†’" for an arrow. This tool replaces every non-ASCII character with a numeric entity (&#x2192; for an arrow)
and adds an <?xml ... encoding="UTF-8"?> declaration. To any viewer that understands entities the text is
identical; a viewer that guesses cannot garble it, because every byte is below 128.
Use it only when you share an SVG with such a viewer: opened as plain text, the file shows entities, not arrows.
It checks its own work: the parsed text of the output must equal the parsed text of the input.
"""
import sys
import xml.etree.ElementTree as ET

DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n'


def texts(data):
    root = ET.fromstring(data)
    return ["".join(t.itertext()) for t in root.iter("{http://www.w3.org/2000/svg}text")]


def convert(raw):
    """Return ASCII-only SVG bytes with the same parsed text, or raise ValueError."""
    text = raw.decode("utf-8")
    out = "".join(c if ord(c) < 128 else f"&#x{ord(c):X};" for c in text)
    if not out.lstrip().startswith("<?xml"):
        out = DECLARATION + out
    result = out.encode("ascii")
    if texts(raw) != texts(result):
        raise ValueError("the parsed text differs between input and output")
    return result


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 2:
        print(__doc__.split("\n")[0] + "\nUsage: python3 tools/svg_ascii.py <in.svg> <out.svg>")
        return 2
    with open(args[0], "rb") as fh:
        raw = fh.read()
    try:
        result = convert(raw)
    except ValueError as exc:
        print("FAIL:", exc)
        return 1
    with open(args[1], "wb") as fh:
        fh.write(result)
    print(f"wrote {args[1]}: {len(result)} bytes (input {len(raw)}), all ASCII, text identical for {len(texts(raw))} text elements")
    return 0


if __name__ == "__main__":
    sys.exit(main())
