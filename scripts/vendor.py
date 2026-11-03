"""Check the vendored third-party files, or rebuild them from the npm tarballs.

Usage:
  python3 scripts/vendor.py --check
      Offline. Compares every file under viewer/vendor/ with viewer/vendor/MANIFEST.sha256: no missing,
      changed or extra file. Exits 1 on any difference.
  python3 scripts/vendor.py --refresh [--tarballs DIR] [--write-manifest]
      Gets the three tarballs (from DIR, or with `npm pack --ignore-scripts`; never `npm install`),
      checks each against the integrity value in package-lock.json, refuses unsafe archive members,
      extracts with tarfile's "data" filter, and copies exactly the files listed in FILES below.
      With --write-manifest it then rewrites MANIFEST.sha256; without it, it runs --check afterwards.
"""
import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, "viewer", "vendor")
MANIFEST = "MANIFEST.sha256"
LOCK = os.path.join(ROOT, "package-lock.json")

# package name -> (tarball file name prefix, [(path inside the package, path under viewer/vendor)])
CHUNK = "vendor-677e88ca78c86bddf13d.js"
FONTS = ["Assistant-Bold", "Assistant-Medium", "Assistant-Regular", "Assistant-SemiBold", "Cascadia", "Virgil"]
FILES = {
    "@excalidraw/excalidraw": ("excalidraw-excalidraw", (
        [("dist/excalidraw.production.min.js", "dist/excalidraw.production.min.js"),
         ("dist/excalidraw.production.min.js.LICENSE.txt", "dist/excalidraw.production.min.js.LICENSE.txt"),
         (f"dist/excalidraw-assets/{CHUNK}", f"excalidraw-assets/{CHUNK}"),
         (f"dist/excalidraw-assets/{CHUNK}.LICENSE.txt", f"excalidraw-assets/{CHUNK}.LICENSE.txt")]
        + [(f"dist/excalidraw-assets/{f}.woff2", f"excalidraw-assets/{f}.woff2") for f in FONTS])),
    "react": ("react", [("umd/react.production.min.js", "react.production.min.js"), ("LICENSE", "LICENSE-react")]),
    "react-dom": ("react-dom", [("umd/react-dom.production.min.js", "react-dom.production.min.js"), ("LICENSE", "LICENSE-react-dom")]),
}
# The Excalidraw tarball ships no LICENSE file. This one comes from the project's v0.17.6 tag
# (https://github.com/excalidraw/excalidraw/blob/v0.17.6/LICENSE) and is committed; its git blob hash is pinned here.
EXCALIDRAW_LICENSE = ("excalidraw/LICENSE", "8a844bc750a313db95d147bea9e4c9537b2cebc0")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def git_blob_sha1(path):
    with open(path, "rb") as fh:
        data = fh.read()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def listing(vendor):
    out = []
    for root, _, files in os.walk(vendor):
        for name in files:
            rel = os.path.relpath(os.path.join(root, name), vendor).replace(os.sep, "/")
            if rel != MANIFEST:
                out.append(rel)
    return sorted(out)


def read_manifest(vendor):
    entries = {}
    with open(os.path.join(vendor, MANIFEST), encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                digest, rel = line.split("  ", 1)
                entries[rel] = digest
    return entries


def check(vendor=VENDOR):
    """Return a list of problems (empty when the vendored files match the manifest)."""
    problems = []
    try:
        expected = read_manifest(vendor)
    except OSError:
        return [f"{MANIFEST} is missing"]
    actual = listing(vendor)
    for rel in sorted(set(expected) - set(actual)):
        problems.append(f"missing: {rel}")
    for rel in sorted(set(actual) - set(expected)):
        problems.append(f"not in the manifest: {rel}")
    for rel in sorted(set(actual) & set(expected)):
        if sha256(os.path.join(vendor, rel)) != expected[rel]:
            problems.append(f"changed: {rel}")
    lic_rel, lic_blob = EXCALIDRAW_LICENSE
    lic_path = os.path.join(vendor, lic_rel)
    if os.path.exists(lic_path) and git_blob_sha1(lic_path) != lic_blob:
        problems.append(f"{lic_rel} does not match the v0.17.6 tag's blob hash {lic_blob}")
    return problems


def write_manifest(vendor=VENDOR):
    lines = [f"{sha256(os.path.join(vendor, rel))}  {rel}" for rel in listing(vendor)]
    with open(os.path.join(vendor, MANIFEST), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return len(lines)


def lock_entry(name):
    with open(LOCK, encoding="utf-8") as fh:
        packages = json.load(fh)["packages"]
    entry = packages[f"node_modules/{name}"]
    return entry["version"], entry["integrity"]


def integrity_of(path):
    with open(path, "rb") as fh:
        return "sha512-" + base64.b64encode(hashlib.sha512(fh.read()).digest()).decode()


def get_tarball(name, version, prefix, tarballs, workdir):
    if tarballs:
        path = os.path.join(tarballs, f"{prefix}-{version}.tgz")
        if not os.path.exists(path):
            raise SystemExit(f"tarball not found: {path}")
        return path
    dest = os.path.join(workdir, prefix)
    os.makedirs(dest)
    result = subprocess.run(["npm", "pack", f"{name}@{version}", "--ignore-scripts", "--pack-destination", dest, "--json"],
                            capture_output=True, text=True, check=True)
    return os.path.join(dest, json.loads(result.stdout)[0]["filename"])


def refresh(tarballs=None, vendor=VENDOR):
    with tempfile.TemporaryDirectory() as work:
        for name, (prefix, files) in FILES.items():
            version, wanted = lock_entry(name)
            tgz = get_tarball(name, version, prefix, tarballs, work)
            got = integrity_of(tgz)
            if got != wanted:
                raise SystemExit(f"{name}@{version}: integrity mismatch\n  lockfile {wanted}\n  tarball  {got}")
            extract_dir = os.path.join(work, "x-" + prefix)
            with tarfile.open(tgz) as tf:
                for m in tf.getmembers():
                    if (m.name.startswith("/") or ".." in m.name.split("/") or not m.name.startswith("package/")
                            or m.issym() or m.islnk() or m.isdev()):
                        raise SystemExit(f"{name}@{version}: unsafe archive member {m.name!r}")
                tf.extractall(extract_dir, filter="data")
            for src, dst in files:
                target = os.path.join(vendor, dst)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                shutil.copyfile(os.path.join(extract_dir, "package", src), target)
            print(f"{name}@{version}: integrity matches the lockfile; {len(files)} files copied")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--tarballs", help="folder holding <prefix>-<version>.tgz files, instead of running npm pack")
    ap.add_argument("--write-manifest", action="store_true")
    args = ap.parse_args(argv)
    if args.refresh:
        refresh(args.tarballs)
        if args.write_manifest:
            print(f"manifest written: {write_manifest()} files")
            return 0
    elif not args.check:
        ap.error("give --check or --refresh")
    problems = check()
    for p in problems:
        print("PROBLEM:", p)
    print("vendored files match the manifest" if not problems else f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
