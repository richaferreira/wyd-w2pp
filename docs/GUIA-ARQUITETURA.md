# w2pp-OpenWYD — Guia de Arquitetura e Desenvolvimento

> Documento consolidado (pt-BR). Ele **resume e organiza** o que já existe em
> `CLAUDE.md`, `AGENTS.md` e `docs/migration/`; não substitui essas fontes.
> Onde há dúvida sobre comportamento do jogo/protocolo, a fonte da verdade é o
> código legado em `Source/` (citado como `arquivo.cpp:linha`) e os documentos de
> engenharia reversa em `docs/migration/`, que marcam o que não foi confirmado
> como **UNVERIFIED**.

## 1. O que é

Reescrita **big-bang em Go** do servidor do MMORPG **WYD (With Your Destiny)**,
feita para funcionar com o client **`WYD.exe` 7662 sem modificação** (versão de
protocolo **7640**; 7662 é o nome do build/patch). Licença **GPL-2.0**.

| Parte | Onde | Papel |
|---|---|---|
| Serviços Go (novo) | `tmserver/` `dbserver/` `binserver/` `webserver/` | O servidor de verdade |
| Pacotes compartilhados | `internal/` | Banco, migrations, domínio, hash de senha, mTLS |
| Contratos gRPC | `api/` | `.proto` + código gerado |
| Código C++ legado | `Source/` | **Referência** de comportamento (não é compilado aqui) |
| Binários + conteúdo do jogo | `Release/` | Rates, catálogos, mapas, templates de mob |
| Engenharia reversa | `docs/migration/`, `docs/agents/` | Especificação de protocolo, formatos e regras |

Tamanho aproximado (medido): ~116 mil linhas de Go (tmserver ≈ 67 mil) contra
~78 mil de C++ legado.

## 2. Topologia

```mermaid
flowchart LR
    C[Client WYD.exe] -- "CPSock legado\nTCP :8281" --> TM[tmServer]
    C -. "HTTP :80\nserv00.htm (status)" .-> TM
    TM -- gRPC --> DB[dbServer :7514]
    TM -- gRPC --> BIN[binServer :3000]
    WEB[webServer :7600] -- SQL --> PG[(PostgreSQL)]
    DB -- SQL --> PG
    BFF[Next.js BFF\n(plataforma web)] -- gRPC --> WEB
```

Somente a borda **client ↔ tmServer** fala o protocolo legado. Todo o tráfego
interno é gRPC (com mTLS opcional).

| Serviço | Porta | Responsabilidade |
|---|---|---|
| **tmServer** | `8281` jogo, `80` status | Dono de **todo** o estado do mundo, em memória |
| **dbServer** | `7514` | Persistência (PostgreSQL via pgx v5), API `api/db/v1` |
| **binServer** | `3000` | "Portão" de billing, API `api/bin/v1` |
| **webServer** | `7600` | Web-API (`api/web/v1`): criar conta, login web, futuro cash/ranking/loja |

Degradação graciosa do tmServer: sem `-dbserver` usa persistência *no-op* (logins
reportam conta inexistente); sem `-binserver` o billing libera tudo.

## 3. A invariante que importa: o loop de dono único

Todo o estado do mundo pertence a **uma única goroutine** (`world.World.Run`) e
nunca é alterado em outro lugar. **Não há locks sobre o estado do mundo.** Isso
espelha o reactor single-thread do WinSock original e é o que evita duplicação de
itens e *lost writes*.

Consequências para qualquer código novo no caminho do jogo:

1. **Handlers rodam dentro do loop** (`tmserver/internal/handler/`), então podem
   mutar o mundo diretamente.
2. **Chamadas bloqueantes (dbServer, billing) nunca podem bloquear o loop.** Use
   `World.Go`; o resultado reentra no loop por callback.
3. A I/O de rede roda em goroutines por conexão (`readLoop`/`writeLoop`) que só
   trocam mensagens com o loop por canais. Elas **nunca** tocam o estado.
4. `pMob[]` é um espaço de índices compartilhado: `[0, MaxUser=1000)` são
   jogadores e `[MaxUser, MaxMob)` são mobs/NPCs. Conn `0` é reservada.

