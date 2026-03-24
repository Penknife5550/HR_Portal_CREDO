Write-Host "=== Dev Server Health Check ==="

# Check login page
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/login' -UseBasicParsing -ErrorAction Stop
    Write-Host "Login Page: $($r.StatusCode) OK"
} catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Host "Login Page: ERROR $code"

    # Read response body for error details
    try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "Response: $($body.Substring(0, [Math]::Min(500, $body.Length)))"
    } catch {}
}

# Check auth API
try {
    $body = '{"email":"dimitri@credo-gruppe.de","password":"admin2026"}'
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/auth' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -ErrorAction Stop
    Write-Host "Auth API: $($r.StatusCode) OK"
    $data = $r.Content | ConvertFrom-Json
    Write-Host "User: $($data.user.firstName) $($data.user.lastName)"
} catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Host "Auth API: ERROR $code"

    try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "Response: $($body.Substring(0, [Math]::Min(500, $body.Length)))"
    } catch {}
}
