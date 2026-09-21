import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const code=read('assets/js/app.js');
const migration=read('supabase/migrations/20260921042225_equipa_0_2_2_custody_context.sql');
for(const field of ['p_holder_mode','p_holder_name','p_holder_role','p_purpose','p_purpose_details']) {
 assert.match(code,new RegExp(field));assert.match(migration,new RegExp(field));
}
for(const feature of ['equipa_checkout_with_context','renderMobileMovementJourney','operationalState','renderOpsRows','bindSmartSearch','setupSmartInputs'])assert.match(code,new RegExp(feature));
assert.doesNotMatch(code,/(?:data-go|data-open|data-view)="reservations"|data-reserve|renderReservations\(/,'Reserva removida da navegação e das operações');
assert.doesNotMatch(code,/equipa_checkout_booking_with_context|create_quantity_reservation/,'Fluxos de reserva removidos do cliente');
assert.match(migration,/private\.checkout_with_due_internal/);
assert.match(migration,/v_role='student'::public\.app_role/);
assert(!/delete\s+from|drop\s+table|truncate\s/i.test(migration),'Migration de custódia não pode destruir dados');
assert(!/sb_secret_/i.test(read('assets/js/config.js')),'Não publicar chave secreta');
console.log('PASS: retirada com custódia, inventário operacional, jornada mobile, busca assistida, reservas fora do cliente e chave pública.');
