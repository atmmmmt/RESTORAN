<#
    Print one test ticket, with the browser, the dashboard and the agent all
    taken out of the picture.

    When a sale reports the printer as unavailable, the reason arrives inside
    a toast that is half gone before anyone reads it. This asks the spooler
    the same question directly and leaves the answer on the screen.
#>

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$ErrorActionPreference = 'Continue'

function Pause-Here {
  Write-Host ''
  Read-Host '  اضغط Enter للإغلاق' | Out-Null
}

Write-Host ''
Write-Host '  ══════════════════════════════════════════════'
Write-Host '           فحص الطابعة — طباعة تجريبية'
Write-Host '  ══════════════════════════════════════════════'
Write-Host ''

# ── What Windows has, and whether it thinks it can reach it ──────────────
$printers = @(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue)
if (-not $printers.Count) {
  Write-Host '  ✖ لا توجد أي طابعة مثبّتة على هذا الجهاز.' -ForegroundColor Red
  Write-Host '    ثبّت تعريف الطابعة أولاً من «الأجهزة والطابعات».'
  Pause-Here
  exit 1
}

Write-Host '  الطابعات المثبّتة:'
Write-Host ''
$i = 0
foreach ($p in $printers) {
  $i++
  $state = if ($p.WorkOffline) { 'غير متصلة' } elseif ($p.PrinterStatus -eq 5) { 'موقوفة' } else { 'جاهزة' }
  $colour = if ($state -eq 'جاهزة') { 'Green' } else { 'Yellow' }
  Write-Host ("   {0}) {1}" -f $i, $p.Name) -NoNewline
  Write-Host ("   [{0}]" -f $state) -ForegroundColor $colour
  # A queue that never drained is the usual reason a healthy printer prints
  # nothing: every new job simply lines up behind the stuck one.
  if ($p.JobCountSinceLastReset -gt 0 -and $p.WorkOffline) {
    Write-Host '        ↑ فيها مهام عالقة — افتحها من «الأجهزة والطابعات» واحذف المهام' -ForegroundColor Yellow
  }
}

Write-Host ''
$answer = Read-Host '  اكتب رقم الطابعة (أو اسمها كاملاً)'
if ([string]::IsNullOrWhiteSpace($answer)) {
  Write-Host '  ✖ لم تختر شيئاً.' -ForegroundColor Red
  Pause-Here
  exit 1
}

# Typing the number is what people actually do; accept it and the full name.
$name = $answer
if ($answer -match '^\d+$') {
  $index = [int]$answer
  if ($index -lt 1 -or $index -gt $printers.Count) {
    Write-Host '  ✖ رقم خارج القائمة.' -ForegroundColor Red
    Pause-Here
    exit 1
  }
  $name = $printers[$index - 1].Name
}

Write-Host ''
Write-Host ("  الطابعة المختارة: {0}" -f $name)
Write-Host '  جاري الإرسال...'
Write-Host ''

# A minimal ESC/POS ticket: reset, centre, one line, feed, cut.
$bytes = [byte[]]@(0x1B,0x40, 0x1B,0x61,0x01) `
       + [Text.Encoding]::ASCII.GetBytes("AJINEH TEST OK`n") `
       + [byte[]]@(0x0A,0x0A,0x0A, 0x1D,0x56,0x41,0x03)

$file = Join-Path $env:TEMP 'ajineh-test.bin'
[IO.File]::WriteAllBytes($file, $bytes)

$global:LASTEXITCODE = 0
& (Join-Path $PSScriptRoot 'raw-print.ps1') -PrinterName $name -FilePath $file | Out-Null
$code = $LASTEXITCODE
Remove-Item $file -Force -ErrorAction SilentlyContinue

Write-Host ''
if ($code -eq 0) {
  Write-Host '  ✓ أُرسلت البيانات بنجاح.' -ForegroundColor Green
  Write-Host ''
  Write-Host '    إذا خرجت ورقة — الطابعة سليمة، والمشكلة في إعدادات الداشبورد.'
  Write-Host '    إذا لم تخرج ورقة — المشكلة في الطابعة نفسها:'
  Write-Host '      · ورق ناقص أو مقلوب      · الغطاء غير مغلق'
  Write-Host '      · كبل الكهرباء            · مهام عالقة في الطابور'
} else {
  Write-Host '  ✖ فشل الإرسال — السبب مكتوب فوق.' -ForegroundColor Red
  Write-Host ''
  Write-Host '    (1801) = اسم الطابعة غير صحيح'
  Write-Host '    (5)    = صلاحيات — شغّل الملف ككمسؤول'
  Write-Host '    (1795) = تعريف الطابعة غير مثبّت'
}

Pause-Here
