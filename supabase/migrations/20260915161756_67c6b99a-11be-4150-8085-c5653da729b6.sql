ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_code text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider_ref text;
CREATE INDEX IF NOT EXISTS transactions_provider_ref_idx ON public.transactions (provider_ref);