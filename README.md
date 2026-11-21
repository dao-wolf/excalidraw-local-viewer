# Excalidraw local viewer

An **unofficial** way to open, edit and export [Excalidraw](https://excalidraw.com) boards on your own machine, with no
internet. It is not affiliated with, or endorsed by, the Excalidraw project.

It exists because of three problems with the usual routes: excalidraw.com, opened in the Claude app's browser pane, can't
load files from your own machine; a page that loads Excalidraw from a CDN stops working offline; and in the Claude app's
browser pane, Excalidraw's own save silently does nothing without the fix in this repo. Here a pinned copy of Excalidraw
0.17.6 is checked in with its hashes, so the page works offline and its files are the ones npm published.

## Run it

```bash
python3 scripts/serve.py
```

Open <http://127.0.0.1:4342/>. It shows `boards/sample.excalidraw`. To open another board in the boards folder:
`http://127.0.0.1:4342/?board=my-board.excalidraw`.

To use your own boards, point the server at a folder that holds **only boards** (everything in it can be read by any
page that reaches localhost):

```bash
python3 scripts/serve.py --boards ~/path/to/boards
```

The server binds to 127.0.0.1 only, serves nothing except `viewer/` and that one boards folder, and answers 404 for
everything else. Only open boards that you, or a tool you trust, made: a malicious board file is the likeliest way to
exploit an old Excalidraw.

## Sticky notes and tags

A small bar at the bottom of the board adds Miro-style stickies. Nothing to install: it uses Excalidraw's own rectangles
and text.

| To do this | Do this |
|---|---|
| Add a sticky | Click a coloured **+** (yellow, green, blue or pink). A square sticky appears at the centre of the view and its text box opens: type, then press Escape. The next sticky goes beside it, and when a row reaches the edge of the view the next row starts below |
| Tag a sticky | Select the sticky (it stays selected when you press Escape after typing its text; if you left its text empty, click it), type its tags in the box, separated by commas (`Urgent, Finance`), press Enter. Up to 4 tags of up to 20 characters each. They sit inside the sticky at the bottom right, in rows that fill upwards |
| Change or remove tags | Select the sticky, edit the list in the box, press Enter. Empty the box to remove them all. Escape leaves the box without changing anything |
| Edit the text of a tagged sticky | Select it and press Enter. (A double-click works too, but a tagged sticky is in a group, so it takes two) |

The box always edits the sticky it was opened for, even if you click another sticky before you press Enter. A tagged sticky
and its tags are one group, so they move together; a copy (Ctrl or Cmd + D) gets its own tags. Undo (Ctrl or Cmd + Z) works for
adding and tagging. A long sticky text can run under the tags: make the text shorter, or the tags fewer.

Boards stay plain Excalidraw JSON, and the files saved are the same as any other board. A sticky is a rectangle with
bound text and a tag is a small rounded rectangle with bound text; both carry a `customData` marker (`kind: "sticky"` or
`kind: "sticky-tag"`) that Excalidraw keeps and ignores. A tag belongs to the sticky it shares a group with. Excalidraw
0.17.6 without this bar loads them as plain rectangles with text; you just lose the bar. The rules live in
`viewer/stickies.js`, the bar in `viewer/stickies-ui.js`.

## Saving and exporting

Use Excalidraw's own menu (top left): **Save to...** or **Export image...**.

| Where | What happens |
|---|---|
| The Claude app's browser pane | A plain download, with a time stamp in the file name |
| Vivaldi (a Chromium browser) | The Mac save panel, where you pick the folder and name |

Tested in the Claude app's browser pane and in Vivaldi (Chromium). Google Chrome itself is untested.

Why the pane differs: there, the browser's file picker rejects at once and Excalidraw shows nothing, and a download whose
file name already exists is dropped without a message. `viewer/pane-fix.js` removes the picker in the pane and stamps each
download's name. Override the choice with `?save=download` or `?save=picker`.

In the pane, do one save or export at a time. Two downloads started in the same instant (PNG and SVG clicked back to
back by a script) lost one of the two in both tries; started alone or a few seconds apart, 11 of 12 landed (the one miss was
unexplained).

To check that a save really wrote a file, do not trust the screen. Run:

```bash
python3 tools/check_saved.py --since <time before you saved> --name-contains my-board --require excalidraw,png,svg --wait 30 ~/Downloads
```

`--since` takes an ISO time (year-month-day, a `T`, then hour:minute). The script exits 0 only if each required kind has a
valid new file.

**Open** (the menu's Open, to load a board from disk): in the pane it uses the library's plain file input. Tested there by
supplying a three-element board to that input: the scene changed from 12 to 3 elements and the page title followed. A
person choosing a file in the system's file chooser, and Open in Vivaldi, are not yet tested.

### Sharing an SVG with a viewer that garbles it

Excalidraw writes SVG as UTF-8 without an encoding declaration. A viewer that guesses the encoding reads it as
Windows-1252 and shows `Â·` for a middle dot and `â†’` for an arrow. If you must share an SVG with such a viewer, run

```bash
python3 tools/svg_ascii.py exported.svg exported-ascii.svg
```

It rewrites every non-ASCII character as an entity (`&#x2192;`) so the file cannot be misread. Opened as plain text it then
shows entities, not arrows, so keep the original too.

## Safety

- `viewer/index.html` carries a strict Content-Security-Policy: scripts only from this server, no frames (so a web embed is
  blocked), connections only to this server. Tested in the pane: an outside fetch, a frame, an inline script, an outside image
  and a Web Embed element each raised a policy violation and did not run. The one loosening is `style-src 'unsafe-inline'`:
  with `'self'` alone Excalidraw's interface renders unstyled.
- Nothing is loaded from the internet. The fonts and the lazy-loaded chunk come from `viewer/vendor/`
  (`window.EXCALIDRAW_ASSET_PATH` in `viewer/config.js`).
- The saving code lives in a 3 MB chunk inside `viewer/vendor/excalidraw-assets/`. Without it, "Save to..." and the exports
  silently do nothing, so it is vendored.

## Third-party files

`viewer/vendor/` holds unmodified files from Excalidraw 0.17.6, React 18.2.0 and React DOM 18.2.0, all MIT. [NOTICE](NOTICE)
lists each file, its source, its integrity hash and where each licence text came from. `package.json` pins the exact
versions and `package-lock.json` records their integrity. Never run `npm install` here; to rebuild the vendored files:

```bash
python3 scripts/vendor.py --check      # offline: compare every vendored file with MANIFEST.sha256
python3 scripts/vendor.py --refresh    # fetch the tarballs with npm pack --ignore-scripts, verify, copy
```

Run the tests with `python3 -m unittest discover -s tests -v`. The sticky tests run in Node 18 or later with no packages
(`node --test tests/stickies.test.js`), and are skipped if Node is missing.

## Licence

The files written for this repository are MIT (see [LICENSE](LICENSE)). The vendored files keep their own licences.
