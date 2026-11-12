# =====================================================================
#  Delta - arrumar as janelas da Privacy QUE JA ESTAO ABERTAS
#  - Nao abre nada, nao fecha nada, nao recarrega e nao navega.
#  - So muda o lugar e o tamanho das janelas cujo titulo comeca com "Privacy | Chat".
#  - MODO PALCO (padrao, v2.3): as 3 Privacy ficam EMPILHADAS no mesmo lugar, a esquerda,
#    com a largura da tela menos 700 px (740 px numa tela de 1440) e a altura toda.
#    Nessa largura a Privacy mostra a lista de conversas E a conversa aberta juntas.
#    O Delta de cada modelo encaixa sozinho na coluna de 700 px da direita.
#    Depois de arrumar, esta janela vira o AJUDANTE da troca de modelo (trocar_modelo.ps1):
#    clique no nome da modelo no topo do Delta, ou Alt+1 / Alt+2 / Alt+3.
#  - Modo antigo (Cockpit 3x2): powershell -File arrumar_cockpit.ps1 -Modo 3x2
#    (1/3 da largura cada, no alto, deixando 195 px embaixo para as docas).
#  Uso: dois cliques em arrumar_cockpit.bat
#  (Sem acentos de proposito: o PowerShell do Windows le este arquivo em ANSI.)
# =====================================================================
param([ValidateSet("palco", "3x2")][string]$Modo = "palco", [switch]$SemAjudante)
$LARG_DELTA = 700   # coluna do Delta no Modo Palco (igual a LARG_NORMAL do coach-ext\fundo.js)
$ALT_DOCA = 195     # faixa das docas no Cockpit 3x2 (igual a ALT_MINI do fundo.js)
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Jan2 {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
  public static List<IntPtr> Privacy() {
    var r = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (IsWindowVisible(h) && GetWindow(h, 4) == IntPtr.Zero) {
        var c = new StringBuilder(64); GetClassName(h, c, 64);
        var t = new StringBuilder(256); GetWindowText(h, t, 256);
        // so os Web Apps: janela comum do Chrome com a Privacy numa aba tem " - Google Chrome" no titulo (fica de fora)
        if (c.ToString() == "Chrome_WidgetWin_1" && t.ToString().StartsWith("Privacy | Chat") && !t.ToString().Contains(" - ")) r.Add(h);
      }
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
"@
[void][Jan2]::SetProcessDPIAware()
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$jans = @([Jan2]::Privacy())
if ($jans.Count -eq 0) { Write-Host "Nao achei nenhuma janela 'Privacy | Chat' aberta. Abra os 3 Web Apps e rode de novo."; exit 1 }
# ordem atual da esquerda para a direita
$ord = $jans | ForEach-Object { $r = New-Object Jan2+RECT; [void][Jan2]::GetWindowRect($_, [ref]$r); [pscustomobject]@{ h = $_; x = $r.L } } | Sort-Object x
$n = [Math]::Min(3, $ord.Count)

if ($Modo -eq "palco") {
  $n = $ord.Count   # no palco todas ficam no mesmo lugar: arruma todos os Web Apps da Privacy abertos
  $larg = $area.Width - $LARG_DELTA
  if ($larg -lt 1000) { Write-Host ("Aviso: a tela tem {0} px de largura; sobram {1} px para a Privacy. O Delta so entra no Modo Palco com 1000 px ou mais." -f $area.Width, $larg) }
  for ($i = 0; $i -lt $n; $i++) {
    $h = $ord[$i].h
    [void][Jan2]::ShowWindow($h, 9)   # 9 = restaurar (sai de maximizada/minimizada)
    [void][Jan2]::MoveWindow($h, $area.Left, $area.Top, $larg, $area.Height, $true)
    Start-Sleep -Milliseconds 200
    $r = New-Object Jan2+RECT; [void][Jan2]::GetWindowRect($h, [ref]$r)
    Write-Host ("  janela {0}: x={1} largura={2} altura={3}" -f ($i + 1), $r.L, ($r.R - $r.L), ($r.B - $r.T))
  }
  Write-Host ""
  Write-Host ("Pronto: {0} janela(s) da Privacy no palco ({1} x {2}). O Delta de cada modelo fica nos {3} px da direita." -f $n, $larg, $area.Height, $LARG_DELTA)
  Write-Host "Se algum Delta nao encaixou: clique no icone do Delta naquela janela (ou feche e abra o Delta de novo)."
} else {
  $larg = [int][Math]::Floor($area.Width / 3)
  $alt = $area.Height - $ALT_DOCA
  for ($i = 0; $i -lt $n; $i++) {
    $h = $ord[$i].h
    [void][Jan2]::ShowWindow($h, 9)
    [void][Jan2]::MoveWindow($h, $area.Left + $i * $larg, $area.Top, $larg, $alt, $true)
    Start-Sleep -Milliseconds 200
    $r = New-Object Jan2+RECT; [void][Jan2]::GetWindowRect($h, [ref]$r)
    Write-Host ("  janela {0}: x={1} largura={2} altura={3}" -f ($i + 1), $r.L, ($r.R - $r.L), ($r.B - $r.T))
  }
  Write-Host ""
  Write-Host ("Pronto: {0} janela(s) da Privacy no andar de cima. Em cada Delta, aperte M (ou a setinha) para ele descer para a doca." -f $n)
}

if (-not $SemAjudante) {
  Write-Host ""
  & (Join-Path $PSScriptRoot "trocar_modelo.ps1") -Comecar:($Modo -eq "palco")
}
