import { runPowerShell, type Brief } from "@twotoe/core";

// SPEC 2.3 story 8 (SHOULD): a Windows toast with the two lines. Uses the
// WinRT toast API through PowerShell (no extra binaries). The text travels in
// env vars, never inside the script. Off unless config.notify.toast is true.

const TOAST_SCRIPT = [
  "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
  "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
  "$n = $t.GetElementsByTagName('text')",
  "$n.Item(0).AppendChild($t.CreateTextNode($env:TWOTOE_T1)) > $null",
  "$n.Item(1).AppendChild($t.CreateTextNode($env:TWOTOE_T2)) > $null",
  "$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
  "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($t))",
].join("\n");

export function toastScript(): string {
  return TOAST_SCRIPT;
}

export async function notifyToast(brief: Brief): Promise<boolean> {
  if (process.platform !== "win32") return false;
  const r = await runPowerShell(TOAST_SCRIPT, { TWOTOE_T1: brief.line1, TWOTOE_T2: brief.line2 });
  return r.ok;
}
