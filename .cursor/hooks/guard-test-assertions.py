#!/usr/bin/env python3
"""Block agent edits that reduce active expect( calls in test spec files."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

EXPECT_PATTERN = re.compile(r"\bexpect\s*\(")
TEST_FILE = re.compile(
    r"^tests/.+\.(?:spec|test)\.(?:[jt]sx?)$"
)


def count_active_expects(content: str) -> int:
    total = 0
    for line in content.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        code = line.split("//", 1)[0]
        total += len(EXPECT_PATTERN.findall(code))
    return total


def is_guarded_test_file(file_path: str) -> bool:
    normalized = file_path.replace("\\", "/")
    return bool(TEST_FILE.match(normalized))


def load_payload() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        print("guard-test-assertions: empty stdin", file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"guard-test-assertions: invalid JSON — {exc}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict):
        print("guard-test-assertions: hook payload must be a JSON object", file=sys.stderr)
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


def fallback_before_count(after_count: int, edits: list) -> int:
    delta = 0
    for edit in edits:
        if not isinstance(edit, dict):
            continue
        old_string = edit.get("old_string") or ""
        new_string = edit.get("new_string") or ""
        delta += count_active_expects(old_string) - count_active_expects(new_string)
    return after_count + delta


def block_message(file_path: str, before_count: int, after_count: int) -> str:
    return (
        f"Blocked: test assertions weakened in {file_path} — active expect( "
        f"count {before_count} -> {after_count}. Do not delete or comment out "
        f"assertions to make tests pass. Fix the app, locator, or test data instead."
    )


def main() -> None:
    payload = load_payload()
    file_path = payload.get("file_path") or payload.get("filePath") or payload.get("path")
    if not file_path or not isinstance(file_path, str):
        print("guard-test-assertions: missing file_path in hook payload", file=sys.stderr)
        sys.exit(1)

    if not is_guarded_test_file(file_path):
        sys.exit(0)

    edits = payload.get("edits")
    if edits is None:
        edits = []
    if not isinstance(edits, list):
        print("guard-test-assertions: edits must be an array", file=sys.stderr)
        sys.exit(1)

    path = Path(file_path)
    if not path.is_file():
        print(f"guard-test-assertions: file not found — {file_path}", file=sys.stderr)
        sys.exit(1)

    after = path.read_text(encoding="utf-8")
    after_count = count_active_expects(after)

    before_count: int
    try:
        before = reverse_edits(after, edits)
        before_count = count_active_expects(before)
    except (ValueError, TypeError):
        before_count = fallback_before_count(after_count, edits)

    if before_count > after_count:
        message = block_message(file_path, before_count, after_count)
        out = {"user_message": message, "agent_message": message}
        sys.stdout.write(json.dumps(out))
        sys.stdout.write("\n")
        print(message, file=sys.stderr)
        sys.exit(2)

    print(
        f"guard-test-assertions: OK — {after_count} active expect( preserved",
        file=sys.stderr,
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
