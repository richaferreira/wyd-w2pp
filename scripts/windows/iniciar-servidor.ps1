# Inicia o servidor WYD (w2pp-OpenWYD) no Windows usando o Docker Desktop.
#
# Faz, na ordem:
#   1. confere Docker, Docker Compose e a pasta Release\
#   2. gera a senha do banco (arquivo .env) e protege esse arquivo contra commit
#   3. sobe banco + servicos + servidor de jogo
#   4. cria a conta de jogo
#   5. libera as portas no Firewall do Windows
#   6. mostra o IP:porta para colocar no serverlist.bin do client
#
# Pode ser executado varias vezes: o que ja existe e reaproveitado.
# Uso normal: de dois cliques em iniciar-servidor.bat (ele chama este arquivo).
#
# Parametros opcionais:
#   -Conta nome   -Senha senha   (evita as perguntas)
#   -SemFirewall                 (nao cria regras no Firewall, nao pede administrador)
#
# Obs.: as mensagens ficam sem acentos de proposito, para nao quebrar em
# nenhuma versao do PowerShell/console do Windows.

param(
    [string]$Conta,
    [string]$Senha,
    [switch]$SemFirewall
)

# Continue (e nao Stop): o Windows PowerShell 5.1 trata qualquer texto que o
# docker escreve em stderr como erro fatal quando o modo e Stop. Conferimos
# $LASTEXITCODE manualmente.
$ErrorActionPreference = 'Continue'

$PortaJogo   = 8281
$PortaStatus = 80

function Pausa {
    if (-not $env:WYD_SEM_PAUSA) { Read-Host "Pressione Enter para fechar" | Out-Null }
}
function Passo($texto)  { Write-Host ""; Write-Host "=== $texto" -ForegroundColor Cyan }
function Ok($texto)     { Write-Host "  [ok] $texto" -ForegroundColor Green }
function Aviso($texto)  { Write-Host "  [aviso] $texto" -ForegroundColor Yellow }
function Falha($texto)  {
    Write-Host ""
    Write-Host "ERRO: $texto" -ForegroundColor Red
    Pausa
    exit 1
}
function Executar($mensagemErro, $exe, [string[]]$argumentos) {
    & $exe @argumentos
    if ($LASTEXITCODE -ne 0) { Falha $mensagemErro }
}
function Servicos-Rodando {
    $r = & docker compose ps --status running --services 2>$null
    if ($null -eq $r) { return @() }
    return @($r)
}
function Porta-Aberta([int]$porta) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $r = $c.BeginConnect('127.0.0.1', $porta, $null, $null)
        $ok = $r.AsyncWaitHandle.WaitOne(1000)
        $conectou = ($ok -and $c.Connected)
        if ($conectou) { $c.EndConnect($r) }
        $c.Close()
        return $conectou
    } catch { return $false }
}
function Nova-SenhaAleatoria {
    # So letras e numeros (sem caracteres que quebrem a URL de conexao do banco).
    $alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'.ToCharArray()
    $bytes = New-Object 'byte[]' 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return -join ($bytes | ForEach-Object { $alfabeto[$_ % $alfabeto.Length] })
}

# --- Administrador (so necessario para o Firewall) ---------------------------
if (-not $SemFirewall -and -not $env:WYD_TESTE) {
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    $ehAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $ehAdmin) {
        Write-Host "Pedindo permissao de administrador (necessaria para liberar as portas no Firewall)..." -ForegroundColor Yellow
        $args2 = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
        if ($Conta) { $args2 += @('-Conta', ('"' + $Conta + '"')) }
        if ($Senha) { $args2 += @('-Senha', ('"' + $Senha + '"')) }
        try {
            Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $args2
        } catch {
            Falha "Nao foi possivel obter permissao de administrador. Rode de novo e aceite o aviso, ou use: iniciar-servidor.ps1 -SemFirewall"
        }
        exit 0
    }
}

# --- Localiza a raiz do projeto (pasta com docker-compose.yaml) ----------------
$raiz = $null
$dir = $PSScriptRoot
for ($i = 0; $i -lt 4; $i++) {
    if (Test-Path (Join-Path $dir 'docker-compose.yaml')) { $raiz = $dir; break }
    $pai = Split-Path $dir -Parent
    if (-not $pai -or $pai -eq $dir) { break }
    $dir = $pai
}
if (-not $raiz) {
    Falha "Nao encontrei o docker-compose.yaml. Deixe este script dentro da pasta do projeto (por exemplo scripts\windows\)."
}
Set-Location $raiz
Write-Host "Projeto: $raiz"

