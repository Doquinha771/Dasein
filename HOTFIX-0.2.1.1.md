# Equipa 0.2.1.1: recuperação + foco mobile

## Recuperação segura do ambiente que está fora do ar

1. Identifique o **projeto Equipa** no painel Supabase. Não execute SQL em projetos de outras aplicações.
2. Faça **backup** do banco atual e valide a restauração em um ambiente separado. Não execute `supabase db reset`, `DROP`, `TRUNCATE`, nem reaplique toda a pasta migrations.
3. Rode **supabase/DIAGNOSTICO-RECUPERACAO.sql** no SQL Editor. Verifique se existem `profiles`, `equipments`, `audit_events`, `withdrawals`, `reservations`, a RPC `equipa_access_allowed` e as funções exigidas pelo aplicativo. Compare a lista de migrations com os arquivos da pasta `supabase/migrations`.
4. Se faltarem migrations antigas, aplique **somente as ausentes em ordem**, uma a uma, após inspecionar suas pré-condições. Algumas migrations antigas contêm autotestes que exigem uma conta administrativa ativa. Não pule ou repita migrations de maneira indiscriminada.
5. Se o banco já tiver todas as migrations até `20260919190000_equipa_0_2_1_pilot_readiness.sql`, aplique **somente** `20260919210000_equipa_0_2_1_1_mobile_recovery_storage.sql`. Se não, primeiro complete as dependências ausentes de forma controlada.
6. Para o agendamento automático, habilite **Supabase Cron** (Integrations > Cron) antes da migration. Se habilitar depois, rode `supabase/INSTALL-CRON.sql` no SQL Editor. Confirme o job `equipa-audit-pressure` ativo. Não coloque a limpeza no JavaScript público.
7. Valide login, cadastro, equipamento, QR Code, reserva, retirada, devolução, painel admin e auditoria com contas de teste autorizadas. Só publique esta versão depois disso.
8. Publique **todo o conteúdo da raiz** do ZIP no GitHub Pages, inclusive `assets` e `supabase` (este último permanece apenas como documentação/SQL no repositório: o GitHub Pages não aplica migrations). Recarregue o navegador ignorando cache.

Se `pg_database_size` já ultrapassou a cota e o Supabase colocou o projeto em modo somente leitura, o cron não consegue apagar dados nesse estado. Consulte as instruções oficiais de read-only no painel Supabase; não desative proteções sem backup e diagnóstico. O site agora informa incompatibilidades sem deixar apenas o carregamento infinito.

## Política de espaço

- Banco Free: limite de **500 MB de database size** (não se confunde com tamanho de disco ou Storage).
- Limpeza sob pressão quando o banco alcança **350 MB**, ou quando a tabela de auditoria (dados + índices) alcança **48 MB**.
- Exclusão limitada a **4.000 auditorias antigas por execução**, apenas em `public.audit_events`, preservando os últimos **30 dias**.
- Rotina programada: diariamente às 02:05 UTC **se Supabase Cron estiver ativado**. Rotinas existentes para recibos técnicos não fazem parte da limpeza por pressão.
- O sistema não apaga equipamentos, QR Codes, reservas, retiradas, devoluções, usuários, histórico operacional ou manutenção. Se os dados protegidos dominarem o armazenamento, a solução é rever a infraestrutura/cota e não apagar registros.
- `DELETE` não libera imediatamente espaço físico. Autovacuum permite reaproveitar páginas; revisar estatísticas depois da limpeza. Não executar `VACUUM FULL` automaticamente em produção.

## Modelo de cálculo para dez anos

A projeção usa `10 x 365 = 3.650 dias` e o tamanho médio observado de cada registro com os índices. Execute `supabase/CALCULO-CAPACIDADE.sql` **no banco real** e ajuste os cenários à escola. Exemplo ilustrativo: 100 retiradas/dia durante 10 anos equivalem a **365.000 retiradas**. Com 2 KB para a retirada e 1 KB por item, um único item por retirada consome aproximadamente **1.095 MB apenas em histórico operacional**. Com 20 retiradas/dia, são 73.000 retiradas, aproximadamente **219 MB** nas mesmas hipóteses, sem contar contas, reservas, auditorias e crescimento de índices. Portanto, nenhuma exclusão só de auditoria pode garantir dez anos no plano de 500 MB para qualquer carga de uso.

## O que mudou no site

- Sessão não é destruída por erro temporário de rede ao renovar token.
- Falhas de perfil/RLS e funções ausentes deixam aviso de diagnóstico com código e botão de tentativa, em vez de descarte silencioso de conta ou loading interminável.
- Administração consulta `equipa_admin_capacity` (com fallback para a RPC antiga durante atualização), informa uso medido, auditoria e estado do agendador.
- Campos, formulários, diálogos e cartões foram ajustados para toque e leitura em celulares pequenos; fonte de 16 px nos inputs evita zoom inesperado no iOS.
- Cache busting dos arquivos do GitHub Pages atualizado; versão 0.2.1.1 Alpha.

## Segurança

Apenas a **publishable key** deve aparecer em `assets/js/config.js`. Qualquer secret key compartilhada em conversa, issue, commit, ZIP ou página pública deve ser **revogada/rotacionada imediatamente** no Supabase. Não é necessário colar segredo administrativo no GitHub Pages.

**Estado de validação:** arquivos e verificações locais podem ser testados aqui. A integridade do banco remoto, a aplicação efetiva da migration e o funcionamento completo dos papéis de acesso exigem acesso autorizado ao projeto Equipa e testes no ambiente conectado. Não confundir pacote preparado com banco já consertado.
