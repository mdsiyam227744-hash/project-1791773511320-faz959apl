-- ============================================================================
-- 0003_functions.sql — application reference numbers, status history, audit
-- Idempotent: safe to re-run.
-- Dollar-quote tags are named ($fn$).
-- ============================================================================

-- Human-readable, collision-safe application reference: VX-YY-XXXXXX
create or replace function public.next_application_reference()
returns text language plpgsql as $fn$
declare seq bigint; yy text := to_char(now(), 'YY');
begin
  loop
    seq := (floor(random() * 900000) + 100000)::bigint;
    if not exists (select 1 from public.applications where reference_no = 'VX-' || yy || '-' || seq) then
      return 'VX-' || yy || '-' || seq;
    end if;
  end loop;
end $fn$;

-- Every status change is recorded with actor + note. Draft rows never create
-- history entries: the application first appears in history when it is
-- submitted for review.
create or replace function public.record_application_status_change()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if (tg_op = 'INSERT' and new.status <> 'draft')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and old.status <> 'draft') then
    insert into public.application_status_history (application_id, old_status, new_status, note, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end,
            new.status, new.status_note, auth.uid());
  elsif (tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'submitted') then
    insert into public.application_status_history (application_id, old_status, new_status, note, changed_by)
    values (new.id, 'draft', new.status, new.status_note, auth.uid());
  end if;
  return new;
end $fn$;

drop trigger if exists trg_app_status_history on public.applications;
create trigger trg_app_status_history
  after insert or update of status on public.applications
  for each row execute function public.record_application_status_change();

-- Optional transition guard: refuses invalid customer-facing transitions and
-- any edit of a submitted application by its owner.
create or replace function public.guard_application_transition()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare actor_is_staff boolean := public.is_staff();
begin
  -- Customers own drafts: only draft->draft (edits) and draft->submitted allowed.
  if not actor_is_staff then
    if old.status = 'draft' and new.status in ('draft','submitted') then
      return new;
    end if;
    raise exception 'This application can no longer be modified by the applicant' using errcode = '42501';
  end if;
  -- Staff: forbid silently reopening a decided case.
  if old.status in ('approved','refused','withdrawn','closed') and new.status not in ('closed','withdrawn') then
    raise exception 'Invalid status transition from a decided state' using errcode = '23514';
  end if;
  return new;
end $fn$;

drop trigger if exists trg_app_transition_guard on public.applications;
create trigger trg_app_transition_guard
  before update of status on public.applications
  for each row execute function public.guard_application_transition();

-- Fee changes on service_fees are journalled (who, when, old -> new)
create or replace function public.record_service_fee_change()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.amount is distinct from old.amount or new.currency is distinct from old.currency then
    insert into public.service_fee_history (service_fee_id, changed_by, previous_amount, new_amount, currency)
    values (new.id, auth.uid(), old.amount, new.amount, new.currency);
  end if;
  return new;
end $fn$;

drop trigger if exists trg_service_fee_history on public.service_fees;
create trigger trg_service_fee_history
  after update on public.service_fees
  for each row execute function public.record_service_fee_change();