# --- 1. Requisitos -----------------------------------------------------------
Passo "1/6 Conferindo requisitos"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Falha "Docker nao encontrado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop/), abra-o, espere ficar 'Running' e rode de novo."
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Falha "O Docker esta instalado mas nao esta rodando. Abra o Docker Desktop, espere o icone ficar verde ('Engine running') e rode de novo."
}
Ok "Docker rodando"

& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Falha "Docker Compose v2 nao encontrado. Atualize o Docker Desktop."
}
Ok "Docker Compose disponivel"

foreach ($sub in 'Release/Common', 'Release/TMsrv', 'Release/DBsrv') {
    if (-not (Test-Path (Join-Path $raiz $sub))) {
        Falha "Pasta '$sub' nao encontrada. A pasta Release\ (conteudo do jogo) precisa estar na raiz do projeto. Veja o passo a passo no chat ou em docs\HOSPEDAR-COM-AMIGOS.md."
    }
}
Ok "Pasta Release\ encontrada"

# --- 2. Senha do banco (.env) -----------------------------------------------
Passo "2/6 Senha do banco de dados"

$envFile = Join-Path $raiz '.env'
if (Test-Path $envFile) {
    Ok "Usando o arquivo .env que ja existe (senha do banco mantida)"
} else {
    $volumes = @(& docker volume ls -q 2>$null)
    $volumeAntigo = $volumes | Where-Object { $_ -match 'pgdata$' } | Select-Object -First 1
    if ($volumeAntigo) {
        Aviso "Ja existe um banco criado antes (volume '$volumeAntigo'). Vou manter a senha antiga 'dev' para ele continuar funcionando."
        Aviso "Para trocar a senha, apague o banco (docker compose down -v) ANTES de iniciar - isso apaga as contas e personagens."
        $senhaDb = 'dev'
    } else {
        $senhaDb = Nova-SenhaAleatoria
        Ok "Senha do banco gerada (guardada no arquivo .env)"
    }
    $utf8SemBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($envFile, ("POSTGRES_PASSWORD=" + $senhaDb + "`n"), $utf8SemBom)
}

# Impede que o .env (com a senha) seja commitado por engano.
$gitDir = Join-Path $raiz '.git'
if (Test-Path $gitDir) {
    $infoDir = Join-Path $gitDir 'info'
    if (-not (Test-Path $infoDir)) { New-Item -ItemType Directory -Path $infoDir -Force | Out-Null }
    $exclude = Join-Path $infoDir 'exclude'
    $jaTem = $false
    if (Test-Path $exclude) { $jaTem = [bool](Select-String -Path $exclude -Pattern '^\.env\s*$' -Quiet) }
    if (-not $jaTem) {
        Add-Content -Path $exclude -Value "`n.env"
        Ok ".env protegido contra commit (.git/info/exclude)"
    }
}

# --- 3. Conta de jogo ----------------------------------------------------------
Passo "3/6 Conta de jogo"

$padraoValido = '^[A-Za-z0-9_.-]+$'
if (-not $Conta) {
    $Conta = Read-Host "Nome da conta de jogo (ate 15 caracteres) [test]"
    if (-not $Conta) { $Conta = 'test' }
}
if (-not $Senha) {
    $Senha = Read-Host "Senha da conta (ate 11 caracteres) [test123]"
    if (-not $Senha) { $Senha = 'test123' }
}
if ($Conta -notmatch $padraoValido -or $Conta.Length -gt 15) {
    Falha "Nome de conta invalido. Use ate 15 letras, numeros, ponto, hifen ou sublinhado (sem espacos nem acentos)."
}
if ($Senha -notmatch $padraoValido -or $Senha.Length -gt 11) {
    Falha "Senha invalida. Use ate 11 letras, numeros, ponto, hifen ou sublinhado (sem espacos nem acentos)."
}
$Conta = $Conta.ToLower()
Ok "Conta: $Conta (o servidor sempre grava o nome em minusculas)"

# --- 4. Sobe os servicos -------------------------------------------------------
Passo "4/6 Subindo os servicos (a primeira vez demora varios minutos: compila o servidor)"

Executar "Falha ao subir o banco e os servicos de apoio. Leia a mensagem acima." 'docker' @('compose', 'up', '-d', '--build', 'db', 'binserver', 'dbserver', 'webserver')

# O dbserver precisa sobreviver as migracoes antes de abrir o servidor de jogo.
$subiu = $false
for ($i = 0; $i -lt 90; $i++) {
    if ((Servicos-Rodando) -contains 'dbserver') { $subiu = $true; break }
    Start-Sleep -Seconds 1
}
if ($subiu) {
    Start-Sleep -Seconds 5
    if (-not ((Servicos-Rodando) -contains 'dbserver')) { $subiu = $false }
}
if (-not $subiu) {
    Write-Host ""
    & docker compose logs --tail 40 dbserver
    Falha "O dbserver nao ficou de pe. Veja os logs acima (se mencionar senha, o banco antigo usa outra senha: veja o aviso do passo 2)."
}
Ok "Banco e servicos de apoio no ar"

