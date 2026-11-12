@echo off
rem Delta - arruma as 3 janelas da Privacy ja abertas no Modo Palco (empilhadas a esquerda, Delta nos 410 px da direita)
rem e fica aberto como ajudante da troca de modelo (clique no nome no topo do Delta, ou Alt+1/2/3). Feche para parar.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0arrumar_cockpit.ps1"
echo.
pause
