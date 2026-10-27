CREATE TABLE public.login_rate_limits (
  key text PRIMARY KEY CHECK (key ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL CHECK (attempts > 0),
  window_started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_rate_limits TO service_role;
CREATE OR REPLACE FUNCTION public.take_login_attempt(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.login_rate_limits; elapsed integer;
BEGIN
  DELETE FROM public.login_rate_limits WHERE window_started_at < now() - interval '1 day';
  INSERT INTO public.login_rate_limits AS limits(key,attempts,window_started_at)
  VALUES(p_key,1,now())
  ON CONFLICT(key) DO UPDATE SET
    attempts = CASE WHEN limits.window_started_at <= now() - interval '15 minutes' THEN 1 ELSE least(limits.attempts + 1,1000000) END,
    window_started_at = CASE WHEN limits.window_started_at <= now() - interval '15 minutes' THEN now() ELSE limits.window_started_at END
  RETURNING * INTO r;
  elapsed := greatest(1,ceil(extract(epoch FROM (r.window_started_at + interval '15 minutes' - now())))::integer);
  RETURN jsonb_build_object('allowed',r.attempts <= 5,'retryAfterSeconds',CASE WHEN r.attempts > 5 THEN elapsed ELSE 0 END);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.take_login_attempt(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.take_login_attempt(text) TO service_role;
