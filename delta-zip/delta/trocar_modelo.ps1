# =====================================================================
#  Delta - ajudante do MODO PALCO: troca de modelo com 1 clique (Windows)
#  - Fica aberto (janela preta; pode minimizar). Ele so OLHA as janelas e traz
#    para a frente o par certo: a Privacy | Chat + o Delta da modelo pedida.
#  - Como pedir a troca:
#      * clicar no nome da modelo (Arruda / Luna / Louise) no topo do Delta; ou
#      * Alt+1, Alt+2, Alt+3 (em qualquer programa).
#  - Como ele sabe qual janela e de qual modelo: o Delta escreve no proprio titulo
#    "Delta - <modelo>" e, ao pedir a troca, "Delta - Arruda >> Luna #123"
#    (com ponto e setas de verdade). A Privacy daquela modelo e a janela do MESMO
#    perfil do Chrome (o Windows guarda o perfil em cada janela).
#  - NAO clica, NAO digita, NAO aperta tecla, NAO envia nada, NAO recarrega e NAO
#    navega. Nao move nem redimensiona janela (isso e o arrumar_cockpit). So muda
#    qual janela fica na frente e qual recebe o foco.
#  - A ordem do Alt+1/2/3 e os nomes vem de coach-ext\data\coach_regras.json
#    (palco.teclas e config_por_conta.<conta>.rotulo).
#  Uso: ja roda sozinho no fim do arrumar_cockpit.bat e do abrir_3_perfis.bat.
#       Para so conferir o que ele enxerga: powershell -File trocar_modelo.ps1 -Listar
#  Para parar: feche a janela preta.
#  (Sem acentos de proposito: o PowerShell do Windows le este arquivo em ANSI.)
# =====================================================================
param([switch]$Listar, [switch]$Comecar)

$regras = Join-Path $PSScriptRoot "coach-ext\data\coach_regras.json"
if (-not (Test-Path -LiteralPath $regras)) { Write-Host "Nao achei $regras"; exit 1 }
$R = Get-Content -LiteralPath $regras -Raw -Encoding UTF8 | ConvertFrom-Json
$teclas = @($R.palco.teclas); if ($teclas.Count -eq 0) { $teclas = @($R.contas_atendidas) }
$rotulos = [string[]]@($teclas | ForEach-Object { $c = $R.config_por_conta.$_; if ($c -and $c.rotulo) { [string]$c.rotulo } else { [string]$_ } })

$codigo = @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;

