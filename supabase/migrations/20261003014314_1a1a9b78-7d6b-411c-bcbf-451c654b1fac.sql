CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS app_private.server_token (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), token_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

CREATE POLICY txn_insert_admin ON public.transactions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.sync_server_token(p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF length(p_hash) <> 64 THEN RAISE EXCEPTION 'Invalid hash'; END IF;
  INSERT INTO app_private.server_token (id, token_hash) VALUES (1, p_hash)
  ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.server_set_txn_status(p_token text, p_ref text, p_status text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, extensions AS $$
DECLARE n integer;
BEGIN
  IF p_status NOT IN ('Completed','Failed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_private.server_token WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.transactions SET status = p_status WHERE provider_ref = p_ref AND status <> p_status;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.sync_server_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_server_token(text) TO authenticated;
REVOKE ALL ON FUNCTION public.server_set_txn_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_set_txn_status(text, text, text) TO anon, authenticated;