# Ativar o comando GM no servidor local (Windows)

Este guia habilita o comando `/gm` para uma conta no servidor WYD local usando Windows PowerShell, Docker Compose e PostgreSQL.

> **Importante:** o valor correto da coluna `role` é `moderator` (ou `admin`), não `modr`. O valor `modr` não é reconhecido como privilégio GM. Contas novas começam como `player`.

## 1. Abrir o PowerShell na pasta do projeto

```powershell
Set-Location "C:\dev\wyd-w2pp"
```

Confirme que está na pasta certa e que o arquivo Compose existe:

```powershell
Get-Location
Get-ChildItem .\docker-compose.yaml
```

Se `docker-compose.yaml` não aparecer, confira se o caminho do projeto está correto.

## 2. Verificar e iniciar os serviços

Confira o estado da stack:

```powershell
docker compose ps
```

Se os serviços não estiverem iniciados, suba a stack:

```powershell
docker compose up -d
```

Confira novamente:

```powershell
docker compose ps
```

## 3. Abrir o PostgreSQL

Execute este comando a partir de `C:\dev\wyd-w2pp`:

```powershell
docker compose exec db psql -U postgres -d postgres
```

O prompt mudará para algo como `postgres=#`, indicando que você está no PostgreSQL.

## 4. Dar o papel de moderador à conta

No prompt do PostgreSQL, execute a consulta abaixo substituindo `NOME_REAL_DA_CONTA` pelo login da sua conta. **Não deixe o texto de exemplo literalmente.**

```sql
UPDATE account
SET role = 'moderator'
WHERE name = lower('NOME_REAL_DA_CONTA')
RETURNING id, name, role;
```

Exemplo: se o login da conta for `Rafa`, use:

```sql
UPDATE account
SET role = 'moderator'
WHERE name = lower('Rafa')
RETURNING id, name, role;
```

A consulta deve retornar uma linha com `role` igual a `moderator`. Se retornar `UPDATE 0` ou nenhuma linha, verifique se a conta existe e se o nome está correto. Você pode consultar as contas cadastradas com:

```sql
SELECT id, name, role FROM account ORDER BY name;
```

### Se você já executou a consulta com `modr`

Corrija o papel usando a consulta correta acima. O valor deve ser exatamente `moderator`.

## 5. Sair e entrar novamente no jogo

No `psql`, saia com:

```text
\q
```

Depois desconecte a conta do jogo e faça login novamente. O servidor carrega o papel durante o login; reconectar é necessário para atualizar a sessão.

## 6. Usar os comandos GM

No cliente, envie os comandos pelo chat como whisper para o alvo `gm`, digitando `/gm` seguido pelo subcomando. Exemplos:

```text
/gm notice Manutenção em 10 minutos
/gm kick NomeDoJogador
/gm item 1234 10
/gm setlevel 55
/gm weather 1
```

Subcomandos implementados incluem:

- `kick <jogador>` — desconecta um jogador online;
- `notice <texto>` ou `aviso <texto>` — anuncia uma mensagem;
- `goto <jogador>` ou `ir <jogador>` — teleporta você até o jogador;
- `summon <jogador>` ou `puxar <jogador>` — puxa o jogador até você;
- `spawn <id>` — cria uma criatura de teste pelo índice do roster de summons;
- `item <id> [quantidade]` — adiciona item ao seu inventário;
- `setlevel <nível>` — aumenta seu nível até o indicado;
- `setgold <quantidade>` — define seu ouro carregado;
- `ban <jogador|conta>` e `unban <jogador|conta>` — bloqueia/desbloqueia a conta;
- `guildname <id> <nome>` e `guildfame <id> <fama>` — configura nome/fama da guild;
- `weather <0|1|2|auto>` ou `clima <0|1|2|auto>` — configura o clima.

## Segurança

Conceda `moderator` apenas a contas de confiança: esse papel permite ações administrativas no jogo. Faça a alteração somente no banco do seu próprio servidor. O papel `admin` também é reconhecido, mas está reservado para operações futuras e não é necessário para os comandos GM atualmente implementados.