public static class DeltaPalco {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr depois, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool ligar);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h, uint de, uint ate, uint remover);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }

  // Perfil de cada janela: o Chrome grava no Windows um "AppUserModelID" por perfil
  // (ex.: Chrome._crx_<app>.UserData.Profile31). A Privacy e o Delta do mesmo perfil terminam igual.
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore ps);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);
  [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PROPERTYKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Explicit)] public struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr p2; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    [PreserveSig] int GetCount(out uint c);
    [PreserveSig] int GetAt(uint i, out PROPERTYKEY k);
    [PreserveSig] int GetValue(ref PROPERTYKEY k, out PROPVARIANT v);
    [PreserveSig] int SetValue(ref PROPERTYKEY k, ref PROPVARIANT v);
    [PreserveSig] int Commit();
  }
  static string Aumid(IntPtr h) {
    try {
      Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"); IPropertyStore ps;
      if (SHGetPropertyStoreForWindow(h, ref iid, out ps) != 0 || ps == null) return null;
      PROPERTYKEY k = new PROPERTYKEY(); k.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); k.pid = 5;
      PROPVARIANT v; if (ps.GetValue(ref k, out v) != 0) return null;
      string s = v.vt == 31 ? Marshal.PtrToStringUni(v.p) : null;
      PropVariantClear(ref v); Marshal.ReleaseComObject(ps);
      return s;
    } catch { return null; }
  }

  public class Jan { public IntPtr H; public string Tipo; public string Chave; public string Rotulo; public string Para; public string N; public string Titulo; public bool App; }
  static readonly Dictionary<IntPtr, string> cache = new Dictionary<IntPtr, string>();
  // "Delta <ponto> Arruda" ou "Delta <ponto> Arruda <seta dupla> Luna #123" (ponto = 0xB7, seta dupla = 0xBB)
  static readonly string PONTO = ((char)0xB7).ToString(), SETA = ((char)0xBB).ToString();
  static readonly Regex reDelta = new Regex("^Delta " + PONTO + " ([^" + SETA + "#]+?)(?: " + SETA + " (.+?) #(\\d+))?(?: - .*)?$");
  static string Chave(IntPtr h) {
    string c; if (cache.TryGetValue(h, out c)) return c;
    uint pid; GetWindowThreadProcessId(h, out pid);
    string a = Aumid(h); int i = a == null ? -1 : a.IndexOf("UserData", StringComparison.OrdinalIgnoreCase);
    c = (i >= 0 ? a.Substring(i) : "?") + "|pid" + pid; // perfil + processo (Chrome comum: mesmo processo; AdsPower: um processo por perfil)
    cache[h] = c; return c;
  }
  public static List<Jan> Janelas() {
    var r = new List<Jan>(); var vivos = new HashSet<IntPtr>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
      var c = new StringBuilder(64); GetClassName(h, c, 64); if (c.ToString() != "Chrome_WidgetWin_1") return true;
      var t = new StringBuilder(300); GetWindowText(h, t, 300); string s = t.ToString();
      Jan j = null;
      if (s.StartsWith("Privacy")) { j = new Jan(); j.Tipo = "privacy"; }
      else {
        Match m = reDelta.Match(s);
        if (m.Success) { j = new Jan(); j.Tipo = "delta"; j.Rotulo = m.Groups[1].Value.Trim(); if (m.Groups[2].Success) { j.Para = m.Groups[2].Value.Trim(); j.N = m.Groups[3].Value; } }
      }
      // Web App da Privacy = titulo sem " - Google Chrome" (janela comum do Chrome com a Privacy numa aba tem)
      if (j != null) { j.H = h; j.Titulo = s; j.App = !s.Contains(" - "); j.Chave = Chave(h); vivos.Add(h); r.Add(j); }
      return true;
    }, IntPtr.Zero);
    var velhos = new List<IntPtr>(); foreach (var k in cache.Keys) if (!vivos.Contains(k)) velhos.Add(k);
    foreach (var k in velhos) cache.Remove(k);
    return r;
  }

  static readonly IntPtr TOPMOST = new IntPtr(-1), NOTOPMOST = new IntPtr(-2);
  // Poe a janela na frente das outras SEM tirar o foco de ninguem (nao move e nao muda o tamanho).
  static void Subir(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 4); // 4 = mostrar sem ativar (volta de minimizada)
    SetWindowPos(h, TOPMOST, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
    SetWindowPos(h, NOTOPMOST, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
  }
  // Da o foco a janela (o Windows so deixa trocar o foco "emprestando" a fila de entrada da janela da frente).
  static void Focar(IntPtr h) {
    uint pid; IntPtr fg = GetForegroundWindow(); uint eu = GetCurrentThreadId();
    uint tFg = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, out pid), tAlvo = GetWindowThreadProcessId(h, out pid);
    bool a1 = tFg != 0 && tFg != eu && AttachThreadInput(eu, tFg, true);
    bool a2 = tAlvo != eu && tAlvo != tFg && AttachThreadInput(eu, tAlvo, true);
    BringWindowToTop(h); SetForegroundWindow(h);
    if (a2) AttachThreadInput(eu, tAlvo, false);
    if (a1) AttachThreadInput(eu, tFg, false);
  }
  static string ativo = "";
  static Jan Par(List<Jan> js, Jan j) {
    Jan reserva = null;
    foreach (var x in js) if (x.Tipo != j.Tipo && x.Chave == j.Chave && (x.Tipo == "privacy" || x.Rotulo != null)) {
      if (x.Tipo == "delta" || x.App) return x; // a Privacy em Web App ganha da janela comum do Chrome
      if (reserva == null) reserva = x;
    }
    return reserva;
  }
  public static string Trocar(string rot, bool focar) {
    if (string.IsNullOrEmpty(rot)) return null;
    var js = Janelas(); Jan d = null;
    foreach (var x in js) if (x.Tipo == "delta" && string.Equals(x.Rotulo, rot, StringComparison.OrdinalIgnoreCase)) { d = x; break; }
    if (d == null) return "Nao achei o Delta da " + rot + " (abra o Delta nesse perfil e entre no login).";
    Jan p = Par(js, d);
    if (p != null) Subir(p.H);
    Subir(d.H);
    if (focar) Focar(p != null ? p.H : d.H);
    ativo = rot;
    return "-> " + rot + (p == null ? "   (so o Delta: nao achei a janela da Privacy desse perfil)" : "");
  }
  // Voce clicou numa janela do Delta ou da Privacy de uma modelo: o par dela vem junto para a frente.
  static void Sincronizar(IntPtr fg, List<Jan> js) {
    Jan j = null; foreach (var x in js) if (x.H == fg) { j = x; break; }
    if (j == null) return;
    Jan par = Par(js, j); if (par == null) return;
    Subir(par.H);
    string rot = j.Tipo == "delta" ? j.Rotulo : par.Rotulo;
    if (rot != null && rot != ativo) { ativo = rot; Log("-> " + rot + " (voce clicou numa janela dela)"); }
  }
  static void Log(string s) { if (s != null) Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + s); }

  public static string Listar() {
    var sb = new StringBuilder(); var js = Janelas();
    foreach (var j in js) if (j.Tipo == "delta") {
      Jan p = Par(js, j);
      sb.AppendLine("  Delta da " + (j.Rotulo ?? "?") + (j.Para != null ? " (pedindo " + j.Para + ")" : "") + "  ->  " + (p != null ? "Privacy achada" : "SEM Privacy do mesmo perfil") + "   [" + j.Chave + "]");
    }
    int n = 0; foreach (var j in js) if (j.Tipo == "privacy") n++;
    sb.AppendLine("  Janelas da Privacy abertas: " + n);
    var sem = 0; foreach (var j in js) if (j.Tipo == "privacy" && Par(js, j) == null) sem++;
    if (sem > 0) sb.AppendLine("  " + sem + " janela(s) da Privacy sem Delta com nome (abra o Delta nelas; o Delta antigo, sem a versao 2.3, aparece so como \"Delta\").");
    return sb.ToString();
  }

  public static void Rodar(string[] rotulos, bool comecar) {
    for (int i = 0; i < rotulos.Length && i < 9; i++) {
      bool ok = RegisterHotKey(IntPtr.Zero, i + 1, 0x0001 | 0x4000, (uint)(0x31 + i)); // Alt + numero, sem repetir
      Console.WriteLine("  Alt+" + (i + 1) + " = " + rotulos[i] + (ok ? "" : "   (NAO consegui reservar esta tecla: outro programa ja usa. O clique no nome continua funcionando.)"));
    }
    Console.WriteLine("");
    if (comecar && rotulos.Length > 0) Log(Trocar(rotulos[0], true));
    var visto = new Dictionary<string, string>(); IntPtr ultimoFg = IntPtr.Zero;
    try {
      while (true) {
        MSG m;
        while (PeekMessage(out m, IntPtr.Zero, 0, 0, 1)) {
          if (m.message == 0x0312) { int id = m.wParam.ToInt32(); if (id >= 1 && id <= rotulos.Length) Log(Trocar(rotulos[id - 1], true)); }
        }
        var js = Janelas();
        foreach (var d in js) {
          if (d.Tipo != "delta" || d.N == null) continue;
          string antes; visto.TryGetValue(d.Rotulo, out antes);
          if (antes == d.N) continue;
          visto[d.Rotulo] = d.N;
          Log(Trocar(d.Para, true));
          js = Janelas();
        }
        IntPtr fg = GetForegroundWindow();
        if (fg != ultimoFg) { ultimoFg = fg; Sincronizar(fg, js); }
        Thread.Sleep(120);
      }
    } finally {
      for (int i = 0; i < rotulos.Length && i < 9; i++) UnregisterHotKey(IntPtr.Zero, i + 1);
    }
  }
  public static void Preparar() { SetProcessDPIAware(); }
}
'@
Add-Type -TypeDefinition $codigo
[DeltaPalco]::Preparar()

if ($Listar) {
  Write-Host "O que o ajudante enxerga agora:"
  Write-Host ([DeltaPalco]::Listar())
  exit 0
}
# Rodou o .bat de novo com o ajudante antigo ainda aberto: fecha o antigo (so ele) para liberar o Alt+1/2/3.
Get-CimInstance Win32_Process -Filter "name='powershell.exe'" | Where-Object {
  $_.ProcessId -ne $PID -and $_.CommandLine -match 'trocar_modelo\.ps1|arrumar_cockpit\.ps1' -and $_.CommandLine -notmatch '-Listar'
} | ForEach-Object { Write-Host ("Fechei o ajudante antigo (processo {0})." -f $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "Delta - ajudante do Modo Palco. Deixe esta janela aberta (pode minimizar). Para parar, feche-a."
Write-Host "Troca de modelo: clique no nome dela no topo do Delta, ou:"
[DeltaPalco]::Rodar($rotulos, [bool]$Comecar)
