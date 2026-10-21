# 제품 투어 Remotion 배포 게이트 (G5)

- 상태: **current** (2026-10-22 고정)
- 배경: PR #2373(remotion 피어 그래프 수렴)의 본질 수정은 코드와 헤드리스
  재생으로 검증됐지만, **운영 배포 빌드에서의 실재생은 그 자체로 별도 확인이
  필요**하다. MP4 폴백이 본선이 되면 안 된다는 것이 확정된 제품 방침이라,
  배포 직후 아래 세 가지를 게이트로 고정한다.
- 범위: 정적 웹 배포(`DEPLOY.md` 절차) 때마다 `/product-tour`에 적용한다.
  Core API만 배포하는 경우에는 적용하지 않는다.

## 1. 게이트 구성

| ID | 확인 | 어디서 | 도구 |
| --- | --- | --- | --- |
| G5-3 | CI 청크의 remotion 단일 인스턴스 | **배포 전** — CI core 잡, `build:bundle` 직후 | `scripts/check-product-tour-remotion-chunks.mjs --require-manifest` |
| G5-1 | Remotion 화면 재생 (MP4 폴백 아님) | **배포 후** — 운영 도메인, 새 브라우저 프로필 | `scripts/verify-product-tour-live.mjs` |
| G5-2 | 내레이션·자막·챕터 동작 | **배포 후** — G5-1과 같은 실행 | 같은 스크립트 |

순서가 이렇다: 청크 게이트가 배포 전에 중복 인스턴스를 막고, 라이브 게이트가
배포 후에 실제 재생을 확인한다. 어느 하나도 다른 하나로 대체하지 않는다.

## 2. G5-3 — 청크 단일 인스턴스 (배포 전, CI)

- 판정 대상: `dist/.vite/manifest.json`에서 `remotion`과 `@remotion/player`의
  pnpm 인스턴스 경로. 인스턴스가 패키지당 정확히 1개여야 한다.
