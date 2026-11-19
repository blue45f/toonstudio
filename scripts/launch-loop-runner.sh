#!/usr/bin/env bash
set -euo pipefail

# ToonStudio 20-Hour Unattended Autonomous Upgrade Runner
# Runs fresh-context agent cycles against docs/launch-loop/AC_LEDGER.md
# until all ACs are VERIFIED or a safety circuit breaker triggers.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEDGER_FILE="$REPO_ROOT/docs/launch-loop/AC_LEDGER.md"
PROMPT_TEMPLATE="$REPO_ROOT/docs/launch-loop/CYCLE_PROMPT.md"
MEMORY_FILE="$REPO_ROOT/docs/launch-loop/MEMORY.md"

AGENT="${AGENT:-auto}"
MAX_HOURS="${MAX_HOURS:-20}"
MAX_CYCLES="${MAX_CYCLES:-60}"
MAX_CONSECUTIVE_FAILURES="${MAX_CONSECUTIVE_FAILURES:-3}"
SLEEP_SECONDS="${SLEEP_SECONDS:-15}"
LOG_DIR="${LOG_DIR:-/tmp/toonstudio-launch-loop-logs}"
DRY_RUN=0
ALLOW_MAIN=0
USE_CAFFEINATE=1
AUTO_PUSH=0
AUTO_PR_MERGE=0

usage() {
  cat <<'EOF'
Usage: scripts/launch-loop-runner.sh [options]

Options:
  --agent <auto|claude|codex|gemini|opencode>   Agent CLI to invoke (default: auto)
  --max-hours <N>                               Max wall-clock hours (default: 20)
  --max-cycles <N>                              Max fresh-context cycles (default: 60)
  --max-failures <N>                            Max consecutive failed cycles before halt (default: 3)
  --sleep <seconds>                             Cooldown between cycles (default: 15)
  --log-dir <path>                              Log directory outside git tree (default: /tmp/toonstudio-launch-loop-logs)
  --auto-push                                   Push feature branch to origin after each verified checkpoint commit
  --auto-pr-merge                               After all ACs VERIFIED + pnpm verify:push green, open PR and enable gh auto-merge
  --allow-main                                  Allow running directly on main branch (not recommended)
  --no-caffeinate                               Disable macOS caffeinate sleep prevention
  --dry-run                                     Print resolved target AC and command without executing agent
  -h, --help                                    Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT="$2"; shift 2 ;;
    --max-hours) MAX_HOURS="$2"; shift 2 ;;
    --max-cycles) MAX_CYCLES="$2"; shift 2 ;;
    --max-failures) MAX_CONSECUTIVE_FAILURES="$2"; shift 2 ;;
    --sleep) SLEEP_SECONDS="$2"; shift 2 ;;
    --log-dir) LOG_DIR="$2"; shift 2 ;;
    --auto-push) AUTO_PUSH=1; shift ;;
    --auto-pr-merge) AUTO_PUSH=1; AUTO_PR_MERGE=1; shift ;;
    --allow-main) ALLOW_MAIN=1; shift ;;
    --no-caffeinate) USE_CAFFEINATE=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[ERROR] Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

for p in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin" "$HOME/.volta/bin" "$HOME/.bun/bin" "$HOME/.nvm/versions/node"/*/bin; do
  if [[ -d "$p" ]]; then
    PATH="$p:$PATH"
  fi
done
export PATH

cd "$REPO_ROOT"

if [[ ! -f "$LEDGER_FILE" || ! -f "$PROMPT_TEMPLATE" ]]; then
  echo "[ERROR] Missing launch-loop ledger or prompt template under docs/launch-loop/." >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" == "main" && "$ALLOW_MAIN" -ne 1 && "$DRY_RUN" -ne 1 ]]; then
  echo "[ERROR] Refusing to run unattended loop directly on 'main'. Switch to a feature branch or pass --allow-main." >&2
  exit 1
fi

resolve_agent() {
  if [[ "$AGENT" != "auto" ]]; then
    echo "$AGENT"
    return
  fi
  for candidate in claude codex gemini opencode; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return
    fi
  done
  echo "none"
}

RESOLVED_AGENT="$(resolve_agent)"
if [[ "$RESOLVED_AGENT" == "none" && "$DRY_RUN" -ne 1 ]]; then
  echo "[ERROR] No supported agent CLI found in PATH (tried: claude, codex, gemini, opencode)." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