### Fila de saída por sessão (importante para estabilidade)

Cada sessão tem uma fila de saída (`Config.OutBuffer`). Se ela enche, o loop
**derruba** a sessão em vez de travar o mundo (proteção contra cliente travado).
O default era 64 e derrubava clientes saudáveis em bursts (teleporte/login em
área cheia envia um `CreateMob` por entidade visível num único tick). Agora é
**512** (`defaultOutBuffer`). Ver `docs/EVOLUCAO.md`.

## 4. Fluxo de uma requisição

```
socket → readLoop (decodifica/desofusca CPSock)
       → evento no canal do loop
       → Dispatcher.Handle  (roteia por Message.Type)
       → handler  (muta o mundo, enfileira respostas)
       → enqueue → writeLoop → socket
```

- O roteamento fica em `tmserver/internal/handler/dispatch.go` (**61** tipos de
  mensagem C→S registrados, agrupados em lotes: login/seleção de personagem,
  movimento, combate, itens, trade, combine, party/guild, chat/misc).
- A sessão segue a máquina de estados `CUser.Mode`:
  `UserEmpty → UserAccept → UserLogin → UserSelChar → UserPlay …`.
- **Comandos de chat** (`/armia`, `/buffs`, `/sair`…) chegam como *whisper* cujo
  alvo é a palavra-chave do comando (quirk do `_MSG_MessageWhisper` legado) e são
  interceptados em `handler/chat.go`.

## 5. Protocolo e paridade com o legado

- **Sem criptografia real.** A camada CPSock é ofuscação por tabela estática
  (`pKeyWord`) + checksum que **não rejeita** por padrão (o ClientPatch
  neutraliza essas checagens no client). `-reject-checksum` fica **desligado**;
  só ligue depois que uma captura confirmar checksums corretos.
- **Layout binário explícito.** Structs de rede usam `pack(1)`; structs de save
  legados usam alinhamento natural MSVC x86. Leia/escreva **por offset**, nunca
  confie no alinhamento de struct do Go. Tamanhos-chave: `STRUCT_MOB` = 816,
  `STRUCT_ACCOUNTFILE` = 7952.
- **Paridade exata de RNG é meta.** O `rand()` LCG do MSVC está reimplementado em
  `tmserver/internal/rng`; drops/refinos/críticos devem casar byte a byte com
  captura controlada. **Preserve a ordem das chamadas de RNG.**
- Senhas/PINs legados eram texto puro; o Go usa **argon2id**
  (`internal/secret`, implementação única). Nunca persista texto puro.

## 6. Dados (PostgreSQL)

Migrations embutidas em `internal/migrations/` (`*.up.sql` / `*.down.sql`),
aplicadas por `store.Migrate` pelo primeiro serviço que subir. Tabelas atuais
(medidas das migrations): `account`, `account_play_code`, `character`, `item`,
`affect`, `guild`, `guild_member`, `guild_relation`, `guild_tower_state`,
`guild_zone`, `castle_quest_state`, `character_pvp_stats`, `kefra_state`,
`sapphire_balance`, `delivery_queue`, `world_event_config|meta|audit`,
`npc_definition`, `npc_shop_item`, `npc_config_meta`, `npc_audit`,
`mob_template_equip`, `mob_template_stat`, `item_price`, `donate_*`,
`daily_reward_*`.

> **Restrição crítica da plataforma web:** a web **nunca escreve** estado vivo de
> personagem (risco de duplicação/lost write contra o loop único). Concessões
> passam pela `delivery_queue`, que o tmServer drena. Ver
> `docs/migration/web-platform-plan.md`.

## 7. Conteúdo do jogo (`Release/`)

Com `-content` setado, o tmServer carrega e valida a árvore `Release/` no boot:
rates e catálogos são **obrigatórios** (erro fatal se o mount estiver quebrado);
os mapas grandes são opcionais (apenas *warning*).

## 8. Referência de flags do tmServer

Quase todas aceitam variável de ambiente `W2PP_*` equivalente.

