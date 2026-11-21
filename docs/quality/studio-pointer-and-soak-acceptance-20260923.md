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
| `latency_baseline` | `true` | `desktop`에서 대표 17종의 새 원고 mouse 지연 검사도 한 번 실행 |
| `sample_heap_per_stroke` | `0` | 기본 10분 GC 표본 유지. 매 획 강제 GC는 별도 진단용 |
| `diagnostic` | `false` | CPU·GPU 원인 조사 계측을 끄고 수락 검사 실행 |

수동 300분 실행에서는 같은 빌드와 입력 설정으로 3분 사전 검사와 시각 분석을 먼저
통과해야 본 검사가 시작된다. 사전 검사와 본 검사는 서로 다른 페이지·보고서이며,
3분을 본 검사 시간에 더하지 않는다. 정기 실행의 기존 다섯 환경·300분·bounded-churn
설정은 유지한다. 유료 러너나 자동 운영 배포를 추가하지 않는다.
`latency_baseline=true`는 `profile=desktop`에서만 허용한다. 현재 대표 17종 검사기는
별도 desktop viewport와 Playwright mouse를 사용하며 모바일 또는 WebGPU profile을
적용하지 않는다. 지원하지 않는 profile 조합은 빌드 전에 거부하고 다른 환경의 통과로
표시하지 않는다.

### 2026-11-22 현재 구현: 원인 진단과 수락 검사 분리

수동·정기 수락 검사의 기본 시간은 300분이며 CPU profiler와 별도 GPU 비교 진단은
꺼져 있다. 수동 `diagnostic=true`는 1~3분에만 허용하고 대표 17종 수락 검사와 함께
요청하면 빌드 전에 실패한다. 이 모드에서 수집한 CPU·Trace와 GPU 비교는 원인 분석용이며,
제품 동작이 모두 정상이어도 `diagnostic-only` 실패를 남겨 수락 통과로 사용할 수 없다.
수락 검사의 작업 제한은 기존 345분, 짧은 진단은 25분이다. 임시 진단 기본값이 정기
300분 검사를 가로막지 않도록 실제 workflow 배선과 기본값을 함께 회귀로 확인한다.

첫 접촉 native Trace는 첫 실제 입력 시도 한 획의 직전에만 시작하고, 해당 입력·500ms 정착·
포인터 지연 회수가 끝나면 닫는다. CPU profile은 진단 세션 끝까지 수집한다. 첫 시도가
실패해도 뒤 획으로 대체하지 않으며, 캡처 범위와 실제 cycle을 메타데이터에 남긴다.
실제 canvas의 pointerdown·첫 pointermove·pointerup·down 뒤 첫 RAF에
세션과 cycle이 붙은 user timing marker를 남긴다. 원본 native trace의 marker 시각과
브라우저 `PerformanceMark.startTime`을 같은 frame·thread에서 대조하고 EventDispatch,
RunTask, style/layout, GC를 함께 보존한다. 첫 RAF는 잉크 픽셀이나 디스플레이 발광의
증명이 아니다. 기존 CPU profile의 호출 전후 시계 범위는 별도로 유지한다. marker 누락,
frame 변경, trace 유실·상한 초과·수집 timeout·정리 실패는 부분 원본과 함께 실패로 남긴다.
[Chromium의 추적 범주 목록](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/public/browser/tracing_controller.h)은 실행한 코드 경로에 따라 달라질 수 있으므로 요청 목록·응답
목록·차집합을 보존하고, 실제 RunTask·EventDispatch·UserTiming 증거로 수집 완전성을 판정한다.
입력 오류와 관측 종료 오류가 동시에 발생하면 둘 다 보존하고 수락 검사를 실패시킨다.
진단 수집을 마친 뒤 생긴 페이지·GPU 오류도 마지막에 다시 수집한다.

### 2026-11-22 관측: Linux 소프트웨어 WebGPU 표시 경로

