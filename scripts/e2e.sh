#!/usr/bin/env bash
# Run the E2E suites and leave a verifiable, repeatable artifact.
#
# Usage:
#   scripts/e2e.sh --smoke              tests marked `smoke` in tests/e2e/ (no model CLIs or credentials)
#   scripts/e2e.sh --full               all of tests/e2e/ and tests/test_agent_dispatch.py
#   scripts/e2e.sh --release <X.Y.Z>    same suites as --full; refuses unless the tracked tree is clean
#
# Artifact: artifacts/e2e/<mode>/<version|local>/<full-sha>/ holds manifest.json plus one raw
# log per command. Modes never share a directory. A release directory is write-once: a second
# run at the same version and SHA is refused. smoke/full directories are replaced by a rerun.
# The version is always the explicit argument, never derived from tags.
#
# Exit code: the worst (highest) exit code of any suite; 2 for a usage error or refusal.
#
# Downstream: edit only the block between the `E2E SUITES` markers to map the project's own
# E2E commands in (SETUP.md § A).

set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() { echo "e2e: $*" >&2; exit 2; }
USAGE="usage: e2e.sh --smoke | --full | --release <X.Y.Z>"

MODE="${1:-}"; VERSION="local"
case "$MODE" in
    --smoke|--full) [ "$#" -eq 1 ] || die "$USAGE" ;;
    --release)
        [ "$#" -eq 2 ] || die "$USAGE"
        VERSION="$2"
        [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || die "invalid version '$VERSION' (expected X.Y.Z)"
        ;;
    *) die "$USAGE" ;;
esac
MODE="${MODE#--}"

# >>> E2E SUITES: the project's own commands; the only block a downstream repo edits >>>
# SUITES: one command per entry, run in order, every one runs even if an earlier one fails.
# INPUTS: every fixture/config file the suites read, hashed into the manifest.
# shortcut: an unfilled template (pyproject name is still a placeholder) is not a valid uv
# project, so run without it; after SETUP the project environment is used. The pattern is
# split so SETUP's marker substitution does not rewrite it. Drop once the project is filled.
if grep -qE '[{][{]PROJECT_NAME' pyproject.toml; then
    PY=(uv run --no-project --with pytest --with pytest-asyncio python)
else
    PY=(uv run python)
fi

case "$MODE" in
    smoke) SUITES=("${PY[*]} -m pytest tests/e2e -m smoke") ;;
    *) SUITES=("${PY[*]} -m pytest tests/e2e" "${PY[*]} -m pytest tests/test_agent_dispatch.py") ;;
esac

INPUTS=(pyproject.toml main.py scripts/agent-dispatch.sh)
while IFS= read -r f; do INPUTS+=("$f"); done < <(find tests/e2e -type f ! -path '*/__pycache__/*' | sort)
[ "$MODE" = smoke ] || INPUTS+=(tests/test_agent_dispatch.py)
# <<< E2E SUITES <<<

SHA="$(git rev-parse HEAD)"
if [ -z "$(git status --porcelain --untracked-files=no)" ]; then CLEAN=true; else CLEAN=false; fi
[ "$MODE" != release ] || [ "$CLEAN" = true ] || die "refusing release E2E: tracked tree is dirty"

OUT="artifacts/e2e/$MODE/$VERSION/$SHA"
if [ "$MODE" = release ]; then
    mkdir -p "$(dirname "$OUT")"
    mkdir "$OUT" 2>/dev/null || die "refusing to overwrite existing release artifact $OUT"
else
    rm -rf "$OUT"; mkdir -p "$OUT"
fi

STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
: > "$OUT/commands.tsv"
WORST=0
n=0
for cmd in "${SUITES[@]}"; do
    n=$((n + 1)); log="$(printf '%02d' "$n").log"
    echo "e2e: [$n/${#SUITES[@]}] $cmd"
    rc=0
    bash -c "$cmd" > "$OUT/$log" 2>&1 || rc=$?
    tail -n 5 "$OUT/$log"
    printf '%s\t%s\t%s\n' "$cmd" "$rc" "$log" >> "$OUT/commands.tsv"
    [ "$rc" -le "$WORST" ] || WORST="$rc"
done
FINISHED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - "$OUT" "$SHA" "$MODE" "$VERSION" "$STARTED" "$FINISHED" "$CLEAN" "${INPUTS[@]}" <<'PYEOF'
import hashlib
import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path

out, sha, mode, version, started, finished, clean, *inputs = sys.argv[1:]
out_dir = Path(out)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


commands = []
for line in (out_dir / "commands.tsv").read_text().splitlines():
    cmd, code, log = line.split("\t")
    commands.append(
        {"cmd": cmd, "exit_code": int(code), "log": log, "log_sha256": sha256(out_dir / log)}
    )
(out_dir / "commands.tsv").unlink()

manifest = {
    "sha": sha,
    "mode": mode,
    "version": version,
    "started_at": started,
    "finished_at": finished,
    "clean_tree": clean == "true",
    "commands": commands,
    "inputs": [{"path": p, "sha256": sha256(Path(p))} for p in inputs if Path(p).is_file()],
    "env": {
        "python": platform.python_version(),
        "uv": subprocess.run(["uv", "--version"], capture_output=True, text=True).stdout.strip()
        if shutil.which("uv")
        else "",
        "os": platform.platform(),
    },
}
(out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
PYEOF

echo "e2e: $MODE exit $WORST; manifest $OUT/manifest.json"
exit "$WORST"
