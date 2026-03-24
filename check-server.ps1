Start-Sleep -Seconds 10
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/login' -UseBasicParsing -ErrorAction Stop
    Write-Host "Login-Seite: Status $($r.StatusCode) OK"
} catch {
    Write-Host "Login-Seite: FEHLER - $($_.Exception.Message)"
}

# Test Login
try {
    $body = '{"email":"dimitri@credo-gruppe.de","password":"admin2026"}'
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/auth' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -ErrorAction Stop
    $data = $r.Content | ConvertFrom-Json
    Write-Host "Login-Test: OK - $($data.user.firstName) $($data.user.lastName)"
} catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Host "Login-Test: FEHLER Status $code"
    try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errBody = $reader.ReadToEnd()
        Write-Host "Details: $($errBody.Substring(0, [Math]::Min(300, $errBody.Length)))"
    } catch {}
}
