-- Remove indice duplicado criado na primeira instalacao do hotfix.
-- audit_events_occurred_idx, equivalente, permanece intacto.
drop index if exists public.audit_events_occurred_desc_idx;
