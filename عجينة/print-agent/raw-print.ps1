<#
    Send a file to a Windows printer queue untouched.

    A USB receipt printer has no IP to open a socket to — it is reached
    through the Windows spooler. Every normal path through the spooler runs
    the bytes past a driver that renders them as a page, which turns an
    ESC/POS stream into a page of mojibake. The RAW data type is the one way
    to say "hand these bytes to the device and keep your hands off them",
    and it is only reachable through the spooler API, not through any cmdlet.

    raw-print.ps1 -PrinterName "XP-80C" -FilePath "C:\...\receipt.bin"
#>
param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'

# Without this, anything written back is encoded in the console code page and
# every Arabic letter in an error reaches the agent as a question mark.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path -LiteralPath $FilePath)) { throw "ملف الطباعة غير موجود: $FilePath" }

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class AjinehRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void Send(string printer, byte[] bytes)
    {
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero))
            throw new Exception("تعذّر فتح الطابعة (" + Marshal.GetLastWin32Error() + ") — تأكد من الاسم");
        try
        {
            DOCINFO di = new DOCINFO();
            di.pDocName = "Ajineh Receipt";
            di.pDataType = "RAW";
            if (!StartDocPrinter(h, 1, di))
                throw new Exception("تعذّر بدء مهمة الطباعة (" + Marshal.GetLastWin32Error() + ")");
            try
            {
                if (!StartPagePrinter(h))
                    throw new Exception("تعذّر بدء الصفحة (" + Marshal.GetLastWin32Error() + ")");
                IntPtr buffer = Marshal.AllocCoTaskMem(bytes.Length);
                try
                {
                    Marshal.Copy(bytes, 0, buffer, bytes.Length);
                    int written;
                    if (!WritePrinter(h, buffer, bytes.Length, out written))
                        throw new Exception("تعذّر إرسال البيانات (" + Marshal.GetLastWin32Error() + ")");
                    if (written != bytes.Length)
                        throw new Exception("أُرسل جزء من البيانات فقط: " + written + "/" + bytes.Length);
                }
                finally { Marshal.FreeCoTaskMem(buffer); }
                EndPagePrinter(h);
            }
            finally { EndDocPrinter(h); }
        }
        finally { ClosePrinter(h); }
    }
}
"@

# PowerShell's own error rendering wraps the message across lines and buries
# it under the call that raised it, which reaches the cashier as a scrambled
# half-sentence. Emit one clean line instead and let the exit code carry the
# failure.
try {
  [AjinehRawPrinter]::Send($PrinterName, [System.IO.File]::ReadAllBytes($FilePath))
  Write-Output "OK"
  # Explicit, because a script that just runs off its end leaves
  # $LASTEXITCODE holding whatever the previous command set — which reads as
  # a failure to any caller that checks, however well the print went.
  exit 0
} catch {
  $message = $_.Exception.Message
  if ($_.Exception.InnerException) { $message = $_.Exception.InnerException.Message }
  $message = ($message -replace '\s+', ' ').Trim()
  Write-Output "ERROR: $message"
  exit 1
}
