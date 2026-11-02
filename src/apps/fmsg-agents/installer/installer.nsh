!include "FileFunc.nsh"
!include "LogicLib.nsh"

!macro customHeader
  !ifdef MUI_BGCOLOR
    !undef MUI_BGCOLOR
  !endif
  !define MUI_BGCOLOR "0B0B14"
  !ifdef MUI_TEXTCOLOR
    !undef MUI_TEXTCOLOR
  !endif
  !define MUI_TEXTCOLOR "F5F6FA"
!macroend

!macro customInstallMode
  # Always install per-user into %LOCALAPPDATA%\Programs\fmsg-agents (no admin prompt)
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInit
  Var /GLOBAL cmdParams
  Var /GLOBAL isOtaUpdate
  Var /GLOBAL browserFound
  Var /GLOBAL optVal

  ${GetParameters} $cmdParams
  StrCpy $isOtaUpdate "0"

  ClearErrors
  ${GetOptions} $cmdParams "/UPDATE" $optVal
  ${IfNot} ${Errors}
    StrCpy $isOtaUpdate "1"
    SetSilent silent
  ${EndIf}
  ClearErrors

  # Verify Chrome or Edge Chromium availability for visible browser automation
  StrCpy $browserFound "0"
  ${If} ${FileExists} "C:\Program Files\Google\Chrome\Application\chrome.exe"
    StrCpy $browserFound "1"
  ${EndIf}
  ${If} ${FileExists} "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    StrCpy $browserFound "1"
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    StrCpy $browserFound "1"
  ${EndIf}
  ${If} ${FileExists} "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    StrCpy $browserFound "1"
  ${EndIf}
  ${If} ${FileExists} "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    StrCpy $browserFound "1"
  ${EndIf}

  ${IfNot} ${Silent}
    ${If} $browserFound == "0"
      MessageBox MB_OK|MB_ICONINFORMATION "Google Chrome was not detected on this computer.$\r$\n$\r$\nFMSG Agents uses Google Chrome for visible job application automation. Installation will continue, and you can install Google Chrome at any time before starting an application run."
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  # Preserve existing local data in %LOCALAPPDATA%\fmsg-agents across upgrades and reinstalls
  CreateDirectory "$LOCALAPPDATA\fmsg-agents"
  CreateDirectory "$LOCALAPPDATA\fmsg-agents\device"
  CreateDirectory "$LOCALAPPDATA\fmsg-agents\secure"
  CreateDirectory "$LOCALAPPDATA\fmsg-agents\updates"

  # If invoked in OTA /UPDATE mode, relaunch the updated application automatically
  ${If} $isOtaUpdate == "1"
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    Var /GLOBAL unParams
    Var /GLOBAL unOptVal
    ${GetParameters} $unParams

    ClearErrors
    ${GetOptions} $unParams "/CLEAR_DATA" $unOptVal
    ${IfNot} ${Errors}
      RMDir /r "$LOCALAPPDATA\fmsg-agents"
    ${Else}
      ${IfNot} ${Silent}
        MessageBox MB_YESNO|MB_ICONQUESTION "Would you also like to remove your local FMSG Agents data (saved credentials, settings, logs, and installation security key)?$\r$\n$\r$\nSelect Yes to permanently remove all local data, or No to keep your data for future installations." IDYES removeLocalData IDNO keepLocalData
        removeLocalData:
          RMDir /r "$LOCALAPPDATA\fmsg-agents"
        keepLocalData:
      ${EndIf}
    ${EndIf}
    ClearErrors
  ${EndIf}
!macroend
