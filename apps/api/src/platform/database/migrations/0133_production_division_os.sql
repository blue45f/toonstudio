-- 실제 분업 API가 사용하는 컷·잠금·검수·정산 원장을 추가한다.
-- 기존 Drizzle 스키마로 생성된 표와 기록은 재실행해도 보존한다.
-- 복구 시 새 분업 API 노출을 중지하고 원장을 보존하며 자동 삭제 rollback은 하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE IF NOT EXISTS public.production_cut_slice (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.production_project(id) ON DELETE CASCADE,
  episode_id text NOT NULL,
  stage_code text NOT NULL,
  cut_start integer NOT NULL,
  cut_end integer NOT NULL,
  allowed_folders jsonb NOT NULL DEFAULT '[]'::jsonb,
  assignee_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned',
  lease_expires_at timestamptz,
  latest_rev_hash text,
  due_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_cut_slice_id_check CHECK (char_length(btrim(id)) BETWEEN 1 AND 160),
  CONSTRAINT production_cut_slice_episode_check CHECK (char_length(btrim(episode_id)) BETWEEN 1 AND 160),
  CONSTRAINT production_cut_slice_stage_check CHECK (stage_code IN ('script','storyboard','bg3d','line','flat','shade','fx','lettering','qa_final')),
  CONSTRAINT production_cut_slice_cut_range_check CHECK (cut_start >= 1 AND cut_end >= cut_start AND cut_end <= 10000),
  CONSTRAINT production_cut_slice_allowed_folders_check CHECK (jsonb_typeof(allowed_folders) = 'array'),
  CONSTRAINT production_cut_slice_status_check CHECK (status IN ('assigned','in_progress','submitted','in_qa','retake','approved','stitched'))
);
CREATE INDEX IF NOT EXISTS idx_production_cut_slice_project_episode_stage
  ON public.production_cut_slice(project_id,episode_id,stage_code,cut_start);
CREATE INDEX IF NOT EXISTS idx_production_cut_slice_assignee_status
  ON public.production_cut_slice(assignee_user_id,status);
CREATE INDEX IF NOT EXISTS idx_production_cut_slice_project_due
  ON public.production_cut_slice(project_id,due_at);

CREATE TABLE IF NOT EXISTS public.production_binary_lock (
  asset_key text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.production_project(id) ON DELETE CASCADE,
  holder_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  lock_reason text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT production_binary_lock_asset_key_check CHECK (char_length(btrim(asset_key)) BETWEEN 1 AND 320),
  CONSTRAINT production_binary_lock_reason_check CHECK (char_length(btrim(lock_reason)) BETWEEN 1 AND 500),
  CONSTRAINT production_binary_lock_expiry_check CHECK (expires_at > locked_at)
);
CREATE INDEX IF NOT EXISTS idx_production_binary_lock_project_expires
  ON public.production_binary_lock(project_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_production_binary_lock_holder
  ON public.production_binary_lock(holder_user_id,expires_at);

CREATE TABLE IF NOT EXISTS public.production_qa_inspection (
  id text PRIMARY KEY,
  cut_slice_id text NOT NULL REFERENCES public.production_cut_slice(id) ON DELETE CASCADE,
  revision_hash text NOT NULL,
  palette_drift_max double precision NOT NULL,
  line_width_cv double precision NOT NULL,
  mobile_375_ok boolean NOT NULL,
  rights_bom_ok boolean NOT NULL,
  redline_strokes jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict text NOT NULL,
  reviewer_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_qa_inspection_id_check CHECK (char_length(btrim(id)) BETWEEN 1 AND 160),
  CONSTRAINT production_qa_inspection_revision_check CHECK (char_length(btrim(revision_hash)) BETWEEN 6 AND 160),
  CONSTRAINT production_qa_inspection_palette_drift_check CHECK (palette_drift_max >= 0 AND palette_drift_max <= 200),
  CONSTRAINT production_qa_inspection_line_width_cv_check CHECK (line_width_cv >= 0 AND line_width_cv <= 10),
  CONSTRAINT production_qa_inspection_redline_strokes_check CHECK (jsonb_typeof(redline_strokes) = 'array'),
  CONSTRAINT production_qa_inspection_verdict_check CHECK (verdict IN ('approved','conditional','retake','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_production_qa_inspection_slice_created
  ON public.production_qa_inspection(cut_slice_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_qa_inspection_reviewer
  ON public.production_qa_inspection(reviewer_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.production_royalty_ledger (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.production_project(id) ON DELETE CASCADE,
  episode_id text NOT NULL,
  payee_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  role_code text NOT NULL,
  settlement_model text NOT NULL DEFAULT 'hybrid-base-plus-royalty',
  approved_cuts integer NOT NULL DEFAULT 0,
  base_amount_krw bigint NOT NULL DEFAULT 0,
  royalty_bps integer NOT NULL DEFAULT 0,
  mg_balance_krw bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'accruing',
  settled_at timestamptz,
  CONSTRAINT production_royalty_ledger_id_check CHECK (char_length(btrim(id)) BETWEEN 1 AND 160),
  CONSTRAINT production_royalty_ledger_role_check CHECK (role_code IN ('pd','art_director','writer','storyboard','bg3d','line','flat','shade','finishing_lettering')),
  CONSTRAINT production_royalty_ledger_model_check CHECK (settlement_model IN ('hybrid-base-plus-royalty','mg-recoup-rs','per-cut','flat')),
  CONSTRAINT production_royalty_ledger_approved_cuts_check CHECK (approved_cuts >= 0),
  CONSTRAINT production_royalty_ledger_base_amount_check CHECK (base_amount_krw >= 0),
  CONSTRAINT production_royalty_ledger_royalty_bps_check CHECK (royalty_bps BETWEEN 0 AND 10000),
  CONSTRAINT production_royalty_ledger_mg_balance_check CHECK (mg_balance_krw >= 0),
  CONSTRAINT production_royalty_ledger_status_check CHECK (status IN ('accruing','ready','settled','disputed','void'))
);
CREATE UNIQUE INDEX IF NOT EXISTS production_royalty_ledger_payee_episode_role_unique
  ON public.production_royalty_ledger(project_id,episode_id,payee_user_id,role_code);
CREATE INDEX IF NOT EXISTS idx_production_royalty_ledger_project_status
  ON public.production_royalty_ledger(project_id,status,episode_id);
CREATE INDEX IF NOT EXISTS idx_production_royalty_ledger_payee
  ON public.production_royalty_ledger(payee_user_id,status);

REVOKE ALL ON TABLE public.production_cut_slice,public.production_binary_lock,
  public.production_qa_inspection,public.production_royalty_ledger FROM PUBLIC;
COMMIT;
