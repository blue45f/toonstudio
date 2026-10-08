import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";
import { ENGINEERING_ATLAS_REALTIME_LOCK } from "./engineering-atlas-realtime-lock";

/**
 * 기술 도감 · realtime 카테고리 중 문서 협업 카드 묶음(Yjs·Socket.IO 입장권·Durable Objects·락 리비전).
 * 주 파일(engineering-atlas-realtime.ts)이 다른 묶음과 함께 배열에 합친다.
 * 모든 값은 2026-10-07 기준으로 코드·설정을 직접 열어 확인한 것이다.
 */
const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const LIVE = "apps/web/src/domains/creator/live";
const CREATOR_API = "apps/api/src/modules/creator";
const WORKER = "deploy/cloudflare-realtime";

export const ENGINEERING_ATLAS_REALTIME_COLLAB: readonly EngineeringAtlasEntry[] = [
  // ───────────────────────────── 1. Yjs 공유 문서 ─────────────────────────────
  {
    id: "yjs-crdt-document",
    category: "realtime",
    name: "Yjs",
    title: t("동시에 고쳐도 같은 그림으로 모이는 공유 문서", "A shared document that converges to the same drawing"),
    status: "experimental",
    tagline: t(
      "획·레이어·삭제를 의미 단위 연산으로 기록해 동시에 편집해도 같은 결과로 모입니다.",
      "Strokes, layers and deletions are recorded as meaningful operations, so concurrent edits converge to one result.",
    ),
    background: [
      t(
        "두 사람이 같은 그림을 동시에 고치면 누가 먼저 저장했느냐에 따라 한쪽 작업이 사라지기 쉽습니다. CRDT(충돌 없는 복제 데이터 타입)는 각자의 편집을 '무엇이 어디에 추가됐는가'라는 기록 조각으로 남기고, 어떤 순서로 합쳐도 같은 결과가 나오도록 규칙을 정해 둔 자료구조입니다. 공유 벽에 각자 포스트잇을 붙이는 것과 같아서, 붙이는 순서가 달라도 결국 같은 벽이 됩니다.",
        "When two people edit one drawing at once, whoever saves first can easily erase the other's work. A CRDT (conflict-free replicated data type) records each edit as a piece saying what was added where, with merge rules that give the same result in any order. It is like everyone sticking notes on a shared wall: the order differs, the wall ends up the same.",
      ),
      t(
        "ToonStudio는 Yjs 문서(Y.Doc) 하나에 획(strokes), 합성 순서(stroke-order), 페이지, 레이어 묶음, 삭제 기록을 나눠 담습니다. 획은 메타데이터와 좌표 배열로 이루어져 그리는 도중에도 샘플이 이어 붙고, 상대 화면에도 진행 중인 획이 보입니다. 삭제는 지우는 대신 고유 번호의 삭제 기록을 남기고, 복원은 자신이 본 삭제 기록만 확인(ack)합니다. 그래서 내가 복원하는 사이 다른 사람이 지운 획은 되살아나지 않습니다(delete-wins).",
        "ToonStudio keeps strokes, compositing order, pages, layer groups and deletion records in one Yjs document (Y.Doc). A stroke is metadata plus coordinate arrays, so samples keep being appended while drawing and peers see the stroke in progress. A deletion leaves a uniquely numbered deletion record instead of erasing, and a restore acknowledges only the deletions it has seen. So a stroke someone else deleted while I was restoring does not come back (delete-wins).",
      ),
      t(
        "대안은 서버가 모든 편집을 한 줄로 세우는 OT 방식이나, 한 사람이 쓰는 동안 나머지를 막는 잠금 방식입니다. CRDT는 오프라인 편집 뒤 재접속, 중복 도착, 순서 뒤바뀜에도 병합 규칙만으로 수렴한다는 장점이 있어 그림 편집에 맞다고 보았습니다. 수렴은 2~6명이 18~30번 무작위로 편집·삭제·복원하고 오프라인·중복·재정렬을 겪게 하는 속성 테스트를 고정 시드 5개로 재현해 확인합니다.",
        "Alternatives are OT, where a server lines up every edit, or locks that block others while one person writes. A CRDT converges by merge rules alone after offline edits, duplicate delivery and reordering, which suits drawing. Convergence is checked by a property test that has 2 to 6 peers make 18 to 30 random edits, deletions and restores through offline spells, duplicates and reordering, replayed from 5 fixed seeds.",
      ),
      t(
        "CRDT는 누가 쓰는지 모릅니다. 강등된 사용자의 변경도 수학적으로는 유효한 병합이므로 서버가 병합 전에 막아야 합니다. 서버는 편집 권한, 사용자·작품 단위 속도 한도를 확인하고, 후보 변경을 임시 문서에 적용해 스키마와 '삭제 기록은 되감을 수 없다' 같은 불변식을 검사합니다. 큰 비트맵은 CRDT에 넣지 않고 변경 로그와 체크포인트로 따로 다루며, 기록이 쌓이는 만큼 압축과 스키마 이전이 운영 과제로 남습니다.",
        "A CRDT does not know who is writing. A demoted user's change is still a valid merge mathematically, so the server must stop it before merging. The server checks edit rights and per-user, per-work rate limits, applies the candidate change to a scratch document and checks the schema and invariants such as deletion history cannot be rewound. Big bitmaps stay out of the CRDT in a change log with checkpoints, and compaction and schema migration remain operational work as records pile up.",
      ),
    ],
    keyPoints: [
      t("획·순서·삭제를 의미 단위 연산으로 기록해 수렴시킵니다", "Strokes, order and deletions are recorded as operations that converge"),
      t("삭제는 고유 기록, 복원은 본 삭제만 확인합니다(delete-wins)", "Each deletion is a record; a restore acknowledges only deletions it saw"),
      t("CRDT는 권한을 모릅니다: 서버가 권한·속도·불변식을 먼저 검사", "A CRDT ignores permissions: the server checks rights, rate and invariants first"),
      t("큰 비트맵은 CRDT 밖: 변경 로그와 체크포인트로 따로 보관", "Big bitmaps stay outside: a change log plus checkpoints"),
    ],
    diagram: {
      id: "yjs-crdt-document-diagram",
      kind: "graph",
      title: t("편집이 문서가 되고 방 전체로 퍼지는 길", "How an edit becomes a document and spreads to the room"),
      caption: t(
        "내 화면에는 즉시 반영되지만, 서버 문지기를 통과한 변경만 저장되고 다른 편집자에게 전달됩니다.",
        "It shows on my screen at once, but only changes that pass the server gatekeeper are stored and passed on to other editors.",
      ),
      alt: t(
        "내 편집은 내 Y.Doc에 즉시 반영되고 묶음 update로 서버에 보내집니다. 서버 문지기가 권한, 속도, 불변식을 검사해 통과하면 PostgreSQL에 저장하고 방의 다른 편집자 Y.Doc에 전달합니다. 저장된 update가 512개, 2MiB, 5분 중 하나라도 차면 스냅샷으로 압축합니다.",
        "My edit is applied to my Y.Doc at once and sent to the server as a batched update. The server gatekeeper checks rights, rate and invariants, stores the update in PostgreSQL if it passes and relays it to the other editors' Y.Docs. When stored updates reach 512, 2 MiB or 5 minutes, they are compacted into a snapshot.",
      ),
      nodes: [
        { id: "edit", label: t("내 편집", "My edit"), sub: t("그리기·지우기·이동", "Draw, erase, move"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "ydoc", label: t("내 Y.Doc", "My Y.Doc"), sub: t("획·레이어·삭제 기록", "Strokes, layers, deletions"), tone: "local", at: [1, 0] },
        { id: "gate", label: t("서버 문지기", "Server gatekeeper"), sub: t("권한·속도·불변식 검사", "Checks rights, rate, invariants"), tone: "server", at: [2, 0] },
        { id: "db", label: t("PostgreSQL", "PostgreSQL"), sub: t("update·스냅샷·영수증", "Updates, snapshots, receipts"), tone: "server", shape: "cylinder", at: [3, 0] },
        { id: "peer", label: t("다른 편집자의 Y.Doc", "Peers' Y.Doc"), sub: t("순서가 달라도 같은 결과로 수렴", "Converges even in another order"), tone: "local", at: [1, 1] },
        { id: "snap", label: t("스냅샷 압축", "Snapshot compaction"), sub: t("512개·2MiB·5분 중 하나", "512 updates, 2 MiB or 5 min"), tone: "server", at: [3, 1] },
      ],
      edges: [
        { from: "edit", to: "ydoc", label: t("즉시 반영", "At once") },
        { from: "ydoc", to: "gate", label: t("묶어 전송", "Batched") },
        { from: "gate", to: "db", label: t("통과 시 저장", "If valid") },
        { from: "gate", to: "peer", style: "dashed", label: t("방 전체에 전달", "To the room") },
        { from: "db", to: "snap", label: t("조건 충족", "When due") },
      ],
      groups: [
        { id: "browser", label: t("내 브라우저", "My browser"), tone: "local", nodeIds: ["edit", "ydoc"] },
        { id: "server", label: t("서버", "Server"), tone: "server", nodeIds: ["gate", "db", "snap"] },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · 동시 그리기", "Shared workroom · drawing together"),
        role: t(
          "획을 Y.Map 레코드와 좌표 배열로 쌓고, 약 40ms(30~50ms) 단위의 배치로 묶어 보냅니다. 합성 순서는 하나의 Y.Array로 모두에게 같게 정합니다.",
          "Builds strokes from Y.Map records and coordinate arrays and sends them in batches of about 40 ms (30 to 50 ms). Compositing order is one Y.Array, identical for everyone.",
        ),
        paths: [`${LIVE}/studio-crdt-document.ts`, `${LIVE}/studio-crdt-document-strokes.ts#appendStrokeSamples`],
        route: "/studio",
      },
      {
        feature: t("공동 작업실 · 지우기와 복원", "Shared workroom · erase and restore"),
        role: t(
          "삭제마다 고유 기록(studio-deletion-ops)을 남기고, 복원은 자신이 본 기록만 studio-deletion-acks에 확인합니다.",
          "Each deletion leaves a unique record (studio-deletion-ops) and a restore acknowledges only the records it has seen in studio-deletion-acks.",
        ),
        paths: [`${LIVE}/studio-crdt-document-tracking.ts#restoreDeletedRecord`, `${LIVE}/studio-crdt-document-constants.ts`],
      },
      {
        feature: t("작업실 서버 · 변경 검사와 저장", "Workroom server · checking and storing changes"),
        role: t(
          "편집 권한과 속도 한도를 통과한 update만 임시 문서에서 불변식을 검사한 뒤, 같은 updateId는 한 번만 PostgreSQL에 기록하고 방에 전달합니다.",
          "Only updates that pass edit rights and rate limits are checked for invariants on a scratch document, stored in PostgreSQL once per updateId, and relayed to the room.",
        ),
        paths: [
          `${CREATOR_API}/studio-crdt.service.ts#applyUpdateBytes`,
          `${CREATOR_API}/studio-live-gateway-handlers-crdt.ts`,
          `${CREATOR_API}/creator-collaboration.policy.ts`,
        ],
      },
      {
        feature: t("품질 · 수렴 속성 테스트", "Quality · convergence property test"),
        role: t(
          "오프라인·중복·재정렬을 섞은 무작위 시나리오를 5개 고정 시드로 재현해 모든 복사본이 같은 문서가 되는지 확인합니다.",
          "Replays random scenarios mixing offline spells, duplicates and reordering from 5 fixed seeds and checks that every copy ends up the same document.",
        ),
        paths: [`${LIVE}/studio-crdt-convergence.property.test.ts`, `${LIVE}/studio-crdt-convergence-property-helper.ts`],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("오프라인 편집 두 개가 하나로 모이는 모습", "Two offline edits merging into one"),
        language: "ts",
        code: `import * as Y from "yjs";

const a = new Y.Doc();
const b = new Y.Doc();
a.getMap<string>("layers").set("L1", "배경"); // 오프라인 A 의 편집
b.getMap<string>("layers").set("L2", "인물"); // 오프라인 B 의 편집

// 상태 벡터 = '나는 여기까지 봤다'. 상대가 모르는 것만 골라 교환한다.
Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));

const keys = (doc: Y.Doc): string => [...doc.getMap<string>("layers").keys()].sort().join();
console.log(keys(a), keys(b), keys(a) === keys(b)); // "L1,L2" "L1,L2" true`,
        codeEn: `import * as Y from "yjs";

const a = new Y.Doc();
const b = new Y.Doc();
a.getMap<string>("layers").set("L1", "background"); // A's offline edit
b.getMap<string>("layers").set("L2", "character"); // B's offline edit

// State vector = "I have seen up to here". Exchange only what the other side lacks.
Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));

const keys = (doc: Y.Doc): string => [...doc.getMap<string>("layers").keys()].sort().join();
console.log(keys(a), keys(b), keys(a) === keys(b)); // "L1,L2" "L1,L2" true`,
        explain: t(
          "각자 오프라인에서 레이어를 추가한 뒤, 상태 벡터로 서로 모르는 부분만 주고받으면 두 문서가 같아집니다. 서비스는 이 교환을 서버가 40KiB 조각으로 나눠 보내고, 받는 쪽이 이어 붙여 한 번에 적용하는 방식으로 합니다.",
          "After adding layers offline, exchanging only what each side lacks via state vectors makes the two documents equal. The service does this exchange through the server in 40 KiB chunks that the receiver reassembles and applies in one go.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("삭제 기록과 복원 확인", "Deletion records and restore acknowledgements"),
        language: "ts",
        code: `import * as Y from "yjs";

// 복원은 '내가 본 삭제'만 확인한다. 아직 못 본 삭제는 계속 살아 있어 대상은 삭제 상태로 남는다.
export class DeletionLedger {
  constructor(
    private readonly ops: Y.Map<string>, // 삭제 번호 -> 대상
    private readonly acks: Y.Map<string>, // 확인된 삭제 번호 -> 대상
  ) {}

  delete(target: string): void {
    this.ops.set(crypto.randomUUID(), target); // 삭제마다 고유 번호
  }

  isDeleted(target: string): boolean {
    for (const [id, deleted] of this.ops) if (deleted === target && !this.acks.has(id)) return true;
    return false;
  }

  restore(target: string): void {
    for (const [id, deleted] of this.ops) if (deleted === target) this.acks.set(id, target);
  }
}`,
        codeEn: `import * as Y from "yjs";

// A restore acknowledges only deletions it has seen; unseen deletions stay alive, so the target stays deleted.
export class DeletionLedger {
  constructor(
    private readonly ops: Y.Map<string>, // deletion id -> target
    private readonly acks: Y.Map<string>, // acknowledged deletion id -> target
  ) {}

  delete(target: string): void {
    this.ops.set(crypto.randomUUID(), target); // a unique id per deletion
  }

  isDeleted(target: string): boolean {
    for (const [id, deleted] of this.ops) if (deleted === target && !this.acks.has(id)) return true;
    return false;
  }

  restore(target: string): void {
    for (const [id, deleted] of this.ops) if (deleted === target) this.acks.set(id, target);
  }
}`,
        explain: t(
          "삭제 기록(ops)과 확인(acks)을 따로 두면, 복원하는 사람이 아직 못 본 다른 사람의 삭제는 확인되지 않아 대상이 삭제된 채로 남습니다. 실제 코드는 여기에 항목 수 상한(10만 개)과 손상 검사를 더합니다.",
          "Keeping deletion records (ops) apart from acknowledgements (acks) means a deletion by someone else that the restoring user has not yet seen stays unacknowledged, so the target remains deleted. The real code adds an entry cap (100,000) and corruption checks.",
        ),
        source: `${LIVE}/studio-crdt-document-tracking.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Yjs · Documentation", url: "https://docs.yjs.dev/", kind: "docs" },
      { title: "Yjs · Document updates", url: "https://docs.yjs.dev/api/document-updates", kind: "docs", note: t("상태 벡터와 update 교환", "State vectors and exchanging updates") },
      { title: "Yjs · GitHub", url: "https://github.com/yjs/yjs", kind: "repo" },
      { title: "crdt.tech", url: "https://crdt.tech/", kind: "guide", note: t("CRDT 개념과 자료 모음", "CRDT concepts and resources") },
      { title: "Shapiro et al. · Conflict-free Replicated Data Types", url: "https://inria.hal.science/inria-00609399", kind: "article" },
      { title: "OWASP · Broken Access Control", url: "https://top10.owasp.org/A01_2021-Broken_Access_Control/", kind: "guide", note: t("CRDT가 해결하지 못하는 권한 문제", "The permission problem a CRDT does not solve") },
    ],
    chapterIds: ["collaborative-crdt-boundary"],
    talk: {
      pitch: t(
        "여럿이 동시에 같은 장면을 그려도 결과가 하나로 모이도록 Yjs라는 CRDT 라이브러리를 씁니다. 획과 레이어, 삭제 기록을 의미 단위로 담아서 오프라인 뒤 재접속해도 합쳐집니다. 다만 CRDT는 누가 써도 되는지를 모릅니다. 그래서 서버가 편집 권한과 속도 한도, 변경 내용의 불변식을 먼저 검사한 뒤에야 저장하고 전달합니다. 아직 실험 단계이고 큰 비트맵은 별도 경로입니다.",
        "We use Yjs, a CRDT library, so that several people drawing the same scene end up with one result. Strokes, layers and deletion records are stored as meaningful units, so work merges even after an offline spell. But a CRDT does not know who may write, so the server checks edit rights, rate limits and the change's invariants before storing and relaying anything. It is still experimental, and big bitmaps take a separate path.",
      ),
      analogy: t(
        "공유 벽에 각자 포스트잇을 붙이는 것과 같습니다. 붙이는 순서가 달라도 결국 같은 벽이 되고, 지운 포스트잇에는 지운 사람의 번호표가 남아 나중에 되살릴 때 그 번호만 확인합니다. 벽에 붙일 자격은 경비실(서버)이 따로 확인합니다.",
        "It is like everyone sticking notes on a shared wall. The order differs but the wall ends up the same, a removed note keeps the remover's ticket number so a later restore checks only that number, and a security desk (the server) separately checks who may stick notes at all.",
      ),
      questions: [
        {
          question: t("충돌이 전혀 안 나나요?", "Do conflicts never happen?"),
          answer: t(
            "병합 때문에 작업이 사라지는 일은 규칙으로 막지만, 같은 값을 동시에 바꾸면 규칙에 따라 한쪽 값이 선택됩니다. 그래서 같은 레이어를 동시에 만지지 않도록 짧은 편집 잠금을 함께 씁니다(락 카드 참조).",
            "Rules prevent merges from losing work, but when the same value is changed at once, a rule picks one side. That is why short edit locks are used alongside it so two people do not touch one layer at once (see the lock card).",
          ),
        },
        {
          question: t("래스터 이미지는 왜 CRDT에 안 넣나요?", "Why are raster images not in the CRDT?"),
          answer: t(
            "큰 비트맵을 그대로 넣으면 방 메모리, 동기화 지연, 압축 비용이 커집니다. 의미 단위 연산만 CRDT에 두고 래스터는 변경 로그와 체크포인트로 따로 보관합니다(챕터 28).",
            "Putting big bitmaps in directly would inflate room memory, sync latency and compaction cost. Only meaningful operations live in the CRDT; raster work is kept separately as a change log with checkpoints (chapter 28).",
          ),
        },
        {
          question: t("서버가 병합 결과를 그대로 믿나요?", "Does the server trust the merge result?"),
          answer: t(
            "믿지 않습니다. 후보 변경을 임시 문서에 적용해 스키마와 삭제 기록 보존 같은 불변식을 검사하고, 어긋나면 영구 거절합니다.",
            "No. It applies the candidate change to a scratch document, checks the schema and invariants such as keeping deletion history, and rejects permanently if anything is off.",
          ),
        },
      ],
      pitfall: t(
        "'CRDT라서 충돌이 없다'고만 말하지 마세요. 병합은 수렴하지만 권한·저장·큰 파일은 해결하지 않고 서버가 따로 막습니다. 획당 샘플 10만 개 같은 상수는 설계 한도이지 성능 측정값이 아닙니다. 속성 테스트는 고정 시드 5개로 재현하는 검증이며 부하 시험이 아닙니다. 실험으로 표시한 이유: 설계 문서(docs/studio-crdt-webgpu-architecture-2026-07-16.md)는 벡터 슬라이스는 출하, 래스터는 옵트인 파일럿이라고 적고 공동 작업실도 이 문서를 실제로 만들어 쓰지만, 운영에서 켜져 있는지와 실기기·부하 검증은 저장소로 확인하지 못했고 챕터 28도 '실험'으로 표시합니다.",
        "Do not say only 'CRDTs have no conflicts'. Merging converges, but permissions, storage and large files are not solved and the server blocks them separately. Constants such as 100,000 samples per stroke are design limits, not performance measurements. The property test replays 5 fixed seeds; it is not a load test. Why it is marked experimental: the design document (docs/studio-crdt-webgpu-architecture-2026-07-16.md) calls the vector slice shipped and the raster path an opt-in pilot, and the shared workroom does create and use this document, but whether it is switched on in production and any real-device or load verification could not be confirmed from the repository, and chapter 28 is marked experimental too.",
      ),
    },
    technologies: ["Yjs", "CRDT", "state vector", "Socket.IO", "PostgreSQL"],
    facts: [
      { value: "100,000", label: t("획 하나의 샘플 수 상한", "Sample cap per stroke"), source: `${LIVE}/studio-crdt-document-constants.ts` },
      { value: "16 KiB", label: t("문서 안 메타데이터 상한", "Inline metadata cap"), source: `${LIVE}/studio-crdt-document-constants.ts` },
      { value: "48 KiB", label: t("update 하나의 크기 상한", "Size cap of one update"), source: `${LIVE}/studio-crdt-protocol.ts` },
      { value: "8", label: t("CRDT 프로토콜 버전(구버전 피어 배제)", "CRDT protocol version (older peers excluded)"), source: `${LIVE}/studio-crdt-protocol.ts` },
    ],
    reviewedAt: "2026-10-07",
  },

  // ───────────────────────────── 2. Socket.IO 입장권 ─────────────────────────────
  {
    id: "socket-io-room-tickets",
    category: "realtime",
    name: "Socket.IO",
    title: t("입장권(티켓)으로만 들어가는 Socket.IO 작업실", "A Socket.IO workroom entered only with a ticket"),
    status: "live",
    tagline: t(
      "로그인 쿠키는 소켓에 주지 않고, 60초짜리 입장권으로 바꿔 작업실에 들어갑니다.",
      "The login cookie never reaches the socket; a 60-second admission ticket opens the workroom.",
    ),
    background: [
      t(
        "공동 작업실은 오래 열려 있는 통화 같은 연결(WebSocket)입니다. 놀이공원에 비유하면 연간 회원증(로그인 쿠키)을 입구 직원에게 맡겨 두지 않고, 들어갈 때마다 60초만 유효한 일회용 입장권으로 바꿔서 냅니다. 입장권을 잃어버려도 1분 뒤에는 쓸 수 없고, 입장한 뒤에도 서버가 사람과 작품 권한을 계속 다시 확인합니다.",
        "A shared workroom is a long-lived connection (a WebSocket), like a phone call left open. Think of a theme park: instead of leaving the annual pass (the login cookie) with the gate staff, you swap it for a one-use ticket valid for 60 seconds each time you enter. A lost ticket is useless after a minute, and even after entry the server keeps rechecking the person and the work's permissions.",
      ),
      t(
        "순서는 이렇습니다. ① 브라우저가 로그인 쿠키로 API에 입장권을 요청합니다(쿠키 세션만 허용). ② 서버가 작품 입장 전용 JWT(유효 60초, 원래 세션 만료를 넘지 않음)를 서명해 줍니다. ③ 브라우저가 이 값을 Socket.IO 연결의 auth로 건네면 서버가 검증하고 곧바로 핸드셰이크에서 지웁니다. ④ 'studio:join'에서 작품 멤버 권한을 확인해 방에 넣습니다. ⑤ 이후 15초마다 모든 참가자의 권한을 다시 확인합니다.",
        "The order: 1) the browser asks the API for a ticket with its login cookie (cookie sessions only); 2) the server signs an admission-only JWT, valid 60 seconds and never beyond the original session's expiry; 3) the browser passes it as the Socket.IO connection's auth, and the server verifies it and deletes it from the handshake right away; 4) on 'studio:join' the server checks the work's member permissions and puts the user in the room; 5) from then on it rechecks every participant's permissions every 15 seconds.",
      ),
      t(
        "쿠키 세션 토큰(유효 30일)을 소켓에 그대로 실으면 오래 열린 연결 쪽 코드와 로그가 장기 토큰을 만지게 됩니다. 그래서 짧은 입장 전용 토큰으로 바꿔 쓰고, 재접속 때 입장권이 만료돼 거절되면 새 입장권을 받아 한 번 더 연결합니다. 브라우저의 WebSocket은 임의 헤더를 붙일 수 없어 Socket.IO의 auth 필드로 건네고, 업그레이드 요청의 Origin도 허용 목록으로 확인합니다. 한 계정은 연결 8개, 작업실은 참가자 30명까지입니다.",
        "Putting the 30-day cookie session token on the socket would let long-lived connection code and logs touch a long-term secret. So a short admission-only token is used instead, and when a reconnect is refused because the ticket expired, a fresh ticket is fetched for one more attempt. Browser WebSockets cannot add arbitrary headers, so the ticket goes in Socket.IO's auth field, and the upgrade request's Origin is also checked against an allow list. One account may hold 8 connections and a workroom 30 participants.",
      ),
      t(
        "Socket.IO가 하는 일과 하지 않는 일을 구분해야 합니다. 문서 동기화·잠금·작업실 채팅·입장 승인은 이 경로가 권위이고, 접속 상태와 화면 공유 신호는 가능하면 Cloudflare Durable Objects가 맡습니다. 허들(P2P 대화)의 통화용 SDP/ICE와 채팅은 Socket.IO가 아니라 브라우저 직통 통로로 갑니다. 운영 무료 플랜은 서버 한 대(메모리 어댑터)이고, 여러 대로 늘릴 때는 PostgreSQL 어댑터(STUDIO_LIVE_CLUSTER_ADAPTER=postgres)를 쓰도록 별도 서비스가 준비돼 있습니다.",
        "Be clear about what Socket.IO does and does not do. It is the authority for document sync, locks, workroom chat and admission, while presence and screen-share signals go through Cloudflare Durable Objects when possible. The call SDP/ICE and chat of the huddle (the P2P conversation) do not travel over Socket.IO but over the direct browser channel. The free production plan runs one server (memory adapter); to scale out, a separate service is prepared to use the PostgreSQL adapter (STUDIO_LIVE_CLUSTER_ADAPTER=postgres).",
      ),
    ],
    keyPoints: [
      t("쿠키 세션 대신 60초 입장 전용 티켓으로 소켓에 입장합니다", "A 60-second admission-only ticket replaces the cookie session on the socket"),
      t("서버는 티켓을 확인한 즉시 핸드셰이크에서 지웁니다", "The server deletes the ticket from the handshake right after verifying it"),
      t("작품 멤버 권한을 확인해 입장시키고 15초마다 다시 확인합니다", "Membership is checked on join and every 15 seconds afterwards"),
      t("한 계정 연결 8개, 작업실 참가자 30명이 상한입니다", "Limits: 8 connections per account, 30 participants per room"),
    ],
    diagram: {
      id: "socket-io-room-tickets-diagram",
      kind: "sequence",
      title: t("입장권을 받아 작업실에 들어가기까지", "From getting a ticket to entering the workroom"),
      caption: t(
        "쿠키는 티켓 발급에만 쓰이고, 소켓에는 60초짜리 입장 전용 티켓이 올라갑니다.",
        "The cookie is used only to get a ticket; the socket carries a 60-second admission-only ticket.",
      ),
      alt: t(
        "브라우저가 쿠키 세션으로 티켓 API에 입장권을 요청하면 서버가 60초짜리 입장 전용 JWT를 서명해 돌려줍니다. 브라우저가 이를 담아 Socket.IO에 연결하면 서버가 검증한 뒤 토큰을 지우고, 작품 참가 요청에서 멤버 권한을 확인해 방에 넣습니다. 이후 문서 변경과 잠금은 편집 권한이 있어야 하고, 서버는 15초마다 전원의 권한을 다시 확인합니다.",
        "The browser asks the ticket API for a ticket with its cookie session and the server signs a 60-second admission-only JWT. The browser connects to Socket.IO carrying it, the server verifies and deletes the token, and on the join request checks member rights before placing the user in the room. Document changes and locks then require edit rights, and the server rechecks everyone's rights every 15 seconds.",
      ),
      actors: [
        { id: "browser", label: t("브라우저", "Browser"), sub: t("쿠키 세션 보유", "Holds the cookie session"), tone: "local" },
        { id: "api", label: t("티켓 API", "Ticket API"), sub: t("입장권 발급", "Issues tickets"), tone: "server" },
        { id: "gateway", label: t("Socket.IO 서버", "Socket.IO server"), sub: t("/studio-live", "/studio-live"), tone: "server" },
        { id: "acl", label: t("작품 권한", "Work access"), sub: t("멤버·역할 DB", "Members and roles"), tone: "server" },
      ],
      messages: [
        { from: "browser", to: "api", label: t("쿠키로 입장권 요청", "Ask for a ticket"), note: t("쿠키 세션만 허용", "Cookie sessions only") },
        { from: "api", to: "api", label: t("입장 전용 JWT 서명", "Sign an admission JWT"), note: t("유효 60초 · 세션 만료 이내", "60 s, within session expiry") },
        { from: "api", to: "browser", label: t("입장권 전달", "Return the ticket"), style: "dashed" },
        { from: "browser", to: "gateway", label: t("wss 연결 + auth 에 입장권", "Connect over wss with the ticket in auth"), note: t("허용 Origin만 업그레이드", "Only allowed origins upgrade") },
        { from: "gateway", to: "gateway", label: t("검증 후 토큰 지움", "Verify, then delete it"), note: t("서명·audience·만료", "Signature, audience, expiry") },
        { from: "browser", to: "gateway", label: t("studio:join (작품 id)", "studio:join (work id)") },
        { from: "gateway", to: "acl", label: t("멤버 상태·보기 권한 확인", "Check member and view rights") },
        { from: "acl", to: "gateway", label: t("역할별 권한 표", "Rights by role"), style: "dashed" },
        { from: "gateway", to: "browser", label: t("참가 확정 (정원 30명)", "Joined (cap of 30)"), style: "dashed" },
        { from: "browser", to: "gateway", label: t("문서 update · 잠금 · 채팅", "Document updates, locks, chat"), note: t("편집은 edit 권한 필요", "Edits need edit rights") },
        { from: "gateway", to: "gateway", label: t("15초마다 전원 재검사", "Recheck everyone every 15 s"), note: t("회수되면 연결 정리", "Revoked users are dropped") },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · 입장", "Shared workroom · entering"),
        role: t(
          "로그인 쿠키를 60초짜리 입장권으로 바꿔 소켓에 건넵니다. 자동 재연결은 최대 8번이고, 입장권이 만료돼 인증 오류가 나면 새 입장권을 받아 한 번 다시 연결합니다.",
          "Swaps the login cookie for a 60-second ticket and hands it to the socket. Automatic reconnection is limited to 8 attempts, and if the ticket expired and an authentication error comes back, a fresh ticket is fetched for one more connection attempt.",
        ),
        paths: [`${LIVE}/studio-live-auth-ticket-client.ts`, `${LIVE}/use-studio-live-transport-auth.ts`, `${LIVE}/studio-live-socket-connection-factory.ts`],
        route: "/studio",
      },
      {
        feature: t("작업실 서버 · 입장권 발급과 검증", "Workroom server · issuing and verifying tickets"),
        role: t(
          "쿠키 세션에서만 입장권을 서명하고, 소켓 핸드셰이크에서 검증한 뒤 토큰을 지웁니다. 일반 로그인 토큰은 입장권으로 쓸 수 없고 그 반대도 마찬가지입니다.",
          "Signs tickets only from cookie sessions and, at the socket handshake, verifies then deletes the token. A normal login token cannot serve as a ticket, nor the other way around.",
        ),
        paths: [`${CREATOR_API}/studio-live-auth-ticket.controller.ts`, "apps/api/src/server/session.ts#signStudioLiveAdmissionTicket", `${CREATOR_API}/studio-live-socket-auth.service.ts`],
      },
      {
        feature: t("작업실 서버 · 방 참가와 신호 릴레이", "Workroom server · joining rooms and relaying signals"),
        role: t(
          "작품 멤버 권한을 확인해 방에 넣고 정원(30명)을 지키며, 대상이 정해진 신호는 보낸 쪽 권한을 확인한 뒤 그 연결에만 전달합니다.",
          "Checks work membership before placing a user in a room, enforces the 30-person cap, and relays targeted signals to that one connection after checking the sender's rights.",
        ),
        paths: [`${CREATOR_API}/studio-live-gateway-join.ts#performJoin`, `${CREATOR_API}/studio-live-gateway-relay.ts`, `${CREATOR_API}/studio-live.gateway.ts`],
      },
      {
        feature: t("운영 배치", "Production layout"),
        role: t(
          "정적 사이트와 같은 주소로 들어온 /socket.io 요청을 Cloudflare Worker가 API 원본(REALTIME_API_ORIGIN, 없으면 CORE_API_ORIGIN 설정)으로 전달합니다. 운영 API는 무료 플랜 한 대(메모리 어댑터)이고, PostgreSQL 어댑터를 쓰는 toonspectrum-studio-live 서비스는 선택형 폴백으로 선언돼 있습니다.",
          "A Cloudflare Worker forwards /socket.io requests arriving at the same address as the static site to the API origin (set by REALTIME_API_ORIGIN, or CORE_API_ORIGIN when absent). The production API is one free-plan instance (memory adapter), and the toonspectrum-studio-live service, which uses the PostgreSQL adapter, is declared as an optional fallback.",
        ),
        paths: ["deploy/cloudflare-static/src/index.ts", "render.yaml", "apps/api/src/realtime/studio-postgres-io.adapter.ts"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("입장 전용 단기 티켓 서명하기", "Signing a short admission-only ticket"),
        language: "ts",
        code: `const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

// 소켓 입장 전용 티켓: 사용자·용도(aud)·만료를 서명해 담는다. 서버에서만 실행한다.
export async function signAdmissionTicket(userId: string, sessionExpiresAt: number, signingKey: string, now = Date.now()) {
  const exp = Math.min(sessionExpiresAt, now + 60_000); // 60초, 그리고 원래 세션 만료를 넘지 않는다
  const header = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const claims = { sub: userId, aud: "toonstudio-studio-live", exp: Math.floor(exp / 1000), jti: crypto.randomUUID() };
  const body = base64url(encoder.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(header + "." + body)));
  return header + "." + body + "." + base64url(signature);
}`,
        codeEn: `const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

// A ticket only for socket admission: signs user, purpose (aud) and expiry. Run on the server only.
export async function signAdmissionTicket(userId: string, sessionExpiresAt: number, signingKey: string, now = Date.now()) {
  const exp = Math.min(sessionExpiresAt, now + 60_000); // 60 seconds, never beyond the original session expiry
  const header = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const claims = { sub: userId, aud: "toonstudio-studio-live", exp: Math.floor(exp / 1000), jti: crypto.randomUUID() };
  const body = base64url(encoder.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(header + "." + body)));
  return header + "." + body + "." + base64url(signature);
}`,
        explain: t(
          "만료를 '60초 뒤'와 '원래 세션 만료' 중 이른 쪽으로 잡고, 용도(aud)를 따로 정해 다른 토큰과 섞어 쓰지 못하게 합니다. 실제 서버 코드는 Node의 HMAC으로 같은 일을 하며 발급 시각, 세션 버전, 원래 세션 만료(sexp)도 서명에 담습니다.",
          "Expiry is the earlier of 60 seconds from now and the original session expiry, and a separate purpose (aud) keeps it from being mixed with other tokens. The real server code does the same with Node's HMAC and also signs the issue time, session version and the original session expiry (sexp).",
        ),
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("입장권을 실어 Socket.IO에 연결하기", "Connecting to Socket.IO with the ticket"),
        language: "ts",
        code: `import { io } from "socket.io-client";

type ConnectError = Error & { data?: { code?: string } };

export async function connectWorkroom(endpoint: string, workId: string, requestTicket: () => Promise<string>) {
  const socket = io(endpoint, {
    path: "/socket.io",
    transports: ["websocket"], // 폴링 없이 WebSocket 만 쓴다
    autoConnect: false,
    reconnectionAttempts: 8, // 무료 서버가 깨어나는 시간을 감안한 재시도
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.25,
    auth: { sessionToken: await requestTicket() }, // 입장권은 60초만 유효하다
  });
  let refreshed = false;
  socket.on("connect", () => {
    refreshed = false;
    socket.emit("studio:join", { workId });
  });
  socket.on("connect_error", async (error) => {
    if ((error as ConnectError).data?.code !== "unauthenticated" || refreshed) return; // 인증 오류에서 한 번만
    refreshed = true;
    socket.auth = { sessionToken: await requestTicket() }; // 만료된 입장권을 새것으로 바꾼다
    socket.connect(); // 서버가 거절한 연결은 자동 재연결되지 않으므로 직접 부른다
  });
  socket.connect();
  return socket;
}`,
        codeEn: `import { io } from "socket.io-client";

type ConnectError = Error & { data?: { code?: string } };

export async function connectWorkroom(endpoint: string, workId: string, requestTicket: () => Promise<string>) {
  const socket = io(endpoint, {
    path: "/socket.io",
    transports: ["websocket"], // WebSocket only, no polling
    autoConnect: false,
    reconnectionAttempts: 8, // retries that allow for a free server to wake up
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.25,
    auth: { sessionToken: await requestTicket() }, // the ticket is valid for only 60 seconds
  });
  let refreshed = false;
  socket.on("connect", () => {
    refreshed = false;
    socket.emit("studio:join", { workId });
  });
  socket.on("connect_error", async (error) => {
    if ((error as ConnectError).data?.code !== "unauthenticated" || refreshed) return; // once, on auth errors
    refreshed = true;
    socket.auth = { sessionToken: await requestTicket() }; // swap the expired ticket for a fresh one
    socket.connect(); // a connection the server refused is not retried automatically, so call it
  });
  socket.connect();
  return socket;
}`,
        explain: t(
          "websocket 전송만 쓰고, 서버가 인증 오류(unauthenticated)로 거절했을 때만 새 입장권으로 바꿔 한 번 다시 연결합니다. 서버가 거절한 연결은 Socket.IO가 자동 재연결하지 않으므로 connect()를 직접 부릅니다. 실제 클라이언트도 같은 재시도 정책(8회, 1~8초)과 '인증 오류에서 자격을 한 번만 갱신' 규칙을 씁니다.",
          "It uses only the websocket transport and, only when the server refuses with an authentication error (unauthenticated), swaps in a fresh ticket and reconnects once. Socket.IO does not reconnect automatically after a server refusal, so connect() is called directly. The real client uses the same retry policy (8 attempts, 1 to 8 seconds) and the same rule of refreshing credentials once on an authentication error.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Socket.IO · The Socket instance (client)", url: "https://socket.io/docs/v4/client-socket-instance/", kind: "docs", note: t("connect_error와 자동 재연결 여부", "connect_error and when it reconnects automatically") },
      { title: "Socket.IO · Middlewares", url: "https://socket.io/docs/v4/middlewares/", kind: "docs", note: t("연결 때 인증하는 방법", "Authenticating at connection time") },
      { title: "Socket.IO · Client options", url: "https://socket.io/docs/v4/client-options/", kind: "docs", note: t("auth·transports·재연결 옵션", "auth, transports and reconnection options") },
      { title: "Socket.IO · PostgreSQL adapter", url: "https://socket.io/docs/v4/postgres-adapter/", kind: "docs", note: t("서버를 여러 대로 늘릴 때의 방 전파", "Room fan-out when scaling to several servers") },
      { title: "IETF RFC 6455 · The WebSocket Protocol", url: "https://www.rfc-editor.org/rfc/rfc6455", kind: "spec" },
      { title: "OWASP · WebSocket Security Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html", kind: "guide", note: t("Origin 검사와 인증 위치", "Origin checks and where to authenticate") },
    ],
    chapterIds: ["collaborative-crdt-boundary", "authentication"],
    talk: {
      pitch: t(
        "공동 작업실은 오래 열려 있는 실시간 연결이라, 로그인 쿠키를 그대로 쓰지 않고 60초짜리 입장권으로 바꿔서 들어갑니다. 서버는 입장권을 확인한 뒤 곧바로 지우고, 작품 멤버 권한을 확인해 방에 넣고, 이후 15초마다 권한을 다시 확인합니다. 편집 권한이 없으면 문서 변경은 거절됩니다. Socket.IO는 문서·잠금·작업실 채팅의 권위 경로이고, 허들 통화용 신호는 브라우저 직통 통로로 갑니다.",
        "A shared workroom is a long-lived realtime connection, so instead of using the login cookie directly we swap it for a 60-second ticket. The server verifies the ticket and deletes it at once, checks the work's membership before admitting the user, and rechecks permissions every 15 seconds. Without edit rights, document changes are refused. Socket.IO is the authoritative path for documents, locks and workroom chat, while huddle call signals go over the direct browser channel.",
      ),
      analogy: t(
        "놀이공원 입구에 연간 회원증을 맡겨 두는 대신, 들어갈 때마다 1분짜리 입장권으로 바꿔 입장하고, 안에서도 직원이 15초마다 팔찌를 확인하는 것과 같습니다.",
        "Instead of leaving the annual pass at the park gate, you swap it for a one-minute ticket each time you enter, and inside, staff check your wristband every 15 seconds.",
      ),
      questions: [
        {
          question: t("입장권을 도둑맞으면요?", "What if the ticket is stolen?"),
          answer: t(
            "유효 시간이 60초이고 원래 세션 만료를 넘지 않으며, 서버가 검증 직후 핸드셰이크에서 지웁니다. 용도(audience)가 달라 입장권으로 일반 API에 로그인할 수 없고, 일반 로그인 토큰도 입장권으로는 거부됩니다.",
            "It lasts 60 seconds, never outlives the original session, and the server deletes it from the handshake right after verifying. Its audience differs, so it cannot log in to the normal API, and a normal login token is rejected as a ticket.",
          ),
        },
        {
          question: t("쿠키를 그냥 쓰면 안 되나요?", "Why not just use the cookie?"),
          answer: t(
            "소켓은 오래 열려 있어서, 30일짜리 쿠키 세션 토큰이 연결 계층 코드와 로그에 닿는 일을 줄이려고 한 번 더 짧은 토큰으로 바꿉니다.",
            "The socket stays open for a long time, so we swap in a short token to keep the 30-day cookie session token away from connection-layer code and logs.",
          ),
        },
        {
          question: t("방은 몇 명까지 되나요?", "How many people fit in a room?"),
          answer: t(
            "작품 하나의 문서 방은 30명, 한 계정은 연결 8개까지입니다. Cloudflare 접속 상태 방의 64연결과는 다른 층의 숫자입니다.",
            "A work's document room holds 30 people and one account may open 8 connections. The 64 connections of a Cloudflare presence room is a number from a different layer.",
          ),
        },
      ],
      pitfall: t(
        "'Socket.IO가 WebRTC 시그널링을 한다'는 요약은 부정확합니다(챕터 30). 서버에는 옛 음성 작업실용 신호 중계(studio:voice:*)가 있지만 운영 설정(STUDIO_LIVE_VOICE_ENABLED=false)에서 꺼져 있고 허들 통화는 이 경로를 쓰지 않습니다. 서버를 지나는 WebRTC 신호는 데이터 통로 시작 신호와 화면 공유 신호입니다. Origin이 없는 비브라우저 요청은 Origin 검사를 통과하므로 보호는 입장권 검증이 맡습니다. 운영은 무료 플랜 서버 한 대이고 동시 접속 수를 부하 시험으로 보증한 적이 없다는 점도 함께 말하세요.",
        "The summary 'Socket.IO does the WebRTC signaling' is inaccurate (chapter 30): the server does contain signal relaying for the older voice workroom (studio:voice:*), but it is switched off in the production settings (STUDIO_LIVE_VOICE_ENABLED=false) and huddle calls do not use that path. The WebRTC signals that do pass the server are the data-channel start signal and screen-share signals. Requests without an Origin, such as non-browser clients, pass the Origin check, so ticket verification does the protecting. Also say that production is one free-plan server and that concurrent connections have never been load-tested.",
      ),
    },
    technologies: ["Socket.IO", "WebSocket", "JWT", "HMAC", "PostgreSQL", "Render"],
    facts: [
      { value: "60 s", label: t("입장권 유효 시간", "Ticket lifetime"), source: "packages/contracts/src/studio-live-auth-ticket.ts" },
      { value: "15 s", label: t("참가자 권한 재검사 주기", "Permission recheck interval"), source: `${CREATOR_API}/studio-live-gateway-constants.ts` },
      { value: "30", label: t("작업실 참가자 상한", "Participant cap per room"), source: `${CREATOR_API}/studio-live-gateway-constants.ts` },
      { value: "8", label: t("한 계정의 동시 연결 상한", "Concurrent connections per account"), source: `${CREATOR_API}/studio-live-gateway-constants.ts` },
    ],
    reviewedAt: "2026-10-07",
  },

  // ───────────────────────────── 3. Durable Objects ─────────────────────────────
  {
    id: "durable-objects-realtime",
    category: "realtime",
    name: "Durable Objects",
    title: t("방 하나가 객체 하나인 Cloudflare 실시간 조정자", "A Cloudflare coordinator where one room is one object"),
    status: "configured",
    tagline: t(
      "접속 상태·커서·댓글 신호·화면 공유 신호를 방 단위 객체 하나가 순서대로 조정합니다.",
      "One object per room coordinates presence, cursors, comment signals and screen-share signals in order.",
    ),
    background: [
      t(
        "여러 사람이 같은 방에 들어오면 누가 있는지, 누구 커서가 어디인지를 한곳에서 정리해 줄 '방 관리인'이 필요합니다. Cloudflare Durable Objects는 방 하나에 관리인 한 명(객체 하나)을 붙여 주는 서비스입니다. 방 하나의 요청은 그 관리인 한 명이 차례로 처리하는 구조라 순서를 맞추려고 따로 잠금을 걸 일이 줄어들고, 방이 조용하면 메모리에서 내려가 유휴 비용을 줄입니다.",
        "When several people enter a room, someone must keep track of who is there and where their cursors are. Cloudflare Durable Objects assigns one room manager (one object) per room. Requests for one room are handled in turn by that single manager, so far less locking is needed to keep order, and a quiet room is unloaded from memory to cut idle cost.",
      ),
      t(
        "순서는 이렇습니다. 브라우저가 API에서 받은 2분짜리 HMAC 티켓을 WebSocket 서브프로토콜로 제시하면 Worker가 Origin·티켓 서명·방 범위를 확인하고, 'work:<작품>:room:<방>' 이름의 객체로 연결을 넘깁니다. 객체는 티켓을 다시 검증하고 방 정원(64)·계정당 연결(4)·1회용 nonce를 확인한 뒤 하이버네이션이 가능한 연결로 받습니다. presence·comments·screen-signaling 세 채널은 각자 번호를 매겨 SQLite에 기록하고, 놓친 이벤트는 번호 이후만 다시 받습니다.",
        "The order: the browser presents a 2-minute HMAC ticket from the API as a WebSocket subprotocol; the Worker checks the origin, ticket signature and room scope, then hands the connection to the object named 'work:<work>:room:<room>'. The object re-verifies the ticket, checks the room cap (64), connections per account (4) and a one-time nonce, then accepts a hibernation-capable connection. Three channels, presence, comments and screen-signaling, are numbered separately and logged in SQLite, and a client that missed events gets only those after its number.",
      ),
      t(
        "이 객체는 일시적 상태만 맡습니다. 그림 문서(CRDT)와 권한은 NestJS·PostgreSQL이 계속 권위이고, 이미지·오디오 같은 바이트는 거부합니다. 조정자 README는 장애가 나면 해당 목적을 멈출 뿐 약한 대체 구현으로 자동 전환하지 않는다고 못박습니다. 한편 클라이언트에는 같은 메시지를 원래 경로인 Socket.IO로 되돌리는 목적별 라우팅이 있어, Cloudflare 경로가 실패하면 접속 상태와 화면 공유 신호를 Socket.IO가 이어받을 수 있습니다.",
        "This object owns only transient state. The drawing document (CRDT) and permissions stay with NestJS and PostgreSQL, and image or audio bytes are rejected. The coordinator's README states that on failure it stops that purpose and never switches automatically to a weaker substitute. Separately, the client has purpose-based routing that sends the same message back through its original path, Socket.IO, so presence and screen-share signals can be taken over by Socket.IO when the Cloudflare path fails.",
      ),
      t(
        "숫자를 읽는 법입니다. 방당 연결 64와 재개 창 10초는 wrangler.jsonc의 설정값이지 부하 시험 결과가 아닙니다. 10초는 '재접속을 허용하는 시간'이 아니라 연결별 재개 요청의 측정 창(창당 64건·8MiB)이고, 놓친 이벤트를 다시 받을 수 있는 기간은 이벤트 보존 15분·최대 2,048건입니다. 운영 상태는 2026-09-21 운영 문서가 'Render의 실시간 티켓 발급이 켜져 있고 realtime.toonstudio.cloud/health가 성공 응답했다'고 기록하지만, 인증된 방 입장과 WAN 수용은 별도 검증이라고 선을 긋습니다. 배포 체크리스트의 승인 항목도 대부분 아직 체크되지 않았습니다.",
        "How to read the numbers: 64 connections per room and the 10-second resume window are settings in wrangler.jsonc, not load-test results. The 10 seconds is not a time during which reconnecting is allowed but a measuring window for each connection's resume requests (64 requests or 8 MiB per window); the period in which missed events can be replayed is the event retention of 15 minutes, up to 2,048 events. As for production, an operations note dated 2026-09-21 records that Render's realtime ticket issuance is on and that realtime.toonstudio.cloud/health answered successfully, but it draws a line saying authenticated room admission and WAN capacity are verified separately. Most approval items in the deployment checklist are also still unchecked.",
      ),
    ],
    keyPoints: [
      t("방 하나 = 객체 하나: 한 곳에서 차례로 처리해 순서를 잡습니다", "One room is one object, handled in turn in a single place"),
      t("연결은 하이버네이션: 조용한 방은 메모리에서 내려갑니다", "Connections hibernate: a quiet room is unloaded from memory"),
      t("채널마다 번호를 매겨 SQLite에 기록하고 놓친 부분만 재생합니다", "Each channel is numbered and logged in SQLite; only the missed part is replayed"),
      t("그림 문서와 권한은 맡지 않고 임시 상태만 조정합니다", "It owns no drawing documents or permissions, only transient state"),
    ],
    diagram: {
      id: "durable-objects-realtime-diagram",
      kind: "graph",
      title: t("티켓을 들고 방 객체에 도착하는 길", "The path from a ticket to the room object"),
      caption: t(
        "문서는 Socket.IO가 맡고, Cloudflare 쪽은 방마다 객체 하나가 임시 상태를 번호 붙여 기록합니다.",
        "Socket.IO owns documents; on the Cloudflare side one object per room logs transient state with sequence numbers.",
      ),
      alt: t(
        "Nest API가 2분짜리 티켓을 브라우저에 주면, 브라우저는 티켓을 담아 Cloudflare Worker에 WebSocket으로 연결합니다. Worker가 Origin과 티켓을 검증해 방 이름의 RealtimeRoom 객체로 넘기고, 객체는 번호를 매겨 SQLite에 기록합니다. Nest API의 철회 신호는 ActorDirectory 객체로 가서 열린 연결을 닫게 하고, 브라우저는 문서와 폴백을 위해 Socket.IO에도 연결돼 있습니다.",
        "The Nest API gives the browser a 2-minute ticket, and the browser connects to the Cloudflare Worker over WebSocket carrying it. The Worker checks origin and ticket and hands the connection to the RealtimeRoom object named for the room, which logs events with sequence numbers in SQLite. Revocation signals from the Nest API go to the ActorDirectory object to close open connections, and the browser is also connected to Socket.IO for documents and as a fallback.",
      ),
      nodes: [
        { id: "socketio", label: t("Socket.IO", "Socket.IO"), sub: t("문서·잠금·채팅 경로", "Docs, locks, chat path"), tone: "server", at: [0, 0] },
        { id: "browser", label: t("브라우저", "Browser"), sub: t("티켓을 WebSocket에 제시", "Presents the ticket"), tone: "local", at: [1, 0] },
        { id: "worker", label: t("Worker", "Worker"), sub: t("Origin·티켓·범위 검증", "Checks origin, ticket, scope"), tone: "edge", at: [2, 0] },
        { id: "room", label: t("RealtimeRoom", "RealtimeRoom"), sub: t("방 하나 = 객체 하나", "One room, one object"), tone: "edge", at: [3, 0] },
        { id: "sqlite", label: t("SQLite", "SQLite"), sub: t("이벤트·접속 상태·nonce", "Events, presence, nonces"), tone: "edge", shape: "cylinder", at: [4, 0] },
        { id: "api", label: t("Nest API", "Nest API"), sub: t("티켓 발급 · 철회 신호", "Tickets and revocations"), tone: "server", at: [1, 1] },
        { id: "actors", label: t("ActorDirectory", "ActorDirectory"), sub: t("철회 펜스를 쥔 객체", "Holds revocation fences"), tone: "edge", at: [3, 1] },
      ],
      edges: [
        { from: "browser", to: "socketio", both: true, label: t("폴백·문서", "Fallback") },
        { from: "api", to: "browser", style: "dashed", label: t("2분 티켓", "2-min ticket") },
        { from: "browser", to: "worker", label: t("티켓+WS", "Ticket + WS") },
        { from: "worker", to: "room", label: t("방 이름으로", "By room") },
        { from: "room", to: "sqlite", label: t("순번 기록", "Numbered") },
        { from: "api", to: "actors", style: "dashed", label: t("철회 신호(HMAC)", "Revocation (HMAC)") },
        { from: "room", to: "actors", both: true, label: t("철회 확인", "Fence check") },
      ],
      groups: [
        { id: "cloudflare", label: t("Cloudflare", "Cloudflare"), tone: "edge", nodeIds: ["worker", "room", "sqlite", "actors"] },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · 접속 상태와 커서", "Shared workroom · presence and cursors"),
        role: t(
          "방 하나를 객체 하나가 맡아 접속자 목록과 커서 이벤트를 순서대로 전달하고, 놓친 이벤트는 번호 이후만 다시 보냅니다.",
          "One object per room relays the participant list and cursor events in order and resends only events after a client's last number.",
        ),
        paths: [`${WORKER}/src/room.ts#RealtimeRoom`, `${WORKER}/src/room-store.ts`],
        route: "/studio",
      },
      {
        feature: t("공동 작업실 · 댓글 변경 알림", "Shared workroom · comment change notices"),
        role: t(
          "댓글 본문 없이 '바뀌었다'는 신호(comment.changed)만 전달해 다른 편집자가 목록을 다시 읽게 합니다.",
          "Relays only a 'changed' signal (comment.changed), without the comment body, so other editors reload the list.",
        ),
        paths: [`${WORKER}/src/protocol.ts`, `${LIVE}/studio-live-purpose-routed-transport.ts#receivePurposeEvent`],
      },
      {
        feature: t("공동 작업실 · 화면 공유 신호", "Shared workroom · screen-share signals"),
        role: t(
          "공유 소유자와 승인된 시청자 쌍만 SDP/ICE를 주고받게 접근 규칙을 적용합니다.",
          "Applies access rules so only the share owner and an approved viewer pair can exchange SDP/ICE.",
        ),
        paths: [`${WORKER}/src/room-store.ts#authorizeScreenSignal`],
      },
      {
        feature: t("배포 설정 · 한도와 정책", "Deployment settings · limits and policy"),
        role: t(
          "방당 연결 64, 계정당 4, 이벤트 보존 15분 같은 한도를 wrangler.jsonc 변수로 선언합니다. 비밀 값은 코드에 두지 않고 Worker secret으로만 등록합니다.",
          "Declares limits such as 64 connections per room, 4 per account and 15-minute event retention as wrangler.jsonc variables. Secrets are never in code and are registered only as Worker secrets.",
        ),
        paths: [`${WORKER}/wrangler.jsonc`, `${WORKER}/README.md`, `${WORKER}/DEPLOY_CHECKLIST.md`],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("채널 번호와 놓친 부분만 다시 받기", "Channel numbers and resuming only what was missed"),
        language: "ts",
        code: `type Event = { sequence: number; payload: string };

// 채널마다 번호를 매기고, 놓친 이벤트는 번호 이후부터만 다시 보낸다.
export class Channel {
  private events: Event[] = [];
  private next = 1;

  constructor(private readonly keep = 2048) {} // 보존 개수 상한 (wrangler.jsonc 의 REALTIME_MAX_REPLAY_EVENTS)

  publish(payload: string): Event {
    const event = { sequence: this.next++, payload };
    this.events.push(event);
    if (this.events.length > this.keep) this.events.shift(); // 오래된 것부터 잊는다
    return event;
  }

  // 이미 잊은 구간이면 null: 스냅샷부터 다시 받아야 한다(resume-gap).
  resume(afterSequence: number): Event[] | null {
    const oldest = this.events[0]?.sequence ?? this.next;
    if (afterSequence + 1 < oldest) return null;
    return this.events.filter((event) => event.sequence > afterSequence);
  }
}`,
        codeEn: `type Event = { sequence: number; payload: string };

// Number each channel and resend missed events only from the client's last number.
export class Channel {
  private events: Event[] = [];
  private next = 1;

  constructor(private readonly keep = 2048) {} // retention cap (REALTIME_MAX_REPLAY_EVENTS in wrangler.jsonc)

  publish(payload: string): Event {
    const event = { sequence: this.next++, payload };
    this.events.push(event);
    if (this.events.length > this.keep) this.events.shift(); // forget the oldest first
    return event;
  }

  // null when that range is already forgotten: the client must refetch from a snapshot (resume-gap).
  resume(afterSequence: number): Event[] | null {
    const oldest = this.events[0]?.sequence ?? this.next;
    if (afterSequence + 1 < oldest) return null;
    return this.events.filter((event) => event.sequence > afterSequence);
  }
}`,
        explain: t(
          "번호가 있으면 접속이 잠시 끊긴 사람에게 놓친 부분만 다시 줄 수 있고, 너무 오래 끊겼다면 '재생 불가'를 알려 스냅샷으로 되돌립니다. 실제 코드는 이를 SQLite에 기록하고 재개 요청의 횟수·바이트 예산(10초 창)도 지킵니다.",
          "Numbers let a briefly disconnected client receive only the part it missed, and a client gone too long is told replay is impossible and falls back to a snapshot. The real code stores this in SQLite and also enforces a resume budget of requests and bytes (a 10-second window).",
        ),
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("하이버네이션이 가능한 WebSocket 수락", "Accepting a hibernation-capable WebSocket"),
        language: "ts",
        code: `import { DurableObject } from "cloudflare:workers";

export class Room extends DurableObject {
  async fetch(_request: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server); // 하이버네이션 가능 수락: 조용하면 메모리에서 내려간다
    server.serializeAttachment({ joinedAt: Date.now() }); // 깨어나도 복원할 연결 정보
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(sender: WebSocket, message: string | ArrayBuffer): Promise<void> {
    for (const peer of this.ctx.getWebSockets()) if (peer !== sender) peer.send(message);
  }
}`,
        codeEn: `import { DurableObject } from "cloudflare:workers";

export class Room extends DurableObject {
  async fetch(_request: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server); // hibernation-capable accept: a quiet room is unloaded from memory
    server.serializeAttachment({ joinedAt: Date.now() }); // connection info restored after waking
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(sender: WebSocket, message: string | ArrayBuffer): Promise<void> {
    for (const peer of this.ctx.getWebSockets()) if (peer !== sender) peer.send(message);
  }
}`,
        explain: t(
          "Cloudflare 공식 문서의 하이버네이션 패턴을 줄인 예입니다. 서비스 코드는 여기에 티켓 재검증, 정원·계정당 연결 한도, nonce 소비, 철회 펜스 등록을 더해 연결을 받습니다. 이 예제는 Cloudflare 전용 타입이 필요해 구문만 검사합니다.",
          "A trimmed version of the hibernation pattern in Cloudflare's docs. The service adds ticket re-verification, room and per-account caps, nonce consumption and revocation-fence registration before accepting a connection. It needs Cloudflare-only types, so only its syntax is checked.",
        ),
        verify: "syntax",
      },
    ],
    links: [
      { title: "Cloudflare · Durable Objects", url: "https://developers.cloudflare.com/durable-objects/", kind: "docs" },
      { title: "Cloudflare · Durable Objects WebSockets (Hibernation)", url: "https://developers.cloudflare.com/durable-objects/best-practices/websockets/", kind: "docs" },
      { title: "Cloudflare · SQLite storage API", url: "https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/", kind: "docs" },
      { title: "Cloudflare · Durable Objects limits", url: "https://developers.cloudflare.com/durable-objects/platform/limits/", kind: "docs" },
      { title: "Cloudflare · Rules of Durable Objects", url: "https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/", kind: "guide" },
    ],
    chapterIds: ["architecture", "infrastructure"],
    talk: {
      pitch: t(
        "접속 상태, 커서, 댓글 변경 알림, 화면 공유 신호처럼 잠깐 있다 사라지는 정보는 Cloudflare Durable Objects가 방마다 객체 하나로 조정합니다. 방 하나의 요청을 객체 하나가 차례로 처리해 순서를 잡고, 조용한 방은 메모리에서 내려갑니다. 그림 문서와 권한은 여전히 NestJS와 PostgreSQL이 권위입니다. 방당 연결 64 같은 숫자는 설정값이며 부하 시험 결과가 아니고, 운영 상태는 문서 기록 수준으로만 확인했습니다.",
        "Information that comes and goes, such as presence, cursors, comment-change notices and screen-share signals, is coordinated by Cloudflare Durable Objects with one object per room. One object handles a room's requests in turn, which keeps their order, and a quiet room is unloaded from memory. Drawing documents and permissions are still owned by NestJS and PostgreSQL. Numbers like 64 connections per room are settings, not load-test results, and the production state has been confirmed only at the level of a document record.",
      ),
      analogy: t(
        "방마다 안내 데스크 직원이 한 명씩 있는 호텔 같습니다. 직원은 한 번에 한 손님만 응대해서 줄이 꼬이지 않고, 손님이 없으면 쉬러 갑니다. 다만 객실 장부(그림 문서)는 본사(PostgreSQL)에 있습니다.",
        "It is like a hotel with one front-desk clerk per room. The clerk serves one guest at a time so queues never tangle, and rests when nobody is around. The ledger of rooms (the drawing document) is kept at headquarters (PostgreSQL).",
      ),
      questions: [
        {
          question: t("64명이 같이 그릴 수 있나요?", "Can 64 people draw together?"),
          answer: t(
            "아니요. 64는 한 방이 받는 WebSocket 연결 상한이며 접속 상태용입니다. 문서 협업 방은 30명, 음성·영상은 원격 3명입니다. 모두 설정값이고 부하 시험으로 보증한 수용량이 아닙니다.",
            "No. 64 is the WebSocket connection cap of one presence room. The document room holds 30 and voice and video 3 remote peers. All are settings, not load-tested capacity.",
          ),
        },
        {
          question: t("'재개 창 10초'는 무슨 뜻인가요?", "What does 'resume window of 10 seconds' mean?"),
          answer: t(
            "재접속을 허용하는 시간이 아닙니다. 연결별 재개 요청을 세는 측정 창이고 창당 64건·8MiB까지입니다. 놓친 이벤트는 최대 15분·2,048건까지 다시 받을 수 있습니다.",
            "It is not the time during which reconnecting is allowed. It is a window for counting each connection's resume requests, up to 64 requests or 8 MiB per window. Missed events can be replayed for up to 15 minutes and 2,048 events.",
          ),
        },
        {
          question: t("Durable Objects가 멈추면요?", "What if Durable Objects stops?"),
          answer: t(
            "접속 상태 같은 임시 기능이 일시 중단될 수 있지만 문서 저장은 영향이 없습니다. 클라이언트는 같은 메시지를 Socket.IO로 되돌릴 수 있게 만들어 뒀고, 운영에서 장애를 일으켜 확인한 기록은 찾지 못했습니다.",
            "Transient features such as presence may pause, but document saving is unaffected. The client can send the same message back over Socket.IO, but no record of verifying this by injecting a failure in production was found.",
          ),
        },
      ],
      pitfall: t(
        "'Durable Objects가 문서 동기화를 한다'고 말하면 틀립니다(문서 레인은 Socket.IO→NestJS→PostgreSQL). 기존 덱의 '재개 허용 창 10초' 표현은 '재개 요청 측정 창 10초'로 바로잡아야 합니다. 운영 상태는 문서 기록(2026-09-21)이며 이 카드에서 직접 확인한 것이 아닙니다. 인증된 방 입장과 사용 비용은 확인한 기록이 없고, 배포 체크리스트의 승인 항목도 대부분 미체크입니다.",
        "Saying 'Durable Objects syncs documents' is wrong: the document lane is Socket.IO to NestJS to PostgreSQL. The existing deck's phrase 'resume allowed window of 10 seconds' should be corrected to 'resume-request measuring window of 10 seconds'. The production state comes from a document dated 2026-09-21 and was not verified directly for this card. No record exists of authenticated room admission or usage cost, and most approval items in the deployment checklist are unchecked.",
      ),
    },
    technologies: ["Durable Objects", "Cloudflare Workers", "WebSocket", "SQLite", "HMAC"],
    facts: [
      { value: "64", label: t("방당 WebSocket 연결 상한(설정값)", "WebSocket connections per room (setting)"), source: `${WORKER}/wrangler.jsonc` },
      { value: "4", label: t("계정당 연결 상한(설정값)", "Connections per account (setting)"), source: `${WORKER}/wrangler.jsonc` },
      { value: "15 min", label: t("이벤트 보존 시간(900,000ms)", "Event retention (900,000 ms)"), source: `${WORKER}/wrangler.jsonc` },
      { value: "10 s", label: t("재개 요청 측정 창", "Resume-request measuring window"), source: `${WORKER}/wrangler.jsonc` },
    ],
    reviewedAt: "2026-10-07",
  },
  ...ENGINEERING_ATLAS_REALTIME_LOCK,
];