[진단 run 123](https://github.com/blue45f/toonstudio/actions/runs/44925201668)은
`8a5358643f49661d19809ae8521f9d4216f55cfc`의 Chromium 158.0.8127.18에서 실행했다.
Linux SwiftShader의 기존 `--use-gl=swiftshader` 조합은 offscreen 연산은 성공했지만,
화면 canvas에서 GC 전에 장치 손실과 `WebgpuSwapChainTexture` backing 생성 실패가
발생했다. 같은 최소 재현의 Vulkan/ANGLE 조합은 telemetry wrapper 유무 모두에서
빨강→강제 GC→초록 readback과 64×64 PNG의 전체 픽셀이 일치했다. 이 관측은 제품의
장치 수명 코드나 강제 GC를 단독 원인으로 지목하지 않으며 Chromium 내부 결함까지
확정한 것도 아니다. 당시 8조건 모두 별도의 command-line metadata 수집 오류를
남겼으므로 진단 전체를 오류 없는 통과로 표시하지 않는다.

현재 소크의 Linux WebGPU 실행은 위 재현에서 확인한 Vulkan·ANGLE·SwiftShader 설정을
공통 helper로 사용한다. 다른 플랫폼과 비 WebGPU profile의 실행 설정은 기존 값이다.
실제 제품 세션의 장치 손실·거절 획·시각 오류·성능·시간 기준은 그대로 적용하고,
이 설정 변경의 수락 여부는 새 소크 결과로 판단한다. 소프트웨어 adapter 결과를
물리 GPU·모바일 운영체제·실제 펜 장치 인증으로 간주하지 않는다.

### 현재 화면의 브러시 선택과 Undo/Redo

PC의 활성 브러시 pill은 떠 있는 라이브러리를 연다. 소크는 실제 보이는 floating 또는
기존 dock의 단일 라이브러리에서 정확한 브러시 ID를 선택하고, `aria-pressed`와 비동기
적용 완료를 모두 확인한다. 떠 있는 창은 실제 닫기 버튼으로 닫아 다음 획의 캔버스를
가리지 않도록 한다. 라이브러리 중복, 적용 지연, 닫기 실패는 검사 실패로 남긴다.

Undo/Redo는 공통 history selector를 재사용해 현재 Clarity 기록 막대의 사용자 버튼을
우선한다. 모바일에서 기본적으로 접힌 상단 편집 행은 실제 편집 버튼으로 펼친 뒤
기록 명령을 실행한다. 검사기가 펼친 행은 성공·실패 모두 실제 버튼으로 다시 접고,
원래 펼쳐져 있던 행은 유지한다. 펼침·접힘 상태와 실제 가시성을 함께 확인하며,
명령과 정리가 모두 실패하면 두 오류를 보존한다.
중복되거나 비활성인 버튼을 성공으로 처리하지 않는다. `bounded-churn`은
기존 Undo 10회·Redo 3회·Undo 3회의 실제 레이어 수 복귀를 계속 확인한다.
`accumulate`는 이 정리를 수행하지 않으므로 기록 복원 경로는 `bounded-churn` 실행으로
별도 확인해야 한다. DOM 회귀 검사는 소크의 실제 선택·기록 함수를 실행하며, 브라우저
검사의 결과와 함께 확인한다.

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

## 2026-11-22 현재 구현: 장시간 명령 기록의 중복 판정

기존 482회 paint 검사는 241종을 두 번 그리는 검사다. eraser 5종을 두 번 사용한
10회를 합치면 246종·492회 작업이다. 실제 브라우저에서 개별 작업은 모두 성공한 뒤
명령 journal의 중복 판정 오류가 console 검사에 걸렸다. 별도의 결정적 제품 재현에서는
draw→Undo→Redo→Undo의 737번째 반복에서 한 번도 사용하지 않은 `undo:2948`이
기존 ID로 판정됐다. 두 실행의 정확한 명령 순서가 같다고 주장하지 않는다.

새 Studio history journal은 명시적인 `sequence-v1` 정책을 사용한다. 새 record ID는
`recordType:nextSequence`, 새 group과 transaction ID는 해당 생성 순번,
checkpoint ID는 다음 record 순번과 일치해야 한다. 보관된 동일 요청의 재시도는
기존 정확한 ID·요청 checksum 대조를 먼저 수행한다. 오래된 순번, 미래 순번,
다른 명령 종류의 ID를 새 명령으로 받아들이지 않는다. 정책 metadata는 journal과
checkpoint의 checksum 대상이며, append·compaction·직렬화 복구에 같은 계약을 적용한다.

4096개 exact retry 기록, 8KiB 확률 필터, bridge의 512개 record와 4MiB 직렬화 상한은
유지한다. 새 정책은 필터가 포화돼도 정확한 순번 계약으로 새 ID와 과거 ID를 구분한다.
회귀 검사는 기존 737번째 실패, 26,000개 명령과 다섯 번의 재열기, 보관 한계 초과,
포화 필터, 실제 중복 거부 및 저장 metadata 한도를 확인한다. 이는 기록 수·직렬화
크기와 동작의 검증이며, 실제 브라우저의 5시간 heap 측정 결과를 대신하지 않는다.

새 획 없이 Undo/Redo만 반복하는 경우도 같은 448개 압축 경계를 적용한다. 기존에는
새 transition에서만 압축해 256번째 Redo가 512개 record 한도에 걸렸다. 현재는 경계에
도달한 탐색에서 호출자가 선택한 authoritative snapshot을 journal의 새 horizon으로
기록한다. 사용자 snapshot history와 원고는 보존하며, 경계 전의 탐색은 계속 기록한다.
1,400회 탐색, Undo와 Redo 각각의 경계, pending coalesced 편집 flush, 재열기 후
새 편집 재개를 회귀로 확인한다. 신규 명령 ID와 이 탐색 경계의 회귀는 기존 bridge·client·
durable runtime 검증과 함께 필수 `studio-foundation` shard에서 실행한다.

### Legacy exception: 기존 임의 ID 기록

정책 metadata가 없는 기존 journal은 기존 계약으로 그대로 복구한다. 구판 integration의
내용이 현재 authoritative snapshot과 맞으면 자동으로 기록을 버리거나 새 정책을
추정하지 않는다. 기존의 명시적 rebase/reset 또는 history horizon 복구가 일어날 때
새 정책의 journal을 생성한다. 구판 checkpoint가 1번부터 마지막 순번까지의 모든
record ID를 정확히 보관했음을 확인한 경우에만 불필요한 record 확률 판정을 생략한다.
checkpoint ID의 재사용 방지와 불완전한 이전 기록의 보호는 유지한다. 4096개 보관
범위를 넘어 과거 ID를 증명할 수 없는 구판 기록에는 확률 필터의 한계가 남는다.
이를 감추기 위한 필터 초기화나 기존 문서·Undo 삭제는 수행하지 않는다.
