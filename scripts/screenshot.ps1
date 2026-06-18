# Capture the real "Vibe Space" Tauri window to a PNG for review.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/screenshot.ps1
#   ...optionally:  -Title "Vibe Space"  -OutDir ".dev/shots"  -Name "before.png"
#
# Primary capture uses PrintWindow with PW_RENDERFULLCONTENT (flag 2), which
# grabs WebView2 / GPU-composited content even when the window is in the
# background or partially occluded. If that yields a blank frame, it falls back
# to bringing the window forward and copying the screen region.
#
# Prints the saved file path on success. Also writes <OutDir>/latest.png.

param(
  [string]$Title  = "Vibe Space",
  [string]$OutDir = ".dev/shots",
  [string]$Name   = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

[void][Win32]::SetProcessDPIAware()

# --- Locate the window -------------------------------------------------------
$proc = Get-Process |
  Where-Object { $_.MainWindowTitle -like "*$Title*" -and $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1

if (-not $proc) {
  Write-Error "No window matching '*$Title*' found. Is the app running? (npm run tauri dev)"
  exit 1
}
$hwnd = $proc.MainWindowHandle

# Un-minimize if needed so the window has a real client area to capture.
if ([Win32]::IsIconic($hwnd)) {
  [void][Win32]::ShowWindow($hwnd, 9)  # SW_RESTORE
  Start-Sleep -Milliseconds 350
}

$rect = New-Object Win32+RECT
[void][Win32]::GetWindowRect($hwnd, [ref]$rect)
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) { Write-Error "Window has no measurable size ($w x $h)."; exit 1 }

# --- Capture: PrintWindow (flag 2) ------------------------------------------
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok  = [Win32]::PrintWindow($hwnd, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()

# Blank-frame detection: sample a coarse grid; if every sample is identical the
# capture failed (typical GPU black frame) -> fall back to screen copy.
function Test-Blank([System.Drawing.Bitmap]$b) {
  $seen = @{}
  $sx = [Math]::Max(1, [int]($b.Width / 24))
  $sy = [Math]::Max(1, [int]($b.Height / 24))
  for ($x = 0; $x -lt $b.Width; $x += $sx) {
    for ($y = 0; $y -lt $b.Height; $y += $sy) {
      $seen[$b.GetPixel($x, $y).ToArgb()] = $true
      if ($seen.Keys.Count -gt 1) { return $false }
    }
  }
  return $true
}

if (-not $ok -or (Test-Blank $bmp)) {
  [void][Win32]::SetForegroundWindow($hwnd)
  Start-Sleep -Milliseconds 450
  $g2 = [System.Drawing.Graphics]::FromImage($bmp)
  $g2.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
  $g2.Dispose()
}

# --- Save --------------------------------------------------------------------
$dir = Join-Path (Get-Location) $OutDir
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

$file = if ($Name) { $Name } else { (Get-Date -Format "yyyyMMdd-HHmmss") + ".png" }
$path = Join-Path $dir $file
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save((Join-Path $dir "latest.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output $path
