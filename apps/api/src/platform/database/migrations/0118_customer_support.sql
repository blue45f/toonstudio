-- 비공개 고객상담. 기존 데이터 변경 없이 테이블과 인덱스만 추가한다.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_support_conversation (
  id uuid PRIMARY KEY,
  "ownerId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'ai' CHECK (status IN ('ai', 'waiting', 'open', 'closed')),
  "aiLease" uuid,
  "aiLeaseUntil" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_support_owner_updated
  ON public.customer_support_conversation ("ownerId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS customer_support_status_updated
  ON public.customer_support_conversation (status, "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS public.customer_support_message (
  id uuid PRIMARY KEY,
  "conversationId" uuid NOT NULL REFERENCES public.customer_support_conversation(id) ON DELETE CASCADE,
  "clientMessageId" uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'admin')),
  "senderId" text REFERENCES public."user"(id) ON DELETE SET NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("conversationId", "clientMessageId")
);
CREATE INDEX IF NOT EXISTS customer_support_message_order
  ON public.customer_support_message ("conversationId", sequence);
CREATE INDEX IF NOT EXISTS customer_support_message_sender_created
  ON public.customer_support_message ("senderId", "createdAt" DESC);

-- 응답 실패·시간 초과도 예약을 남겨 유료 호출의 일일 상한을 보수적으로 지킨다.
CREATE TABLE IF NOT EXISTS public.customer_support_ai_attempt (
  id uuid PRIMARY KEY,
  "conversationId" uuid NOT NULL REFERENCES public.customer_support_conversation(id) ON DELETE CASCADE,
  "ownerId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "reservedTokens" integer NOT NULL DEFAULT 60000 CHECK ("reservedTokens" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_support_ai_attempt_created
  ON public.customer_support_ai_attempt ("createdAt", "ownerId");

REVOKE ALL ON TABLE public.customer_support_conversation, public.customer_support_message,
  public.customer_support_ai_attempt FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.customer_support_message_sequence_seq FROM PUBLIC;

COMMIT;
