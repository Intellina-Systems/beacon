#!/usr/bin/env bash
# Sets BEACON_API_KEY and BEACON_URL as persistent environment variables.
# This is OS-level, not tool-level: every coding agent and IDE (Claude Code,
# Codex, Gemini CLI, OpenCode, VS Code, Antigravity, or anything that comes
# next) inherits it automatically, because they all just run as processes
# under your account. No per-tool config, no sourcing .env, no reminding the
# agent at the start of every session.
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
echo "Restart your terminal (and any IDE/agent launched from one) once so it picks it up."

if [[ "${OSTYPE:-}" == darwin* ]]; then
  echo ""
  echo "macOS note: apps launched from Dock/Spotlight (not from a terminal) don't read shell"
  echo "profiles. If your coding tool is launched that way too, also run:"
  echo "  launchctl setenv BEACON_API_KEY \"$API_KEY\""
  echo "  launchctl setenv BEACON_URL \"$BEACON_URL\""
  echo "(resets on reboot — wrap it in a LaunchAgent if you need it to survive one)."
fi
