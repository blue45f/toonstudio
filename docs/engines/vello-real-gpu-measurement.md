# Vello 실 GPU 측정 — 실행 절차·기록 양식·판정 기준 (D3)

- 상태: **current** (2026-10-22 고정). 기준선 문서의 §3.5·§3.7과 쌍을 이룬다:
  [`docs/engines/vello-baseline.md`](vello-baseline.md)
- 한 줄 요약: Vello 0.11/wgpu 30 포팅(PR #2351)은 머지됐고 정확성 패리티는
  소프트웨어 어댑터에서도 확인됐지만, **실 GPU 어댑터가 `Cpu`가 아닌 상태에서의
  측정은 아직 없다.** 이 문서가 그 측정을 닫는 절차와 기록 양식을 고정한다.

## 1. 지금까지의 측정 상태 (실측 근거 있는 것만)

| 실행 | 날짜 | 어댑터 | 성격 |
| --- | --- | --- | --- |
| 레포 커밋 JSON (`tests/benchmarks/results/toon-vello-fork.json`) | 2026-09-23 | `deviceType: "Other"` (이름·드라이버 공백, 하드웨어 미확인) | **포팅 전**(wgpu 29 세대 forkTrack) 이력. 현행 근거로 쓰지 않는다 |
| 이 VM 실행 (Chromium headless shell 156.0.8078.4) | 2026-10-21 | `deviceType: "Cpu"` (SwiftShader) | 포팅 후 패리티 통과(채택·L4·픽셀). 교환 비용 0.81/0.73/0.51은 CPU 에뮬레이션 수치라 실 GPU 판정에 쓰지 않는다 |
| 사용자 맥 (Apple Silicon, Metal) | — | — | **미실행 — 이 문서의 대상** |

판정 도구 `scripts/check-vello-gpu-result.mjs`로 위 두 JSON을 판정한 결과도
같은 결론이다: 커밋본 = `STALE`(구세대 트랙), VM 실행본 = `CPU_FALLBACK`.

## 2. 프로브 실행 경로 (현행 코드 대조 완료, 2026-10-22)

- 하니스: `packages/studio-engine-vello/src/__tests__/toon-vello-fork-browser-probe.test.ts`
  — env 게이트 `TOON_VELLO_FORK_PROBE=1`이 없으면 skip이라 기본 verify에서는 돌지 않는다.
- 잰 대상: `crates/studio-engine-vello/pkg-gpu/`(빌드 트랙 B, `--features hybrid,lottie,svg`).
  `.d.ts`에 `adopt_gpu_device`·`fabric_device_adopted`·`fabric_device_handle`·
  `render_scene_gpu_texture_json`·`render_scene_hybrid_gpu_texture_json`·
  `probe_webgpu`가 있어야 하며, 없으면 하니스가 조용히 넘기지 않고 실패한다.
- 결과 기록처: 하니스가 `tests/benchmarks/results/toon-vello-fork.json`을 **덮어쓴다**.
- 2026-10-22 정정 2건 (이 문서와 같은 변경에서 수정):
  1. 하니스가 결과에 쓰는 `forkTrack.upstreamCrateSha256`가 wgpu 29 세대의 값으로
     남아 있던 것을 wgpu 30.0.1 .crate의 sha256
     (`527ccdf43dd5…`, crates.io 인덱스 cksum과 일치)으로 교체.
  2. `forkTrack.patchSurface`에서 wgpu 30 상류에 이미 있어 소멸한 백포트 3건을
     걷어내고, 남은 adoption 헝크만 남겼다(기준선 §3.3과 동일).
  그 밖에 `crates/studio-engine-vello/src/gpu_web.rs`의 낡은 주석("stock wgpu 29")과
  기준선 §3.4의 트랙 B 빌드 명령(`lottie,fabric` → 실제 `hybrid,lottie,svg`)도
  현행 코드에 맞췄다.

## 3. 소유자(맥) 실행 절차

전제: MacBook Pro(Apple Silicon), 체크아웃 `~/WebstormProjects/toonstudio`.
터미널에 그대로 붙여넣는다.

```bash
cd ~/WebstormProjects/toonstudio

# 1) 체크아웃을 포팅 이후로 갱신 (pkg-gpu 재생성분이 포함돼야 한다)
git pull --ff-only

# 2) 의존성 동기화 (락파일 기준)
pnpm install

# 3) Playwright 브라우저 설치 (하니스 후보 1용; 시스템 Chrome 폴백만으로도 돌지만 확정성을 위해 권장)
pnpm exec playwright install --only-shell chromium

# 4) 잰 대상이 현행 pkg-gpu인지 대조 — 전부 OK가 나와야 한다
(cd crates/studio-engine-vello/pkg-gpu && shasum -a 256 -c INTEGRITY.sha256)

# 5) 프로브 실행 (VM 기준 약 3분 — 실 GPU에서는 달라질 수 있다)
TOON_VELLO_FORK_PROBE=1 pnpm exec vitest run packages/studio-engine-vello/src/__tests__/toon-vello-fork-browser-probe.test.ts

# 6) 결과 판정
node scripts/check-vello-gpu-result.mjs
```

- `git pull --ff-only`가 실패하면(로컬 변경 충돌 등) 거기서 멈추고 알린다. `--force`류는 쓰지 않는다.
- `pnpm`이 PATH에 없으면 먼저: `corepack enable && corepack prepare pnpm@11.4.0 --activate`
- 4)의 기준 해시(커밋된 `INTEGRITY.sha256` 전문, 2026-10-22 레포 실측):
  - `package.json` a56675b2c731f970e13ad6a358f4053c1f0a71e25d1ae31d47d7b718355d837c
  - `studio_engine_vello.d.ts` f8a225136036cbb203cd29a906b701d6e06f9ec0e1c4c9b0849455d4ec60261e
  - `studio_engine_vello.js` 61bd0852caa6f0b27b6bc944b656615c47f0c8a03c831d833dbd73975d1dbdf2
  - `studio_engine_vello_bg.wasm` 92eec21dc7ffda37137cb91e685c65ac293422b00ce020870b903713f221947d
  - `studio_engine_vello_bg.wasm.d.ts` 5b706abf3ec69626313eb30c6aeb6b0f73d21656539bf12c79cd64d25003b18b

