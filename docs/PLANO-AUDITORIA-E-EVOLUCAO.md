# Plano de auditoria e evolução — WYD W2PP

Este documento separa fatos confirmados por inspeção de código/configuração dos testes que ainda precisam ser executados. Não substitui a validação com o cliente WYD 7662/protocolo 7640.

## Alterações desta branch

- Adiciona `docker-compose.production.yaml`, overlay para exigir senha do PostgreSQL e remover a publicação externa da porta 7600 do webServer.
- Mantém o Compose principal adequado ao fluxo de desenvolvimento já documentado; a configuração endurecida é opt-in e não altera o caminho local de forma silenciosa.

## Achados confirmados na configuração/documentação

### P0 — Configuração insegura se o Compose de desenvolvimento for exposto

O Compose base permite `POSTGRES_PASSWORD` com fallback para `dev`, publica a porta 7600 do webServer e documenta conexões gRPC internas sem TLS por padrão. O guia `docs/HOSPEDAR-COM-AMIGOS.md` já recomenda não expor 7600, trocar a senha e ativar mTLS antes de abrir o servidor à internet.

**Mitigação nesta branch:** usar o overlay de produção, que exige `POSTGRES_PASSWORD` e remove a publicação da porta 7600. Isso não substitui firewall, TLS confiável, gestão de segredos nem revisão da infraestrutura.

### P1 — Senhas de demonstração

`scripts/run-local.sh` semeia por padrão a conta local `test` / `test123`. É útil para desenvolvimento, mas a conta não deve ser reutilizada em ambientes públicos. Use credenciais de demonstração somente em uma instância isolada e recrie/retire a conta antes da publicação.

### P1 — Integridade do estado do mundo

A arquitetura de `tmserver/internal/world` depende de um único proprietário do estado do mundo. Essa regra protege contra mutações concorrentes e duplicação de itens. Toda chamada bloqueante de banco/billing deve permanecer fora do loop e retornar resultados por eventos/canais, conforme as diretrizes do projeto.

**Validação necessária:** testes de concorrência com `-race`, desconexão durante salvamento, falha/timeout de backend e operações concorrentes de inventário/warehouse/trade.

### P1 — Backups e recuperação

O guia de hospedagem descreve backup manual do PostgreSQL, mas o procedimento precisa ser automatizado e acompanhado de teste de restauração. Um arquivo de backup sem uma restauração ensaiada não comprova capacidade de recuperação.

**Validação necessária:** backup automatizado, política de retenção, armazenamento fora do host e teste periódico de restore em uma instância isolada.

### P2 — Capacidade e observabilidade

A documentação de evolução descreve uma correção da fila de saída por sessão (buffer padrão aumentado para absorver rajadas). O tamanho da fila é uma proteção contra rajadas, não uma prova de capacidade ou de ausência de clientes lentos.

**Validação necessária:** simular múltiplas sessões, login/teleporte em áreas cheias, clientes lentos e desconexões; registrar latência do loop, profundidade máxima das filas, goroutines, memória e erros de backend.

## Checklist de validação antes de produção

- [ ] Usar Docker Compose v2.24.4 ou superior para o overlay `!reset`.
- [ ] Definir uma senha aleatória longa para PostgreSQL, com caracteres seguros para uso em URL, e não a registrar no Git.
- [ ] Confirmar que a porta 7600 não está publicada no host: `docker compose -f docker-compose.yaml -f docker-compose.production.yaml config`.
- [ ] Ativar mTLS com certificados de uma autoridade confiável para o ambiente; os certificados gerados por `make certs` são destinados a desenvolvimento/teste.
- [ ] Expor somente as portas de jogo/status que realmente forem necessárias e restringir as regras no firewall.
- [ ] Remover contas de demonstração e verificar que segredos não aparecem nos logs.
- [ ] Executar `make fmt`, `make vet`, `make test`, `make lint` e `make vuln`.
- [ ] Executar testes de integração com PostgreSQL e validar login, criação de personagem, salvamento, reconexão e restauração.
- [ ] Fazer teste com o cliente real compatível antes de alterar protocolo ou estruturas binárias.
- [ ] Testar backup e restore antes de anunciar o servidor.

## Ordem sugerida para próximas mudanças

1. Segurança operacional e segredos.
2. Testes de persistência e recuperação.
3. Robustez de sessão, timeouts e backpressure.
4. Testes de carga e métricas.
5. Evolução de gameplay com testes de regressão por handler e comparação com a referência legada.

### P1 — Entrega de itens com depósito cheio

A auditoria do fluxo `World.ApplyDeliveries` encontrou que os itens da fila `delivery_queue` eram marcados como perdidos quando o depósito da conta estava cheio. Isso poderia descartar permanentemente uma compra da loja ou uma recompensa diária.

**Correção nesta branch:** os itens que não couberem permanecem pendentes para uma próxima tentativa após o jogador liberar espaço. Os IDs entregues continuam sendo confirmados junto com a gravação do depósito em uma transação.

**Risco residual:** o caminho de falha/timeout do salvamento assíncrono precisa de teste dedicado para comprovar que a confirmação da fila e o estado em memória não divergem nem duplicam itens em caso de falha do backend. A correção reduz perda por depósito cheio, mas não é, isoladamente, uma certificação completa de entrega exatamente-uma-vez.

## Limites desta revisão

A leitura remota de arquivos não executa a aplicação, não confirma comportamento em runtime e não substitui a suíte de testes. Não declarar a instância pronta para produção até que os comandos e os testes acima sejam executados em ambiente controlado.
