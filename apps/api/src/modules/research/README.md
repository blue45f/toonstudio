# 리서치 모듈 (DeepSeek Search/Fetch)

창작자가 짧은 질문으로 공개 웹 자료를 조사하는 리서치 기능이다.
검색·fetch·요약·존재 확인·트렌드 다이제스트·크레딧 미터링을 제공한다.

## 엔드포인트

기본 경로: `/research` (Nest API 서버 기준). 모든 쓰기성 엔드포인트는
`x-user-id` 헤더(로그인 사용자)가 필요하고, 없으면 `RESEARCH_LOGIN_REQUIRED`(401)를 반환한다.
`idempotency-key` 헤더를 주면 지갑 차감 멱등키로 쓰고, 없으면 서버가 생성한다.

| 메서드·경로 | 설명 |
| --- | --- |
| `GET /research/status` | 기능 설정 여부(`configured`)와 단가·질의 상한 반환. 키 존재 여부 외 정보는 노출하지 않는다. |
| `POST /research/brief` | `{ question, fetchSources?, maxFetchSources? }` → 검색 결과 요약 개요 + 출처 링크 + (선택) 원문 짧은 발췌 |
| `POST /research/existence-check` | `{ title, maxResults? }` → 공개 검색에 걸린 유사 제목·소재 목록 + 법적 의견 아님 고지 |
| `POST /research/trend-digest` | `{ queries[], fetchSources? }` → 질의별 섹션 + Markdown 다이제스트. 질의 목록은 호출부가 정한다. |

## 설정 (.env)

```env
# 필수. 없으면 기능이 비활성화되고 status.configured=false, 요청 시 503을 반환한다.
DEEPSEEK_API_KEY=
# 선택. 기본값 https://api.deepseek.com, 15000(ms)
# DEEPSEEK_BASE_URL=
# DEEPSEEK_TIMEOUT_MS=15000
# 선택. 기본값 각 1크레딧
# DEEPSEEK_RESEARCH_CREDITS_PER_SEARCH=1
# DEEPSEEK_RESEARCH_CREDITS_PER_FETCH=1
```

`.env.example`에는 이 항목들을 직접 추가해야 한다. 이 모듈의 README가 정본 스니펫이다.

## 크레딧

- 단가: 기본 검색 1크레딧, fetch 1크레딧. DeepSeek 요금(성공 호출 1,000건당 $0.75)과
  1크레딧 = 10원 환산을 대조하면 크레딧 1개가 약 10건 호출 원가를 충당하는 보수적 단가다.
- 차감: 지갑 예약 → 성공 시 실제 사용량 캡처 / 실패 시 해제 (studio-ai 차감과 동일 패턴).
  단가 키는 전용 키를 신설하지 않고 기존 `ai.text.generate`를 재사용하며,
  `metadata.source="deepseek-research"`로 구분한다. 전용 `ai.research` 키 신설은
  core 단가표·가격 페이지와 함께 검토하는 후속 정책 과제다.
- 유료 운영 게이트가 OFF면 차감 없이 미터링만 기록하고 요청은 계속 처리한다.
  응답의 `credits` 필드로 비용이 항상 투명하게 보인다.
- 1요청 최대 예상 사용량은 20단위(트렌드 다이제스트: 질의 10건 + 섹션당 fetch 1건)이며,
  이를 넘는 예약은 거부된다.

## 개인정보·저작권 가드레일

- 모든 질의는 최대 128자(DeepSeek 쿼리 상한)로 제한된다. 긴 미공개 원고는
  이 API로 DeepSeek에 전달될 수 없다. 원고 원문은 절대 쿼리에 넣지 않는다.
- API 키는 환경변수에서만 읽고 로그·오류 메시지에 포함하지 않는다.
- 검색 결과 요약은 출처당 최대 300자, fetch 원문 발췌는 건당 최대 500자까지만
  반환한다. 원문 전체가 필요하면 출처 URL로 이동해야 한다.
- 존재 여부 확인은 공개 검색 결과의 나열일 뿐이며, 상표 등록 가능성이나
  침해 여부에 대한 법적 의견이 아니다 (응답에 고지 포함).

## 속도 제한·비용 주의

- DeepSeek 계정당 제한은 5 QPS이며, 클라이언트는 요청 시작 간격을 최소 200ms로
  벌리는 직렬 큐로 이를 지킨다.
- 검색료보다 모델이 요약을 읽는 토큰 비용이 더 커질 수 있으므로, 결과 수는
  작게(브리프 5건, 다이제스트 섹션당 5건) 유지하고 fetch는 필요할 때만 켠다.

## 미검증 항목 (2026-10-27 기준)

- 실제 DeepSeek API 키로 호출한 적은 없다. 키 발급 후 `GET /research/status`와
  브리프 1건으로 실연동을 확인해야 한다.
- CI는 계정의 GitHub Actions 분이 소진(2,000/2,000, 2026-11-01 초기화)되어
  실패하거나 대기할 수 있다. 코드 원인과 무관하며, 초기화 후 재확인한다.
- 테스트는 vitest 단위 테스트로 작성했으며, 로컬 실행 없이 제출한다.
  `pnpm vitest run apps/api/src/modules/research`으로 확인한다.
