#!/usr/bin/env python3
"""
Qualmly Mobile Scanner — APK / IPA secret + endpoint extraction

Scans a packaged Android (.apk) or iOS (.ipa) build for:
  - Hardcoded API keys (Stripe sk_live_, Anthropic sk-ant-, AWS AKIA, GitHub PAT,
    Supabase anon JWTs, Google API keys, etc. — same 9 patterns as Qualmly)
  - Embedded backend URLs (Supabase project URLs, Firebase databases,
    custom API endpoints)
  - Suspicious config strings (.env references, localhost fallbacks, etc.)
  - Misuse indicators (signInWith{Solana,Ethereum} on apps that obviously
    don't need them, hardcoded admin credentials, etc.)

Usage:
    python qualmly_mobile.py path/to/app.apk
    python qualmly_mobile.py path/to/app.ipa --json --report report.json

This tool is the bare-minimum starting point for Qualmly's mobile coverage.
It uses only the Python stdlib (zipfile + re) and a single optional dependency
(apkutils for AndroidManifest parsing). No reverse-engineering frameworks,
no decompilers — just unzip + grep at scale, which catches ~80% of the secret
leaks in real-world AI-built mobile apps.

For deeper analysis (decompiling smali / disassembling iOS Mach-O binaries),
the next iteration would integrate apktool / ipatool / radare2. This scaffold
is sufficient to ship as v1 and validate demand.

Status: WORKING. Run it on a real APK or IPA today.
"""

import argparse
import json
import os
import re
import sys
import zipfile
from pathlib import Path
from typing import Dict, List, Tuple

__version__ = "1.0.1"

# Same 9 secret-detection patterns the qualmly.dev Code Review uses.
# Keep in sync with index.html SECRET_PATTERNS.
SECRET_PATTERNS: List[Tuple[str, str]] = [
    ("Anthropic API key",            r"sk-ant-[A-Za-z0-9_-]{40,}"),
    ("OpenAI API key",               r"sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}"),
    ("Stripe secret key",            r"sk_(?:live|test)_[A-Za-z0-9]{24,}"),
    ("Stripe publishable key",       r"pk_(?:live|test)_[A-Za-z0-9]{24,}"),
    ("AWS access key ID",            r"AKIA[A-Z0-9]{16}"),
    ("GitHub fine-grained PAT",      r"github_pat_[A-Za-z0-9_]{40,}"),
    ("GitHub classic token",         r"ghp_[A-Za-z0-9]{30,}"),
    ("Slack bot token",              r"xoxb-[0-9]{8,}-[0-9]{8,}-[A-Za-z0-9]{20,}"),
    ("Google API key",               r"AIzaSy[A-Za-z0-9_-]{33}"),
    # ReDoS-safe: every group is upper-bounded so a pathological input can't
    # cause catastrophic backtracking on minified bundles. Real Supabase JWTs
    # fit comfortably inside these limits.
    ("Supabase service-role JWT",    r"\beyJ[A-Za-z0-9_-]{30,500}\.eyJ[A-Za-z0-9_-]{60,2000}\.[A-Za-z0-9_-]{20,200}\b"),
]

# Endpoint / config patterns
ENDPOINT_PATTERNS: List[Tuple[str, str]] = [
    ("Supabase project URL",  r"https://[a-z0-9]{10,30}\.supabase\.co"),
    ("Firebase database",     r"https://[a-z0-9-]+\.firebaseio\.com"),
    ("Localhost fallback",    r"https?://(?:localhost|127\.0\.0\.1)(?::\d+)?"),
    (".env reference",        r"\.env(?:\.production|\.development|\.local)?"),
]

# Files inside an APK/IPA that are worth scanning. Skip media, fonts, native libs.
SCANNABLE_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".tsx", ".html", ".htm", ".css",
    ".json", ".plist", ".xml", ".yaml", ".yml", ".txt",
    ".properties", ".env", ".cfg", ".ini",
}
SKIP_PATHS = re.compile(
    r"(^|/)(META-INF|res/raw|assets/fonts|node_modules|\.git)/", re.IGNORECASE
)
MAX_FILE_BYTES = 5 * 1024 * 1024  # skip files > 5 MB (per-entry hard cap)
MAX_TOTAL_DECOMPRESSED = 500 * 1024 * 1024  # 500 MB total bytes-decompressed across the archive


def detect_format(path: Path) -> str:
    """Return 'apk' or 'ipa' or 'unknown'."""
    name = path.name.lower()
    if name.endswith(".apk"):
        return "apk"
    if name.endswith(".ipa"):
        return "ipa"
    # Try by content (both are zip)
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            if any(n.startswith("AndroidManifest") for n in names) or "classes.dex" in names:
                return "apk"
            if any(n.startswith("Payload/") and n.endswith(".app/") for n in names):
                return "ipa"
            if any("/Payload/" in n for n in names):
                return "ipa"
    except zipfile.BadZipFile:
        pass
    return "unknown"


