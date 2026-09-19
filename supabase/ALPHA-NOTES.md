# Equipa 0.2.0 Alpha · Anotações técnicas

A plataforma permanece no GitHub Pages (frontend estático) e no mesmo projeto Supabase já utilizado pelo Aloca+/Dasein/Equipa. O Pages não executa migrations.

## Dados e compatibilidade

As migrations da Alpha acrescentam campos à tabela de reservas e aos itens de retirada, criam uma tabela pequena para recibos temporários e mantêm os UUIDs, os QRs e as chaves estrangeiras anteriores. O estado físico de equipamento continua em `available`, `in_use`, `maintenance` ou `unavailable`; reservas futuras pertencem à agenda e não alteram automaticamente o estado físico para `reserved`.

Reservas por quantidade são formadas por linhas em `reservations` compartilhando `batch_id` e `start_at`. O índice de exclusão GiST já existente impede horários conflitantes por equipamento. Um checkout atribui o mesmo `withdrawal_id` às linhas da mesma ocorrência. A constraint de unicidade antiga em `reservations.withdrawal_id` foi substituída por índice não único porque uma retirada em lote corresponde a vários itens reservados.

## Segurança

Os novos endpoints são invocadores no schema `public`; suas implementações privilegiadas permanecem no schema `private` com verificação de `auth.uid()` e cargo ativo. Anônimos não recebem EXECUTE. Consultas diretas de reservas continuam sujeitas a RLS. Recibos de idempotência têm RLS ativa, sem concessões de leitura ou escrita para o navegador.

## Limites do Alpha

A reserva por quantidade é atômica; o backend retorna falta de estoque sem criar reserva parcial. A recorrência semanal pode ter até 12 ocorrências, no máximo 60 equipamentos, com até 90 dias de antecedência. A prévia é informativa: o backend valida e bloqueia novamente ao confirmar.

A devolução registra cada condição, sem concluir a retirada enquanto houver itens ausentes ou pendentes. Uma avaria cancela futuras reservas confirmadas daquele equipamento e abre registro de manutenção; a escola deve comunicar operacionalmente os responsáveis pelas reservas canceladas. O sistema ainda não envia avisos externos automatizados. Equipamentos atualmente emprestados não entram nas seleções de novas reservas em lote, mesmo que o prazo de devolução seja anterior à data solicitada; esta decisão conservadora evita prometer equipamento antes da conferência de retorno.

## Testes e publicação

O teste transacional versionado usa registros sintéticos com rollback e não deixa computadores fictícios no inventário. A execução depende de uma conta administradora ativa no banco. Testes de autenticação end-to-end, corrida real entre processos distintos e o fluxo físico de uma turma ainda devem ser conduzidos em ambiente de teste/piloto antes do uso geral. O teste de interface foi feito com sessão e respostas simuladas para os perfis Aluno/Administrador em desktop e mobile. O teste HTTP em navegador foi bloqueado pelo ambiente de execução e não foi contabilizado como aprovação.

A Alpha não implementa ainda um novo cargo Funcionário/Técnico com suas políticas, notificações externas automáticas, importação DOCX estruturada ou uma rotina automática de limpeza/arquivamento de todos os logs históricos. O código do frontend no GitHub Pages continua público por natureza; a autorização é imposta no Supabase e não pela ocultação dos arquivos. Os textos legais precisam de revisão e identificação do canal de privacidade pela unidade escolar antes de adoção geral.

Para uma instalação totalmente nova, os arquivos históricos deste pacote pressupõem o esquema-base do Aloca+ (migrations antigas anteriores à conversão para web). O pacote da Alpha não substitui o backup integral desse esquema-base. Não execute migrations antigas novamente sobre a produção já atualizada.


## 0.2.1 Alpha — Inventário e cadastro

- `equipment_models`: modelos técnicos reutilizáveis, RLS administrativa.
- `equipments`: processador, RAM, armazenamento e SO preservados no equipamento.
- `equipa_register_equipment_batch`: inserção transacional de 1–200 itens; rejeita duplicados; retorno dos UUIDs e QR tokens.
- `equipa_existing_codes`: prévia consultando inventário, sem substituir a restrição única no banco.
- Números/códigos são únicos na base da unidade escolar, ignorando caixa e espaços externos. A estrutura atual é de uma escola por banco; implantação multiescola exigiria `school_id` e política de escopo própria.
- Recibos temporários de idempotência são limpos depois de 14 dias durante novos cadastros, minimizando o impacto no limite do PostgreSQL.
- Teste transacional de 30 equipamentos, prévia e uso de modelos aprovado no Supabase; interfaces desktop/mobile validadas com backend simulado.
- Importação DOCX requer tabela com cabeçalhos; documentos Word de texto livre não são interpretados.
- PDF e importação Excel dependem de bibliotecas de carregamento sob demanda via CDN; o teste de composição PDF usou renderizador simulado, sendo necessária validação do download real no navegador da escola.
- Antes do uso geral: testar duas sessões ADM confirmando o mesmo código simultaneamente, PDF impresso, arquivo real XLSX/DOCX e restauração a partir das migrations.

## 0.2.1 Alpha — preparação do piloto

- usuários e auditoria passaram a usar RPCs paginadas, busca limitada e filtros no servidor;
- o gráfico diário de relatórios é agregado no PostgreSQL e não baixa reservas/retiradas completas para o navegador;
- foi corrigida a ausência de `ilike` no cliente REST local, método já utilizado pelos filtros do inventário;
- a retenção de auditoria possui apenas prévia de volume; nenhuma limpeza destrutiva é ativada sem política aprovada;
- a Edge Function administrativa aceita uma allowlist em `EQUIPA_ALLOWED_ORIGINS` e não devolve detalhes internos em erros 500;
- aplicar `20260919190000_equipa_0_2_1_pilot_readiness.sql` e seguir `DEPLOY-0.2.1-PILOT.md` antes de publicar.
