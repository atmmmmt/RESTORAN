<#
    Give a USB receipt printer a Windows print queue.

    A receipt printer plugged into USB is detected by Windows as a device on
    a USB00x port, but that is not a printer: until something creates a queue
    there is no name to address, so it appears in no list and no application
    can open it. The manufacturer's installer normally does this; when it was
    never run — or ran and left nothing behind — this does the same job with
    the driver Windows already ships.

    "Generic / Text Only" is the right driver here, not a compromise. The
    dashboard sends finished ESC/POS bytes, so what is wanted from a driver
    is that it does nothing to them, and this one renders nothing of its own.

    Must run elevated.
#>

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$ErrorActionPreference = 'Stop'

function Pause-Here { Write-Host ''; Read-Host '  اضغط Enter للإغلاق' | Out-Null }

Write-Host ''
Write-Host '  ══════════════════════════════════════════════'
Write-Host '          تركيب طابعة الفواتير USB'
Write-Host '  ══════════════════════════════════════════════'
Write-Host ''

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole(
      [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host '  ✖ شغّل هذا الملف ككمسؤول (كليك يمين ← Run as administrator).' -ForegroundColor Red
  Pause-Here
  exit 1
}

# ── Which USB port is the printer sitting on? ───────────────────────────
# USBPRINT is the class Windows puts a printer-shaped USB device in, and the
# tail of its instance id is the port a queue has to be bound to.
$usbPrinters = @(Get-PnpDevice -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -like 'USBPRINT\*' -and $_.Status -eq 'OK' })

if (-not $usbPrinters.Count) {
  Write-Host '  ✖ لا يوجد أي طابعة USB موصولة ومُشغّلة.' -ForegroundColor Red
  Write-Host '    تأكد من كبل USB ومن أن الطابعة مفتوحة، ثم أعد المحاولة.'
  Pause-Here
  exit 1
}

Write-Host '  الطابعات الموصولة عبر USB:'
Write-Host ''
$i = 0
foreach ($d in $usbPrinters) {
  $i++
  $port = if ($d.InstanceId -match '(USB\d{3})') { $matches[1] } else { 'USB001' }
  Write-Host ("   {0}) {1}   [{2}]" -f $i, $d.FriendlyName, $port) -ForegroundColor Green
}
Write-Host ''

$choice = if ($usbPrinters.Count -eq 1) { 1 } else { [int](Read-Host '  اكتب رقم الطابعة') }
if ($choice -lt 1 -or $choice -gt $usbPrinters.Count) {
  Write-Host '  ✖ رقم خارج القائمة.' -ForegroundColor Red
  Pause-Here
  exit 1
}

$device = $usbPrinters[$choice - 1]
$port   = if ($device.InstanceId -match '(USB\d{3})') { $matches[1] } else { 'USB001' }

Write-Host ("  الجهاز : {0}" -f $device.FriendlyName)
Write-Host ("  المنفذ : {0}" -f $port)
Write-Host ''

# A queue already bound to this exact port is this printer, already done.
$onPort = Get-Printer -ErrorAction SilentlyContinue | Where-Object PortName -eq $port
if ($onPort) {
  Write-Host ('  ✓ هذه الطابعة مركّبة مسبقاً باسم: {0}' -f $onPort.Name) -ForegroundColor Green
  Write-Host '    استخدم هذا الاسم في الداشبورد.'
  Pause-Here
  exit 0
}

<# Two of these printers on one machine report the same device name, so the
   queue cannot simply take it: the second install would collide with the
   first, and even if it did not, two identical entries in the dashboard's
   list are impossible to tell apart. The name is what the cashier picks
   from, so it should say which printer it is. #>
$suggested = if (Get-Printer -Name $device.FriendlyName -ErrorAction SilentlyContinue) {
  'POS-Kitchen'
} else {
  $device.FriendlyName
}

Write-Host '  اكتب اسماً واضحاً لهذه الطابعة — هذا ما سيظهر في الداشبورد.'
Write-Host '  مثال: POS-Cashier للكاشير، POS-Kitchen للمطبخ.'
Write-Host ''
$typed = Read-Host ("  الاسم [{0}]" -f $suggested)
$name = if ([string]::IsNullOrWhiteSpace($typed)) { $suggested } else { $typed.Trim() }

if (Get-Printer -Name $name -ErrorAction SilentlyContinue) {
  Write-Host ('  ✖ يوجد طابعة بهذا الاسم مسبقاً: {0}' -f $name) -ForegroundColor Red
  Write-Host '    أعد التشغيل واختر اسماً آخر.'
  Pause-Here
  exit 1
}
Write-Host ''

try {
  if (-not (Get-PrinterDriver -Name 'Generic / Text Only' -ErrorAction SilentlyContinue)) {
    Write-Host '  تثبيت التعريف Generic / Text Only ...'
    Add-PrinterDriver -Name 'Generic / Text Only'
  }
  if (-not (Get-PrinterPort -Name $port -ErrorAction SilentlyContinue)) {
    Write-Host ("  إنشاء المنفذ {0} ..." -f $port)
    Add-PrinterPort -Name $port
  }
  Write-Host '  إنشاء الطابعة ...'
  Add-Printer -Name $name -DriverName 'Generic / Text Only' -PortName $port

  Write-Host ''
  Write-Host ('  ✓ تم التركيب باسم: {0}' -f $name) -ForegroundColor Green
  Write-Host ''
  Write-Host '  الخطوة التالية: شغّل TEST-PRINT.bat للتأكد من خروج ورقة،'
  Write-Host '  ثم اختر هذا الاسم من الداشبورد ← الإعدادات ← طابعة الفواتير.'
} catch {
  Write-Host ''
  Write-Host ('  ✖ فشل التركيب: {0}' -f ($_.Exception.Message -replace '\s+', ' ')) -ForegroundColor Red
  Write-Host ''
  Write-Host '  جرّب بدلاً من ذلك: إعدادات ويندوز ← الأجهزة والطابعات ←'
  Write-Host '  إضافة طابعة ← «الطابعة التي أريدها غير مدرجة» ← منفذ موجود'
  Write-Host ("  ← {0} ← Generic / Generic / Text Only" -f $port)
}

Pause-Here
