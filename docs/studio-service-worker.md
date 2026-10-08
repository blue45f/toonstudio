# Service Worker — 캐시 정책 · 업데이트 · 복구

`dist/sw.js` 는 `apps/web/vite.config.ts` 의 `toonstudio-service-worker` 플러그인이
`src/app/service-worker/studio-service-worker-entry.ts` 를 빌드해 만든다. 라우팅·버저닝
판단은 전부 `studio-service-worker-policy.ts` 의 순수 함수라 브라우저 없이 단위 테스트된다.

- 등록: `src/app/main.tsx` → `load` 이후 동적 import (`studio-service-worker-registration.ts`)
- 검증: `pnpm run verify:studio-service-worker` (빌드된 `dist/` 필요)

## 1. 자산 클래스별 캐시 전략

| 클래스 | 경로 | 전략 | 버킷 | 근거 |
| --- | --- | --- | --- | --- |
| `immutable-asset` | `/assets/*` (JS·CSS 등. `.onnx`·`.wasm` 제외) | cache-first | `immutable` (600) | 콘텐츠 해시 URL = 자기 무효화. 재검증 불필요 |
| `heavy-asset` | `/assets/*.onnx` `/assets/*.wasm` | cache-first | `heavy` (64) | 같은 해시·불변 계약이지만 파일 하나가 수십 MB다(코드 주석 기준 tag2pix ≈ 76 MB, dist WASM 합계 ≈ 123 MB). 작은 청크가 쌓여 개수 상한에 걸릴 때 가장 먼저 밀려나지 않도록 별도 버킷에 둔다. 프리캐시에 고정한 항목은 먼저 거기서 읽는다 |
| `static-media` | `/vrm/` `/audio/` `/images/` `/assets/media/` | cache-first | `media` (120) | 대용량·불변. VRM 1개가 최대 19 MB라 별도 상한. `/audio/playlist.json`은 바뀌는 목록이라 캐시하지 않는다 |
| `catalog-data` | `/data/` `/i18n/` `/catalog/` (+ `/assets/studio/cc0-20260906/manifest.json`) | stale-while-revalidate | `data` (80) | 신선도는 필요하지만 대기시키면 안 됨 |
| `cover-image` | `/api/cover` | cache-first | `cover` (300) | 표지 바이트가 앱 셸을 밀어내지 않게 분리. 프록시 응답은 `immutable`이 아니라 재검증 가능한 캐시(`max-age=3600, s-maxage=86400`)로 내려가지만, Service Worker는 신선도를 보지 않고 cache-first로 담아 개수 상한으로만 정리한다 |
| `navigation` / `studio-navigation` | HTML 문서 | network-first | `precache` | **배포 수정본이 다음 온라인 내비게이션에 바로 도달하는 1차 복구 경로** |
| `api` | 그 외 `/api/*` | network-only | — | 데이터 신선도 |
| `sw-runtime` | `/sw.js` `/manifest.webmanifest` `/bootstrap-compat.js` `/bootstrap-theme.js` | network-only | — | 워커 스크립트를 캐시하면 나쁜 워커가 복구 불가능해진다 |
| `passthrough` | 교차 출처 · 비 GET · Range | 미개입 | — | **쓰기 경로는 절대 건드리지 않는다** |

### 프리캐시 2단

- **critical (install, 원자적)** — 앱 셸 JS/CSS 클로저 + 셸 문서 `/` 와 `/studio` + 고정 정적
  critical URL 23개(`STUDIO_SERVICE_WORKER_STATIC_CRITICAL_URLS`: 부트스트랩 스크립트, 비상 드로잉
  `/offline-draw/*`, 브랜드 아이콘·SVG). 예산은 `STUDIO_PRECACHE_BUDGET.criticalBytes` =
  2.25 MiB(9 × 256 KiB)이고, 2026-10-01 실측에서 entry 문서 closure는 2,099,509 bytes(약 2.0 MiB)였다
  (`studio-service-worker-precache-plan.ts` 주석). 이 문서의 이전 판이 적은 "현재 10 URL / 975 KiB"는
  낡은 값이며, 빌드마다 달라지는 정확한 URL 수·바이트는 `dist/`가 있어야 재현된다(이번 갱신에서는
  빌드 산출물이 없어 다시 재지 못했다). `addAll` 이 원자적인 것은 의도적이다: 하나라도 404 면 install 이
  거부되고 **새 워커는 활성화되지 않으며 기존 워커가 계속 서빙한다.** 깨진 배포가 정상 캐시를
  대체할 수 없다.
- **warm (첫 `/studio` 내비게이션, best-effort)** — `/i18n/studio/{ko,en}.json` 2개 / 182 KiB.
  `AppRouter` 가 이 둘을 라우트 청크와 `Promise.all` 하므로 없으면 오프라인 Studio 부팅이
  거기서 죽는다. 카탈로그만 보는 방문자는 이 바이트를 내지 않는다.

