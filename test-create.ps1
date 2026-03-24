# Login und Testvorgang erstellen
$loginBody = '{"email":"dimitri@credo-gruppe.de","password":"admin2026"}'
$loginR = Invoke-WebRequest -Uri 'http://localhost:3000/api/auth' -Method POST -ContentType 'application/json' -Body $loginBody -UseBasicParsing -SessionVariable session
$loginData = $loginR.Content | ConvertFrom-Json
Write-Host "Login: $($loginData.user.firstName) $($loginData.user.lastName) - OK"

# Einrichtungen laden
$orgsR = Invoke-WebRequest -Uri 'http://localhost:3000/api/organizations' -UseBasicParsing -WebSession $session
$orgs = ($orgsR.Content | ConvertFrom-Json).data
$gym = $orgs | Where-Object { $_.shortName -eq 'GYM' }
Write-Host "Gymnasium ID: $($gym.id)"

# Neuen Vorgang erstellen
$newBody = @{
    email = "max.mustermann@test.de"
    organizationId = $gym.id
    questionnaireType = "STANDARD"
} | ConvertTo-Json
$newR = Invoke-WebRequest -Uri 'http://localhost:3000/api/onboarding' -Method POST -ContentType 'application/json' -Body $newBody -UseBasicParsing -WebSession $session
$newData = $newR.Content | ConvertFrom-Json
Write-Host "Vorgang erstellt: $($newData.displayId) - ID: $($newData.id)"

# Notiz hinzufuegen
$noteBody = '{"content":"Testnotiz: Arbeitsvertrag muss noch unterschrieben werden."}'
$noteR = Invoke-WebRequest -Uri "http://localhost:3000/api/onboarding/$($newData.id)/notes" -Method POST -ContentType 'application/json' -Body $noteBody -UseBasicParsing -WebSession $session
Write-Host "Notiz erstellt: $($noteR.StatusCode)"

# Zweite Notiz
$noteBody2 = '{"content":"Erweitertes Fuehrungszeugnis angefordert - wird in 2 Wochen erwartet."}'
$noteR2 = Invoke-WebRequest -Uri "http://localhost:3000/api/onboarding/$($newData.id)/notes" -Method POST -ContentType 'application/json' -Body $noteBody2 -UseBasicParsing -WebSession $session
Write-Host "Notiz 2 erstellt: $($noteR2.StatusCode)"

Write-Host "`nFertig! Vorgang-ID: $($newData.id)"
Write-Host "Detail-URL: http://localhost:3000/dashboard/$($newData.id)"
