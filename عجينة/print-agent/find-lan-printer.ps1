<#
    Find a network receipt printer on a directly-connected cable.

    A printer shipped with a fixed address — 192.168.1.87 and 192.168.123.100
    are the usual ones — and a laptop that asked for DHCP and got nothing sit
    on the same wire in different worlds: neither can address the other, and
    nothing about the link says anything is wrong. The cable is up, the lights
    are on, and every scan comes back empty.

    So this borrows an address on each of the subnets those printers ship
    with, looks for anything answering on the printing port, and puts the
    adapter back the way it found it. Whatever it added, it removes — except
    the one address that turned out to be needed, and only after saying so.

    Must run elevated.
#>

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$ErrorActionPreference = 'Stop'

function Pause-Here { Write-Host ''; Read-Host '  اضغط Enter للإغلاق' | Out-Null }

Write-Host ''
Write-Host '  ══════════════════════════════════════════════'
Write-Host '         البحث عن طابعة الشبكة على الكبل'
Write-Host '  ══════════════════════════════════════════════'
Write-Host ''

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole(
      [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host '  ✖ شغّل هذا الملف ككمسؤول (كليك يمين ← Run as administrator).' -ForegroundColor Red
  Pause-Here
  exit 1
}

# ── Which cable? ────────────────────────────────────────────────────────
# Only wired adapters that are actually up, and never the Wi-Fi or a VPN —
# borrowing an address on the shop's real network would be rude at best.
$candidates = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
  Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Wi-?Fi|Wireless|Bluetooth' })

if (-not $candidates.Count) {
  Write-Host '  ✖ لا يوجد كبل شبكة موصول.' -ForegroundColor Red
  Write-Host '    تأكد من أن الطابعة مفتوحة وأن الكبل داخل في منفذ الشبكة.'
  Pause-Here
  exit 1
}

Write-Host '  كروت الشبكة السلكية الموصولة:'
Write-Host ''
$i = 0
foreach ($a in $candidates) {
  $i++
  Write-Host ("   {0}) {1}  —  {2}" -f $i, $a.Name, $a.InterfaceDescription) -ForegroundColor Green
}
Write-Host ''
$pick = if ($candidates.Count -eq 1) { 1 } else { [int](Read-Host '  اكتب رقم الكرت الموصول بالطابعة') }
if ($pick -lt 1 -or $pick -gt $candidates.Count) {
  Write-Host '  ✖ رقم خارج القائمة.' -ForegroundColor Red
  Pause-Here
  exit 1
}
$adapter = $candidates[$pick - 1]
$ifIndex = $adapter.ifIndex

Write-Host ''
Write-Host ("  الكرت: {0}" -f $adapter.Name)
Write-Host ''

# ── Borrow an address on each subnet these printers ship with ───────────
$probes = @(
  @{ Net = '192.168.1';   Host = '192.168.1.240'   }
  @{ Net = '192.168.123'; Host = '192.168.123.240' }
  @{ Net = '192.168.0';   Host = '192.168.0.240'   }
  @{ Net = '10.0.0';      Host = '10.0.0.240'      }
  @{ Net = '192.168.2';   Host = '192.168.2.240'   }
  @{ Net = '192.168.11';  Host = '192.168.11.240'  }
  @{ Net = '192.168.100'; Host = '192.168.100.240' }
  @{ Net = '172.16.0';    Host = '172.16.0.240'    }
)

$added = @()
Write-Host '  تجهيز العناوين المؤقتة...'
foreach ($p in $probes) {
  if (Get-NetIPAddress -InterfaceIndex $ifIndex -IPAddress $p.Host -ErrorAction SilentlyContinue) { continue }
  try {
    New-NetIPAddress -InterfaceIndex $ifIndex -IPAddress $p.Host -PrefixLength 24 -ErrorAction Stop | Out-Null
    $added += $p.Host
  } catch { }
}
Start-Sleep -Seconds 2

# ── Scan. node is already on this machine for the agent, and opens
#    hundreds of sockets at once where PowerShell would take minutes. ────
$scanner = Join-Path $env:TEMP 'ajineh-scan.js'
$nets = ($probes | ForEach-Object { "'" + $_.Net + "'" }) -join ','
@"
const net = require('net');
const subs = [$nets];
const found = [];
const check = (ip, port) => new Promise(res => {
  const s = new net.Socket();
  s.setTimeout(900);
  const done = ok => { if (ok) found.push(ip + ':' + port); s.destroy(); res(); };
  s.on('connect', () => done(true));
  s.on('timeout', () => done(false));
  s.on('error', () => done(false));
  s.connect(port, ip);
});
(async () => {
  for (const sub of subs) {
    const jobs = [];
    for (let i = 1; i <= 254; i++) { jobs.push(check(sub + '.' + i, 9100)); }
    await Promise.all(jobs);
  }
  console.log(found.join('\n'));
})();
"@ | Set-Content -Path $scanner -Encoding UTF8

Write-Host '  جاري المسح... (قد يستغرق دقيقة)'
Write-Host ''
$hits = @(& node $scanner 2>$null | Where-Object { $_ -match '\d+\.\d+\.\d+\.\d+:\d+' })
Remove-Item $scanner -Force -ErrorAction SilentlyContinue

# ── Put the adapter back, keeping only what the find needs ──────────────
$keep = $null
if ($hits.Count) {
  $printerIp = ($hits[0] -split ':')[0]
  $printerNet = ($printerIp -split '\.')[0..2] -join '.'
  $keep = ($probes | Where-Object { $_.Net -eq $printerNet }).Host
}
foreach ($ip in $added) {
  if ($ip -eq $keep) { continue }
  Remove-NetIPAddress -InterfaceIndex $ifIndex -IPAddress $ip -Confirm:$false -ErrorAction SilentlyContinue
}

Write-Host ''
if ($hits.Count) {
  Write-Host '  ✓ تم العثور على الطابعة' -ForegroundColor Green
  Write-Host ''
  foreach ($h in $hits) { Write-Host ("     {0}" -f $h) -ForegroundColor Green }
  Write-Host ''
  Write-Host ('  ثُبّت عنوان الكرت على {0} ليبقى الاتصال قائماً.' -f $keep)
  Write-Host ''
  Write-Host '  في الداشبورد ← الإعدادات ← طابعة المطبخ:'
  Write-Host '    الوصلة: كبل شبكة (LAN)'
  Write-Host ('    IP: {0}   المنفذ: 9100' -f (($hits[0] -split ':')[0]))
} else {
  Write-Host '  ✖ لم يُعثر على أي طابعة تستجيب على منفذ 9100.' -ForegroundColor Red
  Write-Host ''
  Write-Host '    عنوان الطابعة ليس من العناوين الشائعة. اطبع صفحة إعداداتها:'
  Write-Host '    أطفئ الطابعة ← امسك زر FEED ← شغّلها وأنت ماسك الزر.'
  Write-Host '    ستخرج ورقة فيها عنوان IP — أرسله ليُضاف هنا.'
}

Pause-Here
