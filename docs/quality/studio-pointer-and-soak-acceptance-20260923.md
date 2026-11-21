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
요청하면 빌드 전에 실패한다. 이 모드에서 수집한 CPU·native trace와 GPU 비교는 원인 분석용이며,
제품 동작이 모두 정상이어도 `diagnostic-only` 실패를 남겨 수락 통과로 사용할 수 없다.
수락 검사의 작업 제한은 기존 345분, 짧은 진단은 25분이다. 임시 진단 기본값이 정기
300분 검사를 가로막지 않도록 실제 workflow 배선과 기본값을 함께 회귀로 확인한다.

첫 접촉 native Trace는 첫 실제 입력 시도 한 획의 직전에만 시작하고, 해당 입력·500ms 정착·
포인터 지연 회수가 끝나면 닫는다. CPU profile은 진단 세션 끝까지 수집한다. 첫 시도가
실패해도 뒤 획으로 대체하지 않으며, 캡처 범위와 실제 cycle을 메타데이터에 남긴다.
준비 화면 캡처·이후 획·휴식·종료 history 정리와 GC는 이 native 수집 범위에 포함하지 않는다.
실제 canvas의 pointerdown·첫 pointermove·pointerup·down 뒤 첫 RAF에
세션과 cycle이 붙은 user timing marker를 남긴다. 원본 native trace의 marker 시각과
브라우저 `PerformanceMark.startTime`을 같은 frame·thread에서 대조하고 EventDispatch,
RunTask, style/layout, GC를 함께 보존한다. 이후 획의 원인이나 첫 잉크 표시·디스플레이 발광·
물리 펜 지연의 증명이 아니다. 기존 CPU profile의 호출 전후 시계 범위는 별도로 유지한다.

원본은 64MiB로 제한하며, 이 상한은 JSON 파싱을 포함한 Node 전체 메모리의 상한이 아니다.
marker 누락·시계 불일치·frame 변경·trace 유실·상한 초과·수집 timeout·정리 실패는
부분 원본과 함께 실패로 남긴다.
[Chromium의 추적 범주 목록](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/public/browser/tracing_controller.h)은 실행한 코드 경로에 따라 달라질 수 있으므로 요청 목록·응답
목록·차집합을 보존하고, 실제 RunTask·pointerdown EventDispatch·native UserTiming 증거로
수집 완전성을 판정한다. 일반 300분 경로에서는 CPU·native trace 계측을 시작하지 않는다.
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
공통 helper로 사용한다. 비 WebGPU profile도 [Chromium의 현재 OpenGL ES 실행 경로](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/gpu/swiftshader.md)에
맞춰 ANGLE·SwiftShader를 사용한다. Vulkan 조합은 실측한 Linux WebGPU에만 적용한다.
소크와 비교 진단은 설치된 Playwright·Chromium·CDP 버전과 요청·실제 실행 인자를 함께
남긴다. 실제 인자가 누락되거나 같은 스위치가 뒤에서 다른 값으로 덮어써진 경우도 실패한다.
실행 정보 수집·정리 실패를 정상 실행으로 표시하지 않는다. 이 정보 수집은 입력 전에
끝내고 일반 수락 경로에는 CPU·Trace를 켜지 않는다.
실제 제품 세션의 장치 손실·거절 획·시각 오류·성능·시간 기준은 그대로 적용하고,
이 설정 변경의 수락 여부는 새 소크 결과로 판단한다. 소프트웨어 adapter 결과를
물리 GPU·모바일 운영체제·실제 펜 장치 인증으로 간주하지 않는다.

