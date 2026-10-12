-- ============================================================================
-- 0003_functions.sql — application reference numbers, status history, audit
-- Idempotent: safe to re-run.
-- ============================================================================

-- Human-readable, collision-safe application reference: VX-YY-XXXXXX
create or replace function public.next_application_reference()
returns text language plpgsql as $$
declare seq bigint; yy text := to_char(now(), 'YY');
begin
  loop
    seq := (floor(random() * 900000) + 100000)::bigint;
    if not exists (select 1 from public.applications where reference_no = 'VX-' || yy || '-' || seq) then
      return 'VX-' || yy || '-' || seq;
    end if;
  end loop;
end $$;

-- Every status change is recorded with actor + note (staff writes go through here)
create or replace function public.record_application_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.application_status_history (application_id, old_status, new_status, note, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end,
            new.status, new.status_note, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_app_status_history on public.applications;
create trigger trg_app_status_history
  after insert or update of status on public.applications
  for each row execute function public.record_application_status_change();

-- Fee changes on service_fees are journalled (who, when, old -> new)
create or replace function public.record_service_fee_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.amount is distinct from old.amount or new.currency is distinct from old.currency then
    insert into public.service_fee_history (service_fee_id, changed_by, previous_amount, new_amount, currency)
    values (new.id, auth.uid(), old.amount, new.amount, new.currency);
  end if;
  return new;
end $$;

drop trigger if exists trg_service_fee_history on public.service_fees;
create trigger trg_service_fee_history
  after update on public.service_fees
  for each row execute function public.record_service_fee_change();
