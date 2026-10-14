BEGIN;
-- Organizations group team workspaces; membership never grants manuscript or work access.
CREATE TABLE IF NOT EXISTS production_organization (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  kind text NOT NULL CHECK (kind IN ('company','studio','team-circle')),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  owner_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_organization_owner ON production_organization(owner_user_id, id);
CREATE TABLE IF NOT EXISTS production_organization_member (
  organization_id text NOT NULL REFERENCES production_organization(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','admin','manager','member','guest')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS production_organization_one_owner ON production_organization_member(organization_id) WHERE role='owner';
CREATE INDEX IF NOT EXISTS production_organization_member_user ON production_organization_member(user_id, organization_id);
CREATE TABLE IF NOT EXISTS production_organization_invite (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES production_organization(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 320),
  role text NOT NULL CHECK (role IN ('admin','manager','member','guest')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL REFERENCES "user"(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS production_organization_pending_invite ON production_organization_invite(organization_id,email)
  WHERE revoked_at IS NULL AND accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS production_organization_invite_org ON production_organization_invite(organization_id,expires_at);
CREATE TABLE IF NOT EXISTS production_organization_link (
  organization_id text NOT NULL REFERENCES production_organization(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES production_team_workspace(id) ON DELETE CASCADE,
  linked_by text NOT NULL REFERENCES "user"(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS production_organization_link_workspace ON production_organization_link(workspace_id,organization_id);
CREATE TABLE IF NOT EXISTS production_organization_notice (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES production_organization(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES "user"(id),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_organization_notice_org ON production_organization_notice(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS production_organization_receipt (
  actor_user_id text NOT NULL REFERENCES "user"(id),
  mutation_id uuid NOT NULL,
  organization_id text NOT NULL REFERENCES production_organization(id) ON DELETE CASCADE,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id,mutation_id)
);
CREATE TABLE IF NOT EXISTS production_organization_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES production_organization(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL REFERENCES "user"(id),
  action text NOT NULL,
  target_id text NOT NULL,
  revision integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_organization_audit_org ON production_organization_audit(organization_id,id DESC);
-- Deferred canonical-owner invariant permits an atomic transfer, never an ownerless organization.
CREATE OR REPLACE FUNCTION check_production_organization_owner() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE organization_key text;
BEGIN
  IF TG_TABLE_NAME='production_organization' THEN
    organization_key := COALESCE(NEW.id, OLD.id);
  ELSE
    organization_key := COALESCE(NEW.organization_id, OLD.organization_id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.production_organization o WHERE o.id=organization_key AND NOT EXISTS (
      SELECT 1 FROM public.production_organization_member m WHERE m.organization_id=o.id
        AND m.user_id=o.owner_user_id AND m.role='owner')) THEN
    RAISE EXCEPTION 'organization must retain its canonical owner membership' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS production_organization_owner_identity ON production_organization;
CREATE CONSTRAINT TRIGGER production_organization_owner_identity
  AFTER INSERT OR UPDATE ON production_organization DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_production_organization_owner();
DROP TRIGGER IF EXISTS production_organization_member_owner_identity ON production_organization_member;
CREATE CONSTRAINT TRIGGER production_organization_member_owner_identity
  AFTER INSERT OR UPDATE OR DELETE ON production_organization_member DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_production_organization_owner();

REVOKE ALL ON TABLE public.production_organization, public.production_organization_member, public.production_organization_invite, public.production_organization_link, public.production_organization_notice, public.production_organization_receipt, public.production_organization_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.production_organization_audit_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_production_organization_owner() FROM PUBLIC;

COMMIT;
