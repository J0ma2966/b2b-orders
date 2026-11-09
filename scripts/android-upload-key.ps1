# Ключ загрузки (upload key) для Google Play — создаётся один раз на компьютере владельца.
# Запуск в PowerShell из папки проекта:
#   powershell -ExecutionPolicy Bypass -File scripts\android-upload-key.ps1
# Что делает: создаёт upload.jks в папке b2b-orders-upload-key в профиле пользователя (не в проекте),
# копирует файл в base64 в буфер обмена для секрета GitHub ANDROID_UPLOAD_KEYSTORE.
# Пароль вводится скрыто и никуда не записывается. Пошагово: docs/google-play.md.
$ErrorActionPreference = "Stop"

$dir = Join-Path $env:USERPROFILE "b2b-orders-upload-key"
$jks = Join-Path $dir "upload.jks"
if (Test-Path $jks) {
  Write-Host "Ключ уже есть: $jks" -ForegroundColor Yellow
  Write-Host "Новый не создаю: приложение в Play обновляется только тем ключом, которым загружено."
  $again = Read-Host "Скопировать существующий ключ в буфер обмена (base64) ещё раз? [y/N]"
  if ($again -match '^[yYдД]') {
    Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes($jks)))
    Write-Host "Скопировано. Вставьте в секрет ANDROID_UPLOAD_KEYSTORE." -ForegroundColor Green
  }
  exit 0
}

# keytool входит в любую Java (JDK); Android Studio приносит свою
$keytool = (Get-Command keytool -ErrorAction SilentlyContinue).Source
if (-not $keytool) {
  $candidates = @()
  if ($env:JAVA_HOME) { $candidates += Join-Path $env:JAVA_HOME "bin\keytool.exe" }
  $candidates += "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe"
  $candidates += "$env:LOCALAPPDATA\Programs\Android Studio\jbr\bin\keytool.exe"
  foreach ($root in @("$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java", "$env:ProgramFiles\Microsoft")) {
    if (Test-Path $root) { $candidates += Get-ChildItem $root -Recurse -Filter keytool.exe -ErrorAction SilentlyContinue | ForEach-Object FullName }
  }
  $keytool = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $keytool) {
  Write-Host "Не найден keytool (часть Java). Установите Java и запустите скрипт снова в НОВОМ окне PowerShell:" -ForegroundColor Red
  Write-Host "  winget install EclipseAdoptium.Temurin.21.JDK"
  exit 1
}
Write-Host "keytool: $keytool"

Write-Host ""
Write-Host "Придумайте пароль ключа (от 12 символов). Сохраните его в менеджере паролей:" -ForegroundColor Cyan
Write-Host "без пароля и файла ключа обновления приложения в Play придётся восстанавливать через поддержку Google."
$p1 = Read-Host "Пароль" -AsSecureString
$p2 = Read-Host "Пароль ещё раз" -AsSecureString
$plain1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
$plain2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
if ($plain1 -ne $plain2) { Write-Host "Пароли не совпадают" -ForegroundColor Red; exit 1 }
if ($plain1.Length -lt 12) { Write-Host "Пароль короче 12 символов" -ForegroundColor Red; exit 1 }
$org = Read-Host "Название владельца для сертификата (латиницей, например OOO Optom Savdo)"
if (-not $org) { $org = "B2B Orders" }
$org = $org -replace '[,=+<>#;"\\]', ' '

New-Item -ItemType Directory -Force -Path $dir | Out-Null
# Пароль передаётся через переменную окружения этого процесса, а не в командной строке
$env:B2B_UPLOAD_KEY_PASSWORD = $plain1
try {
  & $keytool -genkeypair -keystore $jks -storetype PKCS12 -alias upload -keyalg RSA -keysize 4096 -validity 10000 `
    -dname "CN=$org, C=UZ" -storepass:env B2B_UPLOAD_KEY_PASSWORD -keypass:env B2B_UPLOAD_KEY_PASSWORD
  if ($LASTEXITCODE -ne 0) { throw "keytool завершился с ошибкой" }
  Write-Host ""
  & $keytool -list -v -keystore $jks -alias upload -storepass:env B2B_UPLOAD_KEY_PASSWORD | Select-String "SHA256:"
} finally {
  Remove-Item Env:B2B_UPLOAD_KEY_PASSWORD -ErrorAction SilentlyContinue
  $plain1 = $null; $plain2 = $null
}

Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes($jks)))
Write-Host ""
Write-Host "Готово: $jks" -ForegroundColor Green
Write-Host "1) Файл ключа (base64) уже в буфере обмена. GitHub → репозиторий → Settings → Secrets and variables → Actions →"
Write-Host "   New repository secret: имя ANDROID_UPLOAD_KEYSTORE, значение — вставить (Ctrl+V)."
Write-Host "2) Ещё один секрет: ANDROID_UPLOAD_KEYSTORE_PASSWORD — пароль, который вы ввели."
Write-Host "3) Сохраните копию папки $dir на флешку или в надёжное облако. Никому не пересылайте."
