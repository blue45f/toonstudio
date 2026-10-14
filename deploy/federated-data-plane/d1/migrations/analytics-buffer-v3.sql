-- traffic_web_vital 테이블과 조회 인덱스만 추가하여 Web Vitals 실측을 저장한다.
-- v2 전체 DDL과 checkpoint 검증 후 --upgrade의 원자 batch에서만 실행한다.
-- Web Vitals(LCP·CLS·INP) 실측. 지표 상한은 web-vitals-model의 정규화 범위와 같다.
CREATE TABLE IF NOT EXISTS traffic_web_vital (
  id text PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  visitor_hash text NOT NULL,
  session_hash text NOT NULL,
  path text NOT NULL,
  lcp_ms integer,
  cls real,
  inp_ms integer,
  country_code text,
  device_type text NOT NULL,
  browser text NOT NULL,
  os text NOT NULL,
  CONSTRAINT traffic_web_vital_visitor_hash_length
    CHECK (length(visitor_hash) = 64),
  CONSTRAINT traffic_web_vital_session_hash_length
    CHECK (length(session_hash) = 64),
  CONSTRAINT traffic_web_vital_path_length
    CHECK (length(path) BETWEEN 1 AND 320),
  CONSTRAINT traffic_web_vital_lcp_range
    CHECK (lcp_ms IS NULL OR lcp_ms BETWEEN 0 AND 600000),
  CONSTRAINT traffic_web_vital_cls_range
    CHECK (cls IS NULL OR cls BETWEEN 0 AND 100),
  CONSTRAINT traffic_web_vital_inp_range
    CHECK (inp_ms IS NULL OR inp_ms BETWEEN 0 AND 600000),
  CONSTRAINT traffic_web_vital_country_code
    CHECK (country_code IS NULL OR country_code GLOB '[A-Z][A-Z]'),
  CONSTRAINT traffic_web_vital_device_type_length
    CHECK (length(device_type) BETWEEN 1 AND 32),
  CONSTRAINT traffic_web_vital_browser_length
    CHECK (length(browser) BETWEEN 1 AND 64),
  CONSTRAINT traffic_web_vital_os_length
    CHECK (length(os) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS traffic_web_vital_occurred_at_idx
  ON traffic_web_vital (occurred_at DESC);
