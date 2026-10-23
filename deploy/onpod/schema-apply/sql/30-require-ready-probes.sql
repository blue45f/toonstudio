-- Calls every *_require_ready() capability function created by the migrations as the owner role and reports the outcome.
\pset pager off
CREATE TEMP TABLE _probe_result (fn text, outcome text, detail text);
DO $probe$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE '%require\_ready%' AND p.pronargs = 0 ORDER BY p.proname LOOP
    BEGIN
      EXECUTE format('SELECT %s', f.sig);
      INSERT INTO _probe_result VALUES (f.proname, 'PASS', '');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _probe_result VALUES (f.proname, 'FAIL', left(SQLERRM, 160));
    END;
  END LOOP;
END
$probe$;
SELECT fn, outcome, detail FROM _probe_result ORDER BY outcome DESC, fn;
SELECT outcome, count(*) FROM _probe_result GROUP BY 1 ORDER BY 1;
