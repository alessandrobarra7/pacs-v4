Unicode true
Name "Assistente RadiAnt do Portal"
OutFile "PacsRadiantAssistantSetup.exe"
InstallDir "$LOCALAPPDATA\PacsRadiantAssistant"
RequestExecutionLevel user
ShowInstDetails show

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Instalar"
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM PacsRadiantAssistant.exe'
  Sleep 500
  SetOutPath "$INSTDIR"
  File "build\PacsRadiantAssistant.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Classes\pacs-radiant" "" "URL:Assistente RadiAnt do Portal"
  WriteRegStr HKCU "Software\Classes\pacs-radiant" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\pacs-radiant\shell\open\command" "" '"$INSTDIR\PacsRadiantAssistant.exe" "%1"'
  MessageBox MB_OK "Ativação concluída. Volte ao Portal e clique em RadiAnt para abrir estudos autorizados. As configurações existentes do RadiAnt não foram alteradas."
SectionEnd

Section "Uninstall"
  DeleteRegKey HKCU "Software\Classes\pacs-radiant"
  Delete "$INSTDIR\PacsRadiantAssistant.exe"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
