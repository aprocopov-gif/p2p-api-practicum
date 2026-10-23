#!/usr/bin/env python3
"""Block agent edits that introduce Playwright constitution violations."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

EXPECT_PATTERN = re.compile(r"\bexpect\s*\(")
GUARDED_FILE = re.compile(r"^(?:tests|pages)/.+\.[jt]sx?$")
SPEC_FILE = re.compile(r"^tests/.+\.(?:spec|test)\.[jt]sx?$")

WAIT_FOR_TIMEOUT = re.compile(r"\.waitForTimeout\s*\(")
XPATH_LOCATOR = re.compile(r"""locator\s*\(\s*['"`]//""")
ANY_TYPE = re.compile(
    r":\s*any\b|(?:\bas\s+any\b)|<any>|Array<any>"
)
FILL_EMAIL = re.compile(r"""\.fill\s*\(\s*['"][^'"]*@[^'"]+['"]""")
CRED_LITERAL = re.compile(
    r"""(?i)(?:password|secret|api_key|token)\s*[:=]\s*['"]([^'"]{4,})['"]"""
)
DESCRIBE_TAG = re.compile(r"test\.describe\s*\([\s\S]*?\{[^}]*\btag\s*:")


def count_active_expects(content: str) -> int:
    total = 0
    for line in content.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        code = line.split("//", 1)[0]
        total += len(EXPECT_PATTERN.findall(code))
    return total


def violation_instances(content: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for match in WAIT_FOR_TIMEOUT.finditer(content):
        found.append(("waitForTimeout", match.group(0)))
    for match in XPATH_LOCATOR.finditer(content):
        found.append(("xpath locator", match.group(0)))
    for match in ANY_TYPE.finditer(content):
        found.append(("any type", match.group(0)))
    for match in FILL_EMAIL.finditer(content):
        found.append(("hardcoded credential (.fill email)", match.group(0)))
    for match in CRED_LITERAL.finditer(content):
        found.append(("hardcoded credential (secret literal)", match.group(0)))
    for match in DESCRIBE_TAG.finditer(content):
        found.append(("tag on test.describe", match.group(0)[:80]))
    return found


def introduced_instances(before: str, after: str) -> list[str]:
    before_c = Counter(violation_instances(before))
    after_c = Counter(violation_instances(after))
    reasons: list[str] = []
    for key, after_count in after_c.items():
        kind, snippet = key
        delta = after_count - before_c.get(key, 0)
        for _ in range(delta):
            reasons.append(f"{kind} ({snippet})")
    return reasons


def load_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        print("guard-constitution: empty stdin", file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"guard-constitution: invalid JSON — {exc}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict):
        print("guard-constitution: hook payload must be a JSON object", file=sys.stderr)
        sys.exit(1)
    return data


def reverse_edits(after: str, edits: list) -> str:
    before = after
    for edit in reversed(edits):
        if not isinstance(edit, dict):
            raise ValueError("edit is not an object")
        new_string = edit.get("new_string")
        old_string = edit.get("old_string")
        if new_string is None or old_string is None:
            raise ValueError("edit missing old_string or new_string")
        if new_string not in before:
            raise ValueError("new_string not found while reversing edit")
        before = before.replace(new_string, old_string, 1)
    return before


def violations_from_edit_diff(edits: list) -> list[str]:
    reasons: list[str] = []
    for edit in edits:
        if not isinstance(edit, dict):
            continue
        old_string = edit.get("old_string") or ""
        new_string = edit.get("new_string") or ""
        reasons.extend(introduced_instances(old_string, new_string))
    return reasons


def fallback_expect_before(after_count: int, edits: list) -> int:
    delta = 0
    for edit in edits:
        if not isinstance(edit, dict):
            continue
        old_string = edit.get("old_string") or ""
        new_string = edit.get("new_string") or ""
        delta += count_active_expects(old_string) - count_active_expects(new_string)
    return after_count + delta


def expect_drop_reason(before_count: int, after_count: int) -> str | None:
    if before_count > after_count:
        return (
            f"weakened assertions — active expect( count {before_count} -> {after_count}"
        )
    return None


def block(file_path: str, reasons: list[str]) -> None:
    detail = "; ".join(dict.fromkeys(reasons))
    message = f"Blocked: constitution violation in {file_path} — {detail}"
    out = {"user_message": message, "agent_message": message}
    sys.stdout.write(json.dumps(out))
    sys.stdout.write("\n")
    print(message, file=sys.stderr)
    sys.exit(2)


def main() -> None:
    payload = load_payload()
    file_path = payload.get("file_path") or payload.get("filePath") or payload.get("path")
    if not file_path or not isinstance(file_path, str):
        print("guard-constitution: missing file_path in hook payload", file=sys.stderr)
        sys.exit(1)

    normalized = file_path.replace("\\", "/")
    if not GUARDED_FILE.match(normalized):
        sys.exit(0)

    edits = payload.get("edits")
    if edits is None:
        edits = []
    if not isinstance(edits, list):
        print("guard-constitution: edits must be an array", file=sys.stderr)
        sys.exit(1)

    path = Path(file_path)
    if not path.is_file():
        print(f"guard-constitution: file not found — {file_path}", file=sys.stderr)
        sys.exit(1)

    after = path.read_text(encoding="utf-8")
    is_spec = bool(SPEC_FILE.match(normalized))
    reasons: list[str] = []

    try:
        before = reverse_edits(after, edits)
        reasons.extend(introduced_instances(before, after))
        if is_spec:
            before_count = count_active_expects(before)
            after_count = count_active_expects(after)
            drop = expect_drop_reason(before_count, after_count)
            if drop:
                reasons.append(drop)
    except (ValueError, TypeError):
        reasons.extend(violations_from_edit_diff(edits))
        if is_spec:
            after_count = count_active_expects(after)
            before_count = fallback_expect_before(after_count, edits)
            drop = expect_drop_reason(before_count, after_count)
            if drop:
                reasons.append(drop)

    if reasons:
        block(file_path, reasons)

    print(f"guard-constitution: OK — {file_path}", file=sys.stderr)
    sys.exit(0)


if __name__ == "__main__":
    main()
