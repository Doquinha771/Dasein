# Implantação 0.2.1 Alpha — preparação do piloto

1. Fazer backup do banco e confirmar que a restauração funciona em ambiente separado.
2. Aplicar somente a migration ainda não registrada: `20260919190000_equipa_0_2_1_pilot_readiness.sql`.
3. Executar os advisors de segurança e desempenho do Supabase e corrigir erros antes de continuar.
4. Publicar novamente a função `equipa-admin-users`.
5. Configurar `EQUIPA_ALLOWED_ORIGINS` como lista separada por vírgula, por exemplo `https://usuario.github.io,https://dominio-da-escola.example`.
6. Confirmar que o Data API expõe apenas os schemas necessários e que todas as tabelas expostas possuem RLS ativa.
7. Testar as RPCs com contas de aluno, professor e administrador. Usuários não administradores devem receber erro nas três RPCs novas.
8. Executar `PILOT-TEST-MATRIX.md` com duas sessões e registrar evidências.
9. Publicar os arquivos estáticos no GitHub Pages somente depois dos testes de banco.

Não execute novamente migrations antigas já registradas. O GitHub Pages não aplica SQL automaticamente.
