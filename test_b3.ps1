$ErrorActionPreference = 'Stop'
$cookieFile = "c:\todo-docker\test_cookies.txt"
$loginJson = "c:\todo-docker\test_login.json"
$activateJson = "c:\todo-docker\test_activate.json"

# Write JSON bodies to files to avoid quoting issues
'{"email":"test@test.com","password":"12341234"}' | Set-Content $loginJson -Encoding UTF8
'{"version":"v2026-02-17"}' | Set-Content $activateJson -Encoding UTF8

# Step 1: Login - save cookies
Write-Host "=== Step 1: Login ==="
$loginResult = curl.exe -s -c $cookieFile -X POST http://localhost:3000/auth/login `
    -H "Content-Type: application/json" `
    --data-binary "@$loginJson"
Write-Host "Login response: $loginResult"

# Step 2: Read CSRF token from cookie file
Write-Host "`n=== Step 2: Extract CSRF token ==="
$cookieContent = Get-Content $cookieFile -Raw
Write-Host "Cookie file:"
Write-Host $cookieContent
$csrf = [regex]::Match($cookieContent, 'todo_csrf\s+(\S+)').Groups[1].Value
Write-Host "CSRF token: $csrf"

if (-not $csrf) {
    Write-Host "ERROR: Could not find todo_csrf in cookie file"
    exit 1
}

# Step 3: Activate model
Write-Host "`n=== Step 3: Activate model v2026-02-17 ==="
$activateResult = curl.exe -s -b $cookieFile -X POST http://localhost:3000/admin/ml/models/activate `
    -H "Content-Type: application/json" `
    -H "x-csrf-token: $csrf" `
    --data-binary "@$activateJson"
Write-Host "Activate response: $activateResult"

# Cleanup
Remove-Item $cookieFile, $loginJson, $activateJson -ErrorAction SilentlyContinue
