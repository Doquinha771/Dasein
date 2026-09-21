-- Espelho da migration ja aplicada em producao: preservar registros ao excluir contas.
-- A operacao deixa as referencias nulas, sem excluir registros operacionais.
alter table public.withdrawals alter column requested_by drop not null;
alter table public.reservations alter column user_id drop not null;
alter table public.maintenance_events alter column opened_by drop not null;
alter table public.withdrawals drop constraint if exists withdrawals_requested_by_fkey;
alter table public.withdrawals add constraint withdrawals_requested_by_fkey foreign key (requested_by) references public.profiles(id) on delete set null;
alter table public.reservations drop constraint if exists reservations_user_id_fkey;
alter table public.reservations add constraint reservations_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;
alter table public.maintenance_events drop constraint if exists maintenance_events_opened_by_fkey;
alter table public.maintenance_events add constraint maintenance_events_opened_by_fkey foreign key (opened_by) references public.profiles(id) on delete set null;