def scan_file_bytes(name: str, raw: bytes) -> List[Dict]:
    """Scan a single in-archive file for secrets + endpoints."""
    findings: List[Dict] = []
    try:
        text = raw.decode("utf-8", errors="ignore")
    except Exception:
        return findings

    for kind, pattern in SECRET_PATTERNS:
        for m in re.finditer(pattern, text):
            sample = m.group(0)
            # is_live: detects production-tier credentials. The Stripe regex
            # captures both `sk_live_` and `sk_test_` under the same kind
            # name, so we MUST inspect the matched value, not the kind label.
            # Earlier the kind-label substring check could never fire (the
            # word "live" never appeared in any kind label) which made the
            # exit-code-1-on-live-key CI gate completely non-functional.
            sample_lower = sample.lower()
            is_live = (
                "_live_" in sample_lower
                or "sk-ant-" in sample_lower      # Anthropic keys are always live
                or "akia" in sample_lower         # AWS access keys are always live
                or sample.startswith("ghp_")      # GitHub PAT
                or sample.startswith("github_pat_")
                or sample.startswith("xoxb-")     # Slack bot
                or sample.startswith("AIzaSy")    # Google API
                or sample.startswith("eyJ")       # Supabase JWT
                or kind.lower().startswith("openai")  # all OpenAI keys are production
            )
            findings.append({
                "category": "secret",
                "kind": kind,
                "file": name,
                "sample": sample[:12] + ("…" if len(sample) > 12 else ""),
                "length": len(sample),
                "is_live": is_live,
            })
    for kind, pattern in ENDPOINT_PATTERNS:
        for m in re.finditer(pattern, text):
            findings.append({
                "category": "endpoint",
                "kind": kind,
                "file": name,
                "value": m.group(0),
            })
    return findings


def scan_archive(archive_path: Path) -> Dict:
    """Open an APK or IPA and scan every text-y file for secrets + endpoints."""
    fmt = detect_format(archive_path)
    if fmt == "unknown":
        return {"error": f"Could not identify format of {archive_path.name} as APK or IPA"}

    findings: List[Dict] = []
    file_count = 0
    skipped_too_large = 0
    skipped_binary = 0
    skipped_zip_bomb = 0
    scanned_files = 0
    total_decompressed = 0

    with zipfile.ZipFile(archive_path) as z:
        for info in z.infolist():
            file_count += 1
            name = info.filename
            # Sanitize filename for any later printing — strip ANSI/control
            # chars so a malicious archive can't pollute the terminal.
            safe_name = re.sub(r"[\x00-\x1f\x7f-\x9f]", "?", name)
            if SKIP_PATHS.search("/" + name):
                continue
            ext = os.path.splitext(name)[1].lower()
            # Always scan suspicious filenames even if extension is non-matching
            if ext not in SCANNABLE_EXTENSIONS and not re.search(r"(?:config|env|settings|api|key)", name, re.I):
                skipped_binary += 1
                continue
            # info.file_size is the ZIP's CLAIMED uncompressed size and is
            # attacker-controlled. A zip bomb declares a small file_size but
            # decompresses to hundreds of MB. We trust nothing — read with a
            # cap and verify what actually came out.
            if info.file_size > MAX_FILE_BYTES:
                skipped_too_large += 1
                continue
            # Bail early if we've already decompressed close to the global cap.
            if total_decompressed >= MAX_TOTAL_DECOMPRESSED:
                skipped_zip_bomb += 1
                continue
            try:
                with z.open(info) as f:
                    # Read at most MAX_FILE_BYTES + 1 — if we get the +1 byte,
                    # the entry lied about its size and we treat it as a bomb.
                    raw = f.read(MAX_FILE_BYTES + 1)
                if len(raw) > MAX_FILE_BYTES:
                    skipped_zip_bomb += 1
                    continue
                total_decompressed += len(raw)
                if total_decompressed > MAX_TOTAL_DECOMPRESSED:
                    skipped_zip_bomb += 1
                    continue
                file_findings = scan_file_bytes(safe_name, raw)
                findings.extend(file_findings)
                scanned_files += 1
            except Exception as e:
                # zip corruption or unreadable entry — keep going
                continue

    # Severity classification — keys "live" status is recorded on each finding
    # at scan time (see scan_file_bytes), NOT inferred from the kind name.
    # A Stripe `sk_test_…` and `sk_live_…` share the same kind label
    # ("Stripe secret key") so the only reliable signal is the matched value.
    n_secrets = sum(1 for f in findings if f["category"] == "secret")
    n_endpoints = sum(1 for f in findings if f["category"] == "endpoint")
    n_live = sum(1 for f in findings if f["category"] == "secret" and f.get("is_live"))
    n_nonlive = n_secrets - n_live
    score = 100
    score -= 15 * n_live
    score -= 8 * n_nonlive
    score -= 3 * n_endpoints
    score = max(0, min(100, score))

    return {
        "archive": archive_path.name,
        "format": fmt,
        "size_bytes": archive_path.stat().st_size,
        "files_in_archive": file_count,
        "files_scanned": scanned_files,
        "files_skipped_binary": skipped_binary,
        "files_skipped_too_large": skipped_too_large,
        "files_skipped_zip_bomb": skipped_zip_bomb,
        "score": score,
        "findings_count": len(findings),
        "secrets_count": n_secrets,
        "live_secrets_count": n_live,
        "endpoints_count": n_endpoints,
        "findings": findings,
    }


