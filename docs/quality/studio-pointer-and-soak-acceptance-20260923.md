# Studio pointer and long-session acceptance — 2026-09-23

## Scope

This gate closes the browser-automatable part of the remaining input and long-session migration
risk. It drives the same Studio Pointer Events path with three explicit authorities:

- `mouse`: Playwright mouse compatibility baseline.
- `pen`: Chromium CDP pen events with changing pressure, tangential pressure, tilt X/Y and twist.
- `touch`: Chromium CDP touch start/move/end with changing force and contact geometry.

`auto` resolves to `pen` for desktop and `touch` for phone-sized in-app profiles. Pen or touch
runs fail closed when a Chromium CDP session is unavailable; the gate never silently downgrades to
mouse evidence.

The generated path is deterministic and bounded to the current document surface. Every stroke
records its input mode, point count, pressure range, tilt ranges and twist range alongside the
before/after changed-pixel sample. The five-hour report also keeps the existing runtime-error,
GPU device-loss, long-task, post-GC heap, DOM-node and event-listener telemetry. The current
collection and completion boundaries are recorded in the Korean update below.

## Short product acceptance

Build and start a production preview, then run:

```bash
node scripts/verify-studio-skia-multitab-mobile.mjs http://127.0.0.1:4173
```

The desktop tabs use pressure-aware CDP pen streams. The mobile 390×844 profile uses CDP touch
contact. The check preserves the existing requirements for exact visible Skia presentation,
cross-tab context-loss isolation and explicit same-engine recovery.

## Long-session matrix

Use an explicit output directory for every row so reports cannot overwrite one another.

```bash
TOONSPECTRUM_SOAK_MINUTES=30 \
TOONSPECTRUM_SOAK_INPUT=pen \
TOONSPECTRUM_SOAK_OUT=artifacts/studio-soak/desktop-pen-30m \
pnpm exec tsx scripts/verify-studio-five-hour-soak.mts

TOONSPECTRUM_SOAK_MINUTES=120 \
TOONSPECTRUM_SOAK_PROFILE=instagram-ios-390 \
TOONSPECTRUM_SOAK_INPUT=touch \
TOONSPECTRUM_SOAK_OUT=artifacts/studio-soak/mobile-touch-120m \
pnpm exec tsx scripts/verify-studio-five-hour-soak.mts

TOONSPECTRUM_SOAK_MINUTES=300 \
TOONSPECTRUM_SOAK_INPUT=pen \
TOONSPECTRUM_SOAK_WEBGPU=1 \
TOONSPECTRUM_SOAK_OUT=artifacts/studio-soak/desktop-pen-webgpu-300m \
pnpm exec tsx scripts/verify-studio-five-hour-soak.mts
```

A run is rejected for persistent missing ink, blocked pen authority, uncaught page/worker/promise
errors, non-benign GPU loss, excessive retained-heap growth or a retained-heap slope above the
shared policy. Existing third-party build warnings are not converted into soak success or failure.

## Evidence boundary

CDP pressure/touch is deterministic browser-level evidence. It proves the application consumes
pressure, tilt, twist and touch contact without relying on a mouse-only harness. It does not claim
that a specific physical tablet driver, palm-rejection implementation, mobile OS thermal policy or
battery profile was attached to this machine. Hardware certification must retain its actual device,
OS, browser and driver identity next to the same report schema rather than replacing this gate.

## 2026-11-21 현재 구현: 누적 원고와 완료 증거

장시간 누적 사용은 `TOONSPECTRUM_SOAK_WORKLOAD=accumulate`로 실행한다. 이 모드는
기본 `bounded-churn`의 Undo/Redo 정리를 하지 않고 같은 페이지와 원고를 유지한다.
각 획의 실제 수락 여부, history append 누계·예산 퇴출·유지 바이트·거절 획 수를 함께
확인한다. 원고가 커진 결과와 정리가 실패한 결과를 메모리 누수로 단정하지 않는다.
기존 50ms 그리기 longtask 및 메모리 증가 정책은 유지한다.

GitHub Actions의 `Studio 5h stability soak` 수동 실행은 다음 입력을 지원한다.

| 입력 | 누적 PC 펜 검사의 값 | 의미 |
| --- | --- | --- |
| `minutes` | `300` | 실제 편집 세션의 최소 분 수. 빌드·준비 시간은 제외 |
| `profile` | `desktop` | 선택한 환경 하나만 실행. `all`은 기존 다섯 환경 |
| `workload` | `accumulate` | 같은 원고에 획 누적 |
| `input` | `pen` | 압력·기울기·회전이 있는 CDP 자동화 입력 |
| `brush_cycles` | `1` | 획마다 다음 paint 브러시 선택 |
| `stop_on_failure` | `true` | 첫 제품·계측 실패의 원본을 보존하고 중단 |
| `measure_pointer_latency` | `true` | 같은 원고의 입력→다음 RAF 시간 측정 |
| `latency_baseline` | `true` | 단일 환경에서 대표 17종의 새 원고 지연 검사도 한 번 실행 |
| `sample_heap_per_stroke` | `0` | 기본 10분 GC 표본 유지. 매 획 강제 GC는 별도 진단용 |

