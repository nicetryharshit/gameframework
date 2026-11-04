# Runs the project's checks on Windows and saves a log you can send back.
# Usage (from the project folder):
#   powershell -ExecutionPolicy Bypass -File scripts\windows-check.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows-check.ps1 -SkipDesktop
# It keeps going after a failure, so one failing step does not hide the rest.
param([switch]$SkipDesktop)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$log = Join-Path $root 'windows-check.log'
$results = New-Object System.Collections.Generic.List[object]

function Write-Log([string]$text) {
  $text | Tee-Object -FilePath $log -Append
}

function Invoke-Step([string]$name, [string]$command) {
  Write-Log ''
  Write-Log "=== $name ==="
  Write-Log "> $command"
  $start = Get-Date
  cmd /c "$command 2>&1" | Tee-Object -FilePath $log -Append | Out-Null
  $code = $LASTEXITCODE
  $seconds = [math]::Round(((Get-Date) - $start).TotalSeconds)
  if ($code -eq 0) { $status = 'PASS' } else { $status = 'FAIL' }
  $results.Add([pscustomobject]@{ Step = $name; Result = $status; ExitCode = $code; Seconds = $seconds })
  Write-Log "exit $code after $seconds seconds ($status)"
}

Set-Content -Path $log -Value "Windows check started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  in $root"

Invoke-Step 'Node version' 'node -v'
Invoke-Step 'npm version' 'npm -v'
Invoke-Step 'Rust version' 'rustc --version'
Invoke-Step 'Cargo version' 'cargo --version'

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 24) {
  Write-Log "NOTE: the project asks for Node 24 or newer; this machine has Node $nodeMajor. Results may differ."
}

Invoke-Step 'Install dependencies' 'npm ci'
Invoke-Step 'Unit tests' 'npm test'
Invoke-Step 'Web build' 'npm run build'

if (-not $SkipDesktop) {
  Invoke-Step 'Windows desktop debug build' 'npx tauri build --debug --no-sign'
  Invoke-Step 'Windows desktop release build' 'npx tauri build --no-sign'
}

Write-Log ''
Write-Log '=== Built files ==='
foreach ($folder in @('src-tauri\target\debug\bundle', 'src-tauri\target\release\bundle')) {
  $path = Join-Path $root $folder
  if (Test-Path $path) {
    Get-ChildItem -Path $path -Recurse -File | Where-Object { $_.Extension -in '.exe', '.msi' } | ForEach-Object {
      Write-Log ("{0}  ({1:N1} MB)" -f $_.FullName, ($_.Length / 1MB))
    }
  }
}

Write-Log ''
Write-Log '=== Summary ==='
$table = $results | Format-Table -AutoSize | Out-String
Write-Log $table

$failed = @($results | Where-Object { $_.Result -eq 'FAIL' }).Count
if ($failed -eq 0) { Write-Log 'All steps passed.' } else { Write-Log "$failed step(s) failed. Send windows-check.log back." }
exit ([int]($failed -gt 0))