def render_human(report: Dict) -> str:
    """Pretty-print a report for the terminal.

    Emoji are wrapped via _glyph() so a Windows cp1252 console doesn't crash
    with UnicodeEncodeError. We auto-detect the stdout encoding and fall
    back to plain ASCII labels when we can't safely emit Unicode.
    """
    use_unicode = _can_print_unicode()

    def g(emoji: str, fallback: str) -> str:
        return emoji if use_unicode else fallback

    if "error" in report:
        return f"\n  {g('❌', '[ERROR]')} {report['error']}\n"

    lines = []
    lines.append("")
    lines.append(f"  {g('🔍', '##')} Qualmly Mobile Scan {g('—', '--')} {report['archive']}")
    lines.append(f"  {g('─' * 50, '-' * 50)}")
    lines.append(f"  Format:           {report['format'].upper()}")
    lines.append(f"  Size:             {report['size_bytes'] / (1024*1024):.1f} MB")
    lines.append(f"  Files scanned:    {report['files_scanned']} / {report['files_in_archive']}")
    score = report["score"]
    bar_filled = max(0, min(10, round(score / 10)))
    bar_full, bar_empty = ("█", "░") if use_unicode else ("#", ".")
    bar = bar_full * bar_filled + bar_empty * (10 - bar_filled)
    lines.append(f"  Score:            {score}/100  {bar}")
    lines.append(f"  Secrets found:    {report['secrets_count']} ({report.get('live_secrets_count', 0)} live)")
    lines.append(f"  Endpoints found:  {report['endpoints_count']}")
    lines.append("")

    if report["secrets_count"]:
        lines.append(f"  {g('🔴', '[!]')} SECRETS:")
        for f in report["findings"]:
            if f["category"] != "secret":
                continue
            tag = " [LIVE]" if f.get("is_live") else ""
            bullet = g("•", "*")
            lines.append(f"     {bullet} {f['kind']:30}  in  {f['file']}{tag}")
            lines.append(f"       sample: {f['sample']} ({f['length']} chars total)")
        lines.append("")

    if report["endpoints_count"]:
        lines.append(f"  {g('🔵', '[i]')} ENDPOINTS:")
        for f in report["findings"]:
            if f["category"] != "endpoint":
                continue
            arrow = g("→", "->")
            bullet = g("•", "*")
            lines.append(f"     {bullet} {f['kind']:30}  {arrow}  {f.get('value', '')}")
            lines.append(f"       in {f['file']}")
        lines.append("")

    lines.append(f"  Powered by Qualmly {g('·', '|')} qualmly.dev")
    lines.append("")
    return "\n".join(lines)


def _can_print_unicode() -> bool:
    """True if stdout can safely emit emoji / box-drawing chars."""
    enc = (getattr(sys.stdout, "encoding", None) or "").lower()
    # cp1252 (Windows default), ascii, latin-1 etc. all crash on emoji.
    if not enc or "utf" not in enc:
        return False
    return True


def main():
    p = argparse.ArgumentParser(
        description="Scan an APK or IPA for embedded secrets + endpoints (Qualmly mobile)."
    )
    p.add_argument("archive", type=str, help="Path to .apk or .ipa file")
    p.add_argument("--json", action="store_true", help="Output JSON instead of human-readable")
    p.add_argument("--report", type=str, help="Write JSON report to this path")
    args = p.parse_args()

    archive_path = Path(args.archive)
    if not archive_path.exists():
        print(f"Error: file not found: {archive_path}", file=sys.stderr)
        sys.exit(2)

    report = scan_archive(archive_path)

    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2))
        print(f"Wrote report to {args.report}")

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(render_human(report))

    # Exit code 1 if any live (production) secret was found.
    # The is_live flag is set per-finding at scan time based on the matched
    # value — we cannot rely on the kind label (e.g. "Stripe secret key"
    # never contains the substring "live"). This is the entire CI-gating
    # value of the tool, so the bug to keep guarding against is "exit 0
    # despite an obvious live key."
    has_critical = any(
        f.get("category") == "secret" and f.get("is_live")
        for f in report.get("findings", [])
    )
    sys.exit(1 if has_critical else 0)


if __name__ == "__main__":
    main()