[진단 run 124](https://github.com/blue45f/toonstudio/actions/runs/44929862825)의
`daba54f6380b1b5d534afdef7b7f3cd63a7fe092` 실행에서 desktop·Kakao·Naver는
조회 범주의 `toplevel` 누락을 잘못 거절해 실제 입력 전에 종료했다. Instagram·WebGPU는
3분 native Trace의 자료 손실과 64MiB 초과가 확인되어 추적 완료로 인정하지 않았다.
이 결과 때문에 범주 조회와 실제 원본 검증을 구분하고 native 수집 범위를 첫 시도로 줄였다.
WebGPU 독립 비교의 Vulkan/ANGLE 네 조건은 픽셀 readback과 메타데이터를 확보했지만,
Studio의 실제 여섯 획은 live-ink `timeout`으로 거절됐다. 이 세션의 GPU 장치 손실은
0건이며 receipt 지연·누락·정체성 불일치 중 어떤 하위 원인인지는 이 원본만으로 확정하지
않았다. 장치 손실 0건만으로 제품 성공을 판정하지 않으며, 위 두 진단 실행은 300분 수락
검사나 물리 장치 인증의 근거가 아니다.

### 대표 17종 지연 보고서의 측정 경계

[run 125](https://github.com/blue45f/toonstudio/actions/runs/44930183797)는 같은 `daba54f`의
새 desktop context에서 브러시별 mouse 첫 접촉 한 번을 검사했다. 6종 통과·11종 실패이며,
11종 모두 한 프레임을 뺀 첫 픽셀 관측 시간의 8ms 기준을 넘었다. oil은 연속 이동 구간의
55ms long task와 move→RAF p99·release→RAF 기준도 넘었다. 기준 검사 실패 때문에
뒤의 소크는 실행하지 않았다. 실행하지 않은 시간을 연속 사용 증거로 더하지 않는다.

`firstPixelMs`는 실제 pointerdown capture 시각부터 canvas backing store의 픽셀 변화를
처음 관측한 RAF 시작 시각까지다. Playwright 명령 전송 대기는 제외하지만, 실제 compositor·
CSS 가림·디스플레이 발광이나 첫 dab 함수의 실행 시간을 직접 측정하지 않는다.
이 실행의 17종은 모두 첫 RAF 표본에서 이미 픽셀이 바뀌어 있었으므로 실제 생성 시각은
그보다 빠를 수 있다. `pointerAppendDurationsMs`는 window capture→microtask이며 제품
append 함수 자체의 실행 시간이 아니다. `settleMs` 수락 값은 release→첫 RAF로,
다른 획에서 수행한 픽셀 안정화 검사와 구분한다. 실제 72개 move의 전달률은 약 28~41Hz였으며
코드의 2ms 대기를 500Hz 실측으로 해석하지 않는다. 이러한 경계를 이유로 8ms·50ms
수락 기준을 완화하거나 기존 실패를 통과로 바꾸지 않는다.

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

## 2026-11-22 추가 검증: 진행 시한과 실제 첫 입력 원본

### GPU 진행 시한의 실제 Host 배선

일반 `appendGpuLiveSourceJournalSuffix`도 매번 terminal 전용 2,000ms override를
전달해, 첫 receipt 이후 시작한 progress 시한이 연속 입력마다 뒤로 밀렸다.
현재 일반 append는 override 없이 기존 300ms 시한을 유지하며, `sealEndpoint=true`
종료 요청과 후보정 terminal baseline만 기존 2초 예산을 사용한다. 실제 Host 함수를
AST에서 추출해 실제 watchdog과 실행하는 두 회귀는 수정 전 실패하고 수정 후 통과했다.
기존 watchdog·GPU audit와 합쳐 10/10이며, Host 줄 수는 증가하지 않았다.

이 수정은 최초 receipt의 300ms 절대시한을 바꾸지 않는다. 아래 실행은 이 변경 전
소스이므로 새 progress 수정의 브라우저 검증으로 합산하지 않는다. 이전 #124의
first-visible timeout도 이 수정으로 해결됐다고 주장하지 않는다.

### 일반 실행 #126·#128

[300분 누적 후보 #126](https://github.com/blue45f/toonstudio/actions/runs/44932843133)의
소스는 `7bc397814c8eef65181ca5f0b87f3526b2040a5a`다. CPU/native 진단을 끈 실제
3분 사전 검사에서 다음 조기 중단을 확인했다. 두 환경 모두 첫 획 수락 1회·거절 0회·
history append 1회·GPU/runtime 오류 0회였지만 긴 작업 기준을 통과하지 못했다.

| 화면 프로필 | 입력과 겹친 긴 작업 | 시간 정합과 판정 |
| --- | --- | --- |
| instagram-ios | 51ms 1건 | pointerup 0.355ms 전부터 50.645ms 뒤까지 겹쳤다. 18.135초에 중단, 300분 본 검사 생략. |
| desktop | 84ms·87ms | 각각 pointerdown 전후와 pointerup 전후에 겹쳤다. 22.068초에 중단, 300분 본 검사 생략. |

관측 시각은 페이지 epoch를 보고서 시계에 맞춰 비교했다. 함수별 attribution이 없어
JS·layout·GC 중 무엇이 원인인지는 확정하지 않는다. iOS의 51ms를 첫 접촉 지연으로
분류하지 않으며, 조기 중단 뒤의 시각 분석 실패도 별도의 GPU 제품 결함으로 더하지 않는다.

[일반 3분 후보 #128](https://github.com/blue45f/toonstudio/actions/runs/44933128643)의
소스는 `46c884d0c1f5bbe5c77acc1d19b3c23492be30fe`다. Naver 화면 프로필은
185.668초·획 수락 7회·거절 0회·history action 13회·입력 중 긴 작업 0회로 통과했다.
이전 non-WebGPU 실행 인자를 쓴 별도 소스의 짧은 검사이며, 300분 증거나 물리 모바일
장치 인증으로 해석하지 않는다. pointermove→다음 RAF p95 1.475ms·p99 2.305ms는
실제 잉크 표시나 디스플레이 발광 시각이 아니다.

### 첫 입력 native 원본 #127

[진단 #127](https://github.com/blue45f/toonstudio/actions/runs/44933071786)은
`46c884d0` 소스의 첫 입력 한 번과 종료 뒤 500ms 구간을 수집했다. Instagram 원본은
11,917,563바이트이며 수집·stream 모두 완료, `dataLossOccurred=false`, 검증 issue 0개다.
SHA-256은 `f0402c7117fcaa90062c9437b170253a84b3871b2a1c7b3ce4d67767198c9412`다.
이 환경에서 이전 64MiB 손실은 해소됐지만 다른 환경의 완료를 대신하지 않는다.

첫 renderer `RunTask` 17.536ms를 같은 thread의 중첩 이벤트를 제거해 분류하면
style 0.288ms·layout 0ms·기록된 GC 0ms·JS/V8 13.949ms·기타 3.299ms다.
pointerdown EventDispatch 13.332ms와 Konva callback 10.989ms는 이 총계 안에
포함되므로 더하지 않는다. #124에서 보인 큰 style/layout 비용은 이 첫 task에서는
재현되지 않았다. 진단 실행의 7회 획 수락과 원본 수집 완료는 일반 성능 수락을
의미하지 않으며, 의도한 `diagnostic-only` 종료 상태를 그대로 유지한다.

## 2026-11-22 후속 구현: 연속 입력과 적용 배치의 일관성

### GPU 표시 요청의 진행

결정적 회귀 재현에서는 16ms 간격의 새 입력이 아직 끝나지 않은 GPU 요청을 계속
교체해, 40ms fence가 정상 완료돼도 현재 요청의 정확한 receipt로 인정되지 못했다.
현재는 활성 WebGPU
획의 같은 identity에서 일반 요청 하나가 진행 중이면 새 원본 점을 기존
`liveDraftVisualRef`에 보존하고 journal cursor와 요청을 유지한다. 정확한 receipt를
수락한 뒤 활성 획·epoch·drawing 상태·watchdog를 다시 대조해 미제출 suffix를 보낸다.
별도의 원본 점 배열이나 무제한 제출 큐를 추가하지 않는다.

획 종료는 이 보류 경로를 우회해 마지막 원본 점을 포함한다. 새 기하가 없어도 진행
중인 exact 요청이 terminal 역할로 바뀌면 기존 2,000ms 예산을 적용한다. 일반 진행의
300ms, 첫 표시의 300ms 절대시한, 후보정 뒤 최종 exact receipt 요구는 그대로다.
오래된 receipt·취소·resize·다음 획·스타일 변경·동기 receipt를 실제 journal,
audit, watchdog 및 Host 배선과 함께 회귀 검증한다. 이 구현의 단위 검증은 앞선
소스에서 발생한 브라우저 timeout의 원인 확정이나 새 소스의 성능 수락을 대신하지 않는다.

### 첫 입력의 중복 처리와 작업공간 저장

첫 접촉에서 확정된 좌표는 같은 Stage의 일반 입력에 한해 커서에도 재사용한다.
다른 Stage, replay, zoom·backdrop으로 좌표가 다시 정해지는 경로는 기존 측정을
유지한다. 실제 pointerdown binder 회귀에서 중복 좌표 읽기 제거와 이 예외를 확인한다.

최근 입력 기기의 관측은 ref에만 기록하며, 실제로 적용한 작업공간 기기는 배치를
적용할 때 변경한다. 펜을 쓰다가 마우스로 메뉴를 열어도 보이는 도크의 폭을 다른
기기 override에 덮어쓰지 않는다. 메뉴의 `지금 도크로`도 실제 적용 기기의 배치를
읽고, 메뉴가 선택한 저장 대상 기기는 유지한다. 명시적인 `null`은 저자 배치이며,
기존 호출자가 새 값을 제공하지 않은 `undefined`와 구분한다.

### 다음 진단의 실행 파일 출처

진단 실행에서만 검증된 dist의 선택된 Studio·React JavaScript를 작은 별도
산출물로 수집한다. 소스 SHA, 깨끗한 상태, buildId, metadata·index 해시와 복사한
파일 해시를 대조하고 누락·중복·symlink를 거부한다. 파일당 16MiB·합계 32MiB
상한을 지키며 일반 소크에는 추가 수집을 하지 않는다. 이는 minified stack을 해당
빌드 코드와 대조하기 위한 자료이며, HTTP 응답이나 실제 실행 함수의 증명은 아니다.

### 이전 실행의 최종 결과와 남은 수락

앞서 일부만 기록한 #126은 다섯 환경 모두 사전 검사에서 실패했다. Naver의 52ms,
Kakao의 50ms 입력 중 긴 작업도 기준을 넘었다. WebGPU는 1회 시도·0회 수락·
1회 거절이며 selected-engine `timeout`, GPU event·runtime error 0회였다.
**300분 본 검사는 모든 환경에서 시작하지 못했다.** 이 보고서는 timeout의
first-visible·progress·terminal 세부 phase를 보존하지 않아 정확한 시한은 미확정이다.

#127은 다섯 환경 모두 첫 입력 native trace와 stream 수집 완료·data loss 0·검증
issue 0을 확인했다. 같은 `46c884d0`의 #128 일반 실행은 모바일 화면 프로필 세 개에서
각각 7/7획·입력 중 긴 작업 0회로 3분 검사를 통과했으나, desktop은 61ms 긴 작업
두 건, WebGPU는 profiler를 끈 상태에서도 0/1획·selected-engine `timeout`으로
실패했다. 따라서 그 소스의 GPU 실패를 profiler 영향만으로 설명할 수 없다.

[일반 3분 후보 #129](https://github.com/blue45f/toonstudio/actions/runs/44934296704)는
`959c1b69fb06959c7804f78e97b2128110f40e7e` 소스로 다섯 환경 모두 실패했다.
실제 ANGLE 실행 인자 수집은 완료됐지만 WebGPU는 0/1획·generic timeout이며,
다른 네 환경도 입력 중 긴 작업 기준을 넘었다. 이 실행 또한 후속 제품 수정 이전이다.
실행 인자가 다른 단일 runner 결과만으로 해당 옵션의 인과 효과를 단정하지 않는다.

현재 후속 코드의 필수 전체 CI와 브라우저 소크는 별도 SHA의 실행에서 다시 확인해야
한다. 새 helper까지 포함한 로컬 부분 타입 검사도 4GiB Node heap 한도에서 OOM으로
종료되어 전체 타입 통과 근거로 쓰지 않는다. 대표 17종의 기존 엄격 판정 6종 통과·
11종 실패와 실제 300분 수락 미완료 상태를 유지하며, 기준값을 완화하지 않는다.

## 2026-11-22 추가 분석: 첫 입력의 상태 갱신과 캔버스 표시 수명

### 실행 코드와 대조한 첫 입력 #130

[진단 #130](https://github.com/blue45f/toonstudio/actions/runs/44938045596)의
소스는 `ecd2cebdbbeedc8a5b80c125319e23bd71d5019b`다. API digest, native·CPU
원본과 선택된 실행 JavaScript의 해시를 확인했다. native 수집·stream은 완료됐고
data loss와 검증 issue는 없었다. 실제 CPU 표본의 함수·URL·위치·호출 조상과
native 시계를 대조했으며, 표본 수를 함수별 CPU 시간 비율로 해석하지 않는다.

첫 pointerdown에서 `recordPointerType`의 상태 갱신 뒤 실제 Host와 작업공간 배치
계산을 포함한 React callback 18.599ms를 확인했다. 현재 입력 기기 관측은 해당
상태 갱신을 제거한 ref 경로다. 이 callback 전체를 그 setter 하나의 비용으로
귀속하거나 새 코드가 정확히 18.599ms 빨라졌다고 주장하지 않는다.

pointerup에는 Host를 포함한 두 React callback 29.877ms·25.350ms와 Konva의
좌표 측정 경로에 겹친 style/layout 27.492ms가 있었다. callback은 task 내부
구간이므로 전체 108.533ms에 중복해서 더하지 않는다. 두 React 구간 사이에 실제
`StudioShellFloatingTarget`의 같은 대상 탐색 callback이 10회 실행됐다. 새 hook은
마지막 요청의 DOM node와 force-visible 값이 같으면 React dispatch 전에 반환하고,
변경되면 두 값을 하나의 snapshot으로 전달한다. React 반영 전 A→B→A 관측도
마지막 요청 ref를 먼저 갱신해 보존한다. 이 수정의 동작 회귀와 실제 지연 개선은
별도 판정이며, 두 번째 Host callback 전체의 제거를 증명한 것은 아니다.

### 사전 검사 #131의 입력 전 표시 실패

[300분 후보 #131](https://github.com/blue45f/toonstudio/actions/runs/44940293374)의
소스는 `6becda63049a3e7a94eedfec100a550c543a8464`다. Naver·Instagram iOS·
Desktop WebGPU 화면 프로필에서 실제 원고가 약 72×108 CSS px로 표시됐다.
Desktop의 공개 배율 표시도 10%였다. 세 환경은 120×120 이상의 가리지 않은
입력 영역을 찾지 못해 각각 8.542초·11.829초·6.654초에 첫 입력 준비를 끝냈다.
완료 획·픽셀 표본·입력 중 긴 작업은 모두 0이며 300분 본 검사는 시작하지 않았다.
이 결과를 GPU receipt 또는 브러시 성능의 성공·실패로 계산하지 않는다.

상위 Host의 폭 관측은 최초 DOM 참조를 계속 보관하고 숨김 상태의 0폭도 배율에
반영할 수 있었다. 후속 구현은 실제 `StudioCanvasViewport`의 layout effect에서
관측을 소유해 표시·숨김·재마운트 수명에 맞춰 다시 측정한다. 0폭·분리된 노드·
cleanup 뒤 callback은 기존 배율을 덮지 않는다. 회전은 최신 문서 폭 ref만 갱신하고
다음 실제 크기 변화에 사용하며, 배율 하한 0.1과 상한 2.5/4는 유지한다.
기존 artifact에는 초기 ref·폭 관측 이력이 없어 이 수명 문제가 #131의 유일한
원인이었다고 확정하지 않는다. 소크에 강제 맞춤 동작을 넣거나 입력 영역·지연
기준을 낮추지 않으며, 새 SHA의 실제 첫 화면과 입력 결과로 후속 수락을 확인한다.

같은 관측 코드가 있는 `471a970c69eeea60560fd25cfaff20162b8a3793`의
[진단 #134](https://github.com/blue45f/toonstudio/actions/runs/44942289825)도
WebGPU 181.104초·Naver 185.347초 동안 각각 7회 모두 입력 영역 준비에서 실패했다.
작은 보고서 ZIP의 전체 API digest와 내부 파일 무결성을 검증했다. 실제 입력이
없어 첫 입력 native trace가 없으며, 긴 세션 CPU 표본만으로 receipt나 입력 지연의
개선을 판정하지 않는다. 이 두 환경의 결과는 후속 관측 수정 이전 증거다.

### 복수의 정상 진단 실행 파일 보존

#134의 검증한 빌드에는 `studio-konva-runtime-CgWvCJDQ.js`와
`studio-konva-runtime-Dq2AFIuE.js`가 함께 있었다. 수집기의 이름군당 한 파일
가정이 정상 runtime·facade를 중복으로 거부했다. 후속 수집기는 필수 이름군 세 개를
계속 요구하고, 이름군마다 서로 다른 실행 파일을 최대 네 개까지 이름·바이트·해시
그대로 보존한다. 가장 큰 파일 하나로 추정해 대체하지 않는다. 다섯 번째 파일,
동일 실파일의 하드링크 중복, symlink, 필수 파일 누락은 출력 전에 거부한다.
개별 16MiB·합계 32MiB와 source/build/session/index/metadata·복사 후 해시 검증을
유지하며, 보고서의 schemaVersion 1과 files 배열 계약은 바꾸지 않는다.

새 캔버스 관측 수명 11개, 기존 보기·입력 33개, PSD·협업 준비·부동 대상 90개,
필수 테스트 manifest 계약 74개, 진단 실행 계획·수집기 60개 회귀를 각 영향 범위에서
실행했다. 새 관측 hook 두 개와 대응 테스트의 부분 strict TypeScript program은
330개 source·진단 0개였으며 Host는 포함하지 않았다. 전체 Host/프로젝트 타입 검사,
필수 전체 CI, 새 소스의 브라우저 성능 및 300분 수락은 이 로컬 결과와 구분한다.

### 협업 모듈 로딩에서도 같은 원고 DOM과 입력 소유권 유지

기존 지연 협업 공급자는 idle/fallback과 실제 runtime의 서로 다른 분기에 편집기
children을 넣었다. 모듈 준비 뒤 분기가 바뀌면 viewport DOM은 재설치되지만 바깥
Host의 mount effect가 보관한 scroll·pointerdown·wheel·touch 대상은 이전 노드에
남을 수 있다. 이는 소스에서 확인한 구체적인 소유권 경로다. 이전 소크에 callback
이력이 없으므로 해당 실행의 모든 표시·입력 실패를 이 경로 하나로 확정하지 않는다.

완료된 `6b3b72a4bb22ff39df03cb763a9f989dea1fb3bd`의 수정을 통합해 편집기
children을 항상 같은 바깥 context 아래 두고 협업 runtime만 형제로 지연 설치한다.
runtime 인스턴스를 계속 유지하므로 복구·철회 래치도 유지된다. 원고·outbox 소유자·
역할·연결 정책이 달라진 첫 render에는 이전 범위의 context를 다시 노출하지 않는다.
같은 runtime 값의 반복 발행과 children 변경에 의한 전달 루프도 막는다.

추가 검토에서는 같은 transport factory로 `serverRequired`만 false→true로 바꿀 때
이전 room이 새 범위의 context에 한 번 다시 나타나는 현상을 일반·StrictMode에서
각각 재현했다. 실제 Provider는 policy effect에서 transport preference를 바꾼 다음
passive effect에서 room·outbox를 초기화한다. relay도 관측·확정을 두 단계로 나눠
이 중간 render를 발행하지 않도록 수정했다. 이는 현재 초기화 순서에 대한 방어이며,
서버 연결이나 초기 문서 동기화의 완료를 대신 보장하는 신호가 아니다.

실제 Provider의 두 effect 본문·의존성 배열·순서를 실행한 회귀와 실제 Host의 남은
세 입력 effect·viewport 배율 hook을 연결한 두 테스트 파일에서 15개 모두 통과했다.
새 정책 전환 두 건은 수정 전 실패·수정 후 통과를 확인했다. DOM 동일성·포커스,
양수 resize, scroll·pointer·wheel·touch, cleanup, 원고·소유자·역할 변경과 기존
복구 래치를 검사했다. 이 결과는 전체 타입 검사나 실제 브라우저의 장시간 수락과
별개이며, `1445eebf94d2811d5e97644628b850781b8d3af8` 실행에는 포함되지 않는다.

### 같은 CI 소스에서 확인한 패널 준비와 검색 버튼 가림

`1445eebf`의 [session goals](https://github.com/blue45f/toonstudio/actions/runs/44946596391)와
[finishing quality](https://github.com/blue45f/toonstudio/actions/runs/44946596204)는
BG3D 패널 두 검사에서 같은 실패를 보였다. 실제 lazy RouteBridge와 retained Host가
패널을 설치하기 전에 동기 DOM 검사가 끝났으며, capability 값이 잘못 전달됐다는
증거는 아니었다. 실제 bridge/Host는 유지하고 무거운 공유 3D 세션 빌더의 비동기
포트만 타입 있는 fixture로 대체했다. 패널 준비 후 기존 capability·삽입 payload·
닫기 초기값 삭제를 검사하며, 모든 패널이 닫혔을 때 빌더를 호출하지 않음도 확인한다.
대상 8개와 실제 retained bridge·WebXR 경계 10개, 총 18개가 unhandled error 없이
통과했고 정상 커밋 훅도 통과했다.

같은 소스의 [필수 접근성 검사](https://github.com/blue45f/toonstudio/actions/runs/44946596222/job/136975262141)는
`/production`, `/production/projects`, `/settings`에서 소재 검색 버튼의 일부 가림을
보고했다. 버튼 rect는 약 136×44px였지만 Axe가 측정한 유효 높이는 5.6px였다.
완료된 `d203bb07dd05a0dc3a7669ca2f5f0085bc4f2a48`의 행 분리 수정을 통합하고,
1280·1024·390px에서 단계 목록 스크롤·검색 영역의 겹침·9점 hit test·실제 클릭과
Enter/Escape를 검사하는 E2E를 유지했다. 기존 Axe와 44px 입력 기준은 낮추지 않는다.
로컬에서는 기존 실패 세 경로와 새 시나리오를 선택했지만 Chromium이 socket 생성
권한 오류로 launch 중 종료돼 페이지·Axe·입력 검사는 실행되지 않았다. 이 수정의
실제 브라우저 통과는 후속 원격 CI에서 확인해야 한다.

### 실제 17종 측정 #137과 후속 CI 회귀

같은 `1445eebf`의 [대표 브러시 검사 #137](https://github.com/blue45f/toonstudio/actions/runs/44947214872)는
데스크톱·Playwright mouse 환경에서 17종 모두 실제 측정을 마쳤다. 작은 ZIP의 API
digest·CRC, 보고서의 source/build 전후 일치를 확인했다. 준비 오류·예상 밖 브라우저
오류·첫 픽셀 timeout·blank frame은 모두 0이며 입력 전달은 100%였다. pen의 실제
잉크 PNG도 확인했다. 이 범위에서 이전 #132의 입력 영역 준비 실패는 해소됐지만,
crop 이미지에 없는 전체 원고 배율이나 다른 화면 프로필의 결과는 추정하지 않는다.

엄격 수락은 0/17이다. 첫 픽셀은 25.470~73.855ms, vsync 초과분은
8.805~57.190ms로 17종 모두 기존 8ms 기준을 넘었다. sumi의 51ms 긴 작업과
62.145ms settle, oil의 최대 68ms 긴 작업·75.300ms settle·25.985ms move→frame
p99 초과분도 실패 항목이다. 기준 실패로 후속 3분 소크는 실행하지 않았다.
이 결과는 후속 협업 DOM 보존·두 단계 relay 이전 소스의 실제 측정이며, 새 소스의
첫 표시 지연·WebGPU·300분 수락은 별도로 확인해야 한다.

`1445eebf`의 [수동 editing 회귀](https://github.com/blue45f/toonstudio/actions/runs/44946764126/job/136975674333)와
PR editing은 Krita bundle 검사에서 저장 호출 전에 기본 대기 한도가 끝났다.
실패 시 UI는 변환 중이었다. 로컬 원본 파일 전체는 17/17 통과했고 해당 case는
666.8ms여서 로컬 실패 재현으로 표현하지 않는다. 실제 중첩 지연 import의 완료를
기존 도메인 방식인 `act(() => vi.dynamicImportSettled())`로 기다리게 보완한 뒤
같은 17개가 통과했다. 실제 bundle·parser·putMany·권리·미지원 항목 검증과 결과
확인의 기본 시간 한도는 유지했다. CI 로그만으로 지연 전부를 모듈 로드에 귀속하지 않는다.

PR foundation의 LT 역할 문자열 검사 두 건은 완료된 `5f51f06`의 변경을 통합했다.
역할 여섯 개의 정확한 순서를 실제 정본인 runtime leaf에서 확인하고 planner의
import·재export·flatMap 소비까지 검사한다. 기존 render 분기와 문서 문구 검사는
유지하며, 이동한 정본의 이전 위치만 읽던 검사를 갱신한다. 두 파일 전체 60개는
검사에 필요한 누락 자료를 HEAD 원문으로 복원한 뒤 제품·테스트 변경 없이 통과했다.

### 전체 타입 검사 범위를 유지하는 초기 묶음·시간 조정

이전 `471a970c`의 [수동 타입 검사](https://github.com/blue45f/toonstudio/actions/runs/44941781594/job/136960355358)는
6MiB 초기 묶음에서 메모리 한도 분류에 따른 재분할을 다섯 번 기록했다. 이 실패한
worker 시도만 878.903초를 소비했고, 28,657개 중 2,222개를 확인한 상태에서 새 소스
검증으로 대체하기 위해 취소했다. 이를 전체 타입 검사 실패나 timeout으로 부르지 않는다.

완료된 `caf17f06`과 `1c134fe4`의 설정·회귀를 통합해 초기 묶음을 3MiB로 낮추고
필수 타입 및 CC0 인계에 110분, 비 main 수동 editing에 120분을 둔다. 다른 static
작업의 25분 한도, 표준 runner와 8192MiB worker heap은 유지한다. 전체 TypeScript
Program, 모든 파일의 의미 검사·중복/누락 확인·입력 fingerprint, API/realtime 명령,
95% type coverage와 실패 시 중단 정책도 유지한다. 기존 하네스의 단일 env 허용과
추가 env·인증/fetch 변경 거부 검사에 YAML 값·타입 검사를 함께 보존했다.

3MiB 묶음의 전체 완주 시간은 아직 확인 전이다. 작은 묶음도 전체 Program을 만들기
때문에 메모리 실패가 사라진다고 보장하지 않으며, 후속 실제 CI의 완료 결과를 요구한다.
설정과 실제 하위 명령 전달을 확인하는 정책 회귀 50개, 변경된 JS lint, 소스 크기
래칫과 workflow fanout 22개 검사는 통과했다. 이는 전체 타입 검사의 완료 결과가 아니다.
