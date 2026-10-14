BEGIN;
-- Stage consensus gates: rounds and decisions that used to live only on one
-- client are persisted per production project so every device sees the same
-- gate. The gate id is deterministic ('stage-gate:<episodeId>:<stageId>'),
-- matching the client model's stageGateId.
CREATE TABLE IF NOT EXISTS production_stage_gate (
  id text PRIMARY KEY CHECK (id ~ '^stage-gate:[^:]+:(plan|storyboard|art)$'),
  project_id text NOT NULL REFERENCES production_project(id) ON DELETE CASCADE,
  episode_id text NOT NULL CHECK (char_length(btrim(episode_id)) BETWEEN 1 AND 160),
  stage_id text NOT NULL CHECK (stage_id IN ('plan','storyboard','art')),
  lead_reviewer_id text REFERENCES "user"(id) ON DELETE SET NULL,
  lead_reviewer_name text NOT NULL DEFAULT '' CHECK (char_length(lead_reviewer_name) <= 160),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, episode_id, stage_id)
);
CREATE INDEX IF NOT EXISTS production_stage_gate_episode ON production_stage_gate(project_id, episode_id, stage_id);
CREATE TABLE IF NOT EXISTS production_stage_gate_round (
  gate_id text NOT NULL REFERENCES production_stage_gate(id) ON DELETE CASCADE,
  round integer NOT NULL CHECK (round >= 1),
  submitted_by_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  submitted_by_name text NOT NULL CHECK (char_length(btrim(submitted_by_name)) BETWEEN 1 AND 160),
  revision_ref text CHECK (revision_ref IS NULL OR char_length(revision_ref) BETWEEN 1 AND 320),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gate_id, round)
);
CREATE TABLE IF NOT EXISTS production_stage_gate_decision (
  gate_id text NOT NULL,
  round integer NOT NULL,
  decision_index integer NOT NULL CHECK (decision_index >= 0),
  reviewer_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  reviewer_name text NOT NULL CHECK (char_length(btrim(reviewer_name)) BETWEEN 1 AND 160),
  role text NOT NULL CHECK (role IN ('lead','participant')),
  value text NOT NULL CHECK (value IN ('approve','approve-with-conditions','request-changes','veto','abstain')),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 2000),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
  pin_thread_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pin_thread_ids) = 'array'),
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gate_id, round, decision_index),
  FOREIGN KEY (gate_id, round) REFERENCES production_stage_gate_round(gate_id, round) ON DELETE CASCADE,
  -- The client model's blocking validation, enforced at rest as well:
  -- a rejection without a reason and a conditional approval without
  -- conditions can never be stored, whichever client sent them.
  CHECK (value NOT IN ('request-changes','veto') OR char_length(btrim(reason)) >= 1),
  CHECK (value <> 'approve-with-conditions' OR jsonb_array_length(conditions) >= 1)
);
CREATE INDEX IF NOT EXISTS production_stage_gate_decision_round ON production_stage_gate_decision(gate_id, round, decision_index);
CREATE TABLE IF NOT EXISTS production_stage_gate_receipt (
  actor_user_id text NOT NULL REFERENCES "user"(id),
  mutation_id uuid NOT NULL,
  gate_id text NOT NULL REFERENCES production_stage_gate(id) ON DELETE CASCADE,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id, mutation_id)
);
CREATE TABLE IF NOT EXISTS production_stage_gate_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gate_id text NOT NULL REFERENCES production_stage_gate(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL REFERENCES "user"(id),
  action text NOT NULL,
  target_id text NOT NULL,
  revision integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_stage_gate_audit_gate ON production_stage_gate_audit(gate_id, id DESC);

REVOKE ALL ON TABLE public.production_stage_gate, public.production_stage_gate_round, public.production_stage_gate_decision, public.production_stage_gate_receipt, public.production_stage_gate_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.production_stage_gate_audit_id_seq FROM PUBLIC;

COMMIT;
