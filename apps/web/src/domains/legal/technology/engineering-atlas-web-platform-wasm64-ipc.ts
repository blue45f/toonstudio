import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · web-platform · WASM64 제로카피 IPC/아레나 + WebGPU WGSL 컴퓨트 & 64비트 OPFS 타일 매퍼 2장.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_WEB_PLATFORM_WASM64_IPC: readonly EngineeringAtlasEntry[] = [
  {
    id: "wasm64-zero-copy-ipc-arena",
    category: "web-platform",
    name: "WASM64 Zero-Copy IPC & Arena",
    title: t("64B 정렬 아레나·SPSC 링·Seqlock·XOR 타일 언두", "64B arena, lock-free SPSC ring, Seqlock & XOR tile undo"),
    status: "experimental",
    tagline: t(
      "SharedArrayBuffer 아레나와 락프리 SPSC·Seqlock·XOR+RLE 압축으로 스레드 복사·RAM 을 줄입니다.",
      "A SharedArrayBuffer arena with lock-free SPSC, Seqlock and XOR+RLE compression cuts copies and RAM.",
    ),
    background: [
      t(
        "메인 스레드와 WASM·렌더 워커가 postMessage 로 매 프레임 레이어 트리와 포인터 배치를 복사하면 직렬화(structured-clone)와 가비지 컬렉션(GC) 멈춤이 누적됩니다. apps/web/src/domains/creator/wasm64-zero-copy-ipc/ 는 64바이트 캐시라인 정렬 공유 아레나(Wasm64SharedArena) 위에 모든 공유 구조를 올려 복사 없이 같은 메모리를 바라보게 설계했습니다.",
        "Copying layer trees and pointer batches across postMessage every frame builds up structured-clone overhead and GC pauses. apps/web/src/domains/creator/wasm64-zero-copy-ipc/ places shared structures inside a 64-byte cache-line-aligned arena (Wasm64SharedArena) so threads read the same memory without copies.",
      ),
      t(
        "명령 전달은 락프리 SPSC 링 버퍼(wasm64-zero-copy-ipc-ring.ts)가 맡습니다. 생산자 head(오프셋 64B)와 소비자 tail(128B)을 별도 64B 캐시라인에 떼어 놓아 False Sharing 을 막고, 64B 고정 바이너리 명령을 실어 나릅니다. Vitest 실측에서 10,000건 처리에 0.931ms(초당 1,074만 명령, 10.74M cmds/s)를 기록했습니다.",
        "Command delivery uses a lock-free SPSC ring (wasm64-zero-copy-ipc-ring.ts) that isolates producer head (byte 64) and consumer tail (byte 128) onto separate 64-byte cache lines to avoid false sharing while passing 64-byte binary commands. Vitest benchmarks measured 0.931 ms (10.74M cmds/s).",
      ),
      t(
        "레이어 상태는 12개 TypedArray 열로 쪼갠 SoA 렌더 상태 트리(wasm64-soa-render-state-tree.ts)에 저장하고, 독립 캐시라인(128B)의 Atomics Seqlock(홀수=쓰기 중, 짝수=안정 스냅샷)으로 락 경합 없이 읽습니다. 256×256 RGBA8(256KiB) 타일 되돌리기는 XOR-Delta + 확장 제로런 RLE(wasm64-tile-undo-compressor.ts)로 단일 패스 압축해 테스트 실측 RAM 98.19% 절감(55.17×, 0바이트 오차)을 확인했습니다.",
        "Layer state lives in a 12-column SoA render-state tree (wasm64-soa-render-state-tree.ts) guarded by an isolated cache-line Atomics Seqlock (odd=writing, even=stable) for contention-free reads. 256x256 RGBA8 tile undo uses single-pass XOR-Delta + extended zero-run RLE (wasm64-tile-undo-compressor.ts), achieving 98.19% RAM savings (55.17x, 0-byte diff) in tests.",
      ),
      t(
        "현재 구현(Current)과 목표(Target)를 구분합니다. 아레나·SPSC 링·SoA Seqlock·XOR 타일 언두 4종 모듈과 단위·성능 테스트는 2026-11-26 기준 검증이 끝났으며, crossOriginIsolated 가 꺼진 환경에서는 일반 ArrayBuffer 로 자동 폴백합니다. 스튜디오 전체 편집 파이프라인의 기본 전송 계층 전환은 단계적 통합 목표입니다.",
        "Current vs Target: all four modules (arena, SPSC ring, SoA Seqlock, XOR tile undo) and their correctness/throughput tests are verified as of 2026-11-26, with automatic ArrayBuffer fallback when crossOriginIsolated is absent. Switching the entire studio editing pipeline onto this transport by default is a phased integration target.",
      ),
    ],
    keyPoints: [
      t("64B 캐시라인 정렬 공유 아레나로 직렬화·GC 중단 제거", "64B cache-line aligned arena eliminates clone & GC pauses"),
      t("락프리 SPSC 링: 0.931ms · 10.74M cmds/s 실측", "Lock-free SPSC ring measured at 0.931 ms (10.74M cmds/s)"),
      t("12컬럼 SoA 트리 + Atomics Seqlock 락프리 스냅샷", "12-column SoA tree with Atomics Seqlock snapshot reads"),
      t("256×256 XOR+RLE 언두: RAM 98.19% 절감 · 55.17× · 0B 오차", "256x256 XOR+RLE undo: 98.19% RAM saved, 55.17x, 0B diff"),
    ],
    diagram: {
      id: "wasm64-zero-copy-ipc-arena-diagram",
      kind: "graph",
      title: t("공유 아레나 위의 제로카피 IPC·상태·언두 흐름", "Zero-copy IPC, state and undo over a shared arena"),
      caption: t(
        "head·tail·Seqlock 을 서로 다른 64B 캐시라인에 떼어 락 경합과 복사를 줄입니다.",
        "Separating head, tail and Seqlock across 64-byte cache lines avoids lock contention and copies.",
      ),
      alt: t(
        "메인 스레드가 64바이트 고정 명령을 락프리 SPSC 링 버퍼에 쓰면 WASM 워커가 복사 없이 소비합니다. 워커는 12컬럼 SoA 렌더 상태 트리를 Seqlock 으로 갱신하고, 변경된 256x256 타일은 XOR+RLE 무손실 압축기로 언두 히스토리에 저장하며, 렌더러가 짝수 세대 스냅샷을 바로 읽습니다.",
        "The main thread writes 64-byte commands into a lock-free SPSC ring consumed without copies by the WASM Worker. The Worker updates the 12-column SoA render-state tree under a Seqlock, compresses changed 256x256 tiles with XOR+RLE for undo, and the renderer reads stable even-generation snapshots directly.",
      ),
      nodes: [
        { id: "ui", label: t("메인 스레드", "Main thread"), sub: t("포인터·카메라 입력", "pointer & camera input"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "ring", label: t("SPSC 링 버퍼", "SPSC ring"), sub: t("head 64B · tail 128B", "head 64B, tail 128B"), tone: "good", at: [1, 0] },
        { id: "worker", label: t("WASM64 워커", "WASM64 Worker"), sub: t("64B 명령 소비", "consumes 64B cmds"), tone: "local", at: [2, 0] },
        { id: "soa", label: t("SoA 상태 트리", "SoA state tree"), sub: t("12열 · Seqlock 128B", "12 cols, Seqlock 128B"), tone: "good", at: [3, 0] },
        { id: "gpu", label: t("렌더러 읽기", "Renderer read"), sub: t("짝수 세대 0-카피", "even-gen zero-copy"), tone: "local", shape: "pill", at: [4, 0] },
        { id: "undo", label: t("XOR+RLE 언두", "XOR+RLE undo"), sub: t("98.19% 절감 · 55.17x", "98.19% saved, 55.17x"), tone: "good", shape: "cylinder", at: [2, 1] },
      ],
      edges: [
        { from: "ui", to: "ring", label: t("64B 기록", "64B write") },
        { from: "ring", to: "worker", label: t("0-카피", "0-copy") },
        { from: "worker", to: "soa", label: t("원자 갱신", "atomic") },
        { from: "soa", to: "gpu", label: t("스냅샷", "snapshot") },
        { from: "worker", to: "undo", label: t("타일 델타", "tile delta") },
      ],
      groups: [
        { id: "arena", label: t("64B 정렬 SharedArrayBuffer 아레나", "64B-aligned SharedArrayBuffer arena"), tone: "local", nodeIds: ["ring", "worker", "soa", "undo"] },
      ],
    },
    usage: [
      {
        feature: t("64바이트 정렬 공유 메모리 아레나", "64-byte aligned shared memory arena"),
        role: t(
          "SharedArrayBuffer(또는 ArrayBuffer 폴백) 위에서 64B 배수로 슬랩을 할당해 TypedArray 뷰를 직접 돌려줍니다.",
          "Allocates 64-byte-aligned slabs inside a SharedArrayBuffer (or ArrayBuffer fallback) and hands back direct TypedArray views.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-zero-copy-ipc/wasm64-shared-arena.ts"],
        route: "/studio",
      },
      {
        feature: t("락프리 SPSC 바이너리 명령 링", "Lock-free SPSC binary command ring"),
        role: t(
          "PointerStrokeBatch·TileDirtyCommit·CameraTransformUpdate·FrameTelemetrySample 64B 명령을 직렬화 없이 전송합니다.",
          "Transports 64-byte PointerStrokeBatch, TileDirtyCommit, CameraTransformUpdate and FrameTelemetrySample commands with zero serialization.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-zero-copy-ipc/wasm64-zero-copy-ipc-ring.ts"],
      },
      {
        feature: t("SoA 렌더 상태 트리 + Atomics Seqlock", "SoA render-state tree with Atomics Seqlock"),
        role: t(
          "12개 레이어 속성 열을 캐시 친화적으로 배치하고 짝수 세대 검증으로 락 없는 일관 스냅샷 읽기를 제공합니다.",
          "Lays out 12 layer attribute columns cache-friendly and guarantees lock-free consistent snapshots via even-sequence validation.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-zero-copy-ipc/wasm64-soa-render-state-tree.ts"],
      },
      {
        feature: t("256×256 XOR-Delta + RLE 무손실 타일 언두", "256x256 XOR-Delta + RLE lossless tile undo"),
        role: t(
          "XOR 대칭성으로 단일 패킷에서 Undo·Redo 를 모두 0바이트 오차로 복원하고, 고엔트로피 타일은 raw-xor(+16B)로 보호합니다.",
          "Reuses one symmetric XOR packet for both lossless Undo and Redo with a raw-xor (+16 B) cap for high-entropy tiles.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-zero-copy-ipc/wasm64-tile-undo-compressor.ts",
          "apps/web/src/domains/creator/wasm64-zero-copy-ipc/wasm64-zero-copy-ipc.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("Atomics Seqlock 락프리 스냅샷 읽기 루프", "Lock-free snapshot read loop with Atomics Seqlock"),
        language: "ts",
        ...sampleSource([
          ["export function readSeqlockSnapshot<T>(seqCtrl: Int32Array, seqIndex: number, readFields: () => T): T {"],
          ["  for (;;) {"],
          ["    const before = Atomics.load(seqCtrl, seqIndex);", "홀수면 쓰기 진행 중", "odd means a writer is active"],
          ["    if ((before & 1) !== 0) continue;"],
          ["    const snapshot = readFields();", "SoA TypedArray 열에서 바로 읽기", "read directly from SoA TypedArray columns"],
          ["    const after = Atomics.load(seqCtrl, seqIndex);", "읽는 도중 바뀌지 않았는지 재확인", "recheck that no write overlapped"],
          ["    if (before === after) return snapshot;"],
          ["  }"],
          ["}"],
        ]),
        explain: t(
          "쓰는 쪽이 시작할 때 숫자를 홀수로, 끝날 때 짝수로 1씩 올립니다. 읽는 쪽은 앞뒤 숫자가 같은 짝수일 때만 스냅샷을 채택하므로 자물쇠 대기 없이 일관성을 지킵니다.",
          "The writer increments the counter to odd before editing and even afterward; the reader retries until both loads match and are even, avoiding mutex blocking.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("XOR 대칭성을 이용한 0-차이 타일 복원", "Zero-diff tile restore using XOR symmetry"),
        language: "ts",
        ...sampleSource([
          ["export function applyXorDeltaInPlace(tile: Uint8Array, xorDelta: Uint8Array): void {"],
          ["  const len = Math.min(tile.byteLength, xorDelta.byteLength);"],
          ["  for (let i = 0; i < len; i += 1) {"],
          ["    const diff = xorDelta[i] ?? 0;"],
          ["    if (diff !== 0) tile[i] = (tile[i] ?? 0) ^ diff;", "0 구간은 건너뛰어 캐시 쓰기 절감", "skip zero bytes to avoid dirtying cache lines"],
          ["  }"],
          ["}"],
        ]),
        explain: t(
          "before ^ after 를 한 번 더 XOR 하면 after 가 before 로, 다시 한 번 XOR 하면 after 로 돌아옵니다. 실제 압축기는 연속 0 구간을 3바이트 확장 제로런으로 묶어 RAM 을 98.19% 줄입니다.",
          "Applying before ^ after once reverts to before and again reapplies after. The real compressor collapses zero runs into 3-byte extended tokens, saving 98.19% RAM.",
        ),
        source: "apps/web/src/domains/creator/wasm64-zero-copy-ipc/wasm64-tile-undo-compressor.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · SharedArrayBuffer & Atomics",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics",
        kind: "docs",
        note: t("자바스크립트 워커 간 원자적 메모리 동기화 표준", "Standard atomic synchronization across JS Workers"),
      },
      {
        title: "Linux Kernel Docs · Sequence counters and sequential locks",
        url: "https://docs.kernel.org/locking/seqlock.html",
        kind: "guide",
        note: t("읽기 우선 락프리 Seqlock 설계 원리", "Reader-biased lock-free Seqlock design"),
      },
    ],
    chapterIds: ["worker-architecture", "performance", "storage"],
    talk: {
      pitch: t(
        "스레드 간 복사 비용을 없애기 위해 64바이트 정렬 공유 아레나 위에 락프리 SPSC 링(0.931ms·1,074만 cmds/s), 12열 SoA Seqlock 트리, 256×256 XOR+RLE 언두 압축기(RAM 98.19% 절감·55.17배·0바이트 오차)를 구현하고 단위·성능 테스트로 검증했습니다.",
        "To remove thread-copy overhead, we built and tested a 64-byte aligned arena hosting a lock-free SPSC ring (0.931 ms, 10.74M cmds/s), a 12-column SoA Seqlock tree, and a 256x256 XOR+RLE undo compressor (98.19% RAM saved, 55.17x, 0-byte diff).",
      ),
      analogy: t(
        "요리사와 서빙이 메모지를 복사해 건네는 대신, 주방 벽의 화이트보드(아레나)와 회전 초밥 레일(SPSC 링)을 함께 보며 작업하는 방식입니다.",
        "Instead of photocopying order slips back and forth, kitchen and server share one wall board (arena) and conveyor rail (SPSC ring).",
      ),
      questions: [
        {
          question: t("COOP/COEP 가 꺼진 환경에서는 멈추나요?", "Does it break when COOP/COEP is disabled?"),
          answer: t(
            "아닙니다. SharedArrayBuffer 가 비활성화된 환경에서는 Wasm64SharedArena 와 링 버퍼가 일반 ArrayBuffer 모드로 자동 폴백하도록 설계돼 있습니다.",
            "No. When SharedArrayBuffer is unavailable, both Wasm64SharedArena and the ring buffer automatically fall back to plain ArrayBuffer mode.",
          ),
        },
        {
          question: t("타일 전체가 난수처럼 바뀌면 압축이 오히려 커지지 않나요?", "What if an entire tile changes like noise?"),
          answer: t(
            "고엔트로피 타일에서는 RLE 결과가 원본보다 커지지 않도록 자동으로 raw-xor 모드로 전환해 최대 +16B 헤더 상한을 지킵니다.",
            "High-entropy tiles automatically switch to raw-xor mode, bounding worst-case overhead to the 16-byte header.",
          ),
        },
      ],
      pitfall: t(
        "10.74M cmds/s 와 98.19% RAM 절감은 전용 모듈 벤치마크(wasm64-zero-copy-ipc.test.ts)에서 확인한 실측값입니다. 실제 캔버스 전체의 체감 프레임률은 단계적 통합 후 브라우저에서 따로 측정해야 합니다.",
        "10.74M cmds/s and 98.19% RAM savings are verified in the dedicated module benchmark (wasm64-zero-copy-ipc.test.ts); whole-canvas browser FPS must be measured separately after integration.",
      ),
    },
    technologies: ["SharedArrayBuffer", "Atomics", "Web Workers", "WebAssembly"],
    facts: [
      {
        value: "0.931ms (10.74M/s)",
        label: t("락프리 SPSC 링 64B 바이너리 명령 처리 실측", "Lock-free SPSC ring 64B command throughput"),
        source: "apps/web/src/domains/creator/wasm64-zero-copy-ipc/wasm64-zero-copy-ipc-ring.ts",
      },
      {
        value: "98.19% (55.17×)",
        label: t("256×256 타일 XOR+RLE 언두 RAM 절감 · 0B 오차", "256x256 tile XOR+RLE undo RAM savings (0B diff)"),
        source: "apps/web/src/domains/creator/wasm64-zero-copy-ipc/wasm64-tile-undo-compressor.ts",
      },
      {
        value: "12 cols / 64B",
        label: t("SoA 렌더 상태 트리 정렬 열 수 · Seqlock 오프셋 128B", "Aligned SoA render-state columns; Seqlock at byte 128"),
        source: "apps/web/src/domains/creator/wasm64-zero-copy-ipc/wasm64-soa-render-state-tree.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wasm64-webgpu-opfs-tile-pipeline",
    category: "web-platform",
    name: "WebGPU Compute & 64-bit OPFS Tile MMap",
    title: t("WGSL 16×16 컴퓨트 3종과 16GiB+ 64비트 OPFS 매퍼", "Three 16x16 WGSL compute kernels & 16 GiB+ OPFS tile mapper"),
    status: "experimental",
    tagline: t(
      "WGSL 워크그룹 공유 메모리 커널 3종과 BigInt 64비트 OPFS 가상 타일 매퍼(16MiB LRU)를 결합했습니다.",
      "Pairs three WGSL workgroup-memory compute kernels with a BigInt 64-bit OPFS tile mapper capped at 16 MiB LRU.",
    ),
    background: [
      t(
        "초고해상도 웹툰 원고의 가우시안 블러·프로시저럴 망점 스크린톤·3D LT(선화·음영) G-Buffer 윤곽선 추출을 CPU 로만 돌리면 수백 밀리초가 걸립니다. apps/web/src/domains/creator/wasm64-webgpu-compute/ 는 @workgroup_size(16, 16) 워크그룹 공유 메모리(workgroup<vec4<f32>>)를 활용하는 WGSL 컴퓨트 커널 3종과 파이프라인·바인드그룹 캐시 디스패처를 구현했습니다.",
        "Running Gaussian blur, procedural halftone screentones and 3D LT G-Buffer contour extraction purely on the CPU takes hundreds of milliseconds on large webtoon pages. apps/web/src/domains/creator/wasm64-webgpu-compute/ implements three @workgroup_size(16, 16) WGSL compute kernels using workgroup shared memory plus a cached compute dispatcher.",
      ),
      t(
        "동시에 4GiB 를 넘는 초대형 원고(16GiB+ 가상 오프셋)를 브라우저 RAM 에 통째로 올리면 탭이 즉시 종료됩니다. opfs-streaming-tile-mmap.ts 는 OPFS FileSystemSyncAccessHandle 호환 바이너리 포맷(\"TSM6\" 64B 헤더 + 40B 희소 디렉터리)에 BigInt 64비트 오프셋으로 타일을 배치합니다.",
        "At the same time, loading manuscripts larger than 4 GiB (16 GiB+ virtual offsets) wholly into browser RAM crashes the tab. opfs-streaming-tile-mmap.ts maps tiles through an OPFS FileSystemSyncAccessHandle-compatible format (\"TSM6\" 64-byte header + 40-byte sparse directory) addressed by BigInt 64-bit offsets.",
      ),
      t(
        "메모리 상주 타일은 기본 64개(256×256 RGBA8 × 64 = 16 MiB RAM 상한) LRU 캐시로 묶고, 퇴거 시 더티 타일만 OPFS 에 써 내리며(write-back) 버퍼를 제로카피로 재활용합니다. 모든 타일 슬롯에는 FNV-1a 32비트 체크섬을 기록해 읽기 시 손상이나 변조가 있으면 TileChecksumMismatchError 로 즉시 차단합니다.",
        "Resident memory is capped by a 64-tile LRU cache (16 MiB RAM ceiling for 256x256 RGBA8), flushing only dirty tiles on eviction and recycling buffers with zero copies. Every tile slot carries an FNV-1a 32-bit checksum so corrupted or tampered reads raise TileChecksumMismatchError immediately.",
      ),
      t(
        "현재 구현(Current)과 목표(Target): WGSL 커널 3종 문법·바인딩 검증, 디스패처, BigInt 64비트 OPFS 타일 매퍼(16MiB LRU·FNV-1a 변조 감지)는 2026-11-26 단위 테스트(wasm64-webgpu-compute.test.ts)로 검증했습니다. 실제 다중 OS GPU 드라이버에서의 실측 프로파일링과 본편 워커 기본 연결은 후속 단계 목표입니다.",
        "Current vs Target: the three WGSL kernels, dispatcher, and BigInt 64-bit OPFS tile mapper (16 MiB LRU + FNV-1a tamper checks) pass unit tests (wasm64-webgpu-compute.test.ts) as of 2026-11-26. Multi-OS GPU driver profiling and wiring into the default manuscript worker remain next-phase targets.",
      ),
    ],
    keyPoints: [
      t("WGSL 16×16 워크그룹 공유 메모리 커널 3종(블러·망점·LT)", "Three 16x16 WGSL workgroup-memory kernels (blur, tone, LT)"),
      t("BigInt 64비트 OPFS 매퍼로 4GiB 초과(16GiB+) 가상 주소 지원", "BigInt 64-bit OPFS mapper addresses 16 GiB+ documents"),
      t("기본 64타일(16 MiB) LRU 상한과 버퍼 재사용 퇴거", "64-tile (16 MiB) LRU RAM cap with buffer recycling"),
      t("타일별 FNV-1a 32비트 체크섬으로 파일 변조·손상 즉시 감지", "Per-tile FNV-1a 32-bit checksum catches tampering"),
    ],
    diagram: {
      id: "wasm64-webgpu-opfs-tile-pipeline-diagram",
      kind: "graph",
      title: t("64비트 OPFS 타일 페이징과 WebGPU 컴퓨트 흐름", "64-bit OPFS tile paging and WebGPU compute flow"),
      caption: t(
        "16MiB LRU 안에서만 타일을 올리고 FNV-1a 검산 뒤 16×16 WGSL 커널로 넘깁니다.",
        "Tiles stay inside a 16 MiB LRU, pass FNV-1a verification, then run through 16x16 WGSL compute kernels.",
      ),
      alt: t(
        "16GiB 이상 가상 원고가 OPFS SyncAccessHandle 파일에 BigInt 64비트 오프셋으로 저장됩니다. 필요한 타일을 읽을 때 FNV-1a 32비트 체크섬을 검증해 16MiB 상한의 LRU 캐시에 올리고, WebGPU 컴퓨트 디스패처가 16x16 WGSL 셰이더 3종(블러·망점·LT 윤곽선)을 실행한 뒤 변경 타일만 다시 OPFS 로 기록합니다.",
        "Virtual documents above 16 GiB live in an OPFS SyncAccessHandle file at BigInt 64-bit offsets. Demanded tiles pass an FNV-1a 32-bit checksum into a 16 MiB LRU cache, run through three 16x16 WGSL compute kernels (blur, halftone, LT contour), and write dirty tiles back to OPFS.",
      ),
      nodes: [
        { id: "opfs", label: t("OPFS TSM6 파일", "OPFS TSM6 file"), sub: t("BigInt 64비트(16GiB+)", "BigInt 64-bit (16 GiB+)"), tone: "local", shape: "cylinder", at: [0, 0] },
        { id: "fnv", label: t("FNV-1a 검산", "FNV-1a check"), sub: t("변조 차단", "tamper check"), tone: "neutral", shape: "diamond", at: [1, 0] },
        { id: "lru", label: t("16MiB LRU 캐시", "16 MiB LRU"), sub: t("최대 64타일 상주", "64-tile RAM cap"), tone: "good", at: [2, 0] },
        { id: "gpu", label: t("WebGPU 컴퓨트", "WebGPU compute"), sub: t("16x16 WGSL 3종", "3x 16x16 WGSL kernels"), tone: "good", at: [3, 0] },
        { id: "out", label: t("더티 쓰기백", "Dirty write-back"), sub: t("버퍼 제로카피 재사용", "zero-copy buffer reuse"), tone: "local", shape: "pill", at: [4, 0] },
        { id: "err", label: t("변조 오류 중단", "Checksum error"), sub: t("손상 타일 반영 차단", "blocks corrupt tile"), tone: "warn", at: [1, 1] },
      ],
      edges: [
        { from: "opfs", to: "fnv", label: t("동기 읽기", "sync read") },
        { from: "fnv", to: "lru", label: t("일치", "valid") },
        { from: "fnv", to: "err", label: t("불일치", "mismatch"), style: "dashed" },
        { from: "lru", to: "gpu", label: t("타일 전달", "upload") },
        { from: "gpu", to: "out", label: t("결과 반영", "commit") },
      ],
    },
    usage: [
      {
        feature: t("WGSL 16×16 컴퓨트 셰이더 3종", "Three 16x16 WGSL compute shaders"),
        role: t(
          "분리 가우시안 블러, 4모드 프로시저럴 망점 스크린톤, 3D LT G-Buffer 윤곽선 추출 커널과 정적 검증기를 제공합니다.",
          "Provides separable Gaussian blur, 4-mode procedural halftone screentone, and 3D LT G-Buffer contour kernels with static validation.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-webgpu-compute/wgsl-compute-kernels.ts",
          "apps/web/src/domains/creator/wasm64-webgpu-compute/webgpu-compute-dispatcher.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("64비트 OPFS 스트리밍 타일 매퍼", "64-bit OPFS streaming tile mapper"),
        role: t(
          "BigInt 64비트 오프셋·희소 디렉터리·16MiB LRU 상주 캐시·FNV-1a 체크섬으로 4GiB 초과 원고를 안전하게 페이징합니다.",
          "Pages documents beyond 4 GiB safely using BigInt 64-bit offsets, a sparse directory, a 16 MiB LRU cap and FNV-1a checksums.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-webgpu-compute/opfs-streaming-tile-mmap.ts",
          "apps/web/src/domains/creator/wasm64-webgpu-compute/wasm64-webgpu-compute.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("BigInt 64비트 타일 오프셋 계산과 워크그룹 분할", "BigInt 64-bit tile offsets & compute workgroup grid"),
        language: "ts",
        ...sampleSource([
          ["export function computeVirtualTileOffset(layerIndex: number, tileIndex: number, layerStrideBytes: bigint): bigint {"],
          ["  const tileBytes = BigInt(256 * 256 * 4);", "256x256 RGBA8 = 262,144B", "256x256 RGBA8 = 262,144 B"],
          ["  return BigInt(layerIndex) * layerStrideBytes + BigInt(tileIndex) * tileBytes;", "4GiB 넘어도 53비트 정밀도 손실 없음", "no 53-bit precision loss past 4 GiB"],
          ["}"],
          [""],
          ["export function computeWorkgroups16x16(width: number, height: number): { readonly x: number; readonly y: number } {"],
          ["  return { x: Math.ceil(width / 16), y: Math.ceil(height / 16) };", "@workgroup_size(16, 16) 격자 계산", "@workgroup_size(16, 16) dispatch grid"],
          ["}"],
        ]),
        explain: t(
          "일반 자바스크립트 number 대신 BigInt 로 파일 오프셋을 계산해 4GiB·16GiB 이상의 가상 문서 주소에서도 정밀도를 잃지 않습니다.",
          "Using BigInt instead of JS number keeps virtual document offsets exact past 4 GiB and 16 GiB.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("타일 무결성 검사용 FNV-1a 32비트 체크섬", "FNV-1a 32-bit checksum for tile tamper detection"),
        language: "ts",
        ...sampleSource([
          ["export function computeTileFnv1a32(bytes: Uint8Array): number {"],
          ["  let hash = 0x811c9dc5;", "FNV-1a 32비트 오프셋 기준값", "FNV-1a 32-bit offset basis"],
          ["  for (let i = 0; i < bytes.byteLength; i += 1) {"],
          ["    hash = Math.imul(hash ^ (bytes[i] ?? 0), 0x01000193) >>> 0;"],
          ["  }"],
          ["  return hash >>> 0;", "읽기 시 디렉터리 기록값과 대조", "compared against directory slot on read"],
          ["}"],
        ]),
        explain: t(
          "타일을 OPFS 에 쓸 때 해시를 디렉터리 슬롯에 남기고, 다시 읽을 때 1비트라도 다르면 TileChecksumMismatchError 를 던져 깨진 픽셀이 원고에 섞이지 않게 막습니다.",
          "Writes record the FNV-1a hash into the tile directory; any single-bit mismatch on reload raises TileChecksumMismatchError before bad pixels enter the canvas.",
        ),
        source: "apps/web/src/domains/creator/wasm64-webgpu-compute/opfs-streaming-tile-mmap.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · WebGPU & WGSL Specification",
        url: "https://www.w3.org/TR/WGSL/",
        kind: "spec",
        note: t("워크그룹 공유 메모리와 컴퓨트 셰이더 표준", "Workgroup memory and compute shader standard"),
      },
      {
        title: "MDN · FileSystemSyncAccessHandle",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle",
        kind: "docs",
        note: t("Dedicated Worker 전용 동기 OPFS 파일 읽기·쓰기 API", "Dedicated Worker synchronous OPFS I/O API"),
      },
    ],
    chapterIds: ["storage", "browser-local-compute", "nextgen-web-experiments"],
    talk: {
      pitch: t(
        "초대형 원고는 16MiB LRU 상한의 64비트 OPFS 타일 매퍼가 필요한 조각만 FNV-1a 검산 뒤 꺼내 오고, 블러·망점·3D LT 윤곽선은 16×16 워크그룹 공유 메모리를 쓰는 WGSL 컴퓨트 셰이더 3종으로 처리하는 구조를 구현·테스트했습니다.",
        "Large manuscripts stay within a 16 MiB LRU cap via a 64-bit OPFS tile mapper with FNV-1a integrity checks, feeding three 16x16 workgroup-memory WGSL compute kernels for blur, halftone and 3D LT contours.",
      ),
      analogy: t(
        "백과사전 전체를 책상에 쌓아 두지 않고 서고(OPFS)에서 지금 펼쳐 볼 64쪽만 꺼내 책상 위(16MiB)에서 작업하고, 도장(FNV-1a)이 깨진 쪽은 바로 걸러 내는 방식입니다.",
        "Like pulling only 64 pages at a time from the stacks (OPFS) onto a 16 MiB desk, and rejecting any page whose wax seal (FNV-1a) is broken.",
      ),
      questions: [
        {
          question: t("왜 16MiB 상한으로 타일을 제한하나요?", "Why cap resident tiles at 16 MiB?"),
          answer: t(
            "모바일·태블릿 브라우저 탭은 수백 MiB 만 넘겨도 OS 가 강제 종료합니다. 기본 64타일 상한과 버퍼 재활용으로 대형 원고에서도 메모리 곡선을 평탄하게 유지합니다.",
            "Mobile and tablet tabs get evicted quickly once RAM spikes. A 64-tile default cap with buffer recycling keeps memory flat even on huge canvases.",
          ),
        },
        {
          question: t("WebGPU 가 없는 기기에서는 어떻게 되나요?", "What happens on devices without WebGPU?"),
          answer: t(
            "동일 알고리즘의 Rust WASM64(Relaxed-SIMD/SIMD128) 또는 JS 참조 커널로 내려가며 기능 자체가 막히지 않습니다.",
            "Execution falls back to the matching Rust WASM64 (Relaxed-SIMD/SIMD128) or JS reference kernels without blocking the workflow.",
          ),
        },
      ],
      pitfall: t(
        "FileSystemSyncAccessHandle 은 Dedicated Worker 안에서만 쓸 수 있고, 16GiB+ 는 가상 문서 오프셋 주소 범위이며 브라우저 저장소 실제 할당량(quota)은 기기 여유 디스크에 따릅니다.",
        "FileSystemSyncAccessHandle works only inside Dedicated Workers, and 16 GiB+ is the virtual offset range while actual writable quota depends on the device's free disk space.",
      ),
    },
    technologies: ["WebGPU", "WGSL", "OPFS", "Dedicated Worker"],
    facts: [
      {
        value: "3 kernels (16×16)",
        label: t("WGSL 워크그룹 공유 메모리 컴퓨트 셰이더(블러·망점·LT)", "WGSL workgroup-memory compute kernels (blur, tone, LT)"),
        source: "apps/web/src/domains/creator/wasm64-webgpu-compute/wgsl-compute-kernels.ts",
      },
      {
        value: "16 MiB (64 tiles)",
        label: t("64비트 OPFS 타일 매퍼 기본 상주 RAM 상한", "Default resident RAM cap of the 64-bit OPFS tile mapper"),
        source: "apps/web/src/domains/creator/wasm64-webgpu-compute/opfs-streaming-tile-mmap.ts",
      },
      {
        value: "FNV-1a 32-bit",
        label: t("타일 슬롯별 무결성 검증 및 변조 차단", "Per-tile integrity check blocking tampered reads"),
        source: "apps/web/src/domains/creator/wasm64-webgpu-compute/opfs-streaming-tile-mmap.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
