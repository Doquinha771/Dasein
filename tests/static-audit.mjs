import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('assets/js/app.js');
const browserClient = read('assets/js/supabase.js');
const config = read('assets/js/config.js');
const migration = read('supabase/migrations/20260919205228_equipa_0_2_1_pilot_readiness.sql');
const edge = read('supabase/functions/equipa-admin-users/index.ts');

assert(!/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(config), 'Segredo administrativo encontrado no config do navegador');
assert(!/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(browserClient), 'Segredo administrativo encontrado no cliente do navegador');
assert.match(browserClient, /ilike\(column, value\)/, 'QueryBuilder precisa suportar ilike usado pelos filtros');
assert.match(app, /equipa_admin_user_page/, 'Administração deve usar paginação no servidor');
assert.match(app, /equipa_admin_audit_page/, 'Auditoria deve usar paginação no servidor');
assert.match(app, /equipa_admin_report_dashboard/, 'Relatórios devem usar agregação no servidor');
assert(!/from\("reservations"\)\.select\([^\n]*quantity/.test(app), 'Relatório não pode consultar reservations.quantity');
assert.match(migration, /EQUIPA_ADMIN_REQUIRED/g, 'RPCs administrativas precisam validar o cargo no backend');
assert.match(migration, /revoke all on function public\.equipa_admin_user_page/, 'RPC de usuários precisa negar PUBLIC/anon');
assert.match(migration, /revoke all on function public\.equipa_admin_audit_page/, 'RPC de auditoria precisa negar PUBLIC/anon');
assert.match(migration, /destructive_cleanup_enabled',false/, 'Retenção não pode apagar auditoria sem política aprovada');
assert.match(edge, /ADMIN_REQUIRED/, 'Função administrativa precisa validar o administrador atual');
assert.match(edge, /ORIGIN_NOT_ALLOWED/, 'Função administrativa precisa rejeitar origens não autorizadas quando configuradas');

console.log('Static audit: 13 checks passed.');