CAFFEINATE_PID=""
cleanup() {
  if [[ -n "$CAFFEINATE_PID" ]] && kill -0 "$CAFFEINATE_PID" 2>/dev/null; then
    kill "$CAFFEINATE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "$DRY_RUN" -ne 1 && "$USE_CAFFEINATE" -eq 1 && "$(uname -s)" == "Darwin" ]] && command -v caffeinate >/dev/null 2>&1; then
  caffeinate -i -w "$$" &
  CAFFEINATE_PID="$!"
fi

count_remaining_acs() {
  awk -F'|' '
    /^\| AC-[0-9]+/ {
      status=$5
      gsub(/^[ \t]+|[ \t]+$/, "", status)
      if (status != "VERIFIED") count++
    }
    END { print count+0 }
  ' "$LEDGER_FILE"
}

pick_next_ac() {
  local target=""
  for wanted in REJECTED IN_PROGRESS TODO; do
    target="$(awk -F'|' -v w="$wanted" '
      /^\| AC-[0-9]+/ {
        id=$2; status=$5
        gsub(/^[ \t]+|[ \t]+$/, "", id)
        gsub(/^[ \t]+|[ \t]+$/, "", status)
        if (status == w) { print id; exit }
      }
    ' "$LEDGER_FILE")"
    if [[ -n "$target" ]]; then
      echo "$target"
      return
    fi
  done
  echo ""
}

run_agent_cycle() {
  local target_ac="$1"
  local prompt_file="$2"
  local log_file="$3"

  sed "s/{{TARGET_AC}}/$target_ac/g" "$PROMPT_TEMPLATE" > "$prompt_file"

  case "$RESOLVED_AGENT" in
    claude)
      claude -p "$(cat "$prompt_file")" --permission-mode acceptEdits 2>&1 | tee "$log_file"
      ;;
    codex)
      codex exec --full-auto "$(cat "$prompt_file")" 2>&1 | tee "$log_file"
      ;;
    gemini)
      gemini -p "$(cat "$prompt_file")" --yolo 2>&1 | tee "$log_file"
      ;;
    opencode)
      opencode run "$(cat "$prompt_file")" 2>&1 | tee "$log_file"
      ;;
    *)
      echo "[ERROR] Unsupported agent: $RESOLVED_AGENT" >&2
      return 2
      ;;
  esac
}

push_feature_branch() {
  if [[ "$AUTO_PUSH" -eq 1 && "$CURRENT_BRANCH" != "main" ]]; then
    echo "[launch-loop] Pushing checkpoint to origin/${CURRENT_BRANCH}..."
    git push -u origin "$CURRENT_BRANCH"
  fi
}

open_and_automerge_pr() {
  if [[ "$AUTO_PR_MERGE" -ne 1 || "$CURRENT_BRANCH" == "main" ]]; then
    return
  fi
  if ! command -v gh >/dev/null 2>&1; then
    echo "[launch-loop] WARNING: 'gh' CLI not found; skipping automatic PR create/merge." >&2
    return
  fi
  echo "[launch-loop] Creating PR and enabling CI-gated auto-merge (squash)..."
  gh pr create \
    --base main \
    --head "$CURRENT_BRANCH" \
    --title "feat(launch-loop): ToonStudio 상용 출시 24개 AC 전수 고도화" \
    --body "docs/launch-loop/AC_LEDGER.md 전 항목 VERIFIED 및 pnpm verify:push 통과 완료. 운영 배포는 AGENTS.md §8에 따라 미실행." \
    || true
  gh pr merge "$CURRENT_BRANCH" --squash --auto --delete-branch
}

START_EPOCH="$(date +%s)"
DEADLINE_EPOCH="$(( START_EPOCH + MAX_HOURS * 3600 ))"
CONSECUTIVE_FAILURES=0

echo "================================================================"
echo "[launch-loop] Repo:      $REPO_ROOT"
echo "[launch-loop] Branch:    $CURRENT_BRANCH"
echo "[launch-loop] Agent:     $RESOLVED_AGENT"
echo "[launch-loop] Budget:    ${MAX_HOURS}h / ${MAX_CYCLES} cycles"
echo "[launch-loop] AutoPush:  ${AUTO_PUSH} | AutoPRMerge: ${AUTO_PR_MERGE}"
echo "[launch-loop] Logs:      $LOG_DIR"
echo "================================================================"

