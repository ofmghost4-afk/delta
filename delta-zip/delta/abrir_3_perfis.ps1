# =====================================================================
#  Delta - abre os 3 perfis da Privacy (Windows)
#  - Abre 3 perfis do Chrome (1 conta da Privacy por perfil) como janela de
#    aplicativo (--app=https://privacy.com.br/chat, sem barra de endereco).
#  - MODO PALCO (padrao, v2.3): as 3 ficam EMPILHADAS a esquerda, com a largura
#    da tela menos 700 px (740 em 1440) e a altura toda: lista + conversa juntas.
#    O Delta de cada uma ocupa a coluna de 700 px da direita. No fim, esta janela
#    vira o AJUDANTE da troca de modelo (clique no nome no topo do Delta, ou
#    Alt+1 / Alt+2 / Alt+3).
#  - Modo antigo (Cockpit 3x2): -Modo 3x2 (1/3 da largura cada, 195 px livres
#    embaixo para as docas do Delta em modo mini).
#  - NAO muda user-agent, NAO usa flags de depuracao/seguranca, NAO
#    carrega extensao por linha de comando. Cada perfil faz login normal.
#  - So reposiciona as janelas NOVAS que este script abriu. Nao recarrega,
#    nao navega e nao mexe em nenhuma aba/janela que ja estava aberta.
#  Uso: dois cliques em abrir_3_perfis.bat
#  (Sem acentos de proposito: o PowerShell do Windows le este arquivo em ANSI.)
# =====================================================================
param([string]$Url = "https://privacy.com.br/chat", [switch]$Teste, [ValidateSet("palco", "3x2")][string]$Modo = "palco")

# ---- CONFIGURE AQUI ------------------------------------------------
# Pasta do perfil (veja em chrome://version > "Caminho do perfil").
# Ordem = esquerda, meio, direita.
# Visto em 11/11/2026: Arruda = Profile 30, Luna = Profile 31, Louise = Profile 34.
$PERFIS  = @("Profile 30", "Profile 31", "Profile 34")
# So para voce se achar. A conta de verdade e a do login na Privacy de cada perfil.
$ROTULOS = @("Arruda", "Luna", "Louise")
$ESPERA_MAX = 25   # segundos esperando cada janela aparecer
$ALT_DOCA = 195     # faixa livre embaixo para as 3 Docas do Delta (igual ao ALT_MINI do fundo.js)
$LARG_DELTA = 700   # coluna do Delta no Modo Palco (igual ao LARG_NORMAL do fundo.js)
# --------------------------------------------------------------------

