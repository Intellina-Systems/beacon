<#
Sets BEACON_API_KEY and BEACON_URL as persistent Windows *user* environment
variables. This is OS-level, not tool-level: every coding agent and IDE
(Claude Code, Codex, Gemini CLI, OpenCode, VS Code, Antigravity, or anything
that comes next) inherits it automatically, because they all just run as
processes under your Windows account. No per-tool config, no sourcing .env,
no reminding the agent at the start of every session.

Run once per machine:
  powershell -ExecutionPolicy Bypass -File setup.ps1
#>

param(
    [string]$ApiKey,
    [string]$BeaconUrl = "https://beacon-tool.vercel.app"
)

if (-not $ApiKey) {
    $ApiKey = Read-Host "Paste your Beacon API key (Beacon -> Settings -> API Keys, starts with bcn_)"
}

if (-not $ApiKey.StartsWith("bcn_")) {
    Write-Warning "That doesn't look like a Beacon API key (should start with 'bcn_'). Continuing anyway."
}

[Environment]::SetEnvironmentVariable("BEACON_API_KEY", $ApiKey, "User")
[Environment]::SetEnvironmentVariable("BEACON_URL", $BeaconUrl, "User")

Write-Host ""
Write-Host "Done. BEACON_API_KEY and BEACON_URL are set for your Windows account." -ForegroundColor Green
Write-Host "Restart any open terminals, IDEs, or coding agents once so they pick it up." -ForegroundColor Yellow
Write-Host "After that it's automatic — every tool, every session, no setup ever again."