Studio 라우트 클로저(precache-plan 주석의 과거 실측으로 5.4 MB / 194 청크, 이번에는 재현하지 않았다)는 **의도적으로 프리캐시하지 않는다.** 워밍을 유발하는
바로 그 내비게이션에서 브라우저가 어차피 전부 받고, cache-first 가 그것을 `immutable` 버킷에
담는다. 즉 **온라인으로 Studio 를 한 번 열면 그 뒤로는 오프라인으로 동작한다.**
`planStudioServiceWorkerPrecache` 의 warm 예산(512 KiB)이 이 결정을 빌드 실패로 고정한다.

`AppRouter` 는 모든 `/studio` 경로에서 선택형 `StudioOfflineRuntime` 을 띄운다. 이 런타임은
사용자 설정 없이 idle 시간에 빌드가 고정한 핵심 드로잉 팩을 준비하고, 연결 복구나 워커 교체 때
다시 검증한다. Data Saver·숨김 탭·저장 공간 90% 이상에서는 자동 다운로드를 건너뛴다. 안내
패널의 수동 재시도는 복구 수단일 뿐 정상 사용의 선행 절차가 아니다.

## 2. 교차 출처 격리 계약 (가장 깨지기 쉬운 부분)

`/studio` 는 COOP `same-origin` + COEP `credentialless` 로 격리된다. 캐시된 응답은 저장된
헤더 그대로 재생되므로:

- 프리캐시된 `/studio` 문서는 반드시 **HTML `Accept` 헤더로** 가져와야 한다
  (`shellRequest()`). 그러지 않으면 오리진이 COOP/COEP 를 붙이지 않고, 오프라인 문서가
  비격리로 재생되어 `crossOriginIsolated` 가 꺼진다 — 새로고침으로 복구할 수도 없는 상태에서.
- 오프라인 폴백은 경로별로 갈린다. `/studio*` 는 격리 셸, 그 외는 `/`.
  (`studioServiceWorkerOfflineShellUrl`)
- `/sw.js` 자체가 `Cross-Origin-Embedder-Policy: credentialless` 로 서빙된다
  (`config/http-response-headers.json` → `apps/web/public/_headers`). 워커는 자신과 COEP 가 호환되는 클라이언트만 제어할 수 있다.

### 캐시 무효화 축이 둘인 이유

- `STUDIO_SERVICE_WORKER_CONTRACT_VERSION` (현재 **5**) — 캐시된 *응답의 형태*가 더 이상
  재생 불가능해질 때만 올린다. 런타임 버킷 이름에 들어간다.
- `buildId` — 프리캐시 URL 목록의 해시. 프리캐시 버킷에만 들어가므로, 배포가 아직 유효한
  콘텐츠 해시 자산 수 MB 를 버리지 않는다.

여기에 더해 **자가 치유** 가드가 있다. `isStudioServiceWorkerCachedResponseUsable` 는 캐시된
Studio 워커 스크립트에 CORP 헤더가 없으면 miss 로 처리하고 지운다. 예전 워커가 v3 → v4 로
올려야 했던 그 실패가, 이제는 상수를 올리지 않아도 스스로 복구된다.

## 3. 업데이트 흐름 — 작업 중 코드가 바뀌지 않는다

1. 새 워커가 백그라운드에서 install 하고 **`waiting` 에 주차한다.** `install` 에서
   `skipWaiting()` 을 호출하지 않는다. 아무것도 제어하지 않고 아무 캐시도 지우지 않으므로,
   실행 중인 빌드는 이미 가진 lazy 청크를 그대로 유지한다.