- 청크 **파일 수**는 재지 않는다. 같은 인스턴스의 코드 스플리팅은 정상이다.
  실패하는 것은 피어 조합이 갈린 복사본(예: `remotion@4.0.536_react@19.2.7`와
  `…_react@19.3.1` 공존)뿐이며, 그 복사본이 <Player>의 재생 컨텍스트를 갈라
  재생 즉시 렌더 오류 → MP4 폴백을 만든다(#2373의 장애 모양).
- 소스 측 보조 게이트: `apps/web/vite.config.ts`의 `resolve.dedupe`에
  `remotion`·`@remotion/player`가 남아 있는지도 같은 스크립트가 본다.
- CI 연결 지점: `.github/workflows/ci.yml` core 잡의 빌드 단계 —
  `pnpm run build:bundle && pnpm run check:studio-bundle` 뒤에
  `pnpm run check:product-tour-remotion-chunks`(`--require-manifest` 포함)가
  이어진다. 매니페스트가 없으면 로컬 실행은 건너뜀(종료 0)이지만 CI에서는
  실패(종료 1)로 바뀐다.
- 로컬 실행:

```bash
pnpm run build:bundle   # 산출물이 있을 때만
node scripts/check-product-tour-remotion-chunks.mjs --require-manifest
node --test scripts/check-product-tour-remotion-chunks.test.mjs
```

## 3. G5-1·G5-2 — 배포 후 실재생 (운영 도메인)

전제: 배포가 끝난 상태, Playwright 설치(`pnpm install`된 체크아웃). 자격증명은
필요 없다(공개 페이지).

```bash
node scripts/verify-product-tour-live.mjs
# 대상 지정 시: --url https://www.toonstudio.cloud/product-tour
# 계획만 볼 때: --dry-run
```

스크립트가 실제로 하는 일 (전부 화면 신호로 판정한다):

1. `/product-tour`를 열고 챕터 레일 버튼이 **10개**인지 센다.
2. 포스터 버튼을 실제로 클릭해 재생을 시작한다(소리 재생이 사용자 입력 안에서
   시작돼야 하는 제품 구조와 같은 경로).
3. 플레이어 섹션(`#product-tour-video`)의 `data-player-engine`이 **"remotion"**
   으로 유지되고, `data-player-phase`가 "ready", `data-current-frame`이
   30프레임 이상 전진하는지 본다. 섹션이 `data-player-engine="mp4"`로 바뀌거나
   <video> 요소·폴백 안내(`.product-tour-player__fallback-notice`)가 나타나면
   그 자리에서 실패로 기록한다.
4. 내레이션·BGM <audio> 요소가 오류 없이 readyState ≥ 2에 도달하는지 본다.
5. 재생 초반 큐(0.8초~)의 한국어 자막 문장이 컴포지션 오버레이에 뜨는지 본다.
6. 5번 챕터 버튼(228초)을 눌러 `data-current-frame`이 6840±90으로 이동하는지 본다.

성공 기준: 위 판정 8개(G5-1 4개 + G5-2 4개)가 전부 통과. 결과 JSON은
`qa-results/product-tour-live/result.json`에, 실패 시 스크린샷이 함께 남는다.
종료 코드 0/1/2 = 통과/게이트 실패/실행 전제 미비(미실행을 통과로 보고하지 않는다).

자동 실행이 막힌 환경(브라우저 자동화 불가 등)에서는 같은 항목을 사람이
새 시크릿 프로필로 수행하고 아래 기록 양식에 남긴다. 이때도 판정 신호는 같다:
주소창이 아닌 **플레이어 섹션의 엔진 표기**가 기준이며, 눈으로 본 것만으로
"Remotion 재생"이라 쓰지 말고 개발자도구의 `data-player-engine` 값을 기록한다.

## 4. 실패 시 원인 분류 (폴백 사유 → 코드 경로)

`ProductTourPlayer.tsx`의 폴백 전환 경로는 세 가지뿐이다. 라이브 게이트가
실패하면 어느 경로인지부터 가른다.

| 관측 | 경로 | 먼저 볼 것 |
| --- | --- | --- |
| 재생 즉시 mp4로 전환 + 콘솔에 렌더 오류 | 컴포지션 렌더 오류(`errorFallback` 보고) | G5-3 재실행 — 중복 인스턴스가 1순위 원인. 그래도 단일이면 컴포지션 예외 스택 |
| 재생 중 mp4로 전환 + 오디오 오류 메시지 | 런타임 오디오 실패(`onAudioIssue`) | 내레이션/BGM 파일 404·CORS·`data-audio-revision`과 실제 파일 경로 대조 |
| 약 45초 로딩 후 mp4로 전환 | 시작 타임아웃 안전망 | 오디오 에셋 응답 시간, seekable fetch 실패 여부 |
| 처음부터 mp4 | 딥링크 `?mode=mp4` 또는 사용자 '호환 재생' 선택 | URL 파라미터 확인 — 게이트 실행은 파라미터 없는 URL로 한다 |

## 5. 기록 양식 (배포마다 1행)

| 항목 | 기록 |
| --- | --- |
| 배포 SHA / 배포 일시 (KST) |  |
| G5-3 결과 (CI 실행 링크 또는 로컬 출력) | 통과 / 실패(사유) |
| G5-1·G5-2 결과 JSON 경로 |  |
| data-player-engine 최종값 | remotion / mp4 |
| 프레임 전진 (시작 → 종료) |  |
| 자막 확인 구간 | 초반 큐 표시 여부 |
| 챕터 탐색 (5번 → frame) |  |
| 실패 시 원인 분류 (§4) |  |
| 롤백 여부 | DEPLOY.md 절차 참조 |

## 6. 경계

- 이 게이트는 **배포 후 확인을 고정**하는 것이지, 아직 배포되지 않은 빌드의
  운영 재생을 보장하지 않는다. 로컬·헤드리스 확인 결과와 운영 확인 결과를
  서로 바꿔 쓰지 않는다.
- 롤백은 `DEPLOY.md`의 정적 웹 롤백 절차를 따르고, 이 문서의 기록 양식에
  롤백 대상 버전과 함께 남긴다.