## 4. 기록 양식 (실행마다 이 표를 채워 결과 JSON과 함께 남긴다)

### 4.1 실행 환경

| 항목 | 기록 | 출처 |
| --- | --- | --- |
| 실행 일시 (KST) |  | 실행자 기록 (`measuredAt`은 UTC로 JSON에 자동 기록됨) |
| 기기 / 칩 |  | 시스템 정보 (예: MacBook Pro, Apple M계열) |
| macOS 버전 |  | 시스템 정보 |
| 체크아웃 SHA |  | `git rev-parse HEAD` |
| pkg-gpu INTEGRITY 대조 | 전부 OK / 불일치 항목 | §3 절차 4) |
| 브라우저 실행 후보 |  | JSON `browser.launch` |
| 브라우저 버전 |  | JSON `browser.version` |

### 4.2 어댑터 정보 (전부 JSON `adapter`에서 그대로 옮긴다)

| 필드 | 값 | 비고 |
| --- | --- | --- |
| `adapter.backend` |  | 기대: `BrowserWebGpu` |
| `adapter.deviceType` |  | **판정의 핵심** — §5 기준 |
| `adapter.name` |  | 비어 있을 수 있다(§5 C-6) — 비었다고 실패가 아니다 |
| `adapter.driver` / `driverInfo` |  |〃 |

### 4.3 판정·수치

| 항목 | 값 | 기준 |
| --- | --- | --- |
| 판정기 verdict |  | §5 |
| `adoption.adoptedFlag` / `sameDeviceObject` |  | 둘 다 true |
| `l4TextureSharing.bindingAccepted` / `validationError` |  | true / null |
| `hybridSparseStrip.bindingAccepted` / `maxFuzzyMismatchPct` |  | true / ≤ 0.6 |
| `pixelParityVsL0Lane.equal` |  | true |
| 교환 비용 256² / 512² / 1024² (`exchangeSpeedupVsL0`) |  | **기록만** — 합격 기준 없음 |
| 소요 시간 |  | 참고 기록 |

## 5. 판정 기준

판정은 `node scripts/check-vello-gpu-result.mjs`가 고정한다(종료 코드 0/1/3).

| verdict | 의미 | D3 상태 |
| --- | --- | --- |
| `REAL_GPU` | `deviceType`이 `Cpu`가 아니고, 패리티 게이트 전부 통과, forkTrack이 현행 핀(wgpu 30.0.1) | **닫힘** — §6 후속 갱신 |
| `CPU_FALLBACK` | 패리티는 통과했으나 `deviceType === "Cpu"` — 소프트웨어 렌더링 | 열려 있음 — §6 원인 항목화 |
| `STALE` | 실 GPU로 보이나 forkTrack이 현행 핀이 아님 — 잰 대상이 구세대일 수 있어 확정 보류 | 열려 있음 — INTEGRITY 대조 후 재실행 |
| `PARITY_FAILED` | 채택·L4·픽셀 게이트 중 하나라도 실패 | 열려 있음 — 포팅 회귀 후보로 분리 보고 |
| `INCOMPLETE` | 필수 필드 누락 | 열려 있음 — 하니스 실행 로그와 함께 재실행 |

