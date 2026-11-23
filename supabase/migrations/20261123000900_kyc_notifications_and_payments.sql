-- ============================================================================
-- SILVER SPOON — Phase B Migration 0009
-- Modules H, I & K: Vendor-Agnostic KYC Metadata, Notifications & Payment Audit (Tables 31-40)
-- Tables: kyc_records, kyc_documents, kyc_reviews, compliance_events,
--         notifications, notification_preferences,
--         payment_providers, payment_references, payment_events, webhook_logs
--
-- ADR-006: No KYC provider selected yet. Zero real BVN/NIN or real document
-- uploads are permitted in Phase B staging.
-- ADR-002: Paystack provider seeded disabled (is_enabled = false).
-- ============================================================================

-- 31. kyc_records (vendor-agnostic compliance metadata; salted hashes + last4 only)
CREATE TABLE public.kyc_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_tier public.kyc_tier_enum NOT NULL,
  status public.kyc_status_enum NOT NULL DEFAULT 'draft',
  vendor_code TEXT, -- NULL until vendor evaluation (ADR-006) completes
  vendor_reference TEXT,
  bvn_hash TEXT,
  bvn_last4 CHAR(4) CHECK (bvn_last4 IS NULL OR bvn_last4 ~ '^[0-9]{4}$'),
  nin_hash TEXT,
  nin_last4 CHAR(4) CHECK (nin_last4 IS NULL OR nin_last4 ~ '^[0-9]{4}$'),
  liveness_status TEXT NOT NULL DEFAULT 'not_checked' CHECK (
    liveness_status IN ('not_checked', 'passed', 'failed', 'manual_review')
  ),
  pep_sanctions_status TEXT NOT NULL DEFAULT 'not_checked' CHECK (
    pep_sanctions_status IN ('not_checked', 'clear', 'potential_match', 'confirmed_match')
  ),
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  -- MLPPA 2022 5-year minimum statutory retention
  retention_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 years'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kyc_records_user ON public.kyc_records(user_id, created_at DESC);
CREATE INDEX idx_kyc_records_status ON public.kyc_records(status);
CREATE UNIQUE INDEX uq_kyc_records_bvn_hash_approved
  ON public.kyc_records(bvn_hash)
  WHERE bvn_hash IS NOT NULL AND status = 'approved';

CREATE TRIGGER trg_kyc_records_updated_at
  BEFORE UPDATE ON public.kyc_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 32. kyc_documents (private bucket references only; zero public URLs)
CREATE TABLE public.kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_record_id UUID NOT NULL REFERENCES public.kyc_records(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'government_id', 'proof_of_address', 'selfie_liveness', 'cac_certificate', 'board_resolution'
  )),
  storage_bucket TEXT NOT NULL DEFAULT 'kyc-private' CHECK (storage_bucket = 'kyc-private'),
  storage_path TEXT NOT NULL UNIQUE,
  sha256_checksum TEXT NOT NULL CHECK (sha256_checksum ~ '^[a-f0-9]{64}$'),
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 years')
);

CREATE INDEX idx_kyc_documents_record ON public.kyc_documents(kyc_record_id);
CREATE INDEX idx_kyc_documents_user ON public.kyc_documents(user_id);

-- 33. kyc_reviews (immutable compliance officer decisions; self-review prohibited)
CREATE TABLE public.kyc_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kyc_record_id UUID NOT NULL REFERENCES public.kyc_records(id) ON DELETE RESTRICT,
  subject_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'escalated')),
  notes TEXT NOT NULL CHECK (length(trim(notes)) >= 5),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_kyc_reviews_no_self_review CHECK (reviewer_user_id <> subject_user_id)
);

CREATE INDEX idx_kyc_reviews_record ON public.kyc_reviews(kyc_record_id, reviewed_at DESC);

CREATE TRIGGER trg_kyc_reviews_immutable
  BEFORE UPDATE OR DELETE ON public.kyc_reviews
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 34. compliance_events (AML, fraud, reconciliation drift, and security anomalies)
CREATE TABLE public.compliance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  severity public.compliance_severity_enum NOT NULL,
  description TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_events_open ON public.compliance_events(severity, created_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX idx_compliance_events_user ON public.compliance_events(user_id, created_at DESC);

-- 35. notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category public.notification_category_enum NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC)
  WHERE is_read = false;

-- 36. notification_preferences
CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  security_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 37. payment_providers (seeded DISABLED in non-production staging — ADR-002 / ADR-010)
CREATE TABLE public.payment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_-]{3,32}$'),
  name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  allowed_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.payment_providers (code, name, is_enabled, allowed_channels, metadata)
VALUES (
  'paystack',
  'Paystack (Checkout Only — Disabled in Phase B Staging)',
  false,
  ARRAY['paystack_checkout_card', 'paystack_checkout_bank_transfer']::TEXT[],
  '{"dva_deferred": true, "written_approval_obtained": false}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- 38. payment_references
CREATE TABLE public.payment_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.payment_providers(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  provider_reference TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initialized',
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  raw_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, provider_reference)
);

CREATE INDEX idx_payment_references_txn ON public.payment_references(transaction_id);

CREATE TRIGGER trg_payment_references_updated_at
  BEFORE UPDATE ON public.payment_references
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 39. payment_events (database-level webhook deduplication — ADR-007)
CREATE TABLE public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.payment_providers(id) ON DELETE RESTRICT,
  payment_reference_id UUID REFERENCES public.payment_references(id) ON DELETE RESTRICT,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  verified_server_side BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, provider_event_id, event_type)
);

CREATE INDEX idx_payment_events_ref ON public.payment_events(payment_reference_id);

-- 40. webhook_logs (raw audit-first ingestion log — immutable)
CREATE TABLE public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.payment_providers(id) ON DELETE RESTRICT,
  payment_event_id UUID REFERENCES public.payment_events(id) ON DELETE RESTRICT,
  signature_valid BOOLEAN NOT NULL,
  source_ip INET,
  http_status_returned INTEGER NOT NULL,
  headers_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_body_sha256 TEXT NOT NULL CHECK (raw_body_sha256 ~ '^[a-f0-9]{64}$'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_logs_provider_time ON public.webhook_logs(provider_id, received_at DESC);

CREATE TRIGGER trg_webhook_logs_immutable
  BEFORE UPDATE OR DELETE ON public.webhook_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();
