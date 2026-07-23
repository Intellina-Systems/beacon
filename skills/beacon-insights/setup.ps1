<#
Sets BEACON_API_KEY and BEACON_URL as persistent Windows *user* environment
variables, AND installs this skill where Claude Code actually discovers it.

The env vars are OS-level, not tool-level: every coding agent and IDE
(Claude Code, Codex, Gemini CLI, OpenCode, VS Code, Antigravity, or anything
that comes next) inherits them automatically, because they all just run as
processes under your Windows account. No per-tool config, no sourcing .env,
no reminding the agent at the start of every session.

That's necessary but not sufficient for Claude Code specifically: it only
auto-loads skills from ".claude/skills/<name>/" in the current repo or from
"~/.claude/skills/<name>/" for every repo — never from an arbitrary folder
like this one. So this script also links this skill folder into both of
those locations (a directory junction, not a copy, so it can't drift out of
sync with this source). The user-level link is what makes Claude Code use
the skill in *every* repo you open on this machine, not just this one.

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

function Install-SkillLink {
    param([string]$LinkPath, [string]$TargetPath, [string]$Label)

    $existing = Get-Item -Path $LinkPath -ErrorAction SilentlyContinue
    if ($existing) {
        if ($existing.LinkType -eq "Junction" -and $existing.Target -contains $TargetPath) {
            Write-Host "$Label already linked: $LinkPath"
            return
        }
        Write-Warning "$LinkPath already exists and isn't the expected link — leaving it alone. Remove it and re-run this script to relink."
        return
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $LinkPath -Parent) | Out-Null
    New-Item -ItemType Junction -Path $LinkPath -Target $TargetPath | Out-Null
    Write-Host "$Label linked: $LinkPath -> $TargetPath"
}

$skillSourceDir = $PSScriptRoot
$repoRoot = Split-Path (Split-Path $skillSourceDir -Parent) -Parent

Install-SkillLink -LinkPath (Join-Path $repoRoot ".claude\skills\beacon-insights") -TargetPath $skillSourceDir -Label "Project-level skill"
Install-SkillLink -LinkPath (Join-Path $HOME ".claude\skills\beacon-insights") -TargetPath $skillSourceDir -Label "User-level skill (every repo)"

Write-Host ""
Write-Host "Restart any open terminals, IDEs, or coding agents once so they pick everything up." -ForegroundColor Yellow
Write-Host "After that it's automatic — every tool, every repo, every session, no setup ever again."
