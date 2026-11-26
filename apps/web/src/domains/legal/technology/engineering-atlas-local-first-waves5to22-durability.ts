import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · local-first · Waves 5·6·10·11·22 무손실 로컬 저장·델타·재해 복구·유휴 머클 스크러버 2종 카드.
 */
export const ENGINEERING_ATLAS_LOCAL_FIRST_WAVES5TO22_DURABILITY: readonly EngineeringAtlasEntry[] = [
  {
    id: "wave5-to-11-opfs-mmap-reed-solomon-tsarc",
    category: "local-first",
    name: "Waves 5·6·10·11 OPFS mmap · FastCDC · Reed-Solomon · .tsarc",
    title: t(
      "Waves 5·6·10·11 OPFS 64KiB 페이저 · FastCDC 델타 · GF(256) 복구 & .tsarc 카트리지",
      "Waves 5·6·10·11 OPFS 64 KiB pager, FastCDC delta, GF(256) Reed-Solomon & .tsarc",
    ),
    status: "experimental",
    tagline: t(
      "64KiB OPFS 창 페이징, 콘텐츠 정의 델타 압축, GF(256) 소거·오류 복구, 10년 자가 검증 .tsarc 카트리지를 묶었습니다.",
      "Unites 64 KiB OPFS mmap windows, FastCDC delta packs, GF(256) Reed-Solomon recovery and 10-year self-verifying .tsarc.",
    ),
    background: [
      t(
        "수백 MB 단위의 다회차 원고 전체를 매 저장마다 통째로 직렬화하면 디스크 쓰기 지연이 커지고, 앞쪽에 바이트가 삽입될 때 고정 크기 청킹은 뒤쪽 블록 해시를 도미노처럼 무너뜨리며, 기기 분실이나 백업 매체 일부 손상에 대비한 자가 복구 수단도 필요합니다.",
        "Re-serializing multi-hundred-MB manuscripts on every save stalls I/O, fixed-size chunking invalidates all trailing hashes on byte insertions, and long-term creator archives require resilience against partial media loss.",
      ),
      t(
        "Wave 5 mmap-multiqueue-autoscaler.ts 는 OPFS SyncAccessHandle 위에 64KiB 정렬 가상 윈도와 인접 더티 구간 병합 플러시를 구현하고, Wave 6 cdc-rabinkarp-delta-pack.ts 는 Gear/Rabin-Karp 롤링 해시 콘텐츠 정의 청킹(CDC)으로 바이트 이동에도 변하지 않는 델타 패치를 생성합니다.",
        "Wave 5 maps 64 KiB aligned virtual windows with coalesced dirty flushes over OPFS SyncAccessHandle, while Wave 6 builds shift-resistant binary delta patches via Gear/Rabin-Karp content-defined chunking.",
      ),
      t(
        "Wave 10 reed-solomon-visual-recovery.ts 의 GF(256)(원시 다항식 0x11d) 코시 조직적 행렬·벌레캠프-매시 복구 키트와 Wave 11 lufs-mastering-tsarc-archive.ts 의 SHA-256 머클 포함 증명 기반 10년 장기 보존용 .tsarc 카트리지까지 초기 번들 0B로 검증했습니다(Current: 단위 검증 완료, Target: 프로젝트 백업·장기 보관 내보내기 연동).",
        "Wave 10 adds GF(256) (0x11d) Cauchy systematic Reed-Solomon shard recovery for brushes, OKLCH palettes and keys, paired with Wave 11 Merkle-verified .tsarc archival cartridges at 0 B eager impact (Current: unit-verified; Target: backup & archival export wiring).",
      ),
    ],
    keyPoints: [
      t("OPFS SyncAccessHandle 64KiB 정렬 가상 윈도 & 인접 더티 병합 쓰기", "OPFS SyncAccessHandle 64 KiB virtual window & coalesced dirty flush"),
      t("Gear / Rabin-Karp 롤링 해시 콘텐츠 정의 청킹(CDC) 무손실 델타", "Gear / Rabin-Karp content-defined chunking (CDC) lossless delta pack"),
      t("GF(256) 코시 행렬 · 벌레캠프-매시 다중 샤드 소거·오류 동시 정정", "GF(256) Cauchy systematic & Berlekamp-Massey shard recovery"),
      t("SHA-256 머클 포함 증명 · 색공간/폰트 내장 .tsarc 장기 보관 카트리지", "SHA-256 Merkle inclusion-proved .tsarc 10-year archival cartridge"),
    ],
    diagram: {
      id: "wave5-to-11-opfs-mmap-reed-solomon-tsarc-diagram",
      kind: "layers",
      title: t("실시간 OPFS 페이징에서 10년 자가 검증 아카이브까지의 보존 계층", "Durability stack from live OPFS paging to 10-year self-verifying archives"),
      caption: t(
        "작업 중에는 64KiB 더티 창만 쓰고, 리비전은 CDC 델타로 줄이며, 장기 보관은 머클 증명과 리드-솔로몬 패리티로 지킵니다.",
        "Writes only 64 KiB dirty spans live, compacts revisions via CDC deltas, and protects archives with Merkle + Reed-Solomon.",
      ),
      alt: t(
        "맨 위 OPFS 64KiB 가상 윈도 매니저 아래로 Gear/Rabin-Karp 콘텐츠 정의 델타 패커, SHA-256 머클 루트 .tsarc 아카이브 카트리지, 맨 아래 GF(256) 코시 리드-솔로몬 패리티 재해 복구 계층이 차례로 배치됩니다.",
        "Four layers: OPFS 64 KiB mmap window manager on top, Gear/Rabin-Karp CDC delta packer, SHA-256 Merkle .tsarc archival cartridge, and GF(256) Cauchy Reed-Solomon disaster recovery shards at the base.",
      ),
      layers: [
        { id: "mmap", label: t("OPFS 64KiB 가상 윈도 매니저", "OPFS 64 KiB mmap window pager"), sub: t("SyncAccessHandle 제로카피 · 인접 더티 병합", "SyncAccessHandle zero-copy & span coalescing"), tone: "local", chips: ["64 KiB", "Wave 5"] },
        { id: "cdc", label: t("Gear / Rabin-Karp CDC 델타 팩", "Gear / Rabin-Karp CDC delta pack"), sub: t("바이트 삽입 밀림 내성 · SHA-256 비트 검증", "Insertion-shift resilient & SHA-256 verified"), tone: "good", chips: ["FastCDC", "Wave 6"] },
        { id: "tsarc", label: t(".tsarc 자가 검증 보관 카트리지", ".tsarc self-verifying cartridge"), sub: t("레이어·ICC·서브셋 폰트 · 머클 포함 증명", "Layers, ICC, subset fonts & Merkle proof"), tone: "local", chips: ["TSARC", "Wave 11"] },
        { id: "rs", label: t("GF(256) 리드-솔로몬 복구 샤드", "GF(256) Reed-Solomon armor shards"), sub: t("코시 조직적 패리티 · 소거+변조 동시 복원", "Cauchy parity matrix & erasure/error heal"), tone: "warn", chips: ["0x11d", "Wave 10"] },
      ],
    },
    usage: [
      {
        feature: t("OPFS 64KiB 가상 윈도 페이저 & 콘텐츠 정의(CDC) 회차 델타 패커", "OPFS 64 KiB mmap pager & content-defined (CDC) episode delta packer"),
        role: t(
          "워커 동기 파일 핸들 위에서 64KiB 페이지 캐시·더티 병합 쓰기와 바이트 삽입 내성 리비전 차분 압축을 수행합니다.",
          "Manages 64 KiB page windows with coalesced writes and shift-resilient rolling-hash delta patches.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave5-frontier/mmap-multiqueue-autoscaler.ts",
          "apps/web/src/domains/creator/wasm64-wave6-moonshot/cdc-rabinkarp-delta-pack.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("GF(256) 리드-솔로몬 오프라인 시드 복구 & .tsarc 아카이브 카트리지", "GF(256) Reed-Solomon seed recovery & .tsarc archival cartridge"),
        role: t(
          "브러시·팔레트·서명키 지문을 다중 패리티 샤드로 분산 보호하고 머클 루트 기반 .tsarc 장기 보관 본을 검증합니다.",
          "Protects creator seeds via Cauchy Reed-Solomon parity shards and packs Merkle-verified .tsarc cartridges.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave10-omega/reed-solomon-visual-recovery.ts",
          "apps/web/src/domains/creator/wasm64-wave11-apex/lufs-mastering-tsarc-archive.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("갈루아 체 GF(2⁸, 원시 다항식 0x11d) 러시아 농부 곱셈", "Galois field GF(2^8, poly 0x11d) peasant multiplication"),
        language: "ts",
        ...sampleSource([
          ["export function gf256MulByte(aByte: number, bByte: number): number {"],
          ["  let a = aByte & 0xff, b = bByte & 0xff, prod = 0;"],
          ["  for (let bit = 0; bit < 8; bit += 1) {"],
          ["    if ((b & 1) !== 0) prod ^= a;"],
          ["    const carry = a & 0x80;"],
          ["    a = ((a << 1) & 0xff) ^ (carry !== 0 ? 0x1d : 0);", "최상위 비트 넘침 시 x^8 + x^4 + x^3 + x^2 + 1 로 환원", "reduce modulo 0x11d on high-bit overflow"],
          ["    b >>>= 1;"],
          ["  }"],
          ["  return prod;"],
          ["}"],
        ]),
        explain: t(
          "reed-solomon-visual-recovery.ts 는 이 유한체 연산 위에서 코시(Cauchy) 행렬 역행렬을 구해 일부 백업 QR/텍스트 샤드가 유실되거나 깨져도 원본을 비트 단위로 되살립니다.",
          "reed-solomon-visual-recovery.ts inverts Cauchy submatrices over GF(256) to reconstruct exact bytes from surviving backup shards.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave10-omega/reed-solomon-visual-recovery.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · FileSystemSyncAccessHandle (OPFS Worker I/O)",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle",
        kind: "docs",
        note: t("전용 워커 내부 OPFS 동기 읽기·쓰기 파일 핸들 명세", "Dedicated-worker synchronous OPFS read/write handle reference"),
      },
      {
        title: "Wen Xia et al. · FastCDC: A Fast and Efficient Content-Defined Chunking Approach",
        url: "https://www.usenix.org/conference/atc16/technical-sessions/presentation/xia",
        kind: "paper",
        note: t("Gear 롤링 해시 기반 고속 콘텐츠 정의 청킹 설계 논문", "USENIX ATC paper on Gear-hash content-defined deduplication"),
      },
    ],
    chapterIds: ["storage", "storage-migration"],
    talk: {
      pitch: t(
        "편집 중에는 바뀐 64KiB 조각만 디스크에 반영하고, 버전 기록은 롤링 해시 델타로 아끼며, 완결 원고는 10년 뒤에도 단독 검증되는 .tsarc 카트리지와 리드-솔로몬 패리티로 남깁니다.",
        "Flushes only dirty 64 KiB pages live, stores revisions as CDC deltas, and seals completed series in Merkle + Reed-Solomon cartridges.",
      ),
      analogy: t(
        "수정된 공책 칸만 덧쓰는 속기장, 바뀐 문단만 오려 붙이는 스크랩북, 일부 조각이 젖어도 복원되는 우주선 블랙박스를 겹쳐 둔 보존 체계입니다.",
        "Like combining a page-level ledger, a paragraph-diff scrapbook and an erasure-coded flight recorder for creator manuscripts.",
      ),
      questions: [
        {
          question: t("브라우저 OPFS 데이터만으로 영구 백업을 대신할 수 있나요?", "Does OPFS alone replace external backups?"),
          answer: t(
            "아닙니다. 브라우저 프로필 초기화나 기기 고장 시 OPFS도 함께 지워질 수 있으므로, .tsarc 카트리지와 리드-솔로몬 복구 샤드를 외부 디스크나 개인 클라우드로 내보내도록 안내합니다.",
            "No. Clearing a browser profile or losing a device wipes OPFS too, so .tsarc cartridges and Reed-Solomon shards are designed for external export.",
          ),
        },
      ],
    },
    technologies: ["OPFS", "FastCDC", "Reed-Solomon GF(256)", "SHA-256 Merkle"],
    facts: [
      { value: "64 KiB", label: t("OPFS SyncAccessHandle 가상 페이지 정렬 폭", "OPFS mmap virtual page alignment"), source: "apps/web/src/domains/creator/wasm64-wave5-frontier/mmap-multiqueue-autoscaler.ts" },
      { value: "0x11d", label: t("GF(256) 리드-솔로몬 원시 다항식", "GF(256) Reed-Solomon primitive polynomial"), source: "apps/web/src/domains/creator/wasm64-wave10-omega/reed-solomon-visual-recovery.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wave22-opfs-idle-merkle-bitrot-scrubber",
    category: "local-first",
    name: "Wave 22 Idle OPFS RFC 6962 Merkle Bit-Rot Scrubber",
    title: t(
      "Wave 22 유휴 ≤2.0ms OPFS 머클 비트부패 스크러버 & XOR 스트라이프 자가 복구",
      "Wave 22 <=2.0 ms idle OPFS RFC 6962 Merkle scrubber & XOR self-healer",
    ),
    status: "experimental",
    tagline: t(
      "그리기 프레임을 방해하지 않는 ≤2.0ms 유휴 틱으로 OPFS 타일 무음 변조를 잡아내고 이중 저널·XOR 패리티로 복원합니다.",
      "Detects silent OPFS tile corruption within <=2.0 ms idle ticks and self-heals from dual journals or XOR parity stripes.",
    ),
    background: [
      t(
        "장기간 로컬 디스크에 머무는 대용량 래스터 타일은 비정상 종료, 스토리지 미디어 결함, 부분 덮어쓰기(Torn Write) 등으로 조용히 바이트가 깨질(Silent Bit-Rot) 위험이 있으나, 작업 도중 전체 볼륨을 한꺼번에 해시 검사하면 펜 입력이 버벅거립니다.",
        "Large local tile volumes kept over months risk silent bit-rot or torn writes after crashes, yet scanning an entire project mid-stroke would stall 60/120 Hz pen responsiveness.",
      ),
      t(
        "opfs-merkle-scrubber.ts 는 리프(0x00 접두사)와 내부 노드(0x01 접두사) 도메인을 분리한 RFC 6962 호환 SHA-256 이진 머클 트리를 구축하고, 유휴 콜백마다 엄격한 시간 예산(기본 1.5ms · 하드 상한 2.0ms) 안에서 라운드-로빈으로 타일을 조금씩 대조합니다.",
        "opfs-merkle-scrubber.ts builds domain-separated RFC 6962 SHA-256 binary Merkle trees (0x00 leaf / 0x01 node prefixes) and scrubs tiles round-robin inside a strict <=2.0 ms idle-tick budget.",
      ),
      t(
        "해시 불일치(비트 반전·영점화·절단)가 발견되면 1차로 커밋된 이중 저널 복제본에서, 2차로 동일 스트라이프의 형제 타일들과 XOR 패리티 블록 결합으로 바이트를 재구성한 뒤 루트 해시 일치까지 재검증하고 원자적으로 되써 넣습니다(Current: 단위 검증 완료·0B 번들, Target: 백그라운드 스토리지 헬스 워커 연동).",
        "When bit-flip, zero-fill or truncation is detected, the scrubber heals the tile first from a verified journal replica or second via sibling XOR stripe parity, re-verifies the Merkle leaf, and atomically writes it back (Current: unit-verified; Target: storage health worker wiring).",
      ),
    ],
    keyPoints: [
      t("RFC 6962 도메인 분리(0x00 리프 / 0x01 내부) SHA-256 이진 머클 트리", "RFC 6962 domain-separated (0x00/0x01) SHA-256 binary Merkle tree"),
      t("펜 입력 무간섭 ≤2.0ms 유휴 틱 예산 라운드-로빈 백그라운드 검사", "Stroke-safe <=2.0 ms idle-tick budget round-robin tile scrubbing"),
      t("1차 이중 저널 복제본 · 2차 형제 타일 XOR 패리티 스트라이프 자가 복구", "Dual-journal primary & XOR parity-stripe secondary self-healing"),
      t("재검증 통과 전 덮어쓰기 금지 — 실패 시 원본 격리 및 사건 보고", "Verify-before-commit writeback; quarantines unrecoverable faults"),
    ],
    diagram: {
      id: "wave22-opfs-idle-merkle-bitrot-scrubber-diagram",
      kind: "sequence",
      title: t("유휴 ≤2.0ms 머클 무결성 대조 및 이중 저널·XOR 자가 치유 순서", "Idle <=2.0 ms Merkle scrub & dual-journal / XOR parity self-healing"),
      caption: t(
        "유휴 시간 조각마다 타일 리프 해시를 점검하고, 손상이 감지되면 저널 또는 XOR 스트라이프로 복원 후 재검증해 되씁니다.",
        "Verifies tile leaf hashes during idle slices and heals corrupted blocks via journal or XOR parity before atomic writeback.",
      ),
      alt: t(
        "유휴 스케줄러가 OPFS 타일 볼륨에서 타일을 읽어 RFC 6962 머클 검증기에 대조하고, 불일치 시 이중 저널·XOR 복구기에서 바이트를 되살려 해시 재검증 통과 후 OPFS 볼륨에 원자적으로 되써 넣습니다.",
        "Idle scheduler reads tiles from the OPFS volume, checks RFC 6962 Merkle leaf hashes, reconstructs corrupt bytes from the journal/XOR healer, re-verifies SHA-256 and atomically commits.",
      ),
      actors: [
        { id: "idle", label: t("유휴 스케줄러", "Idle ticker"), sub: t("예산 ≤ 2.0ms", "Budget <= 2.0 ms"), tone: "local" },
        { id: "opfs", label: t("OPFS 타일 볼륨", "OPFS volume"), sub: t("래스터·벡터 타일", "Tile blocks"), tone: "local" },
        { id: "mrk", label: t("머클 검증기", "Merkle verifier"), sub: t("RFC 6962 SHA-256", "0x00 leaf hash"), tone: "good" },
        { id: "heal", label: t("저널 · XOR 복구", "Journal & XOR"), sub: t("패리티 재구성", "Stripe rebuild"), tone: "warn" },
      ],
      messages: [
        { from: "idle", to: "opfs", label: t("다음 커서 타일 읽기 (시간 상한 체크)", "Read next cursor tile within budget") },
        { from: "opfs", to: "mrk", label: t("0x00 접두 리프 SHA-256 대조", "Compare 0x00-prefixed leaf SHA-256") },
        { from: "mrk", to: "heal", label: t("불일치 감지 → 저널 또는 형제 XOR 요청", "Mismatch → request journal or XOR heal") },
        { from: "heal", to: "opfs", label: t("해시 재검증 통과 바이트만 원자적 복원", "Atomic writeback after hash re-check"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("유휴 예산 OPFS 타일 머클 스크러버 & XOR 스트라이프 복구기", "Idle-budget OPFS tile Merkle scrubber & XOR stripe healer"),
        role: t(
          "유휴 시간 ≤2.0ms 단위로 OPFS 타일의 무음 비트 변조를 탐지하고 이중 저널·XOR 패리티로 무손실 자가 복구합니다.",
          "Scrubs OPFS tiles within <=2.0 ms idle slices and self-heals silent bit-rot via journal replicas or XOR parity.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave22-ultragap/opfs-merkle-scrubber.ts",
          "apps/web/src/domains/creator/wasm64-wave22-ultragap/perspective-shadow-opfs-scrubber.ts",
          "apps/web/src/domains/creator/wasm64-wave22-ultragap/wasm64-wave22-ultragap.test.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("동일 스트라이프 형제 타일과 XOR 패리티 블록을 이용한 손상 타일 복원", "Corrupted tile reconstruction via sibling XOR stripe parity"),
        language: "ts",
        ...sampleSource([
          ["export function reconstructXorStripeTile(parityBlock: Uint8Array, siblings: readonly Uint8Array[]): Uint8Array {"],
          ["  const out = new Uint8Array(parityBlock);"],
          ["  for (const sib of siblings) {"],
          ["    const len = Math.min(out.length, sib.length);"],
          ["    for (let i = 0; i < len; i += 1) out[i] = (out[i] ?? 0) ^ (sib[i] ?? 0);", "결손 타일 = 패리티 ⊕ 나머지 정상 형제 타일 전체", "missing tile = parity XOR all intact siblings"],
          ["  }"],
          ["  return out;"],
          ["}"],
        ]),
        explain: t(
          "복원된 바이트 배열은 곧바로 덮어쓰지 않고 다시 0x00 리프 SHA-256 해시를 계산해 머클 트리의 기대 해시와 정확히 같을 때만 볼륨에 기록합니다.",
          "Reconstructed bytes are written back only if their recomputed 0x00 leaf SHA-256 matches the expected Merkle leaf digest.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave22-ultragap/opfs-merkle-scrubber.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "IETF RFC 6962 · Certificate Transparency (Domain-Separated Merkle Hash Trees)",
        url: "https://datatracker.ietf.org/doc/html/rfc6962#section-2.1",
        kind: "spec",
        note: t("0x00 리프·0x01 내부 노드 접두사로 제2역상 공격을 막는 머클 트리 표준", "0x00/0x01 domain-separated Merkle tree specification preventing second-preimage ambiguity"),
      },
      {
        title: "W3C · Cooperative Scheduling of Background Tasks (requestIdleCallback)",
        url: "https://www.w3.org/TR/requestidlecallback/",
        kind: "spec",
        note: t("프레임 예산 유휴 구간에만 백그라운드 점검 작업을 배정하는 웹 표준", "Browser idle-period scheduling specification for non-blocking maintenance"),
      },
    ],
    chapterIds: ["storage", "pwa-continuity"],
    talk: {
      pitch: t(
        "작가가 펜을 멈추는 2밀리초 남짓한 틈마다 백그라운드에서 원고 타일 지문을 대조해, 조용히 깨진 바이트가 생겨도 다음번 파일을 열기 전에 스스로 고쳐 놓습니다.",
        "Quietly verifies manuscript tile digests in 2-ms idle gaps between strokes and self-heals bit-rot before you ever reopen a corrupt cut.",
      ),
      analogy: t(
        "도서관 문을 닫거나 독자가 책장을 넘기는 잠깐 사이에 사서가 한 칸씩 파본 여부를 대조하고 예비 인쇄본으로 즉시 갈아 끼우는 보존실과 같습니다.",
        "Like a conservator checking one shelf between page turns and swapping damaged pages from parity proof sheets.",
      ),
      questions: [
        {
          question: t("한 스트라이프에서 두 개 이상의 타일이 동시에 깨지면 어떻게 처리하나요?", "What happens if two tiles in the same XOR stripe corrupt at once?"),
          answer: t(
            "단일 XOR 패리티로 복원한 결과의 SHA-256 리프 해시가 원래 머클 해시와 일치하지 않으므로 잘못된 덮어쓰기를 즉시 중단하고 unrecoverable 사건으로 정직하게 격리·보고합니다.",
            "The recomputed SHA-256 leaf digest fails the Merkle check, so writeback is aborted and an explicit unrecoverable incident is reported.",
          ),
        },
      ],
    },
    technologies: ["OPFS", "RFC 6962 Merkle", "WebCrypto SHA-256", "RAID-5 XOR Parity"],
    facts: [
      { value: "≤ 2.0 ms", label: t("유휴 틱당 머클 스크러빙 하드 시간 상한", "Hard max idle-tick scrubbing budget"), source: "apps/web/src/domains/creator/wasm64-wave22-ultragap/opfs-merkle-scrubber.ts" },
      { value: "0x00 / 0x01", label: t("RFC 6962 리프·내부 노드 도메인 분리 바이트", "RFC 6962 leaf/interior domain prefixes"), source: "apps/web/src/domains/creator/wasm64-wave22-ultragap/opfs-merkle-scrubber.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
];
