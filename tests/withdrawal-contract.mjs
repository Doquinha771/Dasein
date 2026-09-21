import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const code=read('assets/js/app.js');
const migration=read('supabase/migrations/20260921042225_equipa_0_2_2_custody_context.sql');
for(const field of ['p_holder_mode','p_holder_name','p_holder_role','p_purpose','p_purpose_details']) {
 assert.match(code,new RegExp(field));assert.match(migration,new RegExp(field));
}
assert.match(code,/equipa_checkout_with_context/);
assert.match(code,/equipa_checkout_booking_with_context/);
assert.match(code,/Identidade declarada|identidade declarada|Nome informado pelo registrador/);
assert.match(migration,/private\.checkout_with_due_internal/);
assert.match(migration,/private\.checkout_booking_internal/);
assert.match(migration,/v_role='student'::public\.app_role/);
assert.match(migration,/EQUIPA_WITHDRAWAL_NOT_FOUND_OR_FORBIDDEN/);
assert(!/delete\s+from|drop\s+table|truncate\s/i.test(migration),'Migration não pode destruir dados');
assert(!/sb_secret_/i.test(read('assets/js/config.js')),'Não publicar chave secreta');
console.log('PASS: contrato de retirada e reserva, RBAC, preservação e chave pública.');
