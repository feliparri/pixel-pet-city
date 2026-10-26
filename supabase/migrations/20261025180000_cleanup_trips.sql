-- Housekeeping: forget the days of the past (the same function the trips use, now also clearing pet_days older than 7 days).
create or replace function public.cleanup_trips() returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; k integer;
begin
  update trips set status = 'expired' where status = 'waiting' and expires_at < now();
  get diagnostics k = row_count; n := n + k;
  delete from trips where status in ('closed', 'cancelled') and updated_at < now() - interval '7 days';
  get diagnostics k = row_count; n := n + k;
  delete from trips where status = 'expired' and updated_at < now() - interval '30 days';
  get diagnostics k = row_count; n := n + k;
  delete from pet_days where updated_at < now() - interval '7 days';
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke all on function public.cleanup_trips() from public, anon, authenticated;
grant execute on function public.cleanup_trips() to service_role;
