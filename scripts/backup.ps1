param([string]$OutputDirectory = './backups')
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$backupName = 'crm-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump'
$backupPath = Join-Path (Resolve-Path $OutputDirectory) $backupName
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/crm-backup.dump'
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
docker compose cp db:/tmp/crm-backup.dump $backupPath
if ($LASTEXITCODE -ne 0) { throw 'copy failed' }
Write-Output "Резервная копия: $backupPath"