- `deviceType`의 값 체계는 wgpu `DeviceType`이다: `IntegratedGpu`·`DiscreteGpu`·
  `Other`·`VirtualGpu`는 실 하드웨어 경로로 보고, `Cpu`만 소프트웨어로 본다.
  단 `Other`이면서 이름·드라이버가 전부 비어 있으면 "하드웨어 미확인"을 기록에
  덧붙인다(2026-09-23 JSON이 그 경우였다).
- 교환 비용은 게이트가 아니다. 실 GPU에서 배속이 1보다 작게 나와도 그대로
  기록한다 — 수치를 이유로 재측정하거나 골라 보고하지 않는다.

## 6. CPU 폴백 시 원인 항목화 절차

`CPU_FALLBACK`이 나오면 아래를 **순서대로** 확인하고, 해당 항목에 증거를 붙여
기록한다. 추측으로 원인을 단정하지 않는다 — 끝까지 해당이 없으면 C-7로 남긴다.

| 코드 | 후보 원인 | 확인 방법 | 증거 |
| --- | --- | --- | --- |
| C-1 | 하니스 후보 1(headless shell)이 소프트웨어 어댑터로 `supported`를 답해 그 후보에서 종료 | JSON `browser.launch`가 후보 1인지 확인. headless shell은 빌드에 따라 SwiftShader만 제공할 수 있다 | `browser.launch` + 후보 1의 어댑터 JSON |
| C-2 | 시스템 Chrome의 WebGPU 비활성 (구버전, 정책, 원격/가상 세션) | 같은 기기 시스템 Chrome에서 `chrome://gpu`의 WebGPU 상태와 `navigator.gpu` 존재 확인 | chrome://gpu 발췌 |
| C-3 | 실행 채널 문제 — Playwright 브라우저 리비전 불일치로 후보 1 기동 실패 후 폴백 경로가 달라짐 | `node_modules/playwright-core/browsers.json` 요구 리비전과 `~/Library/Caches/ms-playwright/` 설치본 대조 | 두 리비전 값 |
| C-4 | 잰 대상 불일치가 만든 오판 — pkg-gpu가 구세대면 어댑터 판정 자체를 현행 근거로 못 쓴다 | §3 절차 4) INTEGRITY 대조. 불일치면 `git pull` 후 재실행 (이때 verdict는 보통 STALE이 먼저다) | INTEGRITY 출력 |
| C-5 | 하드웨어 경로 차단 — 저전력 모드, 외장 GPU 전환, macOS/드라이버 상태 | 전원·디스플레이 연결 상태 기록 후 재실행해 `deviceType` 변화 확인 | 재실행 JSON |
| C-6 | (원인 아님) 어댑터 이름·드라이버 공백 | `deviceType`만으로 판정한다. 공백 자체는 BrowserWebGpu 어댑터에서 관측된 정상 모양일 수 있다 | — |
| C-7 | 미분류 | C-1~C-5 증거를 전부 첨부하고 "미분류"로 기록 | 위 증거 일체 + 실행 로그 |

후보 1에서 CPU로 종료되는 경우의 우회(하니스 무수정): Playwright headless
shell을 치워 후보 1의 **기동 자체가 실패**하게 하면 하니스는 후보 2(시스템
Chrome)로 넘어간다. 이 우회를 썼으면 기록 양식 4.1에 그 사실을 명시한다 —
실행 환경이 달라진 것을 숨기지 않는다.

## 7. 결과 후 레포 갱신 (REAL_GPU일 때만)

1. 하니스가 덮어쓴 `tests/benchmarks/results/toon-vello-fork.json`을 커밋한다.
2. `docs/engines/vello-baseline.md` §3.5의 교환 비용 표·측정 날짜·브라우저 조건을
   새 JSON 값으로 교체한다.
3. `docs/candidates/engine-portfolio/capability-survey.md`의 "Toon GPU fabric/fork"
   행의 최소 배속을 같은 값으로 맞춘다.
4. 2·3의 정합은 `packages/studio-engine-vello/src/__tests__/toon-vello-fork-doc-parity.test.ts`가
   잡으므로, 셋 중 하나만 고친 PR은 CI에서 실패하는 것이 정상이다.
5. 네이티브 `gpu_parity`(Metal 실렌더 대조, `crates/studio-engine-vello/tests/gpu_parity.rs`)는
   같은 맥에서 별도로 닫을 수 있는 후속이다 — 이번 측정의 합격 조건은 아니다.
