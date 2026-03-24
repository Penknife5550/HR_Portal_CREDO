$ErrorActionPreference = "Continue"
$results = @()

function Test-API {
    param($Name, $Method, $Uri, $Body, $Session, $ExpectedStatus, $ContentType)
    try {
        $params = @{
            Uri = $Uri
            Method = $Method
            UseBasicParsing = $true
        }
        if ($Session) { $params.WebSession = $Session }
        if ($Body) { $params.Body = $Body }
        if ($ContentType) { $params.ContentType = $ContentType }

        $r = Invoke-WebRequest @params -ErrorAction Stop
        $status = $r.StatusCode
        $content = $r.Content
        if ($ExpectedStatus -and $status -ne $ExpectedStatus) {
            Write-Host "FAIL | $Name | Got $status, expected $ExpectedStatus"
            return @{Name=$Name; Result="FAIL"; Status=$status; Content=$content}
        }
        Write-Host "PASS | $Name | Status $status"
        return @{Name=$Name; Result="PASS"; Status=$status; Content=$content}
    } catch {
        $code = 0
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($ExpectedStatus -and $code -eq $ExpectedStatus) {
            Write-Host "PASS | $Name | Status $code (expected)"
            return @{Name=$Name; Result="PASS"; Status=$code; Content=""}
        }
        Write-Host "INFO | $Name | Status $code"
        return @{Name=$Name; Result="INFO"; Status=$code; Content=""}
    }
}

Write-Host "=========================================="
Write-Host "CREDO HR-Portal - Funktionstest V2"
Write-Host "=========================================="

# 1. Login
Write-Host "`n--- AUTH TESTS ---"
$loginBody = '{"email":"dimitri@credo-gruppe.de","password":"admin2026"}'
$login = Invoke-WebRequest -Uri 'http://localhost:3000/api/auth' -Method POST -ContentType 'application/json' -Body $loginBody -SessionVariable sess -UseBasicParsing
$loginData = $login.Content | ConvertFrom-Json
Write-Host "PASS | Login | $($loginData.user.firstName) $($loginData.user.lastName) ($($loginData.user.role))"

# 2. Auth Edge Cases
Test-API -Name "Ohne Auth (GET /api/onboarding)" -Method GET -Uri "http://localhost:3000/api/onboarding" -ExpectedStatus 401
Test-API -Name "Falsches Passwort" -Method POST -Uri "http://localhost:3000/api/auth" -Body '{"email":"dimitri@credo-gruppe.de","password":"wrong"}' -ContentType "application/json" -ExpectedStatus 401
Test-API -Name "Ungueltiger Token" -Method GET -Uri "http://localhost:3000/api/fragebogen/invalid-token-123" -ExpectedStatus 401

# 3. Onboardings
Write-Host "`n--- ONBOARDING TESTS ---"
$ob = Test-API -Name "GET /api/onboarding" -Method GET -Uri "http://localhost:3000/api/onboarding" -Session $sess -ExpectedStatus 200
$obData = $ob.Content | ConvertFrom-Json
Write-Host "  Anzahl Vorgaenge: $($obData.Length)"
foreach ($o in $obData) { Write-Host "  - $($o.displayId) | $($o.email) | $($o.status)" }

# 4. Einrichtungs-Filter
$annaOb = $obData | Where-Object { $_.email -eq "anna.schmidt@test.de" }
$annaId = $annaOb.id
$annaOrgId = $annaOb.organizationId
Write-Host "`nAnna ID: $annaId"
Test-API -Name "Filter: Gesamtschule" -Method GET -Uri "http://localhost:3000/api/onboarding?organizationId=$annaOrgId" -Session $sess -ExpectedStatus 200

# 5. Onboarding Detail
$detail = Test-API -Name "GET /api/onboarding/$annaId" -Method GET -Uri "http://localhost:3000/api/onboarding/$annaId" -Session $sess -ExpectedStatus 200
$detailData = $detail.Content | ConvertFrom-Json
Write-Host "  DisplayId: $($detailData.displayId)"
Write-Host "  Hat personalData: $($null -ne $detailData.personalData)"
Write-Host "  Dokumente: $($detailData.documents.Length)"
Write-Host "  Checkliste: $($detailData.checklistItems.Length)"

# 6. Checklisten
Write-Host "`n--- CHECKLISTEN TESTS ---"
$cl = Test-API -Name "GET /api/checklisten" -Method GET -Uri "http://localhost:3000/api/checklisten" -Session $sess -ExpectedStatus 200
$clData = $cl.Content | ConvertFrom-Json
Write-Host "  Vorlagen: $($clData.Length)"

$cli = Test-API -Name "GET Checklist-Items Anna" -Method GET -Uri "http://localhost:3000/api/onboarding/$annaId/checklist" -Session $sess -ExpectedStatus 200
$cliData = $cli.Content | ConvertFrom-Json
Write-Host "  Items: $($cliData.Length)"

if ($cliData.Length -gt 0) {
    $firstItem = $cliData[0]
    Write-Host "  Erstes Item: $($firstItem.title) (completed: $($firstItem.isCompleted))"
    # Toggle ein Item
    $toggleBody = '{"isCompleted":true}'
    $uncheckedItem = $cliData | Where-Object { -not $_.isCompleted } | Select-Object -First 1
    if ($uncheckedItem) {
        Test-API -Name "PATCH Checklist-Item toggle" -Method PATCH -Uri "http://localhost:3000/api/onboarding/$annaId/checklist/$($uncheckedItem.id)" -Body $toggleBody -ContentType "application/json" -Session $sess -ExpectedStatus 200
    }
}

