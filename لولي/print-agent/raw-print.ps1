param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path -LiteralPath $FilePath)) { throw "ملف الطباعة غير موجود: $FilePath" }

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class LulizRawPrinter
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
            throw new Exception("تعذّر فتح الطابعة (" + Marshal.GetLastWin32Error() + ")");
        try
        {
            DOCINFO di = new DOCINFO();
            di.pDocName = "Luliz Receipt";
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

try {
  [LulizRawPrinter]::Send($PrinterName, [System.IO.File]::ReadAllBytes($FilePath))
  Write-Output "OK"
  exit 0
} catch {
  $message = $_.Exception.Message
  if ($_.Exception.InnerException) { $message = $_.Exception.InnerException.Message }
  $message = ($message -replace '\s+', ' ').Trim()
  Write-Output "ERROR: $message"
  exit 1
}
