-- Equipa 0.3.3: no data/QR deletion, safe and additive to the current catalog.
-- 'equipments_code_key' is a UNIQUE constraint index which already serves
-- equality lookup and sorting by code; the old duplicate index is redundant.
drop index if exists public.equipments_code_idx;
-- Supports the inventory's "recent" order after a successful registration.
create index if not exists equipa_equipments_active_recent_idx
  on public.equipments (updated_at desc, id) where is_active = true;
comment on index public.equipa_equipments_active_recent_idx is
  'Consulta ordenada dos equipamentos ativos mais recentes; otimiza atualização imediata do inventário após cadastro.';
