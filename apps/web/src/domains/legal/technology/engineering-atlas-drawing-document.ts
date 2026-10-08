import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { commentedCode, t } from "./engineering-atlas-drawing-kit";

/**
 * 기술 도감 · drawing · 문서 카드.
 * 되돌리기 메모리, 타일 저장소, 선택 도구, 말풍선 조판처럼 "그려진 뒤의 문서"를 다루는 기술을 모았다.
 */

const HISTORY = "apps/web/src/domains/creator/studio-history-retention-budget.ts";
const WAND = "apps/web/src/domains/creator/studio-magic-wand.ts";
const KINSOKU = "apps/web/src/domains/creator/lettering/studio-kinsoku-line-break.ts";

export const ENGINEERING_ATLAS_DRAWING_DOCUMENT: readonly EngineeringAtlasEntry[] = [
  {
    id: "undo-history-byte-budget",
    category: "drawing",
    name: "History byte budget",
    title: t("되돌리기는 '몇 단계'가 아니라 '몇 바이트'로 관리하기", "Managing undo by bytes, not by step count"),
    status: "live",
    tagline: t("되돌리기 단계 수가 아니라 붙들고 있는 메모리 바이트를 기준으로 오래된 단계를 정리합니다.", "Old undo steps are trimmed by the bytes they hold in memory, not by how many there are."),
    background: [
      t(
        "되돌리기(Undo)는 작업마다 '이전 상태'를 보관해야 합니다. 보통은 '최대 200단계'처럼 개수로 제한하지만, 한 단계의 크기는 편집에 따라 네 자릿수 배로 다릅니다. 코드 주석의 Chrome 실측으로 얕은 패치 한 번은 376바이트, 긴 획 12개를 한 번에 키우면 약 0.58MB(581,600바이트), 협업 중 큰 문서는 6.46 MiB 였습니다. 200이라는 한 숫자는 앞쪽에는 지나치게 인색하고 뒤쪽에는 무력합니다(200 × 6.46 MiB 는 약 1.29 GiB, 탭이 죽는 크기).",
        "Undo has to keep the previous state of every action. It is usually capped by count, such as 200 steps, but one step can differ in size by four orders of magnitude. Chrome measurements recorded in code comments are 376 bytes for a shallow patch, about 0.58 MB (581,600 bytes) for resizing 12 long strokes at once, and 6.46 MiB in a collaborative room with a large document. One number, 200, is far too stingy for the first and powerless for the last (200 x 6.46 MiB is about 1.29 GiB, enough to kill a tab).",
      ),
      t(
        "그래서 ToonStudio 는 스냅샷을 복사 없이 참조로 들고, 단계마다 '붙들고 있는 바이트'를 계량해 합이 예산(192 MiB)을 넘으면 오래된 단계부터 정리합니다. 개수 방벽(2,000)은 계량 오차에 대비한 보험이고, 최근 8단계는 예산을 넘어서라도 지킵니다. 192 MiB 는 임의의 값이 아니라, 문서만으로 약 1GB 에 닿았을 때 앱이 구동 불가가 된 브라우저 실측을 근거로 '문서 + 히스토리가 관측된 붕괴점 아래에 머물도록' 정했다고 주석에 적혀 있습니다.",
        "So ToonStudio keeps snapshots by reference, meters the bytes each step holds, and trims the oldest steps when the total exceeds a 192 MiB budget. A count barrier (2,000) is insurance against metering error, and the latest 8 steps are kept even above the budget. A code comment says 192 MiB is not arbitrary: it is chosen so that document plus history stays below the collapse point observed when a document alone approached 1 GB and the app became unusable.",
      ),
      t(
        "계량기는 V8 슬롯 회계로 세기 때문에 실제 힙보다 작게 나옵니다. 같은 조작을 예산만 다른 두 빌드로 재어 실측 배율 1.88배를 얻었고 보정 계수 2 를 적용했다고 주석에 적혀 있습니다(예측 62.1MB, 실측 58.54MB). 히스토리는 메모리 전용이라 오래된 단계를 버려도 저장된 작업은 잃지 않고 '그보다 더 뒤로는 못 간다'만 달라집니다.",
        "The meter counts V8 slots, so it reads smaller than the real heap. A code comment says that running the same actions on two builds differing only in budget gave a measured ratio of 1.88x, and a calibration factor of 2 was applied (predicted 62.1 MB versus measured 58.54 MB). History is memory-only, so trimming old steps never loses saved work; it only means you cannot go back further.",
      ),
      t(
        "정리가 일어나면 '되돌리기 메모리 예산에 도달해 오래된 N단계를 정리했어요'라는 안내를 한 번만 보여 줍니다. 그래서 'Undo 100단계 보장'은 약속하지 않으며, 정직한 설명은 '메모리 예산 안에서 최대한, 그리고 최근 8단계는 보장'입니다. 협업 중에는 원격 반영 경로가 커밋마다 문서 전체를 복사해 단계가 무거워진다는 점도 코드 주석이 밝힙니다.",
        "When trimming happens, a one-time notice says the undo memory budget was reached and N old steps were cleared. So there is no promise of a hundred undo steps; the honest description is as many as fit in the memory budget, with the latest 8 guaranteed. A code comment also notes that during collaboration the remote-apply path copies the whole document on every commit, making steps heavy.",
      ),
    ],
    keyPoints: [
      t("한 단계는 376B에서 6.46MiB까지, 개수 상한은 맞지 않음", "A step ranges from 376 B to 6.46 MiB; a count cap fits neither"),
      t("예산 192 MiB · 방벽 2,000단계 · 최근 8단계는 보장", "192 MiB budget, 2,000-step barrier, latest 8 steps guaranteed"),
      t("정리가 일어나면 사용자에게 한 번 알림", "Users get a one-time notice when trimming happens"),
    ],
    diagram: {
      id: "undo-history-byte-budget-diagram",
      kind: "graph",
      title: t("편집 한 번이 지나가는 길", "The path of one edit"),
      caption: t("스냅샷은 참조로 쌓고 바이트를 재서, 예산을 넘으면 가장 오래된 단계부터 비웁니다.", "Snapshots are stacked by reference and metered; past the budget the oldest steps go first."),
      alt: t(
        "새 편집이 일어나면 스냅샷을 복사 없이 참조로 추가하고 유지 바이트를 계량합니다. 합이 예산을 넘는지 판단해, 넘으면 오래된 단계를 정리하되 최근 8단계는 남기고 사용자에게 한 번 안내하며, 넘지 않으면 그대로 유지합니다.",
        "A new edit adds a snapshot by reference without copying and the retained bytes are metered. If the total exceeds the budget, old steps are trimmed while the latest 8 stay and the user is told once; otherwise everything is kept.",
      ),
      nodes: [
        { id: "edit", label: t("새 편집", "New edit"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "append", label: t("스냅샷 추가", "Add snapshot"), sub: t("참조로, 복사 없음", "By reference, no copy"), tone: "local", at: [1, 1] },
        { id: "measure", label: t("바이트 계량", "Meter bytes"), sub: t("슬롯 회계 × 보정 2", "Slot count x calibration 2"), tone: "local", at: [2, 1] },
        { id: "gate", label: t("예산 초과?", "Over budget?"), sub: t("192 MiB", "192 MiB"), tone: "warn", shape: "diamond", at: [3, 1] },
        { id: "trim", label: t("오래된 단계 정리", "Trim oldest steps"), sub: t("최근 8단계는 보존", "Latest 8 are kept"), tone: "warn", at: [4, 0] },
        { id: "keep", label: t("그대로 유지", "Keep as is"), tone: "good", shape: "pill", at: [4, 2] },
        { id: "notice", label: t("한 번 안내", "One-time notice"), sub: t("N단계를 정리했어요", "N steps were cleared"), tone: "good", at: [5, 0] },
      ],
      edges: [
        { from: "edit", to: "append" },
        { from: "append", to: "measure" },
        { from: "measure", to: "gate" },
        { from: "gate", to: "trim", label: t("예", "yes") },
        { from: "gate", to: "keep", label: t("아니오", "no") },
        { from: "trim", to: "notice" },
      ],
    },
    usage: [
      {
        feature: t("실행 취소·다시 실행(⌘Z)", "Undo and redo (Cmd+Z)"),
        role: t(
          "각 편집 뒤 스냅샷을 참조로 쌓고, 유지 바이트가 예산을 넘으면 오래된 단계부터 정리하되 최근 8단계는 지킵니다.",
          "Stacks a snapshot by reference after each edit and, when retained bytes exceed the budget, trims the oldest steps while protecting the latest 8.",
        ),
        paths: [
          `${HISTORY}#applyStudioPagesHistoryRetention`,
          "apps/web/src/domains/creator/studio-pending-stroke-durability.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("되돌리기 정리 안내", "Undo trimming notice"),
        role: t(
          "정리가 일어난 순간에만 '메모리 예산에 도달해 N단계를 정리했어요'라는 문장을 한 번 만들어, 스크린리더에도 같은 경고가 반복되지 않게 합니다.",
          "Builds the sentence saying the memory budget was reached and N steps were cleared only when trimming happens, so screen readers do not repeat the same warning.",
        ),
        paths: ["apps/web/src/domains/creator/studio-history-retention-ui.ts#observeStudioHistoryRetentionAppend"],
        route: "/studio",
      },
      {
        feature: t("통합 실행취소 저널", "Unified undo journal"),
        role: t(
          "캔버스 스냅샷과 캐릭터 바이블 같은 사이드카 문서 편집을 하나의 시간 순서로 묶고, 길이는 히스토리 예산의 결과를 따릅니다.",
          "Ties canvas snapshots and sidecar-document edits such as the character bible into one timeline, with its length following the history budget's outcome.",
        ),
        paths: ["apps/web/src/domains/creator/studio-history-journal.ts"],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("바이트 예산으로 오래된 단계 정리", "Trimming old steps by a byte budget"),
        language: "ts",
        ...commentedCode(
          [
            "interface Snap { bytes: number }",
            "const BUDGET = 192 * 1024 * 1024; // @0@",
            "const MAX = 2000; // @1@",
            "const MIN = 8; // @2@",
            "",
            "function trim(history: Snap[]): Snap[] {",
            "  const kept = history.slice(-MAX);",
            "  let total = kept.reduce((sum, e) => sum + e.bytes, 0);",
            "  while (kept.length > MIN && total > BUDGET) total -= kept.shift()!.bytes; // @3@",
            "  return kept;",
            "}",
            "",
            "const room = Array.from({ length: 300 }, () => ({ bytes: 6.46 * 1024 * 1024 })); // @4@",
            "const light = Array.from({ length: 3000 }, () => ({ bytes: 376 }));",
            "console.log(trim(room).length, trim(light).length); // @5@",
          ].join("\n"),
          [
            "주 경계: 유지 바이트",
            "보험: 개수 방벽",
            "바닥: 최근 8단계는 예산을 넘어도 보존",
            "오래된 단계부터 퇴출",
            "협업 룸 단계당 6.46 MiB",
            "29 2000 — 무거운 단계는 29개만, 가벼운 단계는 방벽(2,000)까지",
          ],
          [
            "main boundary: retained bytes",
            "insurance: a count barrier",
            "floor: the latest 8 steps survive even over budget",
            "evict the oldest first",
            "6.46 MiB per step in a collaborative room",
            "29 2000 - heavy steps keep only 29, light ones reach the barrier (2,000)",
          ],
        ),
        explain: t(
          "제품은 여기에 실제 힙에 맞춘 보정 계수와 편집 종류별 계량 공식을 더합니다. 이 예제의 바이트는 이미 보정된 값이라고 가정한 것이고, 출력은 Node 로 실행해 확인한 값입니다.",
          "The product adds a calibration factor tied to the real heap and per-edit metering formulas. The bytes here are assumed to be already calibrated, and the output was checked by running it in Node.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Wikipedia · Memento pattern", url: "https://en.wikipedia.org/wiki/Memento_pattern", kind: "article", note: t("스냅샷으로 되돌리는 설계 패턴", "The design pattern behind snapshot-based undo") },
      { title: "Wikipedia · Command pattern", url: "https://en.wikipedia.org/wiki/Command_pattern", kind: "article", note: t("역연산으로 되돌리는 대안", "The alternative of undoing by inverse operations") },
    ],
    chapterIds: ["storage", "performance"],
    talk: {
      pitch: t(
        "되돌리기를 '몇 단계'가 아니라 '몇 바이트'로 관리합니다. 한 단계의 크기가 376바이트에서 6.46MiB까지 네 자릿수 배로 달라서, 200단계 같은 숫자는 어느 쪽에도 맞지 않았기 때문입니다. 예산은 192MiB 이고 최근 8단계는 지킵니다.",
        "We manage undo by bytes, not by step count. One step can be anywhere from 376 bytes to 6.46 MiB, so a number like 200 steps fit neither extreme. The budget is 192 MiB, and the latest 8 steps are always kept.",
      ),
      analogy: t(
        "서랍 개수를 제한하는 대신 서랍장 무게를 제한하는 것과 같습니다. 가벼운 메모는 수백 장, 무거운 도면은 몇 장만 들어갑니다.",
        "It is like limiting a cabinet by weight instead of by number of drawers: hundreds of light notes fit, but only a few heavy drawings.",
      ),
      questions: [
        {
          question: t("Undo 를 몇 단계까지 보장하나요?", "How many undo steps are guaranteed?"),
          answer: t(
            "단계 수는 보장하지 않습니다. 메모리 예산 안에서 최대한 유지하고 최근 8단계를 보장하며, 정리가 일어나면 화면에 안내합니다.",
            "No step count is guaranteed. It keeps as many as fit in the memory budget, guarantees the latest 8, and shows a notice when trimming happens.",
          ),
        },
        {
          question: t("오래된 단계를 정리하면 작업을 잃나요?", "Does trimming lose my work?"),
          answer: t(
            "아닙니다. 히스토리는 메모리 전용이라 저장된 작업은 그대로이고 '더 뒤로 못 간다'만 달라집니다(코드 주석).",
            "No. History is memory-only, so saved work is untouched and only the ability to go back further changes (per code comments).",
          ),
        },
        {
          question: t("192MiB 는 근거가 있나요?", "Is 192 MiB grounded in anything?"),
          answer: t(
            "주석에 적힌 브라우저 실측에서 문서가 긴 획 800개에서 약 0.8~1.1GB 에 닿아 앱이 구동 불가가 됐고, 문서와 히스토리의 합이 약 1.3GB 붕괴점 아래에 머물도록 정한 값입니다. 다른 워크로드로 재검증하기 전에는 개수 방벽을 올리지 말라고도 적혀 있습니다.",
            "The comment's browser measurements show a document with 800 long strokes reaching about 0.8 to 1.1 GB and the app becoming unusable; 192 MiB keeps document plus history under the roughly 1.3 GB collapse point. It also says not to raise the count barrier before re-verifying with other workloads.",
          ),
        },
      ],
      pitfall: t(
        "계량기가 실제 힙을 과소계상하면 예산이 실제로는 더 많은 메모리를 허용할 수 있어 개수 방벽(2,000)을 함께 둡니다. 표의 바이트 수치는 코드 주석에 적힌 Chrome 실측이며 이 카드에서 다시 측정하지 않았습니다.",
        "If the meter undercounts the real heap, the budget could allow more memory than intended, which is why a count barrier (2,000) stands beside it. The byte figures are Chrome measurements recorded in code comments and were not re-measured for this card.",
      ),
    },
    technologies: ["Undo journal", "Yjs"],
    facts: [
      { value: "192 MiB", label: t("되돌리기 유지 바이트 예산", "Retained-bytes budget for undo"), source: HISTORY },
      { value: "2,000", label: t("개수 방벽(계량 오차 대비 보험)", "Step-count barrier (insurance against metering error)"), source: HISTORY },
      { value: "8", label: t("예산을 넘어도 지키는 최근 단계 수", "Latest steps kept even over budget"), source: HISTORY },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "tiled-document-copy-on-write",
    category: "drawing",
    name: "Tiled document store",
    title: t("페이지를 512px 타일로 쪼개고, 되돌리기는 포인터만 복사하기", "Splitting pages into 512 px tiles, copying only pointers for undo"),
    status: "configured",
    tagline: t("페이지를 1 MiB 타일로 나누고, 스냅샷은 포인터만 복사하다 쓸 때만 타일을 복제합니다.", "Pages are split into 1 MiB tiles; snapshots copy pointers and clone a tile only when written."),
    background: [
      t(
        "큰 웹툰 페이지(예: 4000×6000px)를 레이어마다, 되돌리기 단계마다 비트맵 한 장씩 통째로 들고 있으면 한 장이 약 91.5 MiB 라 금방 메모리가 바닥납니다. 타일 방식은 페이지를 512×512px 조각(RGBA 8비트라 정확히 1 MiB)으로 나눠, 그림이 있는 조각만 메모리를 씁니다. 40px 짜리 선이 한 타일 안에 들어가면 타일 하나(1 MiB)만, 경계를 넘으면 닿은 타일 수만큼 차지합니다.",
        "Keeping a whole bitmap for every layer and every undo step of a large webtoon page (say 4000 x 6000 px) costs about 91.5 MiB each and exhausts memory fast. A tiled design splits the page into 512 x 512 px pieces (exactly 1 MiB at 8-bit RGBA) and only pieces with artwork use memory: a 40 px line that fits inside one tile occupies a single 1 MiB tile, and one that crosses tile borders occupies as many tiles as it touches.",
      ),
      t(
        "되돌리기용 스냅샷은 픽셀을 복사하지 않고 '타일 목록의 포인터'만 복사합니다(레이어 수에 비례). 스냅샷 뒤 처음 쓰는 타일이 다른 곳과 공유 중일 때만 그 타일 1 MiB 를 복제합니다(복사-후-쓰기, copy-on-write). 그래서 N단계에 매번 타일 k개를 고치면 비용은 타일 '기본량 + N×k'개이지 '기본량 × (N+1)'이 아닙니다. 바뀐 사각형은 타일 단위로 합쳐 GPU 에는 바뀐 타일만 올립니다.",
        "An undo snapshot copies no pixels, only the pointers in the tile map (cost proportional to layer count). A tile is cloned (1 MiB) only when the first write after a snapshot hits a tile still shared with another map: copy-on-write. So N steps each editing k tiles cost base + N x k tiles, not base x (N + 1). Changed rectangles are merged per tile so the GPU is sent only the tiles that changed.",
      ),
      t(
        "안전 규칙: 메모리를 비우려고 타일을 내보낼(evict) 때는 영속된 것만 내보냅니다. 영속되지 않은 버퍼는 그 픽셀의 유일한 사본이라 지우면 되돌리기 단계 하나를 잃기 때문입니다. 부족하면 과하게 지우지 않고 부족분(shortfall)을 보고하고, 우선순위는 되돌리기 전용 타일, 화면 밖 타일 순이며 고정된 타일은 건드리지 않습니다.",
        "A safety rule: when evicting tiles to free memory, only persisted ones may go. An unpersisted buffer is the only copy of those pixels, so dropping it would delete an undo step. If memory is still short, the planner reports the shortfall instead of over-evicting; the order is history-only tiles, then off-screen tiles, and pinned tiles are never touched.",
      ),
      t(
        "현재 범위: 이 타일 저장소는 협업(CRDT) 래스터 표면의 WebGPU 표시에 연결돼 있고, 그 표면은 프런트 빌드 토큰(VITE_STUDIO_RASTER_CRDT_AUTO_PUBLICATION)과 서버 admission 토큰(STUDIO_RASTER_ASSET_ADMISSION)을 같은 릴리스에서 함께 설정해야 켜지는 옵트인 파일럿이라 상태가 '설정 필요'입니다. 편집기 문서 전체의 소유자는 아직 샘플 기반 획(DrawEl)이고, 타일 단위 권위(RGBA16F 워커 타일)는 vNext 목표입니다. 영속·퇴출 계획기는 순수 계획 코드와 테스트로 있으나 이 체크아웃에서 제품 코드의 호출부는 확인하지 못했습니다.",
        "Current scope: this tile store is connected to the WebGPU display of the collaborative (CRDT) raster surface, and that surface is an opt-in pilot that turns on only when the front-end build token (VITE_STUDIO_RASTER_CRDT_AUTO_PUBLICATION) and the server admission token (STUDIO_RASTER_ASSET_ADMISSION) are set together in the same release, hence the status 'setup required'. The owner of the whole editor document is still sample-based strokes (DrawEl), and tile-level authority (RGBA16F worker tiles) is a vNext goal. The persistence and eviction planners exist as pure planning code with tests, but no product call site was found in this checkout.",
      ),
    ],
    keyPoints: [
      t("512px · 1 MiB 타일, 그림이 있는 타일만 메모리 사용", "512 px, 1 MiB tiles; only tiles with artwork use memory"),
      t("스냅샷은 포인터만 복사, 쓸 때만 타일 복제", "Snapshots copy pointers; a tile is cloned only on write"),
      t("영속된 타일만 퇴출해 되돌리기 단계를 지킴", "Only persisted tiles are evicted, protecting undo steps"),
    ],
    diagram: {
      id: "tiled-document-copy-on-write-diagram",
      kind: "graph",
      title: t("스냅샷 뒤 처음 쓰는 타일만 복제", "Only the first write after a snapshot clones a tile"),
      caption: t("고치지 않은 타일 A 는 현재와 스냅샷이 함께 쓰고, 고친 타일 B 만 복제본이 따로 생깁니다.", "Untouched tile A is shared by the current map and the snapshot; only the edited tile B gets a separate clone."),
      alt: t(
        "현재 타일 맵과 스냅샷 타일 맵이 고치지 않은 타일 A 를 함께 가리킵니다. 타일 B 를 처음 쓰는 순간 현재 맵은 1 MiB 복제본 B 프라임을 새로 가리키고, 스냅샷은 원래 타일 B 를 계속 가리킵니다. 원래 타일은 영속된 뒤에만 메모리에서 내보낼 수 있습니다.",
        "The current tile map and the snapshot map both point to untouched tile A. When tile B is first written, the current map points to a new 1 MiB clone, B prime, while the snapshot keeps pointing to the original tile B. The original may be evicted from memory only after it is persisted.",
      ),
      nodes: [
        { id: "cur", label: t("현재 타일 맵", "Current tile map"), sub: t("편집 중인 문서", "The document being edited"), tone: "local", at: [0, 0] },
        { id: "snap", label: t("스냅샷 타일 맵", "Snapshot tile map"), sub: t("되돌리기 한 단계", "One undo step"), tone: "local", at: [0, 2] },
        { id: "shared", label: t("타일 A (공유)", "Tile A (shared)"), sub: t("고치지 않음 · 1 MiB", "Untouched, 1 MiB"), tone: "neutral", at: [1, 1] },
        { id: "clone", label: t("타일 B′ (복제)", "Tile B' (clone)"), sub: t("쓸 때만 1 MiB 복제", "1 MiB cloned on write"), tone: "good", at: [2, 0] },
        { id: "orig", label: t("타일 B (원본)", "Tile B (original)"), sub: t("스냅샷이 계속 가리킴", "Still held by the snapshot"), tone: "neutral", at: [2, 2] },
        { id: "blob", label: t("영속 저장", "Persisted copy"), sub: t("퇴출은 영속 뒤에만", "Evict only after this"), tone: "local", shape: "cylinder", at: [3, 2] },
      ],
      edges: [
        { from: "cur", to: "shared" },
        { from: "snap", to: "shared" },
        { from: "cur", to: "clone", label: t("쓰면 복제", "clone on write") },
        { from: "snap", to: "orig", label: t("그대로", "unchanged") },
        { from: "orig", to: "blob", style: "dashed", label: t("영속", "persist") },
      ],
    },
    usage: [
      {
        feature: t("협업 래스터 표면(WebGPU 표시)", "Collaborative raster surface (WebGPU display)"),
        role: t(
          "CRDT 래스터 타일을 straight 알파에서 premultiplied 로 한 번 바꿔 타일 저장소에 넣고, 해시가 바뀐 타일만 갱신해 WebGPU 로 합성합니다.",
          "Converts CRDT raster tiles from straight to premultiplied alpha once, stores them in the tile store, and updates only tiles whose hash changed before compositing with WebGPU.",
        ),
        paths: [
          "apps/web/src/domains/creator/render/studio-tiledoc-product-island.ts",
          "apps/web/src/domains/creator/StudioTiledDocWebGpuSurface.tsx",
          "apps/web/src/domains/creator/StudioRasterCrdtSurface.tsx",
        ],
        route: "/studio",
      },
      {
        feature: t("타일 저장소 · 복사-후-쓰기 스냅샷", "Tile store · copy-on-write snapshots"),
        role: t(
          "희소 타일 맵, 참조 카운트, O(레이어 수) 스냅샷, 더티 사각형의 타일 단위 병합을 맡습니다.",
          "Handles the sparse tile map, reference counts, O(layer count) snapshots and tile-level merging of dirty rectangles.",
        ),
        paths: [
          "apps/web/src/domains/creator/render/studio-tiledoc-store.ts#StudioTiledDocumentStore",
          "apps/web/src/domains/creator/render/studio-tiledoc-geometry.ts",
          "apps/web/src/domains/creator/render/studio-tiledoc-dirty.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("퇴출·영속 계획기(순수 계획 코드)", "Eviction and persistence planners (pure planning code)"),
        role: t(
          "영속된 타일만 LRU 로 내보내고 부족분을 보고하는 계획을 세웁니다. 테스트로 검증되지만 제품 호출부는 확인하지 못했습니다.",
          "Plans LRU eviction of persisted tiles only and reports any shortfall. It is covered by tests, but no product call site was confirmed.",
        ),
        paths: [
          "apps/web/src/domains/creator/render/studio-tiledoc-residency.ts",
          "apps/web/src/domains/creator/render/studio-tiledoc-persistence.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("스냅샷은 포인터만, 쓸 때만 복제", "Snapshots copy pointers; clone only on write"),
        language: "ts",
        ...commentedCode(
          [
            "const TILE_BYTES = 512 * 512 * 4; // 512x512 RGBA8 = 1 MiB",
            "",
            "class TileStore {",
            "  private tiles = new Map<string, Uint8ClampedArray>();",
            "  private shared = new Set<Uint8ClampedArray>(); // @0@",
            "",
            "  snapshot(): Map<string, Uint8ClampedArray> {",
            "    const snap = new Map(this.tiles); // @1@",
            "    snap.forEach((buffer) => this.shared.add(buffer));",
            "    return snap;",
            "  }",
            "",
            "  write(id: string, paint: (pixels: Uint8ClampedArray) => void): boolean {",
            "    let buffer = this.tiles.get(id) ?? new Uint8ClampedArray(TILE_BYTES);",
            "    const copied = this.shared.has(buffer);",
            "    if (copied) buffer = buffer.slice(); // @2@",
            "    paint(buffer);",
            "    this.tiles.set(id, buffer);",
            "    return copied;",
            "  }",
            "}",
            "",
            "const store = new TileStore();",
            "store.write('0:0', (px) => px.fill(255));",
            "const undo = store.snapshot();",
            "console.log(store.write('0:0', (px) => px.fill(0))); // @3@",
            "console.log(store.write('0:0', (px) => px.fill(1))); // @4@",
            "console.log(undo.get('0:0')![0]); // @5@",
          ].join("\n"),
          [
            "스냅샷이 붙잡고 있는 버퍼",
            "O(타일 수): 포인터만 복사하고 픽셀은 복사하지 않는다",
            "공유 중이면 첫 쓰기에서만 1 MiB 를 복제한다(copy-on-write)",
            "true — 스냅샷 뒤 첫 쓰기라 복제했다",
            "false — 이미 내 복제본이라 복제하지 않는다",
            "255 — 되돌리기 단계는 그대로다",
          ],
          [
            "buffers held by a snapshot",
            "O(tile count): copy pointers, not pixels",
            "when shared, clone 1 MiB on the first write only (copy-on-write)",
            "true - first write after the snapshot, so it cloned",
            "false - already my own clone, so no copy",
            "255 - the undo step is untouched",
          ],
        ),
        explain: t(
          "제품의 StudioTiledDocumentStore 를 줄인 장난감입니다. 실제 저장소는 참조 카운트로 공유를 세고, 비어 버린 타일을 되돌려 없애며, 스냅샷마다 버퍼 수명을 관리합니다(Node 로 실행해 출력 확인).",
          "A toy reduction of the product's StudioTiledDocumentStore. The real store counts sharing by reference count, prunes tiles that became empty and manages buffer lifetime per snapshot (output checked by running it in Node).",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Wikipedia · Copy-on-write", url: "https://en.wikipedia.org/wiki/Copy-on-write", kind: "article" },
      { title: "W3C · WebGPU", url: "https://www.w3.org/TR/webgpu/", kind: "spec", note: t("타일 합성이 올라가는 GPU API", "The GPU API tile compositing runs on") },
      { title: "MDN · Origin private file system", url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system", kind: "docs", note: t("영속 저장 후보로 거론되는 브라우저 파일 시스템", "The browser file system considered for persistence") },
    ],
    chapterIds: ["storage", "performance"],
    talk: {
      pitch: t(
        "큰 웹툰 페이지를 통째로 비트맵으로 들고 있지 않고 1MiB 타일로 쪼갭니다. 되돌리기 스냅샷은 포인터만 복사하고, 같은 타일을 실제로 고칠 때만 그 타일을 복제합니다. 지금은 배포 옵트인을 켠 협업 래스터 표면에만 연결돼 있고, 편집기 전체를 타일로 바꾼 것은 아닙니다.",
        "Instead of holding a big webtoon page as one bitmap, we split it into 1 MiB tiles. Undo snapshots copy only pointers, and a tile is cloned only when that very tile is edited. Today it is connected only to the collaborative raster surface once the deployment opt-in is switched on; the whole editor has not been converted to tiles.",
      ),
      analogy: t(
        "공유 문서를 '복사본 만들기' 대신 '북마크'로 저장했다가, 누군가 한 쪽을 고칠 때 그 쪽만 복사해 두는 것과 같습니다.",
        "It is like saving a shared document as a bookmark instead of a copy, and copying only a page at the moment someone edits that page.",
      ),
      questions: [
        {
          question: t("획을 타일에 커밋하나요?", "Are strokes committed to tiles?"),
          answer: t(
            "아닙니다. 라이브 문서의 소유자는 Konva/DrawEl(샘플+버전 스냅샷)이고, 타일 저장소는 협업 래스터 표면에 연결돼 있으며 타일 단위 권위는 vNext 목표입니다.",
            "No. The live document is owned by Konva/DrawEl (samples plus version snapshots); the tile store serves the collaborative raster surface, and tile-level authority is a vNext goal.",
          ),
        },
        {
          question: t("타일 크기는 왜 512 인가요?", "Why 512 for the tile size?"),
          answer: t(
            "512×512×4 가 정확히 1 MiB 라 예산을 타일 수로 셀 수 있습니다. 256 은 관리할 타일이 4배가 되고, 1024 는 복제 한 번이 4 MiB 라 되돌리기 비용이 커진다고 코드 주석이 설명합니다.",
            "512 x 512 x 4 is exactly 1 MiB, so budgets count in whole tiles. Code comments explain that 256 would quadruple the tiles to manage and 1024 would make one clone 4 MiB, raising undo cost.",
          ),
        },
        {
          question: t("메모리가 모자라면 아무 타일이나 버리나요?", "When memory runs short, are random tiles dropped?"),
          answer: t(
            "아닙니다. 되돌리기 전용, 화면 밖 순으로 영속된 타일만 내보내고 부족분은 보고합니다. 다만 이 계획기의 제품 호출부는 확인하지 못했습니다.",
            "No. Only persisted tiles go, history-only first and then off-screen ones, and any shortfall is reported. The product call site of this planner, however, was not confirmed.",
          ),
        },
      ],
      pitfall: t(
        "이 저장소는 배포 옵트인(위 두 토큰)이 켜진 협업 래스터 표면에만 연결돼 있고, 운영에서 그 토큰이 켜져 있는지는 저장소로 확인하지 못했습니다. '영속된 뒤에만 퇴출' 규칙은 설계와 테스트로 확인했지만 호출부가 없는 계획기라, 실제 메모리 부족 상황에서의 동작은 확인하지 못했습니다. '입력이 타일 커밋 단계로 나뉜다'는 기존 표현은 이 구분이 없습니다.",
        "The store is connected only to the collaborative raster surface once the deployment opt-in (the two tokens above) is on, and whether production has those tokens on could not be confirmed from the repository. The 'evict only after persisting' rule is confirmed by design and tests, but since the planner has no call site, behavior under real memory pressure was not verified. The older phrase that input is split into tile-commit stages lacks this distinction.",
      ),
    },
    technologies: ["WebGPU", "Copy-on-write"],
    facts: [
      { value: "512 px · 1 MiB", label: t("저장 타일 한 변과 타일 하나의 크기(RGBA8 premultiplied)", "Storage tile side and tile size (RGBA8 premultiplied)"), source: "apps/web/src/domains/creator/render/studio-tiledoc-geometry.ts" },
      { value: "2,048", label: t("더티 추적기가 타일별 기록을 하는 최대 칸 수", "Maximum cells the dirty tracker records individually"), source: "apps/web/src/domains/creator/render/studio-tiledoc-dirty.ts" },
      { value: "256 MiB", label: t("퇴출 계획기의 기본 메모리 예산(타일 256개)", "Default memory budget of the eviction planner (256 tiles)"), source: "apps/web/src/domains/creator/render/studio-tiledoc-residency.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "selection-tools-grabcut",
    category: "drawing",
    name: "Magic wand",
    title: t("마술봉과 정확한 선택 외곽선, 그리고 아직 연결되지 않은 grabCut", "Magic wand, exact selection outlines and the not-yet-wired grabCut"),
    status: "live",
    tagline: t("마술봉은 이어진 비슷한 색을 퍼뜨려 선택을 만들고, OpenCV grabCut 은 구현만 되어 있습니다.", "The magic wand spreads over similar connected color into a selection; OpenCV grabCut exists in code only."),
    background: [
      t(
        "포토샵의 '마술봉'처럼, 클릭한 점과 색이 비슷하면서 이어진 영역을 한 번에 선택하는 도구입니다. 페인트 통이 그 영역을 색으로 칠한다면 마술봉은 같은 영역을 '선택 영역'으로 만들어, 이동·페더(경계 흐림)·반전·되돌리기를 할 수 있게 합니다. 핵심은 연결 영역 탐색(flood fill)으로, 스택을 쓰는 비재귀 방식이라 큰 이미지에서도 호출 스택이 넘치지 않습니다.",
        "Like Photoshop's magic wand, it selects the connected area whose color is close to the clicked point. Where the paint bucket fills that area with color, the magic wand turns it into a selection that can be moved, feathered, inverted and undone. The core is a connected-region search (flood fill), done non-recursively with a stack so large images cannot overflow the call stack.",
      ),
      t(
        "찾은 0/1 마스크의 윤곽선(바깥 하나와 구멍들)을 추적해 선택 모델에 더하거나 뺍니다. 성능을 위해 긴 변 640px 로 줄여 스캔·추적하고 윤곽 루프는 48개까지만 유지하므로 마술봉 경계는 근사입니다(좌표는 0~1 정규화라 해상도와 호환). 반대로 색 범위 선택에는 정확한 경로가 따로 있어, 원본 픽셀 경계를 해상도를 낮추지 않고 추적하고 모서리만 닿는 픽셀과 구멍도 그대로 둡니다. 레이어 알파를 선택으로 바꾸는 모듈(studio-layer-alpha-selection.ts)도 같은 방식으로 구현·시험돼 있지만 제품 호출처는 아직 없습니다.",
        "The outline of the resulting 0/1 mask (one outer loop plus holes) is traced and added to or subtracted from the selection model. For speed it scans and traces at a long side of 640 px and keeps at most 48 loops, so the magic wand's edge is approximate (coordinates are normalized 0 to 1 and thus resolution-independent). Color-range selection instead has an exact path that traces original pixel boundaries without lowering resolution, keeping pixels that only touch at corners and holes as they are. A module that turns layer alpha into a selection (studio-layer-alpha-selection.ts) is built and tested the same way, but no product code calls it yet.",
      ),
      t(
        "OpenCV.js(브라우저용 WebAssembly 컴퓨터 비전)는 마스크를 벡터 경로로 바꾸는 윤곽선 추출에 쓰입니다. 같은 모듈에는 grabCut(사각형 안의 전경을 색 모델과 그래프 컷으로 분리하는 대화형 알고리즘)·플러드 마스크·가장자리 다듬기도 구현돼 있고 입력은 한 변 8,192px, 33.5MP 로 제한되지만, 이 함수들을 부르는 제품 코드는 아직 없습니다. 모든 OpenCV 객체를 만든 순서의 역순으로 해제해야 WASM 힙이 새지 않는다는 규율이 코드에 있습니다.",
        "OpenCV.js (computer vision compiled to WebAssembly for browsers) is used to turn masks into vector paths via contour extraction. The same module also implements grabCut (an interactive algorithm that separates foreground inside a rectangle using color models and graph cuts), flood masks and edge refinement, with inputs capped at 8,192 px per side and 33.5 MP, but no product code calls those functions yet. The code enforces a discipline of freeing every OpenCV object in reverse creation order so the WASM heap does not leak.",
      ),
      t(
        "실행 위치도 시작 전에 정합니다. 마술봉은 Worker 로 돌릴지 직접 돌릴지를 작업 시작 전에 고르고, 도중에 바꾸거나 다른 쪽으로 재실행하지 않습니다. 같은 단일 선택 원칙을 따르는 것이고, Worker 가 없다는 것이 곧 직접 실행을 뜻하지도 않습니다.",
        "Where it runs is also decided up front. The magic wand picks worker or direct execution before the operation starts and neither changes it midway nor reruns on the other side. It follows the same single-choice principle, and having no Worker does not by itself mean running directly.",
      ),
    ],
    keyPoints: [
      t("마술봉은 이어진 비슷한 색을 스택 flood fill 로 찾음", "The wand finds connected similar color with a stack flood fill"),
      t("마술봉 경계는 640px 근사, 정확 선택은 원본 픽셀 경계", "Wand edges are 640 px approximations; exact selections use pixel edges"),
      t("OpenCV grabCut 은 구현·테스트만 있고 화면 기능은 미연결", "OpenCV grabCut is implemented and tested but not wired to the UI"),
    ],
    diagram: {
      id: "selection-tools-grabcut-diagram",
      kind: "graph",
      title: t("클릭 한 번이 선택 영역이 되기까지", "From one click to a selection"),
      caption: t("마술봉 경로는 연결되어 있고, 정확 외곽선은 별도 경로이며, grabCut 은 아직 연결되지 않았습니다.", "The wand path is connected, exact outlines are a separate path, and grabCut is not yet connected."),
      alt: t(
        "마술봉은 클릭한 점에서 비슷한 색으로 이어진 영역을 퍼뜨려 0/1 마스크를 만들고, 외곽선을 추적해 선택 영역에 더합니다. 색 범위 같은 원본 해상도 마스크는 픽셀 경계를 그대로 추적하는 정확 외곽선 경로를 거칩니다(레이어 알파 선택 모듈은 아직 미연결). OpenCV grabCut 은 점선으로 표시했듯 아직 마스크 단계에 연결되지 않았습니다.",
        "The magic wand spreads over similar connected color from the clicked point to make a 0/1 mask, traces its outline and adds it to the selection. Full-resolution masks such as color range go through an exact-outline path that traces pixel boundaries as they are (the layer-alpha selection module is not yet wired). OpenCV grabCut, drawn dashed, is not yet connected to the mask stage.",
      ),
      nodes: [
        { id: "click", label: t("클릭 한 점", "A clicked point"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "scan", label: t("영역 퍼뜨리기", "Spread the region"), sub: t("스택 flood fill · 허용 오차", "Stack flood fill, tolerance"), tone: "local", at: [1, 1] },
        { id: "mask", label: t("0/1 마스크", "0/1 mask"), sub: t("긴 변 640px 로 축소", "Long side scaled to 640 px"), tone: "local", at: [2, 1] },
        { id: "trace", label: t("외곽선 추적", "Trace outline"), sub: t("바깥 1 + 구멍 · 48 루프", "Outer 1 + holes, 48 loops"), tone: "local", at: [3, 1] },
        { id: "sel", label: t("선택 영역", "Selection"), sub: t("추가·빼기·이동·되돌리기", "Add, subtract, move, undo"), tone: "good", shape: "pill", at: [4, 1] },
        { id: "cv", label: t("OpenCV grabCut", "OpenCV grabCut"), sub: t("구현·테스트만, UI 미연결", "Code and tests only"), tone: "warn", at: [2, 0] },
        { id: "src", label: t("원본 해상도 마스크", "Full-resolution mask"), sub: t("색 범위 (알파는 미연결)", "Color range (alpha not wired)"), tone: "local", at: [2, 2] },
        { id: "exact", label: t("정확 외곽선", "Exact outline"), sub: t("픽셀 경계 그대로", "Pixel edges as they are"), tone: "good", at: [3, 2] },
      ],
      edges: [
        { from: "click", to: "scan" },
        { from: "scan", to: "mask" },
        { from: "mask", to: "trace" },
        { from: "trace", to: "sel" },
        { from: "cv", to: "mask", style: "dashed", label: t("미연결", "unwired") },
        { from: "src", to: "exact" },
        { from: "exact", to: "sel" },
      ],
    },
    usage: [
      {
        feature: t("마술봉 도구", "Magic wand tool"),
        role: t(
          "클릭한 점과 색이 비슷하게 이어진 영역을 찾아 윤곽선을 선택 영역에 더하거나 뺍니다. 실행 위치(Worker/직접)는 시작 전에 정해집니다.",
          "Finds the area connected to the clicked point in similar color and adds or subtracts its outline to the selection. The execution place (worker or direct) is fixed before it starts.",
        ),
        paths: [
          `${WAND}#scanMagicWandRegionFromImageData`,
          "apps/web/src/domains/creator/studio-flood-fill.ts#scanFloodRegionMask",
          "apps/web/src/domains/creator/studio-magic-wand-worker-client.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("선택 작업대 · 색 범위 선택 (알파 선택은 미연결)", "Selection workbench · color-range selection (alpha selection not wired)"),
        role: t(
          "색 범위 선택은 원본 픽셀 경계를 해상도를 낮추지 않고 추적하고, 처리 예산을 넘으면 낮추는 대신 기존 선택을 유지합니다. 레이어 알파 선택 모듈(studio-layer-alpha-selection.ts)은 구현·시험만 있고 제품 호출처가 없습니다.",
          "Color-range selection traces original pixel boundaries without lowering resolution, and when the processing budget is exceeded it keeps the existing selection instead of degrading. The layer-alpha selection module (studio-layer-alpha-selection.ts) is implemented and tested only and has no product caller.",
        ),
        paths: [
          "apps/web/src/domains/creator/selection/studio-selection-exact-mask.ts#exactSelectionFromMask",
          "apps/web/src/domains/creator/StudioSelectionWorkbenchPanel.tsx",
          "apps/web/src/domains/creator/layer/studio-layer-alpha-selection.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("이미지 → 벡터 변환(트레이스·벡터화)", "Image to vector conversion (trace, vectorize)"),
        role: t(
          "마스크를 OpenCV.js 윤곽선 추출로 벡터 경로로 바꿉니다. 같은 모듈의 grabCut·플러드 마스크 함수는 아직 호출되지 않습니다.",
          "Turns masks into vector paths with OpenCV.js contour extraction. The grabCut and flood-mask functions in the same module are not called yet.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-opencv-selection.ts#maskToPathIR",
          "apps/web/src/domains/creator/studio-image-trace.ts",
          "apps/web/src/domains/creator/studio-raster-vectorize-product.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("이어진 비슷한 색만 찾는 flood fill", "A flood fill that finds only connected similar color"),
        language: "ts",
        ...commentedCode(
          [
            "// @0@",
            "function floodMask(px: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, tol: number): Uint8Array {",
            "  const mask = new Uint8Array(w * h);",
            "  const o = (sy * w + sx) * 4;",
            "  const near = (i: number): boolean => {",
            "    const dr = px[i]! - px[o]!;",
            "    const dg = px[i + 1]! - px[o + 1]!;",
            "    const db = px[i + 2]! - px[o + 2]!;",
            "    const da = px[i + 3]! - px[o + 3]!;",
            "    return dr * dr + dg * dg + db * db + da * da <= tol * tol * 3; // @1@",
            "  };",
            "  const stack: number[] = [sy * w + sx];",
            "  while (stack.length > 0) {",
            "    const pos = stack.pop()!;",
            "    if (mask[pos] || !near(pos * 4)) continue;",
            "    mask[pos] = 1;",
            "    const x = pos % w;",
            "    if (x > 0) stack.push(pos - 1);",
            "    if (x < w - 1) stack.push(pos + 1);",
            "    if (pos >= w) stack.push(pos - w);",
            "    if (pos < w * (h - 1)) stack.push(pos + w);",
            "  }",
            "  return mask;",
            "}",
            "// @2@",
            "const img = new Uint8ClampedArray([255, 0, 0, 255, 250, 5, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255]);",
            "console.log(floodMask(img, 4, 1, 0, 0, 20)); // @3@",
          ].join("\n"),
          [
            "클릭한 픽셀과 색이 비슷하게 이어진 이웃으로 퍼뜨려 0/1 마스크를 만든다(스택 기반, 재귀 없음).",
            "제품과 같은 거리 기준: RGBA 차이의 제곱합이 허용 오차 범위 안",
            "빨강, 비슷한 빨강, 파랑, 빨강 — 네 픽셀짜리 이미지",
            "[1, 1, 0, 0] — 파랑에서 막혀 오른쪽 끝 빨강은 이어지지 않는다",
          ],
          [
            "Spread from the clicked pixel to connected neighbors of similar color to make a 0/1 mask (stack-based, no recursion).",
            "Same distance rule as the product: the sum of squared RGBA differences within the tolerance",
            "red, similar red, blue, red - an image of four pixels",
            "[1, 1, 0, 0] - blocked by the blue, so the red at the far right is not connected",
          ],
        ),
        explain: t(
          "제품의 scanFloodRegionMask 와 같은 거리 기준이고, 페인트 통과 같은 스캔을 재사용해 '칠하기' 대신 '마스크 만들기'를 합니다(Node 로 실행해 출력 확인).",
          "It uses the same distance rule as the product's scanFloodRegionMask, which the paint bucket shares, producing a mask instead of painting (output checked by running it in Node).",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Wikipedia · Flood fill", url: "https://en.wikipedia.org/wiki/Flood_fill", kind: "article" },
      { title: "OpenCV.js tutorials", url: "https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html", kind: "docs", note: t("브라우저용 OpenCV 입문", "Introduction to OpenCV in the browser") },
      { title: "OpenCV · Foreground extraction using GrabCut", url: "https://docs.opencv.org/4.x/d8/d83/tutorial_py_grabcut.html", kind: "docs" },
      { title: "Rother et al. · GrabCut (ACM TOG 2004)", url: "https://doi.org/10.1145/1015706.1015720", kind: "article", note: t("grabCut 알고리즘의 원 논문", "The original grabCut paper") },
      { title: "opencv-js (TechStark)", url: "https://github.com/TechStark/opencv-js", kind: "repo", note: t("제품이 쓰는 OpenCV.js 패키지", "The OpenCV.js package the product uses") },
    ],
    chapterIds: ["worker-architecture", "browser-local-compute"],
    talk: {
      pitch: t(
        "마술봉은 클릭한 색과 비슷하게 이어진 영역만 찾아 선택으로 만듭니다. 화면용 외곽선은 작게 줄여 빠르게 추적하고, 정확한 경계가 필요한 색 범위 선택은 원본 픽셀 그대로 따로 추적합니다(레이어 알파 선택 모듈은 구현만 있고 아직 연결 전). OpenCV grabCut 은 구현돼 있지만 아직 화면 기능에 연결하지 않았습니다.",
        "The magic wand finds only the area connected to the clicked point in a similar color and makes it a selection. Outlines for display are traced quickly at reduced size, while color-range selection, which needs exact edges, is traced separately on the original pixels (the layer-alpha selection module is built but not yet wired). OpenCV grabCut is implemented but not yet wired to a user feature.",
      ),
      analogy: t(
        "페인트 통으로 칠하는 대신 '칠해질 영역'에만 점선 울타리를 치는 것과 같습니다. 울타리는 옮기고 뒤집고 되돌릴 수 있습니다.",
        "It is like putting a dotted fence around the area a paint bucket would fill instead of painting it; the fence can be moved, flipped and undone.",
      ),
      questions: [
        {
          question: t("OpenCV grabCut 으로 자동 선택하나요?", "Does it auto-select with OpenCV grabCut?"),
          answer: t(
            "아직 아닙니다. grabCut·플러드 마스크·가장자리 다듬기는 구현과 테스트가 있지만 제품 코드에서 호출하는 곳이 없습니다. OpenCV 는 지금 마스크를 벡터 경로로 바꾸는 트레이스·벡터화에서만 쓰입니다.",
            "Not yet. grabCut, flood masks and edge refinement have an implementation and tests but no product caller. OpenCV is currently used only to turn masks into vector paths in trace and vectorize.",
          ),
        },
        {
          question: t("왜 640px 로 줄여서 추적하나요?", "Why trace at 640 px?"),
          answer: t(
            "마술봉 윤곽선의 추적 비용을 줄이기 위해서입니다. 대신 경계는 근사이고, 정확한 경계가 필요한 경로는 원본 해상도로 따로 추적하며 예산을 넘으면 해상도를 낮추지 않고 기존 선택을 유지합니다.",
            "To cut the tracing cost of wand outlines. The edge is therefore approximate; paths that need exact edges trace at original resolution separately, and over budget they keep the existing selection rather than degrade.",
          ),
        },
        {
          question: t("큰 이미지는 어떻게 되나요?", "What happens with huge images?"),
          answer: t(
            "정확 선택은 한 변 8,192px·1,677만 픽셀을 넘으면 거절하고, OpenCV 쪽 함수도 한 변 8,192px·약 3,355만 픽셀로 제한합니다(코드 상수 기준). 실기기에서의 처리 시간은 이 카드에서 확인하지 못했습니다.",
            "Exact selection refuses sizes beyond 8,192 px per side or 16.77 million pixels, and the OpenCV functions are capped at 8,192 px per side and about 33.55 million pixels (per code constants). Processing time on real devices was not verified for this card.",
          ),
        },
      ],
      pitfall: t(
        "grabCut 을 '자동 선택 기능'이라고 소개하면 사실과 다릅니다(제품 호출부 없음). 마술봉 경계는 640px 근사입니다. 선택 정확도나 속도를 다른 앱과 비교한 수치는 이 카드에 없습니다.",
        "Presenting grabCut as an auto-select feature would be untrue (no product caller). The wand's edge is a 640 px approximation. This card has no figures comparing selection accuracy or speed with other apps.",
      ),
    },
    technologies: ["OpenCV.js", "WebAssembly", "Dedicated Worker"],
    facts: [
      { value: "640 px", label: t("마술봉이 스캔·추적하는 긴 변 상한", "Long-side cap for magic-wand scanning and tracing"), source: WAND },
      { value: "48", label: t("한 번에 유지하는 윤곽 루프 수(바깥+구멍)", "Maximum contour loops kept (outer plus holes)"), source: WAND },
      { value: "8,192 px · 16,777,216 px", label: t("정확 선택 외곽선의 한 변·전체 픽셀 상한", "Exact selection outline caps per side and in total pixels"), source: "apps/web/src/domains/creator/selection/studio-selection-exact-mask.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "lettering-kinsoku-vertical",
    category: "drawing",
    name: "Kinsoku shori",
    title: t("말풍선 조판: 줄 첫머리에 '?!'가 홀로 남지 않게 하는 금칙과 세로쓰기", "Bubble typesetting: kinsoku so '?!' never starts a line, and vertical writing"),
    status: "configured",
    tagline: t("금칙·랙 균형·세로쓰기 코어는 있고, 가로 말풍선 줄바꿈에는 아직 연결되지 않았습니다.", "Kinsoku, rag-balancing and vertical-writing cores exist, but the horizontal bubble wrap does not use them yet."),
    background: [
      t(
        "만화·웹툰 말풍선에서 줄 첫머리에 '?!'나 '…', 닫는 따옴표만 덩그러니 남으면 단번에 어색한 조판으로 보입니다. 그래서 일본어 조판 요건(JLReq)은 줄 맨 앞이나 맨 끝에 올 수 없는 글자를 정해 두었고(금칙처리, 禁則処理), 한국어 조판 요건(KLReq)에도 줄 첫머리 제한(Line Head Restrictions) 항목이 있습니다. ToonStudio 의 코어는 위반이 생기면 줄바꿈 지점을 앞으로 물립니다(追い出し, 최대 4자소).",
        "In manga and webtoon bubbles, a line that starts with a lone '?!', an ellipsis or a closing quote instantly looks amateur. The Japanese layout requirements (JLReq) therefore name characters that may not start or end a line (kinsoku shori), and the Korean ones (KLReq) also have a Line Head Restrictions section. ToonStudio's core pulls the break point earlier when a violation would occur (oidashi, up to 4 graphemes).",
      ),
      t(
        "랙 균형(rag balancing)은 그리디 워드랩이 만드는 '길게-길게-짧게' 계단을 없앱니다. 줄 수를 유지하는 가장 좁은 폭을 이진 탐색으로 찾아 다시 줄바꿈하므로 줄 수가 같고, 말풍선 높이와 자동 축소 계산은 그대로이며 줄바꿈 위치만 달라집니다(CSS text-wrap: balance 와 같은 성질). 글자 단위는 Intl.Segmenter 의 자소 군집이라 이모지가 중간에서 쪼개지지 않습니다(그 쪽 이야기는 웹 플랫폼 카드 intl-segmenter-korean-lines 참고).",
        "Rag balancing removes the long-long-short staircase greedy wrapping creates. A binary search finds the narrowest width that keeps the line count and rewraps at it, so the line count, bubble height and auto-shrink math stay identical and only break positions change (the same property as CSS text-wrap: balance). Units are grapheme clusters from Intl.Segmenter, so emoji are never split in half (see the web-platform card intl-segmenter-korean-lines for that side).",
      ),
      t(
        "세로쓰기는 별도의 순수 레이아웃 엔진이 맡습니다. 캔버스와 SVG 어디에도 OpenType vert 기능을 켤 방법이 없어, 모양이 달라져야 하는 글자는 치환표 대신 90° 회전으로 만들고(결정적 기하 폴백), 짧은 숫자는 한 칸에 가로로 넣는 종중횡조(縦中横)를 씁니다. 같은 좌표로 Konva 와 SVG 가 그려 캔버스와 내보내기가 일치합니다.",
        "Vertical writing is handled by a separate pure layout engine. Neither canvas nor SVG can switch on the OpenType vert feature, so glyphs that must change shape are made by a 90 degree rotation instead of a substitution table (a deterministic geometric fallback), and short numbers are set sideways in one cell (tate-chu-yoko). Konva and SVG draw from the same coordinates, so canvas and export match.",
      ),
      t(
        "정직한 현재 상태(여기서 '설정 필요'는 환경 설정이 아니라 가로 줄바꿈에 연결하는 작업이 남았다는 뜻입니다): 금칙·랙 균형 모듈은 번역 QA(현지화 오버플로 보고서)에서 위반을 세는 데 연결돼 있지만, 가로 말풍선의 실제 줄바꿈 함수(wrapBubbleTextLines)는 공백 단위 그리디 워드랩이고 이 모듈을 호출하지 않습니다. HarfBuzz 셰이핑 provider(합자·커닝용)도 구현돼 있지만 제품 코드에서 import 하는 곳이 없습니다.",
        "The honest current state ('setup required' here means the wiring into horizontal wrapping is still to do, not an environment setting): the kinsoku and rag-balancing module is wired into translation QA (the localization overflow report) to count violations, but the real horizontal wrap function (wrapBubbleTextLines) is a space-based greedy wrap that does not call it. A HarfBuzz shaping provider (for ligatures and kerning) is also implemented but nothing in product code imports it.",
      ),
    ],
    keyPoints: [
      t("금칙: 줄 첫머리의 ?! … 」를 막으려 줄바꿈을 앞으로 물림", "Kinsoku pulls the break back so ?! … never start a line"),
      t("랙 균형: 줄 수는 그대로, 줄바꿈 위치만 고름", "Rag balancing keeps the line count and only moves breaks"),
      t("가로 말풍선 줄바꿈에는 금칙이 아직 미적용", "Horizontal bubble wrapping does not apply kinsoku yet"),
    ],
    diagram: {
      id: "lettering-kinsoku-vertical-diagram",
      kind: "graph",
      title: t("말풍선 글자가 배치되는 길", "How bubble text gets laid out"),
      caption: t("세로쓰기와 번역 QA 는 연결돼 있고, 가로 줄바꿈과 금칙 사이는 아직 이어지지 않았습니다.", "Vertical writing and translation QA are connected; horizontal wrapping and kinsoku are not yet joined."),
      alt: t(
        "대사 텍스트는 쓰기 방향에서 갈라집니다. 가로쓰기는 금칙이 없는 그리디 줄바꿈을 거쳐 말풍선에 배치되고, 세로쓰기는 90도 회전과 종중횡조를 쓰는 세로 엔진을 거쳐 같은 말풍선 배치로 갑니다. 금칙·랙 균형 코어는 그리디 줄바꿈과 점선으로만 이어져 있고 현재는 번역 QA 보고서에서 위반 수를 세는 데 쓰입니다.",
        "Dialogue text branches at the writing direction. Horizontal text goes through greedy wrapping without kinsoku into the bubble layout; vertical text goes through a vertical engine using 90 degree rotation and tate-chu-yoko into the same layout. The kinsoku and rag-balancing core is joined to greedy wrapping only by a dashed line and is currently used to count violations in the translation QA report.",
      ),
      nodes: [
        { id: "text", label: t("대사 텍스트", "Dialogue text"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "dir", label: t("쓰기 방향", "Direction"), sub: t("가로·세로", "H or V"), tone: "neutral", shape: "diamond", at: [1, 1] },
        { id: "wrap", label: t("그리디 줄바꿈", "Greedy wrap"), sub: t("금칙 없음(현재)", "No kinsoku (today)"), tone: "warn", at: [2, 0] },
        { id: "vert", label: t("세로쓰기 엔진", "Vertical engine"), sub: t("90° 회전 · 종중횡조", "Rotation, tate-chu-yoko"), tone: "good", at: [2, 2] },
        { id: "balloon", label: t("말풍선 배치", "Bubble layout"), sub: t("Konva·SVG 같은 좌표", "Same coordinates for both"), tone: "good", at: [3, 1] },
        { id: "kin", label: t("금칙·랙 균형", "Kinsoku and rag"), sub: t("구현·테스트 완료", "Built and tested"), tone: "neutral", at: [4, 0] },
        { id: "qa", label: t("번역 QA 보고", "Translation QA"), sub: t("금칙 위반 수 세기", "Counts violations"), tone: "good", at: [4, 2] },
      ],
      edges: [
        { from: "text", to: "dir" },
        { from: "dir", to: "wrap", label: t("가로", "horizontal") },
        { from: "dir", to: "vert", label: t("세로", "vertical") },
        { from: "wrap", to: "balloon" },
        { from: "vert", to: "balloon" },
        { from: "wrap", to: "kin", style: "dashed", label: t("미연결", "unwired") },
        { from: "kin", to: "qa", label: t("위반 수", "violations") },
      ],
    },
    usage: [
      {
        feature: t("번역 QA · 현지화 오버플로 보고서", "Translation QA · localization overflow report"),
        role: t(
          "번역문이 말풍선에 넘치는지와 금칙 위반 개수를 세는 데 금칙·랙 균형 코어를 호출합니다.",
          "Calls the kinsoku and rag-balancing core to count translated lines that overflow a bubble and how many break kinsoku rules.",
        ),
        paths: [
          KINSOKU,
          "apps/web/src/domains/creator/lettering/studio-localization-overflow-gate.ts",
          "apps/web/src/domains/creator/lettering/studio-localization-qa.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("말풍선 가로쓰기 줄바꿈", "Horizontal bubble wrapping"),
        role: t(
          "공백 단위 그리디 워드랩으로 줄을 나누고 글자 폭은 주입된 측정기로 잽니다. 금칙·랙 균형은 이 함수에 아직 연결되지 않았습니다.",
          "Splits lines with a space-based greedy word wrap, measuring widths with an injected measurer. Kinsoku and rag balancing are not yet connected to this function.",
        ),
        paths: ["apps/web/src/domains/creator/lettering/studio-bubble-text-fit.ts#wrapBubbleTextLines"],
        route: "/studio",
      },
      {
        feature: t("세로쓰기 말풍선", "Vertical-writing bubbles"),
        role: t(
          "열을 오른쪽에서 왼쪽으로 쌓는 세로쓰기 조판을 순수 레이아웃 엔진이 계산하고, Konva 와 SVG 내보내기가 같은 좌표로 그립니다.",
          "A pure layout engine computes vertical typesetting with columns stacked right to left, and Konva and SVG export draw from the same coordinates.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-vertical-text.ts",
          "apps/web/src/domains/creator/lettering/studio-bubble-text-runtime.ts",
          "apps/web/src/domains/creator/export/studio-svg-export.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("HarfBuzz 셰이핑 provider(미연결)", "HarfBuzz shaping provider (not wired)"),
        role: t(
          "합자·커닝 같은 OpenType 셰이핑용 provider 로 입력 예산(폰트 32 MiB, 텍스트 65,536 코드유닛 등)을 갖췄지만, 제품 코드의 import 는 없습니다.",
          "A provider for OpenType shaping such as ligatures and kerning, with input budgets (32 MiB fonts, 65,536 text code units and more), but no product code imports it.",
        ),
        paths: ["apps/web/src/domains/creator/studio-harfbuzz-shaping-provider.ts"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("금칙: 줄머리 문자를 피해 줄바꿈 지점 물리기", "Kinsoku: pulling a break back to avoid line-start characters"),
        language: "ts",
        ...commentedCode(
          [
            "const NO_START = new Set(['?', '!', '…', '」', ')', '。', ',']); // @0@",
            "",
            "// @1@",
            "function wrap(text: string, max: number, kinsoku: boolean): string[] {",
            "  const chars = Array.from(text); // @2@",
            "  const lines: string[] = [];",
            "  for (let i = 0; i < chars.length; ) {",
            "    let end = Math.min(i + max, chars.length);",
            "    while (kinsoku && end < chars.length && end - i > 1 && NO_START.has(chars[end]!)) end -= 1;",
            "    lines.push(chars.slice(i, end).join(''));",
            "    i = end;",
            "  }",
            "  return lines;",
            "}",
            "",
            "const text = '정말 그럴 리가 없잖아…?!';",
            "console.log(wrap(text, 13, false)); // @3@",
            "console.log(wrap(text, 13, true)); // @4@",
          ].join("\n"),
          [
            "줄 첫머리에 올 수 없는 문자(일부)",
            "追い出し(밀어내기): 다음 줄이 금칙 문자로 시작하게 되면 줄바꿈 지점을 앞으로 물린다.",
            "제품은 Intl.Segmenter 로 자소 군집 단위 분할",
            "['정말 그럴 리가 없잖아…', '?!'] — 둘째 줄이 ?! 로 시작",
            "['정말 그럴 리가 없잖', '아…?!'] — 줄머리 금칙 해소",
          ],
          [
            "Characters that may not start a line (a subset)",
            "Oidashi (push-out): if the next line would start with a forbidden character, pull the break earlier.",
            "the product splits into grapheme clusters with Intl.Segmenter",
            "['정말 그럴 리가 없잖아…', '?!'] - the second line starts with ?!",
            "['정말 그럴 리가 없잖', '아…?!'] - the line-start violation is gone",
          ],
        ),
        explain: t(
          "제품의 retreatToLegalBreak 은 같은 일을 최대 4자소까지만 물리고, 합법 지점이 없으면 원래 지점을 씁니다(상자를 넘치거나 빈 줄이 생기는 것보다 어색한 줄바꿈 하나가 낫다는 판단). 출력은 Node 로 실행해 확인했습니다.",
          "The product's retreatToLegalBreak does the same but retreats at most 4 graphemes and falls back to the original break if no legal one exists (judging one awkward break better than overflow or an empty line). The output was checked by running it in Node.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "W3C · Requirements for Japanese Text Layout (JLReq)", url: "https://www.w3.org/TR/jlreq/", kind: "spec", note: t("행두·행말 금칙의 표준 출처", "The standard source of line-start and line-end prohibitions") },
      { title: "W3C · Requirements for Hangul Text Layout (KLReq)", url: "https://www.w3.org/TR/klreq/", kind: "spec", note: t("한국어 조판 요건", "Korean layout requirements") },
      { title: "MDN · Intl.Segmenter", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter", kind: "docs", note: t("자소 군집 단위 분할", "Splitting by grapheme cluster") },
      { title: "W3C · CSS Writing Modes Level 4", url: "https://www.w3.org/TR/css-writing-modes-4/", kind: "spec", note: t("세로쓰기와 글자 방향의 표준", "The standard for vertical writing and glyph orientation") },
      { title: "MDN · CSS line-break", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/line-break", kind: "docs" },
      { title: "HarfBuzz", url: "https://harfbuzz.github.io/", kind: "docs", note: t("OpenType 셰이핑 엔진", "The OpenType shaping engine") },
    ],
    chapterIds: ["on-device-translation", "quality"],
    talk: {
      pitch: t(
        "웹툰 말풍선에서 줄 맨 앞에 물음표나 말줄임표만 남으면 바로 어색해 보입니다. 그래서 줄 첫머리에 올 수 없는 글자를 정한 금칙 규칙과, 줄 길이를 고르게 하는 랙 균형, 세로쓰기 조판 코어를 만들었습니다. 지금은 세로쓰기와 번역 QA 에 연결돼 있고, 가로 말풍선의 실제 줄바꿈에 붙이는 일이 남아 있습니다.",
        "In a webtoon bubble, a line that begins with just a question mark or an ellipsis looks off immediately. So we built a kinsoku rule set for characters that cannot start a line, rag balancing to even out line lengths, and a vertical typesetting core. Today it is wired into vertical writing and translation QA; attaching it to the real horizontal bubble wrapping is still to do.",
      ),
      analogy: t(
        "책 편집자가 교정지에 '줄 맨 앞에 마침표가 오면 안 돼요'라고 빨간 펜을 대는 규칙집과 같습니다. 코드가 그 규칙집을 갖고 있고, 아직 모든 줄바꿈에 적용하지는 않았습니다.",
        "It is like an editor's rulebook for red-penning proofs: 'a period must not start a line'. The code holds that rulebook but does not yet apply it to every line break.",
      ),
      questions: [
        {
          question: t("HarfBuzz 를 쓰나요?", "Do you use HarfBuzz?"),
          answer: t(
            "셰이핑 provider 를 만들어 입력 예산까지 갖췄지만 제품 코드에서 import 하는 곳이 없습니다. 지금 글자 폭은 Konva 의 텍스트 측정을 씁니다. 라이선스 목록의 harfbuzzjs 항목이 사용 중으로 읽히지 않게 주의하세요.",
            "A shaping provider with input budgets exists, but nothing in product code imports it; today widths come from Konva's text measurement. Be careful that the harfbuzzjs row in the license list does not read as being in use.",
          ),
        },
        {
          question: t("한국어 규칙도 있나요?", "Are Korean rules covered?"),
          answer: t(
            "일본어 조판 기준의 세로쓰기 표에 한국어 가로쓰기용 약물(ASCII 마침표·쉼표, 퍼센트, 단위 기호 등)을 보충했습니다. KLReq 전체와 대조한 결과는 이 카드에서 확인하지 못했습니다.",
            "The vertical-writing table, based on Japanese typesetting, is supplemented with symbols for Korean horizontal text (ASCII periods and commas, percent, unit signs and so on). A full comparison against KLReq was not done for this card.",
          ),
        },
        {
          question: t("세로쓰기에서 일부 글자가 어색하면요?", "What if some glyphs look off in vertical text?"),
          answer: t(
            "OpenType vert 기능을 켤 수 없어 90° 회전으로 만드는 결정적 근사입니다. 폰트별 전용 세로 글리프까지 같다는 뜻은 아니라고 코드 주석이 밝힙니다.",
            "Since OpenType vert cannot be enabled, it is a deterministic approximation by 90 degree rotation. A code comment states this does not mean font-specific vertical glyphs are matched.",
          ),
        },
      ],
      pitfall: t(
        "'금칙처리를 지원한다'고 크게 말하기 전에 상태를 구분하세요. 코어와 테스트는 있고 번역 QA 와 세로쓰기에 연결돼 있지만, 가로 말풍선 줄바꿈 함수에는 호출이 없습니다. 실제 웹툰 대사에서 금칙 위반이 얼마나 줄어드는지는 이 카드에서 확인하지 못했습니다.",
        "Before saying kinsoku is supported, separate the states: the core and tests exist and are wired into translation QA and vertical writing, but the horizontal bubble wrap function does not call it. How much it would cut violations in real webtoon dialogue was not verified for this card.",
      ),
    },
    technologies: ["Intl.Segmenter", "HarfBuzz", "Konva"],
    facts: [
      { value: "4", label: t("금칙을 피하려고 줄바꿈 지점을 앞으로 물릴 수 있는 최대 자소 수", "Maximum graphemes a break may be pulled back to avoid a kinsoku violation"), source: KINSOKU },
    ],
    reviewedAt: "2026-10-07",
  },
];
