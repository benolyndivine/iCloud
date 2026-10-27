Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strCurDir = fso.GetParentFolderName(WScript.ScriptFullName)
strProjectDir = fso.GetParentFolderName(strCurDir)
WshShell.CurrentDirectory = strProjectDir
WshShell.Run "node server/index.js", 0, False
Set WshShell = Nothing