for (( cycle=1; cycle<=MAX_CYCLES; cycle++ )); do
  NOW_EPOCH="$(date +%s)"
  if (( NOW_EPOCH >= DEADLINE_EPOCH )); then
    echo "[launch-loop] Reached wall-clock limit (${MAX_HOURS}h). Stopping cleanly."
    exit 0
  fi

  REMAINING="$(count_remaining_acs)"
  if (( REMAINING == 0 )); then
    echo "[launch-loop] All ACs in AC_LEDGER.md are VERIFIED!"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] Would run final gate: pnpm verify:push"
      exit 0
    fi
    echo "[launch-loop] Running final release gate: pnpm verify:push"
    pnpm verify:push 2>&1 | tee "$LOG_DIR/final-verify-push-$(date +%Y%m%d-%H%M%S).log"
    push_feature_branch
    open_and_automerge_pr
    echo "[launch-loop] ALL GATES GREEN. Commercial launch loop complete."
    exit 0
  fi

  TARGET_AC="$(pick_next_ac)"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  CYCLE_LOG="$LOG_DIR/cycle-$(printf '%03d' "$cycle")-${TARGET_AC}-${STAMP}.log"
  CYCLE_PROMPT_FILE="$LOG_DIR/cycle-$(printf '%03d' "$cycle")-${TARGET_AC}-prompt.md"
  HEAD_BEFORE="$(git rev-parse --short HEAD)"

  echo ""
  echo "[launch-loop] Cycle ${cycle}/${MAX_CYCLES} | Remaining ACs: ${REMAINING} | Target: ${TARGET_AC} | HEAD: ${HEAD_BEFORE}"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    sed "s/{{TARGET_AC}}/$TARGET_AC/g" "$PROMPT_TEMPLATE" > "$CYCLE_PROMPT_FILE"
    echo "[dry-run] Prepared prompt: $CYCLE_PROMPT_FILE"
    echo "[dry-run] Would invoke agent '${RESOLVED_AGENT}' for ${TARGET_AC} and log to ${CYCLE_LOG}"
    exit 0
  fi

  set +e
  run_agent_cycle "$TARGET_AC" "$CYCLE_PROMPT_FILE" "$CYCLE_LOG"
  CYCLE_RC="${PIPESTATUS[0]}"
  set -e

  HEAD_AFTER="$(git rev-parse --short HEAD)"
  NEW_REMAINING="$(count_remaining_acs)"

  if [[ "$CYCLE_RC" -eq 0 && ( "$NEW_REMAINING" -lt "$REMAINING" || "$HEAD_AFTER" != "$HEAD_BEFORE" ) ]]; then
    CONSECUTIVE_FAILURES=0
    echo "[launch-loop] Cycle ${cycle} progressed (${TARGET_AC}: HEAD ${HEAD_BEFORE} -> ${HEAD_AFTER}, remaining ${REMAINING} -> ${NEW_REMAINING})."
    push_feature_branch
  else
    CONSECUTIVE_FAILURES="$(( CONSECUTIVE_FAILURES + 1 ))"
    echo "[launch-loop] WARNING: Cycle ${cycle} made no verified progress (rc=${CYCLE_RC}, failures=${CONSECUTIVE_FAILURES}/${MAX_CONSECUTIVE_FAILURES})."
    echo "- [$(date +%Y-%m-%d\ %H:%M)] Cycle ${cycle} (${TARGET_AC}) 무진전/실패 (rc=${CYCLE_RC}, log=${CYCLE_LOG})" >> "$MEMORY_FILE"
    if (( CONSECUTIVE_FAILURES >= MAX_CONSECUTIVE_FAILURES )); then
      echo "[launch-loop] Circuit breaker tripped (${MAX_CONSECUTIVE_FAILURES} consecutive failures). Halting safely." >&2
      exit 1
    fi
  fi

  sleep "$SLEEP_SECONDS"
done

echo "[launch-loop] Reached max cycles (${MAX_CYCLES}). Remaining ACs: $(count_remaining_acs)."
exit 0
