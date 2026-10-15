# Evolução do projeto — registro e roadmap

Registro das mudanças feitas na revisão de estabilidade + o que ainda falta para
um servidor confiável para jogar online. Tudo abaixo foi **medido ou verificado
no código**; o que é hipótese está marcado como tal.

## 1. Linha de base (antes das mudanças)

- `go build ./...`: OK.
- `go test ./...`: **2 pacotes falhando** (`TestNightmareCycle/2` e um **panic**
  em `TestWaterFullProgressionAndParty`); 43 pacotes OK, 14 sem testes.
- Toolchain: Go 1.27.2 (satisfaz `go 1.26.9` do `go.mod`).

## 2. Mudanças

### 2.1 Fila de saída por sessão estourava em bursts (bug de estabilidade)

- **Sintoma:** o servidor derrubava clientes saudáveis com
  `session out queue full; dropping connection`.
- **Causa:** `Config.OutBuffer` default = 64. Um único tick do loop pode enfileirar
  centenas de frames para uma sessão (teleporte/login em área cheia envia um
  `CreateMob` por entidade visível) antes da goroutine de escrita rodar.
  `cmd/tmserver` não sobrescreve o valor, então **produção usava 64**.
- **Correção:** default `512` (`defaultOutBuffer` em `world/world.go`). A proteção
  contra cliente realmente travado continua (fila cheia ⇒ drop).
- **Evidência:** com o log do teste ligado apareceu
  `session out queue high conn=1 depth=32 cap=64`, seguido do drop.

### 2.2 `World.Send`/`SendTo` com sessão nula derrubavam o mundo

- **Sintoma:** `panic: nil pointer dereference` em `World.Send` (api.go).
- **Causa:** o loop pode remover uma sessão no meio de um handler (drop ou
  desconexão); código seguinte do mesmo handler ainda a usa. Um panic na goroutine
  única do mundo derruba **todos** os jogadores.
- **Correção:** `Send` e `SendTo` ignoram `s == nil`.

### 2.3 `TestNightmareCycle/2`

Passou após 2.1. **Hipótese (não provada):** o teste reaproveita uma conexão que
nunca lê o socket e acumulava frames até o servidor derrubá-la no 3º subteste.

### 2.4 Comando `/guild` implementado

- Legado: `_MSG_MessageWhisper.cpp:793` → `SendGuildList` (`SendFunc.cpp:1367`).
  Lista os **membros online** da guild do jogador (inclusive ele), em ordem de
  índice, nomes separados por espaço, quebrando linha ao atingir 70 bytes
  (a linha é descarregada **antes** de anexar o próximo nome, então pode passar
  de 70). Silencioso sem guild.
- Go: `sendGuildList` / `formatGuildList` em `handler/guild.go`, rota em `chat.go`.

### 2.5 Documentação corrigida

- `docs/game.md` marcava `/create` como ⏳ ("guild não modelado"), mas ele **já
  estava implementado e testado** (`TestGuildCreateCommand`), junto com
  `/subcreate`, `/handover`, `/summonguild`, `/expulsar`. A descrição de `/guild`
  ("mostra o index") também não batia com o legado. Ambos corrigidos.

### 2.6 Testes adicionados

| Arquivo | Garante |
|---|---|
| `world/send_robustness_test.go` | `Send` nulo não dá panic; rajada de 300 frames não derruba; cliente travado ainda é derrubado |
| `handler/guild_list_test.go` | empacotamento de linhas idêntico ao legado; `/guild` ponta a ponta pelo socket |

### 2.7 Documentos novos

`docs/GUIA-ARQUITETURA.md`, `docs/HOSPEDAR-COM-AMIGOS.md` e este arquivo.

## 3. Resultado após as mudanças

- `go test -race ./...`: **todos os pacotes OK, 0 falhas**.
- `go vet ./...`: sem avisos.
- Integração com PostgreSQL 16 (`-tags=integration ./internal/store/...`): OK.

## 4. O que NÃO foi verificado

- **Nenhum teste com o client `WYD.exe` real.** A suíte simula o protocolo.
- **Sem teste de carga**; comportamento com centenas de jogadores é desconhecido.
- `golangci-lint` e `govulncheck` **não foram executados** nesta revisão: rode
  `make lint vuln`.
- Cobertura baixa em partes críticas de wiring: `tmserver/cmd/tmserver` ≈ 20%,
  `dbserver/cmd/dbserver` ≈ 36%, `world` ≈ 58%.

## 5. Roadmap sugerido (ordem de valor para jogar com amigos)

**P0 — antes de convidar pessoas**
1. Subir com `make run-local` e jogar uma sessão real com o client; coletar logs
   (`session out queue …`, panics, desconexões inesperadas).
2. Endurecer o compose para internet (senha do Postgres, não publicar `7600`,
   mTLS) — checklist em `docs/HOSPEDAR-COM-AMIGOS.md`.
3. Backup automático do Postgres (cron + `pg_dump`) e teste de restauração.
4. Rodar `make lint vuln` e tratar o que aparecer.

**P1 — confiabilidade**
5. Recuperação de panic por handler: hoje um panic em qualquer handler derruba o
   processo todo (loop único). Avaliar `recover` no `Dispatcher.Handle` que
   registre o erro e desconecte só o jogador culpado. *Atenção:* isso toca a
   invariante do loop; precisa de revisão cuidadosa para não deixar estado
   meio-alterado.
6. Teste de carga simples (N clientes sintéticos logando/andando) para medir
   o gargalo do loop único e dimensionar `OutBuffer`/`-msg-burst`.
7. Healthcheck e métricas (sessões ativas, profundidade das filas, duração do tick).
8. Teste de integração do tmserver com Postgres real (login → personagem →
   salvar → relogar) em CI, não só no pacote `store`.

**P2 — conteúdo**
9. Evento Pista das Runas/Uxmal: kills, chefes, drops de runa, prêmios, portal do
   Balrog, contador do Coelho (`docs/game.md`, seção do evento).
10. Destrave do Arch.
11. `/crias`: depende de descobrir a coordenada de destino (não existe no legado).

**P3 — manutenção**
12. Fazer o CI falhar se `docs/game.md` divergir dos comandos registrados em
    `chat.go` (a doc já ficou defasada uma vez).
13. Subir a cobertura de `cmd/*` e `world`.
