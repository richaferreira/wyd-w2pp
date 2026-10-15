# Hospedar o servidor para jogar com amigos

Guia prático para colocar a stack no ar. Tudo aqui foi derivado de
`docker-compose.yaml`, `scripts/run-local.sh` e das flags do `tmserver`.

## 1. Requisitos

- Linux com **Docker + Docker Compose v2**.
- Uma máquina com IP acessível pelos jogadores (LAN, VPS ou port-forward).
- Os players precisam do **client WYD 7662** e de um `serverlist.bin` apontando
  para o IP:porta do seu servidor (ver §4). Links de client estão no `README.md`.

## 2. Subir em modo local/LAN (5 minutos)

```bash
git clone https://github.com/Jean1dev/w2pp-OpenWYD.git
cd w2pp-OpenWYD
make run-local          # sobe db + dbserver + binserver + webserver + tmserver
                        # e semeia a conta test / test123
```

O script imprime o `IP:porta` para o client. Contas extras:

```bash
W2PP_LOCAL_ACCOUNT=ana W2PP_LOCAL_PASSWORD='uma-senha-forte' ./scripts/run-local.sh
# ou, com a stack já no ar:
docker compose run --rm dbserver seed-account -name ana -pass 'uma-senha-forte'
```

Contas novas **não têm personagem**: crie no client. Logs: `docker compose logs -f tmserver`.
Parar: `docker compose down`.

## 3. Checklist de segurança antes de abrir para a internet

O compose padrão é feito para **desenvolvimento**. Antes de expor a jogadores
fora da sua rede, faça:

- [ ] **Troque a senha do Postgres.** O default é `dev`. Defina
      `POSTGRES_PASSWORD` (num `.env` fora do git) antes do primeiro `up`.
      O Postgres **não** publica porta no host (só `expose`), mantenha assim.
- [ ] **Não publique a porta `7600` (webServer)** na internet. No compose ela é
      exposta "para o BFF Next.js rodar no host"; em produção o BFF deve estar
      dentro da rede Docker. Remova/restrinja esse `ports:`.
- [ ] **Ligue o mTLS interno** (dbserver/binserver/webserver ficam em rede
      privada, mas é defesa em profundidade):
      `make certs` e
      `docker compose -f docker-compose.yaml -f docker-compose.mtls.yaml up --build`.
- [ ] **Firewall:** abra apenas `8281/tcp` (jogo) e, se quiser a página de status,
      `80/tcp`. Nada de `7514`, `3000`, `7600` ou `5432` para fora.
- [ ] **Backups do Postgres** (volume `pgdata`). Exemplo:
      `docker compose exec db pg_dump -U postgres postgres > backup-$(date +%F).sql`
- [ ] Mantenha `-reject-checksum` **desligado** (padrão). As checagens do client
      são neutralizadas pelo ClientPatch; só ligue depois que uma captura
      confirmar que os checksums chegam corretos (ver `CLAUDE.md`).
- [ ] Não ligue `-log-sends` em produção (volume altíssimo de log).
- [ ] Rode `make vuln` periodicamente (govulncheck).

## 4. Conectar o client

1. No Windows, abra `serverlist editor.exe` (pasta `serverlist bin/` / `Ferramentas.rar`
   do repositório) e configure `SEU_IP:8281`; gere o `serverlist.bin` e coloque na
   pasta do client.
2. O nome dos canais vem do arquivo `sn` na pasta do client (ver `docs/client.md`).
   Distribua `serverlist.bin` + `sn` no patch dos seus jogadores.
3. O client consulta a página de status via HTTP na porta `80` antes de abrir a
   conexão de jogo — por isso o tmServer serve `serv00.htm` em `:80`.
4. Versão: o build 7662 "Cavaleiros de Kersef" envia `ClientVersion = 12000`;
   o `docker-compose.yaml` já passa `-client-version 12000`. Se usar outro client
   (por exemplo o 7.59 do README), ajuste essa flag.

## 5. Configuração de jogo (rates e eventos)

Via flags/variáveis `W2PP_*` do tmserver (lista completa em `docs/GUIA-ARQUITETURA.md` §8):

| Quero… | Variável |
|---|---|
| EXP em dobro | `W2PP_DOUBLE_EXP=true` |
| +15% EXP / bônus newbie | `W2PP_NEWBIE_EVENT=true` |
| Cidade de Kefra aberta desde o início | `W2PP_KEFRA_LIVE=true` |
| Buffs mais longos | `W2PP_AFFECT_SCALE_PCT`, `W2PP_AFFECT_MAX_MINUTES` |

Para passar variáveis ao container, adicione-as em `environment:` do serviço
`tmserver` (ele já lê as flags a partir de `command:`; as `W2PP_*` valem como
default de cada flag).

## 6. Operação do dia a dia

```bash
docker compose ps                         # saúde dos serviços
docker compose logs -f tmserver           # logs do jogo
docker compose restart tmserver           # reinicia só o jogo
docker compose up -d --build              # atualiza após git pull
```

Dica de diagnóstico: se um jogador "congela", procure nos logs por
`session out queue high` / `session out queue full; dropping connection`
(backpressure do socket) e, só durante a investigação, ligue `-log-sends`.

## 7. Limitações conhecidas

- Servidor privado de um jogo comercial: use apenas com **client e conteúdo que
  você tem direito de usar** e esteja ciente de que você é o responsável pela
  operação e pelos dados dos jogadores (contas/senhas).
- Itens ⏳ em `docs/game.md` ainda não existem no servidor Go.
- Alta carga (centenas de jogadores simultâneos) **não foi testada** — o projeto
  não traz teste de carga. Ver o roadmap em `docs/EVOLUCAO.md`.
