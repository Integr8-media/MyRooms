-- Tiny pgTAP subset (invoker rights so RLS applies to the SQL under test).
create table public.tap_results (n serial, ok boolean, descr text, diag text);
grant all on public.tap_results to public; grant all on sequence public.tap_results_n_seq to public;
create function public.tap_add(p_ok boolean, p_descr text, p_diag text default null) returns text language sql as $$
  insert into public.tap_results (ok, descr, diag) values (p_ok, p_descr, p_diag) returning case when ok then 'ok' else 'not ok' end $$;
create function public.plan(int) returns text language sql as $$ select set_config('tap.plan', $1::text, true) $$;
create function public.finish() returns setof text language sql as $$ select 'done' $$;
create function public.ok(boolean, text) returns text language sql as $$ select public.tap_add(coalesce($1, false), $2) $$;
create function public.is(anyelement, anyelement, text) returns text language sql as $$
  select public.tap_add($1 is not distinct from $2, $3, format('got %s, expected %s', $1, $2)) $$;
create function public.is_empty(p_sql text, p_descr text) returns text language plpgsql as $$
declare n int; begin execute 'select count(*) from (' || p_sql || ') q' into n;
  return public.tap_add(n = 0, p_descr, format('%s rows', n)); end $$;
create function public.results_eq(p_sql text, p_expected anyarray, p_descr text) returns text language plpgsql as $$
declare got text[]; exp text[]; begin
  execute 'select coalesce(array_agg(v::text), ''{}'') from (' || p_sql || ') as q(v)' into got;
  exp := array(select unnest(p_expected)::text);
  return public.tap_add(got = exp, p_descr, format('got %s, expected %s', got, exp)); end $$;
create function public.lives_ok(p_sql text, p_descr text) returns text language plpgsql as $$
begin begin execute p_sql; exception when others then
  return public.tap_add(false, p_descr, sqlstate || ': ' || sqlerrm); end;
  return public.tap_add(true, p_descr); end $$;
create function public.throws_ok(p_sql text, p_code text, p_msg text, p_descr text) returns text language plpgsql as $$
begin begin execute p_sql; exception when others then
  return public.tap_add(sqlstate = p_code and (p_msg is null or sqlerrm = p_msg), p_descr,
    format('threw %s: %s', sqlstate, sqlerrm)); end;
  return public.tap_add(false, p_descr, 'did not throw'); end $$;
-- Only the test helpers: a blanket grant would also re-open functions the migrations locked down.
grant execute on function public.tap_add(boolean, text, text), public.plan(int), public.finish(),
  public.ok(boolean, text), public.is(anyelement, anyelement, text), public.is_empty(text, text),
  public.results_eq(text, anyarray, text), public.lives_ok(text, text),
  public.throws_ok(text, text, text, text) to public;
