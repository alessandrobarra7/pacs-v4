import crypto from "crypto";

export const RADIANT_ASSISTANT_SCHEME = "pacs-radiant";

export type RadiantAssistantToken = {
  studyUid: string;
  userId: number;
  expiresAt: number;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function createRadiantAssistantTokenStore(options: {
  ttlMs?: number;
  now?: () => number;
  makeToken?: () => string;
} = {}) {
  const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  const now = options.now ?? Date.now;
  const makeToken = options.makeToken ?? (() => crypto.randomBytes(32).toString("base64url"));
  const entries = new Map<string, RadiantAssistantToken>();

  const prune = () => {
    const timestamp = now();
    entries.forEach((entry, token) => {
      if (entry.expiresAt <= timestamp) entries.delete(token);
    });
  };

  return {
    issue(input: { studyUid: string; userId: number }) {
      prune();
      let token = makeToken();
      while (entries.has(token)) token = makeToken();
      const entry: RadiantAssistantToken = {
        studyUid: input.studyUid,
        userId: input.userId,
        expiresAt: now() + ttlMs,
      };
      entries.set(token, entry);
      return { token, expiresAt: entry.expiresAt };
    },
    consume(token: string): RadiantAssistantToken | null {
      if (!TOKEN_PATTERN.test(token)) return null;
      const entry = entries.get(token);
      if (!entry || entry.expiresAt <= now()) {
        entries.delete(token);
        return null;
      }
      entries.delete(token);
      return entry;
    },
    prune,
    size() {
      return entries.size;
    },
  };
}

function ensureAllowedPortalOrigin(portalOrigin: string): string {
  const parsed = new URL(portalOrigin);
  const isLocalDevelopment = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocalDevelopment) {
    throw new Error("O Assistente RadiAnt exige origem HTTPS fora do desenvolvimento local.");
  }
  return parsed.origin;
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Instalador por usuário do Assistente RadiAnt.
 * Ele cria somente uma associação de protocolo em HKCU e nunca lê ou altera
 * configurações, AE Title, IP, porta ou licença do RadiAnt.
 */
export function buildRadiantAssistantInstaller(portalOrigin: string): string {
  const safeOrigin = escapePowerShellSingleQuoted(ensureAllowedPortalOrigin(portalOrigin));
  return String.raw`# PACS RadiAnt Assistant — instalador por usuário
# Este arquivo não altera qualquer configuração PACS existente do RadiAnt.
param([string]$Uri)

$ErrorActionPreference = 'Stop'
$PortalBaseUrl = '${safeOrigin}'
$SchemeName = '${RADIANT_ASSISTANT_SCHEME}'
$InstallRoot = Join-Path $env:LOCALAPPDATA 'PacsRadiantAssistant'
$InstalledScript = Join-Path $InstallRoot 'PacsRadiantAssistant.ps1'
$StudiesRoot = Join-Path $InstallRoot 'studies'

function Find-RadiantExecutable {
  $candidates = @(
    (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\RadiAntViewer.exe' -ErrorAction SilentlyContinue).'(default)',
    (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\RadiAntViewer.exe' -ErrorAction SilentlyContinue).'(default)',
    "$env:LOCALAPPDATA\RadiAntViewer\RadiAntViewer.exe",
    "$env:ProgramFiles\RadiAntViewer\RadiAntViewer.exe",
    (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'RadiAntViewer\RadiAntViewer.exe')
  ) | Where-Object { $_ -and (Test-Path $_) }
  return $candidates | Select-Object -First 1
}

function Show-AssistantMessage([string]$Text, [string]$Title) {
  Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
  [System.Windows.MessageBox]::Show($Text, $Title) | Out-Null
}

function Install-Assistant {
  $radiant = Find-RadiantExecutable
  if (-not $radiant) {
    Show-AssistantMessage 'RadiAnt não foi encontrado neste computador. Instale ou ative o RadiAnt e execute novamente este instalador.' 'PACS RadiAnt Assistant'
    exit 2
  }

  New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
  Copy-Item -LiteralPath $PSCommandPath -Destination $InstalledScript -Force
  $protocolKey = 'HKCU:\Software\Classes\' + $SchemeName
  $commandKey = $protocolKey + '\shell\open\command'
  New-Item -Path $protocolKey -Force | Out-Null
  Set-Item -Path $protocolKey -Value 'URL:PACS RadiAnt Assistant'
  New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  New-Item -Path $commandKey -Force | Out-Null
  $command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $InstalledScript + '" -Uri "%1"'
  Set-Item -Path $commandKey -Value $command
  Start-Process -FilePath $radiant
  Show-AssistantMessage 'Ativação concluída. O Portal poderá abrir somente os estudos para os quais você tiver permissão.' 'PACS RadiAnt Assistant'
}

function Open-AuthorizedStudy([string]$IncomingUri) {
  $parsed = [Uri]$IncomingUri
  if ($parsed.Scheme -ne '${RADIANT_ASSISTANT_SCHEME}' -or $parsed.Host -ne 'open') { throw 'Comando RadiAnt inválido.' }
  $token = $parsed.AbsolutePath.Trim('/')
  if ($token -notmatch '^[A-Za-z0-9_-]{32,128}$') { throw 'Token de estudo inválido.' }

  $radiant = Find-RadiantExecutable
  if (-not $radiant) { throw 'RadiAnt não encontrado neste computador.' }

  New-Item -ItemType Directory -Path $StudiesRoot -Force | Out-Null
  Get-ChildItem -Path $StudiesRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-48) } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  $workRoot = Join-Path $StudiesRoot ('study_' + [Guid]::NewGuid().ToString('N'))
  $zipPath = Join-Path $workRoot 'study.zip'
  $dicomPath = Join-Path $workRoot 'dicom'
  New-Item -ItemType Directory -Path $dicomPath -Force | Out-Null

  try {
    Invoke-WebRequest -UseBasicParsing -Uri ($PortalBaseUrl + '/api/radiant-assistant-download/' + $token) -OutFile $zipPath
    Expand-Archive -LiteralPath $zipPath -DestinationPath $dicomPath -Force
    $dicomFiles = Get-ChildItem -Path $dicomPath -File -Recurse -Filter '*.dcm' -ErrorAction SilentlyContinue
    if (-not $dicomFiles) { throw 'O pacote não contém arquivos DICOM.' }
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath $radiant -ArgumentList @('-d', $dicomPath)
  } catch {
    Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue
    throw
  }
}

try {
  if ([string]::IsNullOrWhiteSpace($Uri)) { Install-Assistant }
  else { Open-AuthorizedStudy $Uri }
} catch {
  Show-AssistantMessage $_.Exception.Message 'PACS RadiAnt Assistant'
  exit 1
}
`;
}
