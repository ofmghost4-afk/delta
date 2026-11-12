#!/bin/bash
# =====================================================================
#  Delta · abrir 3 perfis do Chrome lado a lado (macOS)
#  - Abre 3 perfis do Chrome (1 conta da Privacy por perfil) em
#    https://privacy.com.br/chat e divide a tela principal em 3 terços.
#  - NÃO muda user-agent, NÃO usa flags de depuração/segurança, NÃO
#    carrega extensão por linha de comando. Cada perfil faz login normal.
#  - Só reposiciona as janelas NOVAS que este script abriu. Não recarrega,
#    não navega e não mexe em nenhuma aba/janela que já estava aberta
#    (ex.: a aba "seed" do leitor Delta existente fica intocada).
#  Uso: dois cliques no arquivo (ou: ./abrir_3_perfis.command)
#  1ª vez no Mac: Ajustes > Privacidade e Segurança > Acessibilidade /
#  Automação: permitir o Terminal controlar o "Google Chrome".
# =====================================================================

# ---- CONFIGURE AQUI ------------------------------------------------
# Nome da pasta do perfil (veja em chrome://version > "Caminho do perfil").
PERFIS=("Profile 1" "Profile 2" "Profile 3")
# Só pra você se achar no Terminal (a conta de verdade é a do login).
CONTAS=("arrudafree" "xlunavitaligratis" "louisefree")
URL="https://privacy.com.br/chat"
# Cada janela ocupa 1/3 da tela. O Delta (acoplado) entra compacto, 300 px,
# por dentro da borda direita da própria janela; não cobre a janela vizinha.
# Se preferir o Delta FORA da janela, use RESERVA_COACH=300 e, no Delta,
# clique "📌 acoplado" para soltar e arraste para a faixa livre (ele lembra).
RESERVA_COACH=0
ESPERA_ENTRE=2   # segundos entre um perfil e outro
# --------------------------------------------------------------------

set -u
APP="Google Chrome"
if [ "$(uname)" != "Darwin" ]; then echo "Este script é para macOS."; exit 1; fi
if [ ! -d "/Applications/$APP.app" ] && [ ! -d "$HOME/Applications/$APP.app" ]; then
  echo "Google Chrome não encontrado em /Applications."; exit 1
fi

ids_janelas() {
  osascript -e 'if application "Google Chrome" is running then
  tell application "Google Chrome" to return id of every window
else
  return ""
end if' 2>/dev/null | tr -d ' '
}

# ids_antes: janelas que já existiam (nunca são tocadas)
ids_antes=",$(ids_janelas),"
novas=()

for i in 0 1 2; do
  p="${PERFIS[$i]}"
  echo "Abrindo perfil \"$p\" (${CONTAS[$i]})..."
  open -na "$APP" --args --profile-directory="$p" --new-window "$URL"
  # espera a janela nova desse perfil aparecer
  for _ in $(seq 1 20); do
    sleep 0.5
    nova=""
    IFS=',' read -ra atuais <<< "$(ids_janelas)"
    for w in "${atuais[@]}"; do
      [ -z "$w" ] && continue
      case "$ids_antes" in *",$w,"*) continue ;; esac
      ja=0; for n in "${novas[@]:-}"; do [ "$n" = "$w" ] && ja=1; done
      [ $ja -eq 0 ] && nova="$w" && break
    done
    [ -n "$nova" ] && break
  done
  if [ -n "$nova" ]; then novas+=("$nova"); else echo "  (não achei a janela nova do perfil \"$p\"; ela não será reposicionada)"; fi
  sleep "$ESPERA_ENTRE"
done

[ ${#novas[@]} -eq 0 ] && { echo "Nenhuma janela nova para organizar."; exit 0; }

# área útil da tela principal (sem a barra de menu)
read -r X0 Y0 X1 Y1 <<< "$(osascript -e 'tell application "Finder" to get bounds of window of desktop' | tr -d ',')"
Y0=$((Y0 + 25))
L=$(( (X1 - X0) / 3 ))

for idx in "${!novas[@]}"; do
  w="${novas[$idx]}"
  esq=$((X0 + idx * L)); dir=$((esq + L - RESERVA_COACH))
  osascript -e "tell application \"Google Chrome\" to set bounds of (first window whose id is $w) to {$esq, $Y0, $dir, $Y1}" >/dev/null
done
echo "Pronto: ${#novas[@]} janela(s) em terços. Faça login de UMA conta por perfil e abra o Delta (ícone da extensão) em cada janela."
echo "Lembrete: 1 leitor (Aura) por conta. Não abra a mesma conta em dois perfis."