| Flag | Default | Para que serve |
|---|---|---|
| `-addr` | `:8281` | Porta do jogo (CPSock) |
| `-status-addr` | `:80` | Página de status HTTP (`serv00.htm`) |
| `-dbserver` | `$W2PP_DBSERVER` | Endereço gRPC do dbServer (vazio = no-op) |
| `-binserver` | `$W2PP_BINSERVER` | Endereço gRPC do binServer (vazio = libera tudo) |
| `-content` | `$W2PP_CONTENT` | Caminho de `Release/` |
| `-client-version` | `7640` | `ClientVersion` exigido no login (o build 7662 "Cavaleiros de Kersef" envia **12000**; o compose já usa 12000) |
| `-tls-cert/-tls-key/-tls-ca/-tls-server-name` | env | mTLS interno |
| `-reject-checksum` | `false` | Derruba conexão com checksum inválido |
| `-msg-burst` | `400` | Rajada de mensagens por conexão |
| `-double-exp` | `false` | EXP PvE em dobro |
| `-newbie-event` | `false` | +15% EXP e bônus newbie (<100) |
| `-kefra-live` | `false` | Estado inicial de Kefra derrotado (false = EXP PvE pela metade) |
| `-max-nightmare` | `3` | Admissões contadas por mapa/ciclo de Nightmare |
| `-kefra-entries-per-scroll` | `100` | Entradas na Hall de Kefra por pergaminho |
| `-affect-scale-pct` / `-affect-min-seconds` / `-affect-max-minutes` | `15` / `60` / `10` | Ajuste de duração dos buffs |
| `-npc-editing`, `-mob-stat-editing` | `false` | Overlays de edição por moderadores (precisam de `-dbserver` e `-content`) |
| `-log-sends` | `false` | Loga todo frame S→C (alto volume; só para diagnóstico) |

## 9. Fluxo de desenvolvimento

```bash
make build      # go build ./...
make test       # go test -race -cover ./...
make lint       # golangci-lint v2 (staticcheck/govet/errcheck/gosec)
make vet        # go vet ./...
make fmt        # gofmt + goimports
make vuln       # govulncheck ./...
make proto      # regenera gRPC (protoc + protoc-gen-go[-grpc])
make certs      # certificados mTLS de desenvolvimento
make run        # só o tmserver, persistência no-op
make run-local  # stack completa via docker compose + semeia test/test123
```

Testes de integração do banco ficam atrás da build tag `integration`:
`go test -tags=integration ./internal/store/...`.

Convenções (resumo de `development-guidelines/Go-development-guidelines.md`):
`cmd/<bin>/main.go` só faz wiring; nada de pacotes `util`/`common`; nomes
idiomáticos (`MixedCaps`, sem `Get`); erros como último retorno e embrulhados com
`%w`; `context.Context` como primeiro parâmetro; comente o **porquê** (principalmente
quirks de paridade); testes *table-driven* com `-race`.

## 10. Estado funcional

O status de gameplay vive em `docs/game.md` (✅ funciona / ⏳ pendente). Depois
da revisão que ligou `/guild` e corrigiu a doc de `/create` (que já estava
implementado), restam **3 pendências** declaradas nesse arquivo:

1. `/crias`: teleporte para o drop de crias (Sleipnir e Svaldfire); o código legado
   não traz a coordenada de destino.
2. Destrave do **Arch** (o `/arch` hoje só teleporta).
3. Evento da **Pista das Runas / Uxmal**: inscrição, entrada e saída funcionam, mas
   faltam contagem de kills, chefes, drops de runa, prêmios, portal do Balrog e
   contador do Coelho.

> Atenção: `docs/game.md` já estava defasado em relação ao código uma vez. Em caso
> de dúvida, confirme no `tmserver/internal/handler/chat.go`.

## 11. Mapa de leitura recomendado

1. `README.md` → `CLAUDE.md`
2. `docs/migration/migration-plan.md` (decisões de arquitetura)
3. `docs/migration/data-formats.md` e `docs/migration/domain-model.md`
4. `docs/migration/handlers/` (um arquivo por handler/lote)
5. `docs/migration/parity-tests.md` (como a paridade é validada)
6. `docs/agents/component-deep-analyzer/` (análises profundas do C++: CPSock, TMSrv, DBSrv, BISrv, Basedef)
