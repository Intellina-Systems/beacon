#!/usr/bin/env bash
# Sets BEACON_API_KEY and BEACON_URL as persistent environment variables, AND
# installs this skill where Claude Code actually discovers it.
#
# The env vars are OS-level, not tool-level: every coding agent and IDE
# (Claude Code, Codex, Gemini CLI, OpenCode, VS Code, Antigravity, or
# anything that comes next) inherits them automatically, because they all
# just run as processes under your account. No per-tool config, no sourcing
# .env, no reminding the agent at the start of every session.
#
# That's necessary but not sufficient for Claude Code specifically: it only
# auto-loads skills from ".claude/skills/<name>/" in the current repo or
# from "~/.claude/skills/<name>/" for every repo - never from an arbitrary
# folder like this one. So this script also symlinks this skill folder into
# both of those locations (a symlink, not a copy, so it can't drift out of
# sync with this source). The user-level link is what makes Claude Code use
# the skill in *every* repo you open on this machine, not just this one.
#
# Run once per machine:
#   bash setup.sh

set -euo pipefail

BEACON_URL_DEFAULT="https://beacon-tool.vercel.app"

if [ -z "${1:-}" ]; then
  read -rp "Paste your Beacon API key (Beacon -> Settings -> API Keys, starts with bcn_): " API_KEY
else
  API_KEY="$1"
fi

BEACON_URL="${2:-$BEACON_URL_DEFAULT}"

case "$API_KEY" in
  bcn_*) ;;
  *) echo "Warning: that doesn't look like a Beacon API key (should start with 'bcn_'). Continuing anyway." >&2 ;;
esac

# Pick whichever profile this shell actually reads on startup.
if [ -n "${ZSH_VERSION:-}" ]; then
  PROFILE="$HOME/.zshrc"
else
  PROFILE="$HOME/.bashrc"
fi

{
  echo ""
  echo "# Beacon insights (added by skills/beacon-insights/setup.sh)"
  echo "export BEACON_API_KEY=\"$API_KEY\""
  echo "export BEACON_URL=\"$BEACON_URL\""
} >> "$PROFILE"

echo ""
echo "Done. Added to $PROFILE."

# skill_source_dir = this script's own directory (skills/beacon-insights)
skill_source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(dirname "$(dirname "$skill_source_dir")")"

install_skill_link() {
  local link_path="$1" label="$2"
  if [ -e "$link_path" ] || [ -L "$link_path" ]; then
    if [ -L "$link_path" ] && [ "$(readlink "$link_path")" = "$skill_source_dir" ]; then
      echo "$label already linked: $link_path"
    else
      echo "Warning: $link_path already exists and isn't the expected link - leaving it alone. Remove it and re-run this script to relink." >&2
    fi
    return
  fi
  mkdir -p "$(dirname "$link_path")"
  ln -s "$skill_source_dir" "$link_path"
  echo "$label linked: $link_path -> $skill_source_dir"
}

install_skill_link "$repo_root/.claude/skills/beacon-insights" "Project-level skill"
install_skill_link "$HOME/.claude/skills/beacon-insights" "User-level skill (every repo)"

echo ""
echo "Restart your terminal (and any IDE/agent launched from one) once so it picks everything up."

if [[ "${OSTYPE:-}" == darwin* ]]; then
  echo ""
  echo "macOS note: apps launched from Dock/Spotlight (not from a terminal) don't read shell"
  echo "profiles. If your coding tool is launched that way too, also run:"
  echo "  launchctl setenv BEACON_API_KEY \"$API_KEY\""
  echo "  launchctl setenv BEACON_URL \"$BEACON_URL\""
  echo "(resets on reboot - wrap it in a LaunchAgent if you need it to survive one)."
fi