2. 작업자에게 프롬프트로 알린다(Shadow DOM, 닫기 가능). 강제하지 않는다.
3. 적용은 사용자 제스처에서 나온 평범한 `location.reload()` 다. 따라서 Studio 자신의
   `beforeunload` 가드가 그대로 발동해 브라우저가 미저장 작업을 묻는다.
   적용 버튼은 먼저 Studio 의 업데이트 안전 레지스트리(`getStudioUpdateSafetySnapshot()`,
   `studio-update-safety`)를 읽는다. 저장되지 않은 잉크, 진행 중인 저장 영수증, 대기 중인 협업 경계가
   있으면 새로고침을 시도하기 전에 적용이 막힌다. `beforeunload` 는 그 뒤의 마지막 브라우저 수준
   안전망이고, 새로고침이 작업자를 이길 수 있는 경로는 없다. (이전 판은 "에디터 상태에 별도 결합이
   없다"고 적었으나 지금은 이 레지스트리 결합이 있다.)

`activate` 의 캐시 정리는 `skipWaiting` 이후(=사용자 동의) 또는 모든 탭이 닫힌 뒤에만 돈다.

## 4. 킬 스위치 / 현장 복구

나쁜 워커가 나갔을 때, 위에서부터 순서대로:

1. **아무것도 안 해도 됨 (1차).** 내비게이션이 network-first 다. 수정 배포는 다음 온라인
   내비게이션에 바로 도달한다. `/sw.js` 는 `Cache-Control: no-cache` 로 서빙되므로 브라우저가
   워커 스크립트를 오래 붙들지 않는다.
2. **사용자 URL 스위치.** 아무 URL 뒤에 `?__toonspectrumSwReset=1` 을 붙인다. 모든 워커를
   해제하고 이 앱이 소유한 캐시를 전부 지운 뒤 한 번만 리로드한다(sessionStorage 로 루프 방지).
   지원 문의에 그대로 붙여넣을 수 있는 형태다.
3. **DevTools.** `await __toonspectrumServiceWorker.reset()` — 같은 동작.
   `await __toonspectrumServiceWorker.inspect()` 로 buildId·버킷별 엔트리 수를 본다.
4. **툼스톤 배포 (최후).** `dist/sw.js` 를 아래로 교체해 배포하면 방문자 전원이 자가 해제한다.
   ```js
   self.addEventListener('install', () => self.skipWaiting());
   self.addEventListener('activate', (e) => e.waitUntil((async () => {
     for (const k of await caches.keys()) if (k.startsWith('toonstudio-')) await caches.delete(k);
     await self.registration.unregister();
     for (const c of await self.clients.matchAll()) c.navigate(c.url);
   })()));
   ```

> 어떤 복구 경로도 작업자 데이터를 건드리지 않는다. 문서·자동저장·CRDT outbox 는 OPFS/SQLite
> 에 있고 Service Worker 는 Cache API 만 만진다.

## 5. Background Sync 를 쓰지 않는 이유 (의도적 결정)

`live/studio-crdt-outbox.ts` 에 SQLite 기반 durable outbox 가 있고 `recordRetry` 가
`nextRetryAt` 까지 저장하므로 후보처럼 보인다. 그러나 그 SQLite 핸들은 **OPFS
`opfs-sahpool` VFS** 위에 있고 전용 Worker 가 배타적으로 들고 있다. Service Worker 의
`sync` 이벤트에서 같은 풀을 열면 열려 있는 탭과 sync access handle 을 다투게 되고, 그 실패
모드는 **작업자의 로컬 DB 손상**이다.

가용성을 조금 얻자고 데이터 무결성을 거는 거래이므로 채택하지 않았다. 탭이 닫힌 뒤 outbox 를
비우려면 먼저 SQLite 소유권을 Worker 하나로 조정하는 작업이 선행되어야 하며, 그건 별도 과제다.

## 6. 브라우저 기준 — 서로 다른 값 두 가지 (2026-10-08 코드 확인)

- Service Worker·Cache Storage 는 주요 엔진이 공통으로 지원하지만, 앱 번들은 Vite 8.0.16 의 기본 빌드
  타깃(`chrome111` `edge111` `firefox114` `safari16.4` `ios16.4`, `apps/web/vite.config.ts` 에서
  `build.target` 을 따로 정하지 않음)으로 만들어진다.
- 앱 안 호환성 점검(`apps/web/src/platform/browser/browser-check.ts`)이 "레거시"로 보는 기준은 Chrome·Edge 90
  미만, Safari 14 미만, Firefox 88 미만이며 UA 문자열 파싱에 의존한다. 이 값은 위 빌드 타깃보다 낮다. 따라서
  그 사이 버전(예: Chrome 90~110)은 레거시 경고 없이 열리지만 빌드 산출물이 지원 범위 밖일 수 있다.
  이 차이가 실제로 어떤 오류로 나타나는지는 실브라우저로 확인하지 않았다.

## 7. 회귀 방지

- `studio-service-worker-policy.test.ts` — 라우팅·전략·캐시명·무효화·자가치유 순수 함수
- `studio-service-worker-precache-plan.test.ts` — 프리캐시 선택·예산·buildId 안정성
- `studio-service-worker-entry.test.ts` — 실제 워커 모듈을 인메모리 Cache API 로 구동
  (install 원자성, `skipWaiting` 미호출, activate 정리, 오프라인 셸 분기, 킬 스위치)
- `scripts/verify-studio-service-worker.mts` — 실제 브라우저. `config/http-response-headers.json`과
  Cloudflare 정적 헤더 산출물을 적용한 서버로 `dist/`를 제공하므로 **프로덕션 헤더 설정이 퇴화하면 실패한다.**