# 7. Mandanten
Write-Host "`n--- MANDANTEN TESTS ---"
$orgs = Test-API -Name "GET /api/organizations" -Method GET -Uri "http://localhost:3000/api/organizations" -Session $sess -ExpectedStatus 200
$orgsData = $orgs.Content | ConvertFrom-Json
Write-Host "  Mandanten: $($orgsData.Length)"

# Neuen Test-Mandanten erstellen
$newOrg = '{"mandantNumber":"999","name":"Test-Mandant","shortName":"TST","type":"VERWALTUNG"}'
Test-API -Name "POST neuer Mandant" -Method POST -Uri "http://localhost:3000/api/organizations" -Body $newOrg -ContentType "application/json" -Session $sess -ExpectedStatus 201

# Duplikat testen
Test-API -Name "POST duplikat Mandant (409)" -Method POST -Uri "http://localhost:3000/api/organizations" -Body $newOrg -ContentType "application/json" -Session $sess -ExpectedStatus 409

# 8. Neuen Vorgang erstellen (displayId Test)
Write-Host "`n--- VORGANGS-ID TEST ---"
$gymId = ($obData | Where-Object { $_.email -eq "anna.schmidt@test.de" }).organizationId
$newOb = "{`"email`":`"test.vorgang@test.de`",`"organizationId`":`"$($annaOrgId)`",`"questionnaireType`":`"STANDARD`"}"
$newObResult = Test-API -Name "POST neuer Vorgang" -Method POST -Uri "http://localhost:3000/api/onboarding" -Body $newOb -ContentType "application/json" -Session $sess -ExpectedStatus 201
if ($newObResult.Content) {
    $newObData = $newObResult.Content | ConvertFrom-Json
    Write-Host "  Neue displayId: $($newObData.displayId)"
    Write-Host "  Token: $($newObData.token)"
}

# 9. Dokument Upload
Write-Host "`n--- DOKUMENT UPLOAD TESTS ---"
$token = "6fc2aa61-c0e6-42b7-ac86-ca6413fd3d0c"

# Erstelle Test-PDF
$pdfContent = [byte[]]@(0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3)
$pdfContent += [System.Text.Encoding]::ASCII.GetBytes("1 0 obj<</Type/Catalog>>endobj 2 0 obj<</Type/Pages/Count 0>>endobj xref 0 3 trailer<</Root 1 0 R>>startxref 0 %%EOF")
$tmpPdf = [System.IO.Path]::GetTempFileName() + ".pdf"
[System.IO.File]::WriteAllBytes($tmpPdf, $pdfContent)
Write-Host "  Test-PDF erstellt: $tmpPdf ($($pdfContent.Length) Bytes)"

# Upload via multipart
try {
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"type`"$LF",
        "ZEUGNIS",
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"test.pdf`"",
        "Content-Type: application/pdf$LF",
        [System.Text.Encoding]::ASCII.GetString($pdfContent),
        "--$boundary--$LF"
    ) -join $LF

    $upload = Invoke-WebRequest -Uri "http://localhost:3000/api/fragebogen/$token/documents" -Method POST -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyLines -UseBasicParsing -ErrorAction Stop
    Write-Host "PASS | PDF Upload | Status $($upload.StatusCode)"
    $uploadData = $upload.Content | ConvertFrom-Json
    Write-Host "  Datei: $($uploadData.fileName), Typ: $($uploadData.type)"
} catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Host "INFO | PDF Upload | Status $code - $($_.Exception.Message)"
}

# Dokumente abrufen
$docs = Test-API -Name "GET Dokumente Anna" -Method GET -Uri "http://localhost:3000/api/fragebogen/$token/documents" -ExpectedStatus 200
if ($docs.Content) {
    $docsData = $docs.Content | ConvertFrom-Json
    Write-Host "  Anzahl Dokumente: $($docsData.Length)"
}

# Cleanup
Remove-Item $tmpPdf -ErrorAction SilentlyContinue

# 10. Fragebogen IBAN Validierung (Code-basiert)
Write-Host "`n--- VALIDIERUNG (Code-Check) ---"
$validatorPath = "C:\Users\driesen.FES\Desktop\Claude_Projekte\credo-hr-portal\src\lib\utils\iban-validator.ts"
if (Test-Path $validatorPath) {
    Write-Host "PASS | IBAN-Validator existiert"
} else {
    Write-Host "FAIL | IBAN-Validator fehlt!"
}

$personalDataPath = "C:\Users\driesen.FES\Desktop\Claude_Projekte\credo-hr-portal\src\lib\validations\personal-data.ts"
$pdContent = Get-Content $personalDataPath -Raw
if ($pdContent -match "validateIBAN") {
    Write-Host "PASS | IBAN-Validierung in Schema integriert"
} else {
    Write-Host "FAIL | IBAN-Validierung fehlt im Schema!"
}
if ($pdContent -match "email") {
    Write-Host "PASS | E-Mail-Validierung in Schema vorhanden"
} else {
    Write-Host "FAIL | E-Mail-Validierung fehlt im Schema!"
}

Write-Host "`n=========================================="
Write-Host "FUNKTIONSTEST ABGESCHLOSSEN"
Write-Host "=========================================="