$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Host "Google Chrome nao encontrado."; exit 1 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Jan {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
  // Janelas principais visiveis de apps Chromium (o filtro pelo chrome.exe certo e feito no PowerShell).
  public static List<IntPtr> Lista() {
    var r = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (IsWindowVisible(h) && GetWindowTextLength(h) > 0 && GetWindow(h, 4) == IntPtr.Zero) {
        var s = new StringBuilder(64); GetClassName(h, s, 64);
        if (s.ToString() == "Chrome_WidgetWin_1") r.Add(h);
      }
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
"@
[void][Jan]::SetProcessDPIAware()

function JanelasChrome {
  $r = @()
  foreach ($h in [Jan]::Lista()) {
    try { $p = Get-Process -Id ([Jan]::Pid($h)) -ErrorAction Stop; if ($p.Path -eq $chrome) { $r += $h } } catch {}
  }
  return $r
}

$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$antes = @(JanelasChrome)
$minhas = @()
Write-Host ("Tela util: {0}x{1}. Janelas do Chrome ja abertas (nao serao mexidas): {2}" -f $area.Width, $area.Height, $antes.Count)

for ($i = 0; $i -lt $PERFIS.Count; $i++) {
  $perfil = $PERFIS[$i]
  Write-Host ("Abrindo {0} ({1})..." -f $perfil, $ROTULOS[$i])
  Start-Process -FilePath $chrome -ArgumentList ('--profile-directory="{0}"' -f $perfil), ("--app={0}" -f $Url)
  $nova = $null; $fim = (Get-Date).AddSeconds($ESPERA_MAX)
  while (-not $nova -and (Get-Date) -lt $fim) {
    Start-Sleep -Milliseconds 300
    $nova = @(JanelasChrome) | Where-Object { $antes -notcontains $_ -and $minhas -notcontains $_ } | Select-Object -First 1
  }
  if (-not $nova) { Write-Host "  janela nao apareceu a tempo; pulei este perfil."; $minhas += [IntPtr]::Zero; continue }
  $minhas += $nova
  Start-Sleep -Milliseconds 600
}

# Palco: as 3 empilhadas a esquerda, (largura util - 700) x altura util.
# 3x2: andar de cima, 3 janelas de 1/3 da largura e (altura util - 195). Janela de aplicativo aceita 480 px;
# se alguma nao aceitar, as 3 ficam um pouco sobrepostas, mas todas inteiras dentro da tela.
$n = $PERFIS.Count
$palco = $Modo -eq "palco"
$larg = if ($palco) { $area.Width - $LARG_DELTA } else { [int][Math]::Floor($area.Width / $n) }
$alt = if ($palco) { $area.Height } else { $area.Height - $ALT_DOCA }
for ($i = 0; $i -lt $n; $i++) {
  $h = $minhas[$i]; if ($h -eq [IntPtr]::Zero) { continue }
  [void][Jan]::ShowWindow($h, 9)   # 9 = restaurar (sai de maximizada/minimizada)
  if ($palco) {
    [void][Jan]::MoveWindow($h, $area.Left, $area.Top, $larg, $alt, $true)
    $r = New-Object Jan+RECT; [void][Jan]::GetWindowRect($h, [ref]$r)
    Write-Host ("  {0} ({1}): x={2} largura={3} altura={4}" -f $PERFIS[$i], $ROTULOS[$i], $r.L, ($r.R - $r.L), ($r.B - $r.T))
    continue
  }
  [void][Jan]::MoveWindow($h, $area.Left + $i * $larg, $area.Top, $larg, $alt, $true)
  Start-Sleep -Milliseconds 200
  $r = New-Object Jan+RECT; [void][Jan]::GetWindowRect($h, [ref]$r)
  $real = $r.R - $r.L
  if ($real -gt $larg) {
    $x = $area.Left + [int][Math]::Round($i * ($area.Width - $real) / [Math]::Max(1, $n - 1))
    [void][Jan]::MoveWindow($h, $x, $area.Top, $real, $alt, $true)
    [void][Jan]::GetWindowRect($h, [ref]$r)
  }
  Write-Host ("  {0} ({1}): x={2} largura={3} altura={4}" -f $PERFIS[$i], $ROTULOS[$i], $r.L, ($r.R - $r.L), ($r.B - $r.T))
}

if ($Teste) {
  Start-Sleep -Seconds 2
  foreach ($h in $minhas) { if ($h -ne [IntPtr]::Zero) { [void][Jan]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) } }
  Write-Host "Teste: fechei as janelas que eu mesmo abri."
} elseif ($palco) {
  Write-Host ""
  Write-Host "Pronto. Em cada janela: entre na conta da Privacy daquele perfil e abra o Delta (icone de quebra-cabeca > Delta)."
  Write-Host "Ele encaixa sozinho na coluna da direita. Para trocar de modelo: clique no nome dela no topo do Delta, ou Alt+1/2/3."
  Write-Host ""
  & (Join-Path $PSScriptRoot "trocar_modelo.ps1")
} else {
  Write-Host ""
  Write-Host "Pronto. Em cada janela: entre na conta da Privacy daquele perfil, abra o Delta (icone de quebra-cabeca > Delta)"
  Write-Host "e clique na setinha do topo do Delta (ou tecla m): ele encaixa na faixa livre embaixo da janela."
}
