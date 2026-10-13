#!/usr/bin/env python3
"""
Veridex test runner (G32).

Runs the static checks and every browser suite in tests/suites/, prints a summary
and exits non-zero on any failure, so it can gate a commit or a CI job.

    python tests/run.py                  run everything
    python tests/run.py --suite g06      run suites whose name starts with g06 (repeatable)
    python tests/run.py --list           list suites
    python tests/run.py --static-only    only the static checks
    python tests/run.py --junit out.xml  also write a JUnit XML report
    python tests/run.py --keep           keep the generated pages in tests/.out for debugging

How a suite works: the runner copies index.html, adds a <base> tag so the scripts
load from the project folder, appends the suite's <script> block, opens the page in
headless Edge/Chrome and reads the result lines the suite writes into <pre id="__t">.
Each line starts with PASS, FAIL, EXCEPTION, INFO, WARN or "PAGE ERRORS:". A suite
fails on any FAIL or EXCEPTION, on any page error, or if it reports nothing at all.

Needs Python 3.8+ and Microsoft Edge or Chrome (set EDGE_PATH to point at one).
Node.js is optional: if present, every js file is also syntax-checked.
"""
import argparse, glob, html, os, re, shutil, subprocess, sys, tempfile, time
from xml.sax.saxutils import quoteattr

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUITES = os.path.join(ROOT, "tests", "suites")
OUT = os.path.join(ROOT, "tests", ".out")

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def find_browser():
    cands = [os.environ.get("EDGE_PATH"), shutil.which("msedge"), shutil.which("chrome"), shutil.which("google-chrome"), shutil.which("chromium"),
             r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
             r"C:\Program Files\Google\Chrome\Application\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None


# ---------------------------------------------------------------- static checks
def static_checks():
    """Returns a list of (name, ok, detail)."""
    res = []
    idx = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    srcs = re.findall(r'<script[^>]+src="([^"]+)"', idx)
    local = [s for s in srcs if not re.match(r"https?:", s)]
    missing = [s for s in local if not os.path.exists(os.path.join(ROOT, s))]
    res.append(("every script tag in index.html points at a file that exists", not missing, ", ".join(missing)))
    dupes = sorted({s for s in local if local.count(s) > 1})
    res.append(("no script is loaded twice", not dupes, ", ".join(dupes)))
    on_disk = {os.path.relpath(p, ROOT).replace("\\", "/") for p in glob.glob(os.path.join(ROOT, "js", "*.js"))}
    unused = sorted(on_disk - {s.replace("\\", "/") for s in local})
    res.append(("every file in js/ is loaded by index.html", not unused, ", ".join(unused)))
    # The app runs with no network: no script, stylesheet, font or image is loaded from a web address, and what it needs is in vendor/.
    css_text = open(os.path.join(ROOT, "css", "styles.css"), encoding="utf-8").read()
    web = re.findall(r'(?:src|href)="(https?:[^"]+)"', idx) + re.findall(r"url\(['\"]?(https?:[^)'\"]+)", css_text) + re.findall(r"@import\s+(?:url\()?['\"]?(https?:[^'\")]+)", css_text)
    res.append(("nothing is loaded from the web (no CDN): fonts, icons and the PDF library are local", not web, ", ".join(web)))
    css_local = [h for h in re.findall(r'<link[^>]+href="([^"]+)"', idx) if not h.startswith("data:") and not re.match(r"https?:", h)]
    need = ["vendor/fonts/fonts.css", "vendor/phosphor/style.css", "vendor/jspdf/jspdf.umd.min.js"]
    gone = [n for n in need if not os.path.exists(os.path.join(ROOT, n))] + [h for h in css_local if not os.path.exists(os.path.join(ROOT, h))]
    res.append(("the local stylesheets and vendor files exist", not gone and "vendor/fonts/fonts.css" in css_local and "vendor/phosphor/style.css" in css_local, ", ".join(gone)))
    fontfiles = re.findall(r'url\("\./([^"]+)"\)', open(os.path.join(ROOT, "vendor", "fonts", "fonts.css"), encoding="utf-8").read())
    icon_files = re.findall(r'url\("\./([^"#]+)', open(os.path.join(ROOT, "vendor", "phosphor", "style.css"), encoding="utf-8").read())
    lost = [f for f in fontfiles if not os.path.exists(os.path.join(ROOT, "vendor", "fonts", f))] + [f for f in icon_files if not os.path.exists(os.path.join(ROOT, "vendor", "phosphor", f))]
    res.append(("every font file the local stylesheets name is present", not lost, ", ".join(lost)))
    # The gates of a quote are guarded through the guard registry (js/guard-registry.js); no module wraps those functions itself.
    wrapped = []
    for path in sorted(glob.glob(os.path.join(ROOT, "js", "*.js"))):
        if os.path.basename(path) == "guard-registry.js":
            continue
        for ln, line in enumerate(open(path, encoding="utf-8").read().split("\n"), 1):
            if re.search(r"window\.(openESignatureModal|issueQuoteAction|simulatePASBindSync)\s*=\s*function", line):
                wrapped.append("%s:%d" % (os.path.basename(path), ln))
    res.append(("no module wraps openESignatureModal, issueQuoteAction or simulatePASBindSync itself (use registerGuard)", not wrapped, ", ".join(wrapped)))
    ids = re.findall(r'\sid="([^"]+)"', idx)
    d = sorted({i for i in ids if ids.count(i) > 1})
    res.append(("no duplicate element ids in index.html", not d, ", ".join(d[:10])))
    # a function must have one definition: with two, whichever file loads last silently wins
    defs = {}
    for f in sorted(on_disk):
        src = open(os.path.join(ROOT, f), encoding="utf-8").read()
        for m in re.finditer(r"^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(", src, re.M):
            defs.setdefault(m.group(1), []).append(f)
    twice = sorted("%s (%s)" % (k, ", ".join(v)) for k, v in defs.items() if len(v) > 1)
    res.append(("no function is defined twice", not twice, "; ".join(twice[:6])))
    # a button must call something that exists (a typo or a removed function is a button that silently does nothing)
    alljs = chr(10).join(open(os.path.join(ROOT, f), encoding="utf-8").read() for f in sorted(on_disk))
    defined = set(re.findall(r"^(?:async\s+)?function\s+([A-Za-z0-9_$]+)", alljs, re.M)) | set(re.findall(r"window\.([A-Za-z0-9_$]+)\s*=", alljs)) | set(re.findall(r"^(?:var|let|const)\s+([A-Za-z0-9_$]+)", alljs, re.M))
    builtin = {"if", "return", "event", "this", "confirm", "alert", "prompt", "window", "document", "JSON", "Math", "setTimeout", "Number", "String", "parseInt", "parseFloat", "encodeURIComponent", "Object", "Array", "console", "isNaN"}
    called = set()
    for text in [idx, alljs]:
        for h in re.findall(r'on(?:click|change|input|keyup|keydown|submit|blur|focus)\s*=\s*"([^"]*)"', text):
            called |= {f for f in re.findall(r"(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(", h) if f not in builtin}
    ghost = sorted(f for f in called if f not in defined)
    res.append(("every button handler calls a function that exists", not ghost, ", ".join(ghost)))
    # dead code: a function nothing calls is a feature with no way in
    refs = {}
    for m in re.finditer(r"(?<![\w$.])([A-Za-z_$][\w$]*)", alljs + idx):
        refs[m.group(1)] = refs.get(m.group(1), 0) + 1
    orphans = []
    for fn in sorted(set(re.findall(r"^(?:async\s+)?function\s+([A-Za-z0-9_$]+)", alljs, re.M))):
        exported = len(re.findall(r"window\." + re.escape(fn) + r"\s*=\s*" + re.escape(fn) + r"", alljs))
        if refs.get(fn, 0) - 1 - exported <= 0:
            orphans.append(fn)
    res.append(("no function is defined that nothing calls (dead features)", not orphans, ", ".join(orphans[:12])))
    # the application itself carries no demonstration data; suites get theirs from tests/fixtures
    demo = [n for n in ("loadSeedDemoData", "DEFAULT_IMPORTED_RATING_JSON", "PRODUCER_REGISTRY_DEMO", "SANCTIONS_DEMO_WATCHLIST", "generateDemoRegistryEnrichment", "useSampleQuote", "completeSampleCase") if re.search(r"" + n + r"", alljs + idx)]
    seedvar = re.search(r"var SEED_SUBMISSIONS_DATASET\s*=", alljs)
    res.append(("the application ships no demonstration data (seeds, registries, watchlist, sample quote)", not demo and not seedvar, ", ".join(demo) + (" SEED_SUBMISSIONS_DATASET" if seedvar else "")))
    # the application ships exactly the six listed users; restricted external users come from fixtures or onboarding
    extra = [n for n in ("Jordan Reyes", "Meera Arora", "Taylor Brooks", "Helen Park", "broker_user_2", "mga_user", "carrier_auditor") if n in alljs]
    res.append(("the application ships only the six listed users (no producer, program or carrier-auditor users)", not extra, ", ".join(extra)))
    node = shutil.which("node")
    if node:
        bad = []
        for f in sorted(on_disk):
            p = subprocess.run([node, "--check", os.path.join(ROOT, f)], capture_output=True, text=True)
            if p.returncode:
                bad.append(f + ": " + (p.stderr.strip().splitlines() or ["syntax error"])[0])
        res.append(("every js file passes a syntax check (node --check)", not bad, "; ".join(bad)))
    else:
        res.append(("every js file passes a syntax check (node --check)", True, "skipped: node not found"))
    # an add-on module's RBAC resource must exist for every role in the default matrix
    cfg = open(os.path.join(ROOT, "js", "data-config.js"), encoding="utf-8").read()
    res_keys = re.findall(r'\{ key: "([A-Za-z0-9_]+)", label:', cfg)
    gaps = []
    for role in ("assistant", "junior", "senior_uw", "senior", "admin"):
        m = re.search(r"\n    " + role + r": \{(.*?)\n    \}", cfg, re.S)
        if not m:
            gaps.append(role + ": block not found")
            continue
        have = set(re.findall(r"\n\s+([A-Za-z0-9_]+): all\(", m.group(1)))
        for k in res_keys:
            if k not in have:
                gaps.append(role + "." + k)
    res.append(("every RBAC resource has a default for each internal role", not gaps, ", ".join(gaps[:10])))
    return res


# ---------------------------------------------------------------- browser suites
def list_suites(prefixes=None):
    files = sorted(glob.glob(os.path.join(SUITES, "*.html")))
    if prefixes:
        files = [f for f in files if any(os.path.basename(f).lower().startswith(p.lower()) for p in prefixes)]
    return files


def run_suite(browser, path, timeout, keep):
    name = os.path.splitext(os.path.basename(path))[0]
    page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    base = "file:///" + ROOT.replace("\\", "/").replace(" ", "%20") + "/"
    page = page.replace("<head>", '<head><base href="%s">' % base, 1)
    frag = open(path, encoding="utf-8").read()
    # Fixtures: the application ships no demonstration data, so the suites bring their own (tests/fixtures/*.js),
    # loaded after the application and before the suite.
    NL = chr(10)
    fixtures = "".join("<script>" + NL + open(f, encoding="utf-8").read() + NL + "</script>" + NL for f in sorted(glob.glob(os.path.join(ROOT, "tests", "fixtures", "*.js"))))
    page = page.replace("</body>", fixtures + frag + "</body>")
    os.makedirs(OUT, exist_ok=True)
    out_html = os.path.join(OUT, name + ".html")
    with open(out_html, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(page)
    url = "file:///" + out_html.replace("\\", "/").replace(" ", "%20")
    prof = tempfile.mkdtemp(prefix="veridex-test-")
    t0 = time.time()
    try:
        args = [browser, "--headless", "--disable-gpu", "--disable-sync", "--no-first-run", "--allow-file-access-from-files", "--user-data-dir=" + prof,
                "--virtual-time-budget=30000", "--dump-dom", url]
        # Some pages leave the browser process running after the DOM is dumped, so write the dump to a
        # file and stop the browser as soon as it is complete rather than waiting for it to exit.
        dump = os.path.join(prof, "dom.txt")
        done = False
        with open(dump, "wb") as fh:
            proc = subprocess.Popen(args, stdout=fh, stderr=subprocess.DEVNULL)
            deadline = time.time() + timeout
            while time.time() < deadline:
                if proc.poll() is not None:
                    done = True
                    break
                try:
                    with open(dump, "rb") as rf:
                        tail = rf.read()[-200:]
                except OSError:
                    tail = b""
                if b"</html>" in tail:
                    done = True
                    break
                time.sleep(0.25)
            if proc.poll() is None:
                proc.kill()
                proc.wait()
        with open(dump, "rb") as rf:
            dom = rf.read().decode("utf-8", errors="replace")
        if not done:
            return name, [("FAIL", "suite timed out after %ds" % timeout)], time.time() - t0
    finally:
        shutil.rmtree(prof, ignore_errors=True)
    m = re.search(r'<pre id="__t">(.*?)</pre>', dom, re.S)
    if not m:
        return name, [("FAIL", "the suite produced no results (the page may have failed to load)")], time.time() - t0
    lines = [html.unescape(l) for l in m.group(1).split("\n") if l.strip()]
    results = []
    for l in lines:
        kind = l.split(" ", 1)[0].rstrip(":")
        if l.startswith("PAGE ERRORS:"):
            results.append(("PASS" if l.strip().endswith("none") else "FAIL", l))
        elif kind in ("PASS", "FAIL", "INFO", "WARN", "SKIP"):
            results.append((kind, l.split(" ", 1)[1] if " " in l else ""))
        elif kind == "EXCEPTION":
            results.append(("FAIL", l))
        else:
            results.append(("INFO", l))
    if not any(k in ("PASS", "FAIL") for k, _ in results):
        results.append(("FAIL", "the suite reported no checks"))
    if not keep:
        try:
            os.remove(out_html)
        except OSError:
            pass
    return name, results, time.time() - t0


def junit(path, static, suites):
    tests, fails = 0, 0
    body = ['<testsuite name="static">']
    for n, ok, d in static:
        tests += 1
        if ok:
            body.append("<testcase classname=\"static\" name=%s/>" % quoteattr(n))
        else:
            fails += 1
            body.append("<testcase classname=\"static\" name=%s><failure message=%s/></testcase>" % (quoteattr(n), quoteattr(d)))
    body.append("</testsuite>")
    for name, results, secs in suites:
        body.append("<testsuite name=%s time=\"%.1f\">" % (quoteattr(name), secs))
        for k, txt in results:
            if k == "PASS":
                tests += 1
                body.append("<testcase classname=%s name=%s/>" % (quoteattr(name), quoteattr(txt[:200])))
            elif k == "FAIL":
                tests += 1
                fails += 1
                body.append("<testcase classname=%s name=%s><failure message=%s/></testcase>" % (quoteattr(name), quoteattr(txt[:200]), quoteattr(txt)))
        body.append("</testsuite>")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="%d" failures="%d">\n%s\n</testsuites>\n' % (tests, fails, "\n".join(body)))


def main():
    ap = argparse.ArgumentParser(description="Veridex test runner")
    ap.add_argument("--suite", action="append", help="run suites whose file name starts with this (repeatable)")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--static-only", action="store_true")
    ap.add_argument("--junit")
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--timeout", type=int, default=120)
    ap.add_argument("-v", "--verbose", action="store_true", help="print passing checks too")
    a = ap.parse_args()

    if a.list:
        for f in list_suites():
            print(os.path.basename(f))
        return 0

    failed = False
    static = static_checks()
    print("Static checks")
    for n, ok, d in static:
        print("  %s  %s%s" % ("ok  " if ok else "FAIL", n, ("  [" + d + "]") if d else ""))
        failed |= not ok
    suites = []
    if not a.static_only:
        browser = find_browser()
        if not browser:
            print("\nNo Edge/Chrome found. Install one or set EDGE_PATH.")
            return 2
        files = list_suites(a.suite)
        if not files:
            print("\nNo suites match.")
            return 2
        print("\nBrowser suites (%s)" % os.path.basename(browser))
        for f in files:
            name, results, secs = run_suite(browser, f, a.timeout, a.keep)
            suites.append((name, results, secs))
            p = sum(1 for k, _ in results if k == "PASS")
            bad = [t for k, t in results if k == "FAIL"]
            warn = [t for k, t in results if k == "WARN"]
            print("  %s  %-34s %3d passed, %d failed%s  (%.0fs)" % ("ok  " if not bad else "FAIL", name, p, len(bad), (", %d warning(s)" % len(warn)) if warn else "", secs))
            for t in bad:
                print("        FAIL: " + t)
            for t in warn:
                print("        WARN: " + t)
            if a.verbose:
                for k, t in results:
                    if k == "PASS":
                        print("        pass: " + t)
            failed |= bool(bad)
        total = sum(1 for _, r, _s in suites for k, _ in r if k == "PASS")
        nfail = sum(1 for _, r, _s in suites for k, _ in r if k == "FAIL")
        print("\n%d checks passed, %d failed across %d suites." % (total, nfail, len(suites)))
    if a.junit:
        junit(a.junit, static, suites)
        print("JUnit report written to " + a.junit)
    print("\nRESULT: " + ("FAILED" if failed else "PASSED"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
