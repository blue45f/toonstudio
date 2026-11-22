# 문서·환경변수 예제·하네스 검토

- 상태: **current** — 2026-11-04 저장소 감사 결과. 운영 상태의 신규 확인 기록이 아니다.
- 기준: 최신 `origin/main` `4ce0e45e852feb0fa750f17fb8b1212f3ea30a75`.

## 검토 범위와 한계

추적된 Markdown·MDX·MDC 1,103개를 목록화하고 바이트 동일성을 검사했다. 문서 검사기는 변경 전 1,102개 관리 문서의 링크·경로·권위 표기를 검사했다. 이는 모든 본문을 사람이 전수 검토했다는 뜻이 아니다. 본문 대조는 배포 진입점, 인프라 지도, onpod 도구 설명, 문서 인덱스, 루트·문서 AGENTS와 도구 어댑터 5개에 집중했다.

환경변수 예제 9개(`.env.*example` 5개, `deploy/` 3개, `tools/toonbridge/` 1개)의 할당 이름을 추출해 추적 소스·설정·시험의 식별자와 대조했다. 실제 `.env.production`이나 로컬 secret store의 값, 공급자 credential·서비스 설정은 조사·변경하지 않았다. 문자열 참조가 없다는 사실만으로 키가 무효라고 판정하지 않는다.

열린 PR #2674·#2676·#2680·#2681·#2682·#2683은 기능·CI 수정 중이었다. 이번 변경은 workflow·검사 코드·보호 설정을 수정하지 않는다.

## 인프라 근거와 시점

| 구성 | 확인한 근거 | 판정·미확인 |
| --- | --- | --- |
| 프런트·gateway | `deploy/cloudflare-static/wrangler.jsonc`의 `ASSETS`, Worker 설정 | Cloudflare 구현. 마지막 공급자 상태는 인프라 지도 2026-10-29 기록 |
| 백엔드·DB | 인프라 지도 1·4·9절, ADR-0030 | 2026-10-23 Core API·PostgreSQL의 onpod 서울 컷오버 기록. 이번 세션의 실시간 재조회는 없음 |
| 공개 대형 에셋 | 위 Wrangler의 `LARGE_ASSETS` → `toonspectrum-public-assets` | Cloudflare R2 설정과 인프라 지도 운영 기록 일치 |
| 실시간·분석 | 인프라 지도 1절 및 `deploy/cloudflare-realtime/`, `deploy/cloudflare-analytics/` | Cloudflare Durable Objects·D1 기록. 코드와 원격 활성 버전의 동일성은 미확인 |
| 과거 제공자 | 인프라 지도 1·8절 | Render 삭제·Neon 삭제·Supabase 미사용 기록. 파일 존재와 서비스 활성은 구분 |
| GPU 추론 | `services/creator-inference/README.md` 운영 상태 절 | CPU test-only 검증과 GPU 운영 검증을 명시적으로 구분. 운영 GPU 공급자·인스턴스·배포 SHA 미확인 |

onpod와 RunPod는 다른 이름이다. 저장소 전체의 `runpod` 대소문자 무시 검색에서 기존 참조는 없었다. 이 검색과 인프라 지도만으로 계정에 RunPod 자원이 전혀 없다고 증명할 수는 없다.

마지막 배포 식별자도 인프라 지도 2026-10-29 기록을 그대로 구분한다. Core API 이미지는 `onpod://toonspectrum-core-api:5294fcc693284c38563ed7773748bbd0b7b2822e`, 정적 Worker 활성 버전은 `4670c23c-f464-45d9-b34d-c747612d5790`다. Worker annotation에 Git SHA가 없어 배포 SHA는 미확인이다. 감사 기준 main SHA가 운영에 배포됐다는 뜻이 아니다.

## 반영한 정리와 근거

- `DEPLOY.md`: 현재형 Supabase·Render 안내를 onpod 컷오버 기록과 맞췄다. 기존 Render 승인 scope와 DB workflow가 자동으로 onpod에 승계되지 않음을 명시했다. 과거 DB 역할·TLS·검증 계약은 보존했다.
- `docs/README.md`, `deploy/onpod/README.md`: 컷오버를 아직 진행 중으로 설명하던 상태를 수정했다. 고정 커밋 DB 재구축 도구와 일상 이미지 교체를 구분했다.
- `deploy/README.md`: 설정과 운영 기록으로 확인 가능한 역할을 채우고, 근거 없는 서비스 수·운영 리스크 단정을 제거했다. 미조회 단위는 미확인으로 남겼다.
- 도구 어댑터 5개: 정책 본문을 중복하지 말라는 `docs/operations/agent-harness.md`의 단일 기준 원칙에 따라 반복 문장을 루트·가까운 AGENTS 상속으로 통합했다. 언어·Git·검증·보안·시크릿·배포 정책 자체와 검사 구현은 변경하지 않았다.
- `.env.creator-resources.example`: 아래 14개의 빈 미사용 예제 항목을 제거했다. 실제 키를 삭제하거나 무효 판정한 변경이 아니다.

제거한 예제 이름:

```text
NATIONAL_HERITAGE_API_KEY NRICH_API_KEY ODII_API_KEY VWORLD_API_KEY
JUSO_API_KEY NIBR_API_KEY KMA_API_KEY NAVER_DATALAB_CLIENT_ID
NAVER_DATALAB_CLIENT_SECRET SEOUL_OPEN_DATA_KEY KOSIS_API_KEY NLK_API_KEY
DATA4LIBRARY_API_KEY OPENTOPOGRAPHY_API_KEY
```

근거: 위 이름의 리터럴 소스·설정·시험 참조가 없었다. 국가유산 검색은 `apps/api/src/modules/creator-resources/korean-open-data-providers.ts`에서 키 없이 호출한다. 네이버 DataLab은 `apps/api/src/modules/integration-platform/integration-runtime.providers.ts`의 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`, 도서관 정보는 `apps/api/src/modules/creator-ecosystem/creator-ecosystem.service.ts`의 `DATA4LIBRARY_AUTH_KEY`를 사용한다. 다른 후보 제공자의 활성 구현은 확인되지 않았다.

## 유지한 항목과 후속 확인

- `deploy/backend-capabilities.env.example`의 이름 일부는 리터럴 검색에 없지만 `backend-capability-policy.ts`의 `providerEnvPrefix`·workload 반복에서 동적으로 조합한다. 삭제하지 않았다.
- 바이트가 같은 OpenCode loop 명령 6개는 서로 다른 명령 진입점이므로 중복 본문만으로 삭제하지 않았다. Hokusai WASM README 두 사본도 소스·패키징 위치가 달라 유지했다.
- 실제 키의 유효성·마지막 사용·권한과 로컬 Keychain 잠금 상태는 미확인이다. 서비스 자격증명 폐기·회전은 수행하지 않았다.
- 인프라 지도의 공급자 상태·활성 SHA는 2026-10-29 기록이다. 신규 원격 조회, GPU 스모크·유료 자원 생성, DB·DNS 변경, 배포는 수행하지 않았다.

## 검증

`pnpm harness:check`, `pnpm harness:verify`(하네스 회귀 6개·lockfile importer 20개·변경 파일 Secretlint 포함), `pnpm validate:documentation`(관리 문서 1,103개·회귀 15개), `git diff --check`가 통과했다. 실행 코드 변경이 없어 제품 전체 시험·빌드·GPU 시험은 실행하지 않았다.
