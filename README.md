# Equipa

Sistema web para controle de equipamentos escolares, com Supabase (autenticação, PostgreSQL e RLS) e frontend estático para GitHub Pages.

**Versão: 0.2.6 Alpha.** Interface para desktop e celular.

## Funções

```text
Inventário de equipamentos com QR Code permanente
Identificação de computadores disponíveis, em uso, atrasados ou em manutenção
Retirada individual e em lote com responsável, recebedor, destino, finalidade e prazo
Devolução e conferência individual dos itens
Histórico de movimentações, registros de manutenção e auditoria
Movimentações recentes em linha do tempo no celular
Busca contextual e preenchimento assistido com resultados autorizados ao perfil
Tema escuro e claro para as telas principais, formulários, modais e filtros
Administração de usuários e equipamentos, com regras de acesso no servidor
```

## Alterações da 0.2.6

No celular, a barra superior apresenta somente busca global e notificações, sem botão de menu lateral e sem o nome duplicado junto da pesquisa. As opções secundárias, sair e alternar o tema estão no menu **Mais** da barra inferior. O cartão de boas-vindas na tela Início usa a paleta azul de Retiradas. O modo escuro foi revisado em todas as abas, incluindo campos, dropdowns, filtros, tabelas e janelas; a busca continua disponível na aba Retiradas.

Este hotfix modifica somente o frontend. Nenhuma nova migration nem modificação no Supabase são necessárias. Consulte `RELEASE-0.2.6.md`.

## Alterações da 0.2.5

As buscas em Equipamentos e Retiradas atualizam somente os resultados, sem reconstruir a aba nem derrubar o foco do teclado. Nas buscas de Carrinhos e Manutenção, a página só é atualizada ao confirmar com Enter ou sair do campo, para impedir telas de carregamento durante a digitação. Histórico, Auditoria e Usuários usam atraso maior entre consultas. As sugestões continuam disponíveis, sem escolher automaticamente a primeira opção ao pressionar Enter.

A previsão de devolução vem preenchida com a **data atual da escola às 21h15**. São Paulo é a referência de horário. Quando o prazo de hoje já não é válido, é necessário escolher outra data; o horário máximo de qualquer data continua sendo 21h15. Uma trigger do banco também rejeita previsões posteriores ao limite, inclusive fora do formulário.

A área de notificações mostra registros recentes de retirada e devolução, atualizando enquanto o site está aberto, a cada 45 segundos (não é notificação nativa do aparelho). Alunos com conta escolar ativa podem consultar, na lista de equipamentos em uso, o nome da pessoa em posse, com indicação de identidade declarada quando pertinente; não são expostos e-mail, RA ou data de nascimento de terceiros.

Todas as janelas do sistema possuem botão de fechar vermelho, acessível por toque ou mouse; filtros mobile, notificações, scanner e menu adicional recebem controles visíveis também no tema escuro.

O Supabase do projeto `oxcfbsrukzfnzkivatsn` **já recebeu** a migration `20260921050807_equipa_0_2_5_school_cutoff_activity.sql`. Não a execute novamente nesse projeto. Os dados existentes foram mantidos. Consulte `RELEASE-0.2.5.md`.

## Alterações da 0.2.4

Removidos os títulos, ícones grandes, descrições e trilhas de navegação redundantes do topo das abas Equipamentos, Retiradas, Histórico, Carrinhos, Manutenção, Relatórios, Auditoria e Administração, no desktop e no celular. A posição atual continua indicada pela navegação selecionada. A saudação pessoal e os títulos de seções que identificam dados úteis permanecem. Os títulos das páginas são preservados para leitores de tela por cabeçalhos visualmente ocultos e por `aria-label` no conteúdo principal.

As ações de cada aba foram mantidas, incluindo cadastrar equipamento, nova retirada, novo carrinho e exportar relatório. Os botões de ação no celular compartilham o mesmo azul da tela de retiradas, inclusive a ação de leitura QR na barra inferior; botões de status de alerta ou manutenção mantêm as cores semânticas. O modo escuro utiliza a mesma paleta de ação, com contrastes específicos para fundos escuros.

Esta atualização é **apenas do frontend**: não modifica o banco, as migrations, os QR Codes nem os dados operacionais. Publique os arquivos do pacote para disponibilizar a nova interface; consulte `RELEASE-0.2.4.md`.

## Alterações da 0.2.3

A tela **Retiradas** agora mostra o inventário operacional, incluindo equipamentos *em uso* e *não em uso*. A tabela desktop e os cartões mobile distinguem quem registrou de quem recebeu a máquina; o status destaca OK, atenção e problema. O painel móvel apresenta as movimentações recentes na forma de uma jornada: retirada registrada → com responsável → devolução prevista, atrasada ou concluída. Os horários indicados como previstos não são apresentados como eventos já ocorridos.

O fluxo de **novas reservas foi desativado**: não há navegação ou formulários de reserva e as RPCs públicas relacionadas tiveram a execução revogada no Supabase. **A tabela histórica `reservations` e os registros antigos são mantidos** por integridade e rastreabilidade. Não apague a tabela, funções internas, QR Codes ou migrations antigas para economizar espaço.

A pesquisa sugere códigos, modelos, turmas, nomes e locais que a conta autenticada pode consultar. A escolha de um perfil conhecido pode preencher seu vínculo no formulário de retirada, mas o recebedor indicado por terceiros continua sendo uma informação declarada, não uma autenticação da pessoa.

## Publicação

1. Faça backup dos dados antes de qualquer alteração futura no banco.
2. A migration `supabase/migrations/20260921044245_equipa_0_2_3_retire_bookings.sql` **já foi aplicada** ao projeto Supabase `oxcfbsrukzfnzkivatsn`. Não há necessidade de executá-la novamente nesse banco.
3. Envie os arquivos da raiz deste pacote para a raiz de publicação do seu GitHub Pages, substituindo a versão anterior e mantendo `.nojekyll`.
4. Confira em celular e desktop: login, estados de uso, busca, retirada, devolução, modo escuro e linha do tempo.

O ZIP é um pacote de **publicação, não uma prova de deploy**. Não houve acesso autenticado para testar os fluxos com contas reais no ambiente publicado. Veja `RELEASE-0.2.6.md` para instruções e limites dos testes.

## Segurança

Use somente a chave publicável do Supabase no frontend. Nunca publique chaves secretas ou `service_role`. O servidor valida operações e a RLS limita as informações exibidas. O QR identifica a máquina, mas não autoriza uma retirada sozinho.
