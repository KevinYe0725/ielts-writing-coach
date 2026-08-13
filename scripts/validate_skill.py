#!/usr/bin/env python3
"""Run the Codex Skill Creator quick validator from a stable repo command."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def validator_candidates(repository: Path) -> list[Path]:
    candidates: list[Path] = []
    explicit = os.environ.get("IWC_SKILL_QUICK_VALIDATE")
    if explicit:
        candidates.append(Path(explicit).expanduser())

    codex_home = os.environ.get("CODEX_HOME")
    if codex_home:
        candidates.append(
            Path(codex_home)
            / "skills"
            / ".system"
            / "skill-creator"
            / "scripts"
            / "quick_validate.py"
        )

    candidates.extend(
        [
            Path.home()
            / ".codex"
            / "skills"
            / ".system"
            / "skill-creator"
            / "scripts"
            / "quick_validate.py",
            repository / "scripts" / "vendor" / "skill_quick_validate.py",
        ]
    )
    return candidates


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/validate_skill.py <skill_directory>", file=sys.stderr)
        return 2

    repository = Path(__file__).resolve().parents[1]
    skill_directory = Path(sys.argv[1]).resolve()
    if not skill_directory.is_dir():
        print(f"Skill directory does not exist: {skill_directory}", file=sys.stderr)
        return 2

    validator = next(
        (candidate for candidate in validator_candidates(repository) if candidate.is_file()),
        None,
    )
    if validator is None:
        print(
            "Codex Skill Creator quick_validate.py was not found. "
            "Set IWC_SKILL_QUICK_VALIDATE or restore scripts/vendor/skill_quick_validate.py.",
            file=sys.stderr,
        )
        return 2

    result = subprocess.run(
        [sys.executable, str(validator), str(skill_directory)],
        check=False,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
