Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowOrder {
    [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr handle, uint command);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr handle, int index);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$windows = @()
$handle = [WindowOrder]::GetTopWindow([IntPtr]::Zero)
for ($i = 0; $i -lt 5000 -and $handle -ne [IntPtr]::Zero; $i++) {
    if ([WindowOrder]::IsWindowVisible($handle)) {
        $windows += @{
            handle = $handle.ToInt64()
            topmost = ([WindowOrder]::GetWindowLong($handle, -20) -band 8) -ne 0
        }
    }
    $handle = [WindowOrder]::GetWindow($handle, 2)
}
@{foreground = [WindowOrder]::GetForegroundWindow().ToInt64(); windows = $windows} | ConvertTo-Json -Depth 4 -Compress