Executar "Falha ao subir o servidor de jogo (tmserver). Leia a mensagem acima." 'docker' @('compose', 'up', '-d', '--build', 'tmserver')

Write-Host "  Criando a conta '$Conta'..."
Executar "Falha ao criar a conta de jogo. Leia a mensagem acima." 'docker' @('compose', 'run', '--rm', 'dbserver', 'seed-account', '-name', $Conta, '-pass', $Senha)
Aviso "Se a conta ja existia, ela foi mantida e a senha NAO foi alterada (vale a senha antiga)."

# Espera o servidor de jogo abrir a porta.
$escutando = $false
for ($i = 0; $i -lt 60; $i++) {
    if (Porta-Aberta $PortaJogo) { $escutando = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $escutando) {
    Write-Host ""
    & docker compose logs --tail 40 tmserver
    Falha "O servidor de jogo nao abriu a porta $PortaJogo. Veja os logs acima."
}
Ok "Servidor de jogo escutando na porta $PortaJogo"

# --- 5. Firewall -------------------------------------------------------------
Passo "5/6 Firewall do Windows"

if ($SemFirewall) {
    Aviso "Pulado (-SemFirewall). Se outros PCs nao conseguirem conectar, libere as portas $PortaJogo e $PortaStatus (TCP)."
} else {
    function Garantir-Regra([string]$nome, [int]$porta) {
        $existe = Get-NetFirewallRule -DisplayName $nome -ErrorAction SilentlyContinue
        if ($existe) {
            Ok "Regra '$nome' ja existe"
        } else {
            New-NetFirewallRule -DisplayName $nome -Direction Inbound -Protocol TCP -LocalPort $porta -Action Allow -Profile Any | Out-Null
            Ok "Regra '$nome' criada (porta $porta)"
        }
    }
    try {
        Garantir-Regra "WYD servidor de jogo $PortaJogo" $PortaJogo
        Garantir-Regra "WYD status do canal $PortaStatus" $PortaStatus
    } catch {
        Aviso "Nao consegui criar as regras do Firewall: $($_.Exception.Message)"
    }
}

# --- 6. Resumo -------------------------------------------------------------
Passo "6/6 Pronto"

$ip = $null
try {
    $cfg = Get-NetIPConfiguration -ErrorAction Stop |
        Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
        Select-Object -First 1
    if ($cfg) { $ip = @($cfg.IPv4Address)[0].IPAddress }
} catch { }
if (-not $ip) { $ip = '<IP-DESTE-PC>' }

Write-Host ""
Write-Host "  ------------------------------------------------------------" -ForegroundColor Green
Write-Host "   SERVIDOR NO AR" -ForegroundColor Green
Write-Host ""
Write-Host "     Endereco para o client : ${ip}:${PortaJogo}"
Write-Host "     Conta                  : $Conta"
Write-Host "     Senha                  : $Senha"
Write-Host "  ------------------------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "  No PC de quem vai jogar:"
Write-Host "    1. Abra 'serverlist editor.exe' (pasta 'serverlist bin' do projeto),"
Write-Host "       coloque ${ip}:${PortaJogo}, gere o serverlist.bin e copie para a pasta do client."
Write-Host "    2. Abra o WYD.exe e entre com a conta acima. Ela nao tem personagem: crie no jogo."
Write-Host "    3. O servidor espera o client build 7662 (ClientVersion 12000)."
Write-Host ""
Write-Host "  Comandos uteis (mesma pasta deste script):"
Write-Host "    ver-logs.bat       acompanha o log do servidor de jogo"
Write-Host "    parar-servidor.bat desliga tudo (os dados do banco sao mantidos)"
Write-Host "    backup-banco.bat   salva uma copia do banco em %USERPROFILE%\wyd-backups"
Write-Host ""
Write-Host "  Avisos de seguranca:" -ForegroundColor Yellow
Write-Host "    - A senha da conta trafega SEM criptografia entre o client e o servidor"
Write-Host "      (limitacao do protocolo original). Nao use uma senha que voce usa em outro lugar."
Write-Host "    - Para jogar pela internet, redirecione no roteador SOMENTE as portas $PortaJogo e $PortaStatus (TCP)."
Write-Host "      NUNCA redirecione 7600 nem 5432. Teste primeiro na rede local."
Write-Host "    - Faca backups com backup-banco.bat antes de convidar jogadores."
Write-Host ""
Pausa