수동 300분 실행에서는 같은 빌드와 입력 설정으로 3분 사전 검사와 시각 분석을 먼저
통과해야 본 검사가 시작된다. 사전 검사와 본 검사는 서로 다른 페이지·보고서이며,
3분을 본 검사 시간에 더하지 않는다. 정기 실행의 기존 다섯 환경·300분·bounded-churn
설정은 유지한다. 유료 러너나 자동 운영 배포를 추가하지 않는다.
`profile=all`과 `latency_baseline=true` 조합은 빌드 전에 거부한다. 여러 환경 중 하나의
지연 검사만 실패하고 나머지 환경이 본 검사를 계속하는 모호한 선행 조건을 만들지 않는다.

### 같은 원고의 p95·p99

`measure_pointer_latency=true`는 원래 그리던 획의 `pointermove`를 수동으로 관측한다.
추가 mouse 입력, 원고 초기화, 페이지 이동, 별도 지연 측정용 획은 만들지 않는다.
원시 표본은 `pixelSamples[].pointerLatency`, 10분 구간별 p50·p95·p99·최댓값·표본 수는
`acceptance.pointerLatency.windows`에 남는다. 백분위수를 계산할 때 각 획의 평균이나
p95를 다시 평균내지 않고 해당 구간의 모든 원시 이벤트 시간을 사용한다.

측정 경계는 **pointermove capture listener 관측 시각 → 다음 requestAnimationFrame
callback 시작 시각**이다. 실제 펜 접촉→디스플레이 발광, 특정 입력의 잉크 반영,
제품 append 완료를 측정한 수치가 아니다. 각 제한은 보고서에도 별도 필드로 기록한다.
브라우저가 합친 이벤트 내부의 모든 하드웨어 표본을 측정했다고 주장하지 않는다.

같은 `sessionId`·`pageEpoch`·원고 URL·cycle에서 예상한 입력 수와 종류가 모두 맞아야
계측 완료가 된다. pointercancel, 표본 누락, 다른 입력 종류, 관측기 소실, 페이지 변경은
0ms나 정상값으로 대체하지 않는다. 실제 300분 이후에도 입력할 수 있는지 확인하기 위해
계측을 요청한 실행은 시간 경계 뒤에 정상 cycle을 한 번 더 수행한다. 마지막 획과
마지막 입력의 실제 원고 나이는 `lastStrokeAgeMs`·`lastInputAgeMs`를 확인한다.
마지막 구간의 표본이 28개라면 nearest-rank p99는 최댓값이므로 표본 수도 같이 보고한다.
이 계측 완료는 대표 브러시의 전체 성능 예산 통과 인증과 구분한다.

### 실행 전후 빌드와 마지막 오류

대표 17종 latency 보고서는 시작·종료 시점의 전체 Git SHA, 깨끗한 소스 상태,
buildId, metadata와 index의 SHA-256을 대조한다. 같은 SHA를 표시해도 실행 중 산출물
해시가 바뀌면 실패한다. 입력은 `playwright-mouse`이고 물리 장치 인증은 `false`다.
소크의 CDP pen 입력과 같은 입력 장치로 해석하지 않는다.

소크는 각 cycle뿐 아니라 마지막 대기와 종료 정리 이후에도 runtime 오류를 수집한다.
페이지가 만든 dedicated Worker의 `error`·`messageerror`와 worker console.error도
관측하며 정상 worker 종료는 오류로 만들지 않는다. 이 관측으로 모든 SharedWorker,
Service Worker 또는 worker 내부에서 처리된 오류까지 검증했다고 주장하지 않는다.

### 필수 이미지와 완료 판정

300분 검사에는 initial·10~290분 periodic·final의 **31개 메모리 체크포인트**와
10~290분 periodic·final의 **30개 필수 PNG**가 필요하다. PNG마다 예정 시각, 실제
세션 시각, 파일명과 저장 시점 SHA-256을 기록하고 시각 분석에서 실제 파일과 대조한다.
누락·중복·해시 변경·이전 실행의 PNG 재사용은 실패다. 캡처 실패도 계측 오류에 남긴다.
화면 전체의 색상·변화 검사는 편집 성공을 대신하지 않으므로 실제 획 수락과 원고
진행, 오류, 시간·메모리·입력 계측 판정도 모두 확인한다.

완료 보고에는 `status=pass`, `ok=true`, `acceptance.fiveHourProofComplete=true`,
소크와 시각 분석의 실제 exit 0을 함께 확인한다. 짧은 사전 검사, 중단된 실행,
서로 다른 페이지의 시간을 합친 결과를 5시간 통과로 보고하지 않는다.
