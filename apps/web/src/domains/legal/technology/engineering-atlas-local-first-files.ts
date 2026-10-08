import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { sampleLines, t } from "./engineering-atlas-local-first-kit";

/**
 * 기술 도감 · local-first 카드 (3) 파일·저장소·설치: 내용주소 저장소, 쿼터와 Safe Mode,
 * File System Access 재저장, 웹앱 매니페스트, 검증된 저장소 이전.
 * 핵심 메시지: 서버가 없어도 작업은 남지만, 브라우저 저장소는 영구 백업이 아니다.
 */

const CREATOR = "apps/web/src/domains/creator";
const SHARED_LIB = "apps/web/src/shared/lib";

export const OPFS_CONTENT_ADDRESSED_STORE: EngineeringAtlasEntry = {
  id: "opfs-content-addressed-store",
  category: "local-first",
  name: "Content-addressed store",
  title: t("해시가 곧 이름인 자산 창고", "An asset warehouse where the hash is the name"),
  status: "live",
  tagline: t(
    "같은 바이트는 이름 하나로 한 번만 저장하고, 안 쓰는 파일은 mark-and-sweep으로 치웁니다.",
    "Identical bytes are stored once under one name, and unused files are swept away by mark-and-sweep.",
  ),
  background: [
    t(
      "글꼴 하나가 수십 MB, 3D 모델은 그 이상입니다. 같은 글꼴을 두 번 올리면 파일이 두 벌 쌓이고, 지울 때 다른 보관함이 쓰는 파일까지 지워 버릴 위험도 있습니다. 그래서 파일 이름을 ‘내용의 지문(SHA-256 해시)’으로 정했습니다. 같은 내용은 같은 지문이라 파일이 하나만 남고, 지문이 같으면 내용도 같으니 손상 여부는 다시 계산해 확인할 수 있습니다.",
      "A single font can be tens of megabytes and a 3D model more. Uploading the same font twice would stack two copies, and deleting one risks removing a file another library still uses. So files are named after a fingerprint of their content (a SHA-256 hash). Identical content has an identical fingerprint and is stored once, and matching fingerprints mean matching content, so damage can be checked by recomputing.",
    ),
    t(
      "저장은 세 겹입니다. ① 파일시스템 래퍼: 읽기·쓰기·삭제·목록·크기 다섯 함수만 보이고, 경로는 소문자 영숫자와 . _ - 로 4단계·200자까지만 허용합니다. 쓰기는 createWritable()이 임시 파일에 쓰고 닫을 때 바꿔치기해 중간에 꺼져도 원본이 남습니다. ② 저장소: 압축 전 원본의 SHA-256을 키로 blobs 폴더에 두고, 이미 압축된 형식(PNG·WOFF2·GLB 등)은 압축하지 않습니다. ③ 소유자: 글꼴 보관함 같은 소유자가 ‘내가 지금 참조하는 해시 집합’을 통째로 선언합니다.",
      "Storage has three layers. ① A file-system wrapper that shows only five functions (read, write, remove, list, size) and allows only lowercase alphanumerics plus . _ - in paths, up to 4 levels and 200 characters. Writes use createWritable(), which writes a temporary file and swaps it on close, so a crash leaves the original. ② The store, which keys blobs by the SHA-256 of the original bytes and skips compression for already-compressed formats such as PNG, WOFF2 and GLB. ③ Owners, such as the font library, each declaring ‘the full set of hashes I reference right now’.",
    ),
    t(
      "치우는 방식은 참조 카운트(+1/−1)가 아니라 mark-and-sweep입니다. 감소 한 번을 놓치면 영원히 새고, 증가 한 번을 놓치면 살아 있는 자산을 지워 되돌릴 수 없기 때문입니다. sweep은 ‘어떤 소유자도 참조하지 않고 만든 지 5분이 지난’ 파일만 지웁니다. 5분 유예는 저장과 참조 확정 사이에 sweep이 끼어드는 경합을 막고, 몇 번 돌려도 결과가 같아(멱등) 중단된 쓰기나 다른 탭의 어긋남은 다음 sweep이 바로잡습니다.",
      "Cleanup is mark-and-sweep, not reference counting (+1/−1). One missed decrement leaks forever, while one missed increment deletes a live asset irrecoverably. Sweep removes only files that no owner references and that are older than five minutes. The five-minute grace closes the race between saving a file and committing a reference to it, and because sweeping is idempotent, interrupted writes or another tab’s drift are corrected by the next sweep.",
    ),
    t(
      "한계: OPFS는 사용자가 파일 탐색기로 볼 수 없는 브라우저 안 공간이고, 사이트 데이터를 지우면 함께 사라집니다. OPFS를 열 수 없는 환경(시크릿 모드 등)에서는 ‘이 탭 메모리에만 유지’라고 알리고 localStorage로 몰래 대체하지 않습니다. 옛 localStorage 데이터를 옮기는 도구(studio-opfs-migration.ts)는 코드에 있지만 V12 정책 이후 제품에서 호출하는 곳이 없습니다.",
      "Limits: OPFS is space inside the browser that users cannot browse with a file explorer, and it disappears with site data. Where OPFS cannot be opened (private mode and the like), the app says assets live in this tab’s memory only and does not quietly swap in localStorage. A tool for moving old localStorage data (studio-opfs-migration.ts) exists in code but nothing in the product calls it since the V12 policy.",
    ),
  ],
  keyPoints: [
    t("키는 압축 전 원본의 SHA-256, 같은 파일은 하나만 저장", "Key = SHA-256 of the original bytes; one copy per file"),
    t("치우기는 참조 카운트가 아니라 mark-and-sweep + 5분 유예", "Cleanup is mark-and-sweep with a five-minute grace, not ref-counting"),
    t("OPFS를 못 열면 ‘메모리뿐’이라 알리고 몰래 대체하지 않음", "If OPFS cannot open, say ‘memory only’ instead of swapping silently"),
  ],
  diagram: {
    id: "opfs-content-addressed-store-diagram",
    kind: "graph",
    title: t("넣을 때와 치울 때", "Putting in and sweeping out"),
    caption: t(
      "이름이 곧 내용의 지문이라 중복은 저절로 사라지고, 치우기는 ‘아무도 안 쓰고 5분이 지난 것’만 고릅니다.",
      "The name is the content’s fingerprint, so duplicates vanish by themselves and sweeping picks only what nobody uses and is older than five minutes.",
    ),
    alt: t(
      "넣을 때는 원본 바이트의 SHA-256을 계산해 이미 있으면 그대로 재사용하고, 없으면 blob 파일로 씁니다. 치울 때는 소유자들이 선언한 참조 집합을 모아 sweep이 돌고, 참조가 없고 5분이 지난 blob만 삭제하며 나머지는 남깁니다.",
      "When putting, the SHA-256 of the original bytes is computed; if it already exists it is reused, otherwise the blob file is written. When sweeping, the references declared by owners are gathered and sweep runs; only blobs with no reference that are older than five minutes are deleted and the rest are kept.",
    ),
    nodes: [
      { id: "put", label: t("원본 바이트", "Original bytes"), tone: "local", shape: "pill", at: [0, 0] },
      { id: "hash", label: t("SHA-256 해시", "SHA-256 hash"), sub: t("압축 전 바이트로 계산", "Of the uncompressed bytes"), tone: "local", at: [1, 0] },
      { id: "exists", label: t("이미 있나?", "Exists?"), tone: "warn", shape: "diamond", at: [2, 0] },
      { id: "reuse", label: t("그대로 재사용", "Reuse it"), sub: t("같은 파일은 하나", "One file per content"), tone: "good", at: [3, 0] },
      { id: "blob", label: t("blob 파일", "Blob file"), sub: t("해시.bin · gz · dfl", "hash.bin, gz or dfl"), tone: "local", shape: "cylinder", at: [2, 1] },
      { id: "owners", label: t("소유자 참조 선언", "Owners declare refs"), sub: t("해시 집합을 통째로", "The whole hash set"), tone: "local", at: [0, 3] },
      { id: "sweep", label: t("sweep 실행", "Run sweep"), sub: t("정리 시점에만, 매 쓰기 아님", "At cleanup moments, not every write"), tone: "local", at: [1, 3] },
      { id: "gate", label: t("치워도 되나?", "Safe to remove?"), tone: "warn", shape: "diamond", at: [2, 3] },
      { id: "keep", label: t("남겨 둠", "Keep it"), sub: t("참조 중이거나 5분 이내", "Referenced or under 5 min"), tone: "good", at: [3, 3] },
    ],
    edges: [
      { from: "put", to: "hash" },
      { from: "hash", to: "exists" },
      { from: "exists", to: "reuse", label: t("있음", "yes") },
      { from: "exists", to: "blob", label: t("없음", "no") },
      { from: "owners", to: "sweep" },
      { from: "sweep", to: "gate" },
      { from: "gate", to: "blob", label: t("삭제", "delete"), style: "dashed" },
      { from: "gate", to: "keep", label: t("아니오", "no") },
    ],
    groups: [
      { id: "put-side", label: t("넣을 때 (put)", "Putting in (put)"), tone: "local", nodeIds: ["put", "hash", "exists", "reuse", "blob"] },
      { id: "sweep-side", label: t("치울 때 (sweep)", "Sweeping out (sweep)"), tone: "local", nodeIds: ["owners", "sweep", "gate", "keep"] },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 · 사용자 글꼴 보관함", "Studio · the user font library"),
      role: t(
        "글꼴 파일(수십 MB)의 바이트는 이 저장소에, 목록(매니페스트)은 SQLite에 두고 소유자 id로 참조를 선언합니다.",
        "Font bytes (tens of MB) go into this store, the manifest into SQLite, and the library declares its references under an owner id.",
      ),
      paths: [`${CREATOR}/studio-custom-font-sqlite-opfs-repository.ts`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 에셋 보관함", "Studio · the asset library"),
      role: t(
        "일반 에셋을 해시 이름으로 보관하고, 목록을 읽을 때 Web Lock 안에서 소유자 참조를 다시 맞춘 뒤 sweep으로 고아 blob을 치웁니다.",
        "Stores general assets under hash names and, when listing, re-aligns owner references inside a Web Lock and sweeps orphaned blobs.",
      ),
      paths: [`${CREATOR}/studio-asset-library-sqlite-opfs-repository.ts#STUDIO_ASSET_LIBRARY_LOCK_NAME`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · VRM·3D 라이브러리", "Studio · VRM and 3D libraries"),
      role: t(
        "VRM 모델·텍스처와 BG3D GLB 같은 큰 파일을 같은 방식으로 두고, 어떤 파일이 있는지는 SQLite 매니페스트가 가리킵니다.",
        "Large files such as VRM models, textures and BG3D GLBs are stored the same way, and a SQLite manifest points to what exists.",
      ),
      paths: [`${CREATOR}/vrm/studio-vrm-asset-sqlite-opfs-repository.ts`, `${CREATOR}/bg3d/studio-bg3d-libraries-sqlite-opfs-authority.ts`],
    },
    {
      feature: t("공통 기반 · 파일시스템 래퍼와 압축 정책", "Foundation · the file-system wrapper and compression policy"),
      role: t(
        "경로 검증, 원자적 쓰기, 시크릿 모드 감지, 측정에 근거한 압축 여부 결정을 한곳에 둡니다.",
        "Keeps path validation, atomic writes, private-mode detection and the measurement-based compression decision in one place.",
      ),
      paths: [`${CREATOR}/studio-opfs-filesystem.ts`, `${CREATOR}/studio-opfs-asset-store.ts`, `${CREATOR}/studio-opfs-compression.ts`],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("SHA-256 이름으로 저장하고 중복 건너뛰기", "Store under a SHA-256 name and skip duplicates"),
      language: "ts",
      ...sampleLines([
        "interface Fs { write(path: string, bytes: Uint8Array): Promise<void>; size(path: string): Promise<number | null> }",
        "",
        "export async function putBlob(fs: Fs, bytes: Uint8Array<ArrayBuffer>): Promise<{ hash: string; deduped: boolean }> {",
        '  const digest = await crypto.subtle.digest("SHA-256", bytes);',
        '  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");',
        ['  const path = "blobs/" + hex + ".bin"; // 키 = 압축 전 원본 바이트의 SHA-256', '  const path = "blobs/" + hex + ".bin"; // key = SHA-256 of the original bytes'],
        '  if ((await fs.size(path)) !== null) return { hash: "sha256:" + hex, deduped: true };',
        ["  await fs.write(path, bytes); // OPFS createWritable → close() 에서 원자적 교체", "  await fs.write(path, bytes); // OPFS createWritable swaps atomically on close()"],
        '  return { hash: "sha256:" + hex, deduped: false };',
        "}",
      ]),
      explain: t(
        "같은 바이트는 같은 해시, 즉 같은 경로가 되므로 두 번째 저장은 파일을 만들지 않고 건너뜁니다. 해시는 압축 전 바이트로 계산해 압축 방식이 바뀌어도 이름이 변하지 않습니다.",
        "Identical bytes give an identical hash and path, so a second save creates no file. The hash covers the uncompressed bytes, so changing the compression method does not change the name.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("sweep 계획: 미참조 + 유예 경과만 삭제", "A sweep plan: only unreferenced and past the grace"),
      language: "ts",
      source: `${CREATOR}/studio-opfs-asset-store.ts`,
      ...sampleLines([
        "interface Entry { hash: string; createdAt: number }",
        "",
        "export function planSweep(entries: Entry[], owners: Map<string, Set<string>>, now: number, graceMs = 300_000) {",
        "  const referenced = new Set<string>();",
        ["  for (const hashes of owners.values()) for (const hash of hashes) referenced.add(hash); // mark: 누가 쓰는가", "  for (const hashes of owners.values()) for (const hash of hashes) referenced.add(hash); // mark: who uses it"],
        "  const remove: Entry[] = [];",
        "  const keepInGrace: Entry[] = [];",
        "  for (const entry of entries) {",
        ["    if (referenced.has(entry.hash)) continue; // 누군가 쓰는 중이면 건드리지 않는다", "    if (referenced.has(entry.hash)) continue; // in use: leave it alone"],
        ["    if (now - entry.createdAt < graceMs) keepInGrace.push(entry); // 방금 만든 것은 유예(5분)", "    if (now - entry.createdAt < graceMs) keepInGrace.push(entry); // just created: grace period (5 min)"],
        ["    else remove.push(entry); // sweep: 미참조 + 유예 경과", "    else remove.push(entry); // sweep: unreferenced and past the grace"],
        "  }",
        "  return { remove, keepInGrace };",
        "}",
      ]),
      explain: t(
        "소유자가 ‘지금 참조하는 집합’을 통째로 선언하므로, 참조를 하나씩 세지 않고 합집합만 구하면 됩니다. 몇 번 실행해도 결과가 같고, 방금 저장한 파일은 5분 동안 지켜집니다.",
        "Owners declare their whole current set, so there is nothing to count; the union is enough. Running it repeatedly gives the same result, and a file saved a moment ago is protected for five minutes.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · Origin private file system", url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system", kind: "docs" },
    { title: "MDN · Compression Streams API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API", kind: "docs", note: t("gzip·deflate 압축을 브라우저가 제공", "Browser-provided gzip and deflate") },
    { title: "MDN · SubtleCrypto.digest()", url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest", kind: "docs", note: t("SHA-256 해시 계산", "Computing the SHA-256 hash") },
    { title: "MDN · StorageManager.estimate()", url: "https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate", kind: "docs" },
    { title: "Pro Git · Git Objects", url: "https://git-scm.com/book/en/v2/Git-Internals-Git-Objects", kind: "guide", note: t("내용주소 저장소의 대표 사례", "A well-known content-addressed store") },
  ],
  chapterIds: ["storage", "browser-local-compute"],
  talk: {
    pitch: t(
      "글꼴이나 3D 모델 같은 큰 파일은 이름을 ‘내용의 지문’으로 지어 저장합니다. 같은 파일을 몇 번 올려도 한 벌만 남고, 지문을 다시 계산하면 손상도 알아낼 수 있습니다. 안 쓰는 파일은 참조 카운트가 아니라 ‘누가 쓰는지 전부 모아 보고, 아무도 안 쓰고 5분이 지난 것만’ 치웁니다. 이 파일들은 브라우저 안에 있어서 내보내기나 백업이 따로 필요합니다.",
      "Large files such as fonts and 3D models are named after a fingerprint of their content. However many times the same file is uploaded, one copy remains, and recomputing the fingerprint reveals damage. Unused files are not cleaned by counting references but by collecting who uses what and removing only what nobody uses and is five minutes old. These files live inside the browser, so export or backup is needed separately.",
    ),
    analogy: t(
      "도서관의 청구기호를 책 내용으로 정하는 것과 같습니다. 같은 책은 같은 칸에 꽂히고, 폐기할 때는 모든 대출 장부를 모아 아무도 안 빌렸고 입고 5분이 지난 책만 치웁니다.",
      "It is like deriving a library call number from a book’s content. The same book always goes to the same shelf, and for weeding you gather every loan ledger and remove only books nobody borrowed that arrived over five minutes ago.",
    ),
    questions: [
      {
        question: t("왜 참조 카운트를 쓰지 않나요?", "Why not reference counting?"),
        answer: t(
          "코드 주석이 세 가지를 듭니다. 보관함은 목록 전체를 다시 쓰는 연산이 자연스럽고, 카운트는 스스로 고쳐지지 않으며, 증가를 놓치면 살아 있는 자산을 지워 되돌릴 수 없기 때문입니다.",
          "Code comments give three reasons: libraries naturally rewrite their whole list, counts cannot heal themselves, and a missed increment deletes a live asset irrecoverably.",
        ),
      },
      {
        question: t("방금 저장한 파일을 sweep이 지우면요?", "What if sweep deletes a file that was just saved?"),
        answer: t(
          "삭제 대상은 ‘미참조이면서 만든 지 5분이 지난 것’뿐이라 저장과 참조 확정 사이의 짧은 틈은 유예가 막아 줍니다.",
          "Only files that are unreferenced and older than five minutes are candidates, so the grace period covers the short gap between saving and committing a reference.",
        ),
      },
      {
        question: t("OPFS를 쓸 수 없는 브라우저는요?", "What about browsers without OPFS?"),
        answer: t(
          "실제로 디렉터리를 열어 보고 실패하면 ‘이번 탭 메모리에서만 유지, 창을 닫으면 사라짐’이라고 알립니다. 존재 검사만으로는 시크릿 모드를 구분할 수 없어서 열어 보는 방식을 씁니다.",
          "It actually tries to open the directory and, on failure, tells the user assets stay in this tab’s memory only and vanish when the window closes. An existence check alone cannot tell private mode, so it probes by opening.",
        ),
      },
    ],
    pitfall: t(
      "localStorage를 OPFS의 제품 폴백이라고 말하지 마세요. 폴백은 메모리뿐입니다. studio-opfs-migration.ts는 이전 도구로 코드에 있지만 제품에서 호출하는 곳이 없으니 ‘자동 마이그레이션이 돈다’고 말하면 안 됩니다. 벤치마크 수치는 개발 기기 1대(Chromium·macOS)의 값입니다.",
      "Do not call localStorage a product fallback for OPFS; the fallback is memory only. studio-opfs-migration.ts is a migration tool that exists in code but nothing in the product calls it, so do not say an automatic migration is running. Benchmark figures come from one development machine (Chromium on macOS).",
    ),
  },
  technologies: ["OPFS", "SubtleCrypto", "Compression Streams", "SQLite WASM"],
  facts: [
    { value: "5분 (300,000 ms)", label: t("sweep이 방금 만든 파일을 지키는 유예 시간", "Grace during which sweep spares a freshly made file"), source: `${CREATOR}/studio-opfs-asset-store.ts` },
    { value: "4단계 · 200자", label: t("OPFS 경로 규칙: 최대 세그먼트 수 · 길이", "OPFS path rule: maximum segments and length"), source: `${CREATOR}/studio-opfs-filesystem.ts` },
    { value: "10 MB · 80% · 95%", label: t("에셋 저장소 쿼터: 남겨 둘 여유 · 경고 · 위험 비율", "Asset-store quota: reserve, warning and critical ratios"), source: `${CREATOR}/studio-opfs-asset-store.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const STORAGE_PERSISTENCE_QUOTA_SAFE_MODE: EngineeringAtlasEntry = {
  id: "storage-persistence-quota-safe-mode",
  category: "local-first",
  name: "StorageManager",
  title: t("공간이 모자라도 조용히 실패하지 않는 저장", "Storage that does not fail silently when space runs low"),
  status: "live",
  tagline: t(
    "저장소 상태를 보여 주고, 공간이 부족하면 회수·고지하며, 영구 보관은 사용자가 눌러야 요청합니다.",
    "It shows storage health, reclaims and warns when space runs short, and asks for persistence only after a click.",
  ),
  background: [
    t(
      "브라우저 저장소는 기본적으로 ‘임시 보관함’입니다. 기기 공간이 부족하면 브라우저가 사용자에게 묻지 않고 사이트 데이터를 통째로 지울 수 있습니다. 그래서 ToonStudio는 이 사실을 숨기지 않습니다. 파일 화면에 ‘영구 보관 허용됨’ 또는 ‘브라우저 정리 대상일 수 있음’을 보여 주고, 중요한 작품은 내보내기 파일이나 개인 클라우드로 사본을 남기도록 안내합니다.",
      "Browser storage is by default a ‘temporary locker’. When the device runs low on space the browser may erase a site’s data wholesale without asking. ToonStudio does not hide this. The file screen shows ‘persistent storage granted’ or ‘may be cleared by the browser’, and important work is steered toward an export file or a personal-cloud copy.",
    ),
    t(
      "동작: ① StorageManager의 persisted()와 estimate()로 상태와 사용량을 읽고, 값이 없거나 반올림되면 ‘알 수 없음’으로 두어 지어내지 않습니다. ② persist()는 사용자가 버튼을 눌렀을 때만 요청하고, 거부되면 ‘아카이브 사본을 따로 저장하세요’라고 안내합니다. ③ 저장이 쿼터 오류로 실패하면 상태 레일에 알리고 Safe Mode(storage-pressure)에 들어가 복구 기록을 정리해 공간을 되찾은 뒤 회수한 크기를 다시 알립니다. 회수할 것이 없으면 ‘직접 확보해 주세요’라고 말합니다.",
      "How it works: ① persisted() and estimate() on the StorageManager give the state and usage; if a value is missing or rounded it stays ‘unknown’ rather than invented. ② persist() is requested only when the user presses a button, and on refusal the user is told to save an archive copy separately. ③ If a save fails with a quota error, the status rail says so, Safe Mode (storage-pressure) begins, recovery records are cleaned up to regain space, and the reclaimed size is announced. If nothing can be reclaimed the user is asked to free space manually.",
    ),
    t(
      "계층마다 임계값이 다릅니다. 에셋 저장소는 남은 공간이 10 MB 밑이면 새 자산을 거절하고(경고 80%·위험 95%), 서비스 워커 캐시는 사용률 85%·95%에서 상한을 줄이며, 오프라인 팩 자동 준비는 90%에서 멈춥니다. Safe Mode는 작품의 의미를 바꾸지 않고 GPU 레인과 라이브 잉크 같은 화면 품질 두 가지만 낮춥니다. 이 값들은 브라우저의 실제 quota와는 별개인 제품 정책 상수입니다.",
      "Each layer has its own thresholds. The asset store rejects new assets when less than 10 MB would remain (warning at 80%, critical at 95%), the Service Worker cache shrinks its limits at 85% and 95% use, and automatic offline-pack preparation stops at 90%. Safe Mode never changes the meaning of the artwork; it only lowers two display-quality features, the GPU lanes and live ink. These values are product-policy constants, separate from the browser’s actual quota.",
    ),
    t(
      "한계: 영구 보관(persist)을 허용받아도 사용자가 사이트 데이터를 직접 지우거나 기기를 잃으면 사라집니다. 허용 여부는 브라우저마다 정책이 달라 보장할 수 없습니다. 그래서 이 영역의 핵심 메시지는 ‘서버가 없어도 작업이 남지만, 브라우저 저장소는 영구 백업이 아니다’이고, 내보내기 파일과 개인 클라우드 사본을 함께 안내합니다.",
      "Limits: even when persistence is granted, the data is gone if the user clears site data or loses the device, and whether it is granted differs by browser and cannot be guaranteed. So the key message of this area is that work survives without a server but browser storage is not a permanent backup, and export files and personal-cloud copies are offered together.",
    ),
  ],
  keyPoints: [
    t("persist()는 버튼을 눌렀을 때만 요청", "persist() is requested only on a button press"),
    t("쿼터 오류는 무음 대신 고지 → Safe Mode → 공간 회수 → 재고지", "A quota error is announced, enters Safe Mode, reclaims space, and is announced again"),
    t("Safe Mode는 화면 품질만 낮추고 작품은 그대로", "Safe Mode lowers display quality only, never the artwork"),
    t("브라우저 저장소는 백업이 아니므로 사본을 함께", "Browser storage is not a backup, so keep copies"),
  ],
  diagram: {
    id: "storage-persistence-quota-safe-mode-diagram",
    kind: "layers",
    title: t("작품이 놓이는 저장 계층", "The storage layers an artwork lives in"),
    caption: t(
      "메모리에서 브라우저 저장소를 거쳐 사용자가 가진 사본까지, 브라우저가 지울 수 있는 구간과 지울 수 없는 구간이 갈립니다.",
      "From memory through browser storage to a copy the user owns, the stack splits into what the browser may clear and what it cannot.",
    ),
    alt: t(
      "위에서 아래로 메모리 속 작품, OPFS 복구 저널, SQLite, 내용주소 에셋 저장소, 내보내기 파일과 개인 클라우드 순으로 쌓여 있습니다. 가운데 세 계층은 브라우저가 지울 수 있는 저장소이고, 맨 아래 사본만 사용자가 소유해 사이트 데이터 삭제에도 남습니다.",
      "From top to bottom the layers are the artwork in memory, the OPFS recovery journal, SQLite, the content-addressed asset store, and export files plus personal cloud. The middle three are browser storage the browser may clear, and only the bottom copy is owned by the user and survives deletion of site data.",
    ),
    layers: [
      {
        id: "memory",
        label: t("메모리 속 작품 (편집 중)", "Artwork in memory (editing)"),
        sub: t("탭을 닫거나 크래시하면 사라짐", "Gone when the tab closes or crashes"),
        tone: "warn",
      },
      {
        id: "journal",
        label: t("OPFS 복구 저널", "OPFS recovery journal"),
        sub: t("자동저장 체크포인트, A/B 슬롯", "Autosave checkpoints in A/B slots"),
        tone: "local",
        chips: ["OPFS"],
      },
      {
        id: "sqlite",
        label: t("SQLite (OPFS 파일 풀)", "SQLite (OPFS file pool)"),
        sub: t("설정·카탈로그·저장 의도", "Settings, catalogs and save intents"),
        tone: "local",
        chips: ["SQLite WASM", "Dedicated Worker"],
      },
      {
        id: "cas",
        label: t("내용주소 에셋 저장소", "Content-addressed asset store"),
        sub: t("글꼴·VRM·3D·이미지 (SHA-256)", "Fonts, VRM, 3D and images (SHA-256)"),
        tone: "local",
        chips: ["OPFS"],
      },
      {
        id: "copy",
        label: t("내보내기 파일 · 개인 클라우드", "Export file and personal cloud"),
        sub: t("브라우저 밖 사본 — 사용자가 소유", "A copy outside the browser, owned by the user"),
        tone: "good",
        chips: ["Google Drive", "Dropbox", "OneDrive"],
      },
    ],
    brackets: [
      { label: t("브라우저가 지울 수 있는 저장소", "Storage the browser may clear"), layerIds: ["journal", "sqlite", "cas"] },
      { label: t("사용자가 가진 사본", "Copies the user holds"), layerIds: ["copy"] },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 · 파일 센터의 저장소 상태", "Studio · storage status in the file center"),
      role: t(
        "‘영구 보관 허용됨 / 브라우저 정리 대상일 수 있음’ 문구와 사용량을 보여 주고, 버튼을 눌렀을 때만 persist()를 요청합니다.",
        "Shows ‘persistent storage granted’ or ‘may be cleared by the browser’ with usage, and calls persist() only when the button is pressed.",
      ),
      paths: [`${CREATOR}/StudioFileControlCenter.tsx#requestPersistence`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 저장 실패 고지와 공간 회수", "Studio · save-failure notices and reclaiming space"),
      role: t(
        "쿼터 오류를 분류해 상태 레일에 알리고, Safe Mode에 들어가 복구 기록을 정리한 뒤 회수한 크기를 다시 알립니다.",
        "Classifies quota errors, announces them on the status rail, enters Safe Mode, cleans recovery records and announces the reclaimed size.",
      ),
      paths: [`${CREATOR}/studio-storage-recovery-runtime.ts#reportStudioAutosaveFailure`, `${CREATOR}/studio-reliability-status-store.ts`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 오프라인 패널", "Studio · the offline panel"),
      role: t(
        "persisted()·estimate()·persist()를 시간 제한으로 감싸 응답이 없어도 화면이 멈추지 않게 하고, 사용률 90%에서 자동 준비를 멈춥니다.",
        "Wraps persisted(), estimate() and persist() in a time limit so the screen never hangs, and stops automatic preparation at 90% use.",
      ),
      paths: [`${CREATOR}/offline/studio-offline-client.ts`, `${CREATOR}/offline/StudioOfflinePanel.tsx`, `${CREATOR}/offline/studio-offline-automation.ts`],
      route: "/studio",
    },
    {
      feature: t("프로젝트 보관 · 내보내기와 개인 클라우드", "Project keeping · export and personal cloud"),
      role: t(
        "프로젝트를 .toonstudio 패키지로 저장하거나, 연결한 개인 클라우드(Google Drive·Dropbox·OneDrive)에 올리는 경로가 따로 있습니다. 공급자 연결은 설정에 따릅니다.",
        "A project can be saved as a .toonstudio package or uploaded to a connected personal cloud (Google Drive, Dropbox, OneDrive) through separate paths. Provider connection depends on configuration.",
      ),
      paths: [`${CREATOR}/save-first/studio-project-package.ts`, `${CREATOR}/save-first/personal-cloud-upload.ts`, `${CREATOR}/save-first/personal-cloud-client.ts`],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("쿼터 단계 판정과 영구 보관 요청", "Quota levels and the persistence request"),
      language: "ts",
      ...sampleLines([
        'export type Level = "ok" | "warn" | "critical" | "unknown";',
        "",
        "export async function quotaLevel(): Promise<Level> {",
        "  const { usage, quota } = await navigator.storage.estimate();",
        ['  if (usage === undefined || !quota) return "unknown"; // 브라우저가 값을 숨기면 지어내지 않는다', '  if (usage === undefined || !quota) return "unknown"; // if the browser hides values, do not invent them'],
        "  const available = quota - usage;",
        "  const ratio = usage / quota;",
        '  if (ratio >= 0.95 || available <= 10_000_000) return "critical";',
        '  if (ratio >= 0.8 || available < 100_000_000) return "warn";',
        '  return "ok";',
        "}",
        "",
        ["// 영구 보관 요청은 사용자의 명시적 동작(버튼 클릭) 안에서만 부른다.", "// Request persistence only inside an explicit user action (a button click)."],
        "export const requestPersistence = (): Promise<boolean> => navigator.storage.persist();",
      ]),
      explain: t(
        "estimate()는 프라이버시 때문에 반올림되거나 과소 보고될 수 있어 정확한 잔량이 아니라 추세 신호로 씁니다. 값을 알 수 없으면 ‘unknown’으로 두고, 단계 숫자는 제품이 정한 정책입니다.",
        "estimate() may be rounded or under-reported for privacy, so it is a trend signal rather than an exact balance. Unknown values stay ‘unknown’, and the level numbers are product policy.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("저장소 API를 시간 제한으로 감싸기", "Wrapping storage APIs in a time limit"),
      language: "ts",
      source: `${CREATOR}/offline/studio-offline-client.ts`,
      ...sampleLines([
        ["/** 저장소 API가 응답하지 않아도 화면이 멈추지 않게 시간 제한으로 감싼다. */", "/** Wrap a storage call in a time limit so the screen never hangs on a silent API. */"],
        "export async function bounded<T>(operation: () => Promise<T>, fallback: T, timeoutMs = 2000): Promise<T> {",
        "  let timer: ReturnType<typeof setTimeout> | undefined;",
        "  try {",
        "    return await Promise.race([",
        ["      Promise.resolve().then(operation).catch(() => fallback), // 실패는 예외 대신 기본값", "      Promise.resolve().then(operation).catch(() => fallback), // a failure becomes the default, not an exception"],
        "      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),",
        "    ]);",
        "  } finally {",
        "    clearTimeout(timer);",
        "  }",
        "}",
        "",
        "export const storageHealth = () => Promise.all([",
        "  bounded<boolean | null>(async () => navigator.storage?.persisted?.() ?? null, null),",
        "  bounded<StorageEstimate | null>(async () => navigator.storage?.estimate?.() ?? null, null),",
        "]);",
      ]),
      explain: t(
        "persisted()와 estimate()가 오래 걸리거나 막혀도 2초 뒤 기본값(null = 알 수 없음)으로 화면을 계속 그립니다. 알 수 없는 상태를 ‘정상’으로 위장하지 않는 것이 핵심입니다.",
        "If persisted() or estimate() is slow or blocked, the screen carries on after two seconds with the default (null = unknown). The point is never to disguise an unknown state as healthy.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · Storage quotas and eviction criteria", url: "https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria", kind: "docs", note: t("언제 브라우저가 데이터를 지우는가", "When the browser may evict data") },
    { title: "MDN · StorageManager.persist()", url: "https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist", kind: "docs" },
    { title: "MDN · StorageManager.estimate()", url: "https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate", kind: "docs" },
    { title: "web.dev · Persistent storage", url: "https://web.dev/articles/persistent-storage", kind: "guide" },
    { title: "MDN · Storage API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Storage_API", kind: "docs" },
  ],
  chapterIds: ["storage", "browser-local-compute"],
  talk: {
    pitch: t(
      "서버가 없어도 작업이 남는다는 것은 브라우저 저장소가 영원하다는 뜻이 아닙니다. 브라우저는 공간이 모자라면 사이트 데이터를 지울 수 있어서, ToonStudio는 보관 상태를 화면에 그대로 보여 주고 공간이 부족하면 조용히 실패하는 대신 알리고 회수합니다. 영구 보관은 사용자가 버튼을 눌렀을 때만 요청하고, 어떤 경우에도 내보내기 파일과 개인 클라우드 사본을 함께 권합니다.",
      "Work surviving without a server does not mean browser storage is forever. A browser can erase site data when space runs low, so ToonStudio shows the real keeping status, and when space is short it announces and reclaims instead of failing silently. Persistence is requested only when the user presses a button, and export files and personal-cloud copies are always recommended alongside.",
    ),
    analogy: t(
      "공용 사물함에 짐을 맡기는 일과 같습니다. 사물함이 꽉 차면 관리인이 짐을 치울 수 있으니, 중요한 짐은 ‘보관 확정’ 도장을 받아 두되(영구 보관) 그래도 복사본은 집에 둡니다(내보내기·클라우드).",
      "Like leaving belongings in a public locker: if the locker fills up the attendant may clear it, so for important items you ask for a ‘guaranteed hold’ stamp (persistence) and still keep a copy at home (export or cloud).",
    ),
    questions: [
      {
        question: t("영구 보관을 자동으로 요청하면 안 되나요?", "Why not request persistence automatically?"),
        answer: t(
          "허용 여부는 브라우저가 사용자 동의와 사용 맥락을 보고 정합니다. 그래서 버튼을 눌렀을 때만 요청하고, 거부되면 내보내기 사본을 안내합니다. 오프라인 복원력 문서에도 ‘영구 저장은 다른 명시적 사용자 동작으로만 요청한다’고 적혀 있습니다.",
          "The browser decides based on user consent and usage context. So it is requested only on a button press and, if refused, an export copy is suggested. The offline-resilience document also states that persistent storage is requested only by another explicit user action.",
        ),
      },
      {
        question: t("Safe Mode가 작품을 바꾸나요?", "Does Safe Mode change the artwork?"),
        answer: t(
          "아니요. GPU 레인과 라이브 잉크 두 가지 화면 품질만 낮추고 문서의 의미는 그대로입니다. 라이브 잉크가 꺼져도 획은 보통 획으로 그려져 남습니다.",
          "No. It lowers only two display features, the GPU lanes and live ink, and the document’s meaning stays the same. Even with live ink off, strokes are drawn as ordinary strokes and kept.",
        ),
      },
      {
        question: t("공간 회수는 무엇을 지우나요?", "What does reclaiming space delete?"),
        answer: t(
          "복구 저널에서 더 이상 필요 없는 오래된 항목만 정리합니다. 회수할 것이 없으면 아무것도 지우지 않고 ‘브라우저 저장소 설정에서 공간을 직접 확보해 주세요’라고 안내합니다.",
          "Only obsolete old entries in the recovery journal are cleaned. If there is nothing to reclaim, nothing is deleted and the user is asked to free space in the browser’s storage settings.",
        ),
      },
      {
        question: t("내보내기만 하면 안전한가요?", "Is exporting alone safe enough?"),
        answer: t(
          "내보낸 파일은 브라우저 밖 사본이라 사이트 데이터 삭제에는 안전하지만, 파일 자체를 잃으면 같습니다. 개인 클라우드 업로드 경로가 코드에 있으나 공급자 연결은 설정에 따라 달라서 운영 활성 여부는 확인하지 못했습니다.",
          "An exported file is a copy outside the browser and survives site-data deletion, but losing the file is the same loss. A personal-cloud upload path exists in code, but provider connection depends on configuration and I could not confirm it is active in production.",
        ),
      },
    ],
    pitfall: t(
      "‘영구 보관을 받으면 안전하다’고 말하지 마세요. 사용자가 사이트 데이터를 지우거나 기기를 잃으면 사라집니다. 10 MB·100 MB·64 MiB·80%/95% 같은 값은 코드 상수이며 브라우저의 실제 quota와는 무관한 제품 정책입니다. 코드의 순서는 ‘Safe Mode 진입 → 회수 → 성공 시 사유 해제’입니다.",
      "Do not say persistence makes data safe: it is lost if the user clears site data or loses the device. Values such as 10 MB, 100 MB, 64 MiB and 80%/95% are code constants and product policy, unrelated to the browser’s real quota. The order in code is enter Safe Mode, reclaim, then clear the reason on success.",
    ),
  },
  technologies: ["OPFS", "Service Worker", "IndexedDB", "Google Drive", "Dropbox", "OneDrive"],
  facts: [
    { value: "10,000,000 B", label: t("에셋 저장소가 항상 남겨 두는 여유(이 밑이면 새 자산 거절)", "Reserve the asset store always keeps (new assets are refused below it)"), source: `${CREATOR}/studio-opfs-asset-store.ts` },
    { value: "64 MiB", label: t("복구 저널의 쿼터 예약 크기", "Quota reserve of the recovery journal"), source: `${CREATOR}/studio-opfs-recovery-journal.ts` },
    { value: "90%", label: t("사용률이 이 값 이상이면 오프라인 자동 준비를 건너뜀", "Offline auto-preparation is skipped at or above this use"), source: `${CREATOR}/offline/studio-offline-automation.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const FILE_SYSTEM_ACCESS_RESAVE: EngineeringAtlasEntry = {
  id: "file-system-access-resave",
  category: "local-first",
  name: "File System Access API",
  title: t("같은 파일에 다시 저장하기", "Saving back to the same file"),
  status: "live",
  tagline: t(
    "고른 파일을 기억해 다음 저장은 묻지 않고 덮어쓰고, 지원하지 않으면 다운로드로 내려갑니다.",
    "It remembers the chosen file, overwrites it next time without asking, and falls back to a download where unsupported.",
  ),
  background: [
    t(
      "브라우저의 기본 저장은 ‘다운로드’입니다. 저장할 때마다 다운로드 폴더에 사본이 쌓이고 같은 파일을 덮어쓸 수 없습니다. 원고처럼 같은 파일을 계속 갱신하고 싶을 때는 불편하지요. File System Access API는 사용자가 고른 실제 파일을 열어 둘 수 있게 해 주어, 위치를 한 번 정하면 다음부터는 ‘저장’만 눌러도 그 파일이 갱신됩니다. 이 파일은 브라우저 밖 사본이라 백업의 역할도 합니다.",
      "Saving in a browser normally means ‘download’. Every save piles another copy into the downloads folder, and an existing file cannot be overwritten, which is awkward for a manuscript that keeps changing. The File System Access API lets a page keep a real file the user chose, so after choosing a location once, pressing ‘save’ updates that same file. Because it is a copy outside the browser, it also acts as a backup.",
    ),
    t(
      "동작: ① 저장을 누르는 순간(사용자 제스처 안에서) 먼저 저장 위치 선택창을 엽니다. 비싼 스냅샷 수집은 그 뒤에 합니다. ② 고른 파일 핸들은 IndexedDB(toonstudio-fs-handles)에 저장해 다음에 재사용합니다. ③ 재사용할 때는 쓰기 권한을 다시 확인하고, 회수됐으면 핸들을 지운 뒤 호출부의 폴백(다운로드)에 맡깁니다. ④ 사용자가 선택창을 취소하면 실패가 아니라 ‘취소’로 다루어 다운로드를 강행하지 않습니다.",
      "How it works: ① The location picker opens first, inside the click that started the save; the expensive snapshot collection comes after. ② The chosen file handle is kept in IndexedDB (toonstudio-fs-handles) for reuse. ③ On reuse, write permission is checked again, and if it was revoked the handle is deleted and the caller’s fallback (download) takes over. ④ If the user cancels the picker, that counts as ‘cancelled’, not a failure, and no download is forced.",
    ),
    t(
      "대안은 어디서나 되는 앵커 다운로드지만 덮어쓰기가 불가능합니다. 저장 선택기는 주로 Chromium 계열 데스크톱 브라우저에서 제공되는 것으로 알려져 있어(MDN에서 재확인 권장), 기능이 없으면 다운로드로 자동 강등합니다. 어느 쪽이든 같은 파일을 만들고, 호출자는 결과(파일 핸들·다운로드·취소)를 구분해 받습니다.",
      "The alternative is an anchor download that works everywhere but cannot overwrite. The save picker is known to ship mainly in Chromium-based desktop browsers (worth re-checking on MDN), so without it the app falls back to a download automatically. Either way the same file is produced, and the caller receives the outcome (file handle, download or cancelled).",
    ),
    t(
      "한계: 핸들과 권한은 브라우저가 관리해 언제든 회수될 수 있고, 파일 열기·폴더 선택기의 실사용은 코드에서 확인하지 못했습니다(탐지 코드만 있음). 또 저장 파일의 확장자는 코드가 .toonstudio인데 화면 문구는 .toonproject.zip 사본이라고 안내해서, 발표 전에 용어를 하나로 맞춰야 합니다.",
      "Limits: handles and permissions are managed by the browser and can be revoked at any time, and I could not confirm real use of the open-file and folder pickers in code (only detection). The saved file’s extension is .toonstudio in code, yet the screen text speaks of a .toonproject.zip copy, so the term should be unified before presenting.",
    ),
  ],
  keyPoints: [
    t("선택창은 클릭 안에서 먼저 연다(비싼 작업은 그 뒤에)", "Open the picker first, inside the click; heavy work comes after"),
    t("고른 파일 핸들을 기억해 다음엔 묻지 않고 덮어씀", "The chosen handle is remembered and overwritten without asking"),
    t("취소는 실패가 아니다 — 다운로드를 강행하지 않음", "Cancel is not failure — no download is forced"),
    t("미지원·권한 회수면 다운로드로 강등", "Unsupported or revoked falls back to a download"),
  ],
  diagram: {
    id: "file-system-access-resave-diagram",
    kind: "sequence",
    title: t("처음 저장하고, 다음엔 묻지 않기", "First save, then no more questions"),
    caption: t(
      "처음에는 클릭 안에서 선택창을 열어 핸들을 기억하고, 다음 저장부터는 권한만 확인해 같은 파일을 덮어씁니다.",
      "The first save opens the picker inside the click and remembers the handle; later saves only check permission and overwrite the same file.",
    ),
    alt: t(
      "사용자가 저장을 누르면 저장 코드가 곧바로 선택창을 열고, 사용자가 파일을 고르면 핸들을 보관소에 저장하고 파일에 씁니다. 다음 저장에서는 보관소의 핸들과 권한을 확인해 묻지 않고 같은 파일을 덮어쓰며, 지원하지 않는 브라우저에서는 다운로드로 내려갑니다.",
      "When the user presses save, the save code immediately opens the picker; after the user picks a file, the handle is stored and the file is written. On the next save the stored handle and permission are checked and the same file is overwritten without asking; in browsers without support it falls back to a download.",
    ),
    actors: [
      { id: "user", label: t("사용자", "User"), tone: "neutral" },
      { id: "code", label: t("저장 코드", "Save code"), sub: t("페이지 안", "In the page"), tone: "local" },
      { id: "store", label: t("핸들 보관소", "Handle store"), sub: t("IndexedDB", "IndexedDB"), tone: "local" },
      { id: "file", label: t("내 파일", "My file"), sub: t("디스크", "On disk"), tone: "good" },
    ],
    messages: [
      { from: "user", to: "code", label: t("‘저장’ 클릭", "Click ‘Save’"), note: t("사용자 제스처 안에서 바로", "Straight away inside the gesture") },
      { from: "code", to: "user", label: t("저장 위치 선택창", "Save-location picker"), note: t("취소하면 ‘취소’, 다운로드 안 함", "Cancel means ‘cancelled’, no download") },
      { from: "user", to: "code", label: t("파일 선택", "Pick a file"), style: "dashed" },
      { from: "code", to: "store", label: t("핸들 저장(프로젝트별 키)", "Store the handle (per project)") },
      { from: "code", to: "file", label: t("쓰고 닫기", "Write and close"), note: t("close()에서 원자적으로 교체", "Swapped atomically on close()") },
      { from: "user", to: "code", label: t("다음 ‘저장’ 클릭", "Next ‘Save’ click") },
      { from: "code", to: "store", label: t("핸들과 쓰기 권한 확인", "Check handle and permission"), note: t("회수됐으면 핸들 삭제", "A revoked handle is deleted") },
      { from: "code", to: "file", label: t("묻지 않고 덮어쓰기", "Overwrite without asking") },
      { from: "code", to: "code", label: t("미지원이면 다운로드", "Unsupported: download"), note: t("앵커 download 로 강등", "Falls back to an anchor download") },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 · 프로젝트 패키지 저장", "Studio · saving the project package"),
      role: t(
        "프로젝트 키로 파일 핸들을 기억해 같은 .toonstudio 패키지에 다시 저장하고, 선택창은 무거운 스냅샷 수집보다 먼저 엽니다.",
        "Remembers a file handle per project to save into the same .toonstudio package, and opens the picker before heavy snapshot collection.",
      ),
      paths: [`${CREATOR}/save-first/studio-project-package.ts#chooseStudioProjectPackageSaveTarget`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 내보내기", "Studio · exports"),
      role: t(
        "내보내기 Blob을 고른(또는 기억한) 파일에 저장하고, 취소는 취소로 돌려주며, 실패하거나 지원하지 않을 때만 다운로드로 폴백합니다.",
        "Saves an export blob to the chosen (or remembered) file, reports cancel as cancel, and falls back to a download only on failure or lack of support.",
      ),
      paths: [`${CREATOR}/export/studio-export.ts#saveExportBlob`],
      route: "/studio",
    },
    {
      feature: t("공용 래퍼 · 핸들 영속과 권한", "Shared wrapper · handle persistence and permission"),
      role: t(
        "능력 감지, 핸들의 IndexedDB 영속, 권한 확인, ‘저장된 핸들 → 선택기’ 순서의 저장 흐름을 한곳에서 제공합니다.",
        "Provides capability detection, IndexedDB persistence of handles, permission checks and the ‘stored handle, then picker’ save flow in one place.",
      ),
      paths: [`${SHARED_LIB}/file-system-access.ts#saveBlobWithFilePicker`],
    },
    {
      feature: t("스튜디오 · 파일 센터 안내", "Studio · file center guidance"),
      role: t(
        "‘브라우저 보관 상태는 서버 저장 성공을 뜻하지 않으니 장기 보관에는 사본을 함께 남기라’고 화면에서 안내합니다.",
        "Tells users on screen that browser-kept state does not mean a server save succeeded and to keep a copy for long-term storage.",
      ),
      paths: [`${CREATOR}/StudioFileControlCenter.tsx`],
      route: "/studio",
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("선택기로 저장하고 안 되면 다운로드", "Save with the picker, else download"),
      language: "ts",
      ...sampleLines([
        "type PickerWindow = Window & { showSaveFilePicker?: (o: { suggestedName: string }) => Promise<FileSystemFileHandle> };",
        "",
        'export async function saveBlob(blob: Blob, name: string): Promise<"picker" | "download" | "cancelled"> {',
        "  const w = window as PickerWindow;",
        '  if (typeof w.showSaveFilePicker === "function") {',
        ["    try { // 선택기는 사용자 제스처 안에서 가장 먼저 연다", "    try { // open the picker first, inside the user gesture"],
        "      const out = await (await w.showSaveFilePicker({ suggestedName: name })).createWritable();",
        "      await out.write(blob);",
        "      await out.close();",
        '      return "picker";',
        '    } catch (e) { if (e instanceof DOMException && e.name === "AbortError") return "cancelled"; } // 취소 ≠ 실패',
        "  }",
        '  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });',
        "  a.click();",
        "  setTimeout(() => URL.revokeObjectURL(a.href), 0);",
        ['  return "download"; // 미지원/실패: 앵커 다운로드로 강등', '  return "download"; // unsupported or failed: fall back to an anchor download'],
        "}",
      ]),
      explain: t(
        "선택창에서 사용자가 취소하면 AbortError가 오므로, 이를 실패와 구분해 ‘cancelled’를 돌려줍니다. 취소한 사용자에게 다운로드까지 강행하면 의도를 어기는 것입니다.",
        "Cancelling the picker raises AbortError, which is separated from failure and returned as ‘cancelled’. Forcing a download on a user who just cancelled would defy their intent.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("기억한 핸들의 쓰기 권한 확인", "Checking write permission of a remembered handle"),
      language: "ts",
      source: `${SHARED_LIB}/file-system-access.ts`,
      ...sampleLines([
        "type Handle = FileSystemFileHandle & {",
        '  queryPermission?(descriptor: { mode: "readwrite" }): Promise<PermissionState>;',
        '  requestPermission?(descriptor: { mode: "readwrite" }): Promise<PermissionState>;',
        "};",
        "",
        "export async function canWrite(handle: Handle): Promise<boolean> {",
        '  const current = await handle.queryPermission?.({ mode: "readwrite" }).catch(() => null);',
        '  if (current === "granted") return true;',
        ["  if (typeof handle.requestPermission !== \"function\") return current === undefined; // 권한 API가 없는 핸들은 방금 고른 것으로 본다", "  if (typeof handle.requestPermission !== \"function\") return current === undefined; // a handle without the permission API is treated as just picked"],
        "  try {",
        ['    return (await handle.requestPermission({ mode: "readwrite" })) === "granted"; // 클릭(제스처) 안에서만 성공', '    return (await handle.requestPermission({ mode: "readwrite" })) === "granted"; // succeeds only inside a click (gesture)'],
        "  } catch {",
        "    return false;",
        "  }",
        "}",
      ]),
      explain: t(
        "이미 허용돼 있으면 묻지 않고 쓰고, 아니면 사용자 제스처 안에서 권한을 요청합니다. 회수되었거나 거부되면 호출자가 핸들을 지우고 다운로드로 내려가도록 false를 돌려줍니다.",
        "If permission is already granted it writes without asking; otherwise it asks inside a user gesture. If revoked or denied it returns false so the caller can drop the handle and fall back to a download.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · File System API", url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API", kind: "docs" },
    { title: "Chrome · The File System Access API", url: "https://developer.chrome.com/docs/capabilities/web-apis/file-system-access", kind: "guide", note: t("저장 선택기와 핸들 영속 가이드", "A guide to the save picker and persisted handles") },
    { title: "MDN · Window.showSaveFilePicker()", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker", kind: "docs" },
    { title: "WICG · File System Access", url: "https://wicg.github.io/file-system-access/", kind: "spec" },
    { title: "MDN · FileSystemFileHandle.createWritable()", url: "https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable", kind: "docs" },
  ],
  chapterIds: ["storage", "browser-local-compute"],
  talk: {
    pitch: t(
      "브라우저의 기본 저장은 다운로드라서 저장할 때마다 사본이 쌓입니다. ToonStudio는 File System Access API로 사용자가 고른 실제 파일을 기억해, 다음 저장부터는 묻지 않고 같은 파일을 갱신합니다. 이 API가 없는 브라우저에서는 다운로드로 자동으로 내려가고, 사용자가 선택창을 취소하면 다운로드를 강행하지 않습니다. 그 파일은 브라우저 밖 사본이라 백업 역할도 합니다.",
      "Saving in a browser means downloading, so copies pile up. ToonStudio uses the File System Access API to remember a real file the user picked and update that same file on later saves without asking. Browsers without the API fall back to a download automatically, and if the user cancels the picker no download is forced. That file is a copy outside the browser, so it doubles as a backup.",
    ),
    analogy: t(
      "책상 위 같은 서류철에 계속 새 쪽을 끼워 넣는 것과, 매번 복사본을 새 봉투에 담아 서랍에 쌓는 것의 차이입니다.",
      "It is the difference between always filing new pages into the same folder on your desk and sealing a fresh copy into a new envelope for the drawer every time.",
    ),
    questions: [
      {
        question: t("사파리나 파이어폭스에서도 되나요?", "Does it work in Safari or Firefox?"),
        answer: t(
          "저장 선택기는 주로 Chromium 계열 데스크톱에서 제공되는 것으로 알려져 있어, 지원하지 않으면 다운로드로 자동 강등합니다. 정확한 지원 현황은 발표 전에 MDN에서 다시 확인하세요.",
          "The save picker is known to be offered mainly in Chromium-based desktop browsers, so otherwise the app falls back to a download automatically. Re-check the exact support on MDN before presenting.",
        ),
      },
      {
        question: t("파일 권한을 잃으면요?", "What if permission is lost?"),
        answer: t(
          "권한이 회수된 핸들은 지우고 이번 저장은 다운로드 폴백에 맡깁니다. 사용자는 다음에 새 위치를 고르면 됩니다.",
          "A handle whose permission was revoked is deleted and this save goes to the download fallback. The user simply picks a new location next time.",
        ),
      },
      {
        question: t("왜 선택창을 맨 먼저 여나요?", "Why open the picker first?"),
        answer: t(
          "브라우저는 선택창을 클릭 같은 사용자 제스처 안에서만 열어 줍니다. 대형 문서는 스냅샷을 모으는 데 시간이 걸려서, 먼저 위치를 정하고 나중에 모아 쓰는 순서로 만들었습니다.",
          "Browsers open the picker only inside a user gesture such as a click. Large documents take time to snapshot, so the location is chosen first and the data is collected and written afterwards.",
        ),
      },
    ],
    pitfall: t(
      "‘모든 브라우저에서 같은 파일에 덮어쓴다’고 말하지 마세요. 지원하지 않는 브라우저는 다운로드입니다. 열기·폴더 선택기의 실사용은 코드에서 확인하지 못했습니다. 저장 확장자는 코드 기준 .toonstudio이고 화면 문구는 .toonproject.zip 사본이라 용어를 맞춰야 합니다. 이 파일은 백업의 한 형태일 뿐, 파일을 잃으면 복구할 수 없습니다.",
      "Do not say the same file is overwritten in every browser; unsupported browsers download instead. I could not confirm real use of the open-file and folder pickers in code. The saved extension is .toonstudio in code while the screen text says a .toonproject.zip copy, so the terms need aligning. The file is one form of backup only; if it is lost it cannot be recovered.",
    ),
  },
  technologies: ["File System Access API", "IndexedDB", "OPFS"],
  facts: [
    { value: "toonstudio-fs-handles", label: t("파일 핸들을 보관하는 IndexedDB 이름", "Name of the IndexedDB that keeps file handles"), source: `${SHARED_LIB}/file-system-access.ts` },
    { value: ".toonstudio", label: t("프로젝트 패키지 저장 확장자(코드 기준)", "Project package extension in code"), source: `${CREATOR}/save-first/studio-project-package.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const WEB_APP_MANIFEST_INSTALL_IDENTITY: EngineeringAtlasEntry = {
  id: "web-app-manifest-install-identity",
  category: "local-first",
  name: "Web App Manifest",
  title: t("앱처럼 설치되는 두 개의 정체성", "Two install identities for an app-like experience"),
  status: "live",
  tagline: t(
    "메인 앱과 ‘툰드로잉’이 서로 다른 id·시작 주소·바로가기로 따로 설치됩니다.",
    "The main app and ‘Toon Draw’ install separately, each with its own id, start URL and shortcuts.",
  ),
  background: [
    t(
      "웹앱 매니페스트는 ‘이 사이트를 앱으로 설치하면 이름·아이콘·시작 화면은 무엇인가’를 적은 신분증(JSON 파일)입니다. 이것이 있으면 브라우저가 설치를 제안하고, 설치한 앱은 주소창 없이 독립 창으로 열리며, 아이콘을 길게 누르면 ‘새 작품’ 같은 바로가기가 나옵니다. 그림 도구에서는 브라우저 탭을 찾아 들어가는 수고가 줄어드는 만큼 체감 차이가 큽니다.",
      "A web app manifest is an identity card (a JSON file) saying what name, icon and start screen the site has when installed as an app. With it, the browser offers installation, the installed app opens in its own window without an address bar, and a long press on the icon shows shortcuts such as ‘New work’. For a drawing tool, not having to hunt for a browser tab makes a noticeable difference.",
    ),
    t(
      "메인 매니페스트는 id ‘/’, 시작 주소 /studio, display standalone을 쓰고, display_override로 창 컨트롤 오버레이 → standalone → minimal-ui 순서를 제안합니다. 바로가기는 4개(새 작품·2D·3D·연재 준비), 스크린샷은 데스크톱·모바일 2장, 아이콘은 일반 3종과 maskable 2종입니다. 설치 이벤트(beforeinstallprompt, appinstalled)는 앱 진입 즉시 붙잡아 두었다가 사용자가 버튼을 누를 때 설치창을 띄우고, iOS처럼 이벤트가 없으면 ‘홈 화면에 추가’를 안내합니다.",
      "The main manifest uses id ‘/’, start URL /studio and display standalone, and proposes display_override in the order window-controls-overlay, standalone, minimal-ui. It declares four shortcuts (new work, 2D, 3D, publishing prep), two screenshots (desktop and mobile) and five icons (three regular, two maskable). The install events (beforeinstallprompt, appinstalled) are captured as soon as the app starts and the install dialog is shown when the user presses a button; where no event exists, as on iOS, a ‘Add to Home Screen’ guide is shown.",
    ),
    t(
      "설치 정체성이 둘입니다. 메인 앱(id ‘/’)과 별도로 /draw-app 매니페스트(id ‘/draw-app’)가 있어 ‘툰드로잉’으로 따로 설치할 수 있고, 시작 주소는 캔버스 중심 모드(drawingShell=app&uiMode=focus…)입니다. 같은 스튜디오 엔진을 다른 신분증으로 여는 방식입니다. 반대로 file_handlers, share_target, launch_handler 같은 고급 항목은 두 매니페스트에 선언돼 있지 않습니다.",
      "There are two install identities. Besides the main app (id ‘/’), a /draw-app manifest (id ‘/draw-app’) lets users install ‘Toon Draw’ separately, starting in a canvas-first mode (drawingShell=app&uiMode=focus and so on). It opens the same studio engine under a different identity card. Advanced members such as file_handlers, share_target and launch_handler are not declared in either manifest.",
    ),
    t(
      "주의: index.html이 연결하는 매니페스트는 /brand/spectrum-ribbon-v2/manifest.webmanifest인데, 루트 /manifest.webmanifest와 내용이 같습니다(2026-10-07 diff로 확인). 테스트는 루트 사본만 전수 검사하므로 두 파일이 갈라질 위험이 있습니다. 또 display_override 첫 항목이 창 컨트롤 오버레이인데 이를 위한 env(titlebar-area-*) CSS가 코드에 없어, 그 모드에서 상단 UI가 겹치는지는 실기로 확인하지 못했습니다.",
      "Note: the manifest linked from index.html is /brand/spectrum-ribbon-v2/manifest.webmanifest, and it is identical to the root /manifest.webmanifest (confirmed with a diff on 2026-10-07). The tests check only the root copy in full, so the two could drift apart. Also display_override lists window-controls-overlay first, yet no env(titlebar-area-*) CSS exists in the code, and I could not check on a real device whether the top UI overlaps in that mode.",
    ),
  ],
  keyPoints: [
    t("메인 앱(id /)과 툰드로잉(id /draw-app), 설치 정체성이 둘", "Main app (id /) and Toon Draw (id /draw-app): two install identities"),
    t("바로가기 4개·스크린샷 2장·display_override로 앱답게", "Four shortcuts, two screenshots and display_override feel app-like"),
    t("설치 이벤트는 앱 진입 즉시 붙잡고, iOS는 수동 안내", "Install events are captured at startup; iOS gets a manual guide"),
  ],
  diagram: {
    id: "web-app-manifest-install-identity-diagram",
    kind: "graph",
    title: t("하나의 엔진, 두 개의 신분증", "One engine, two identity cards"),
    caption: t(
      "두 매니페스트가 서로 다른 id와 시작 주소로 두 앱을 설치하지만, 열리는 곳은 같은 /studio 엔진입니다.",
      "Two manifests install two apps with different IDs and start URLs, yet both open the same /studio engine.",
    ),
    alt: t(
      "index.html이 연결한 메인 매니페스트는 id가 슬래시이고 시작 주소가 /studio인 툰스튜디오 앱을 설치합니다. draw-app 설치 페이지가 연결한 드로잉 매니페스트는 id가 /draw-app인 툰드로잉 앱을 설치합니다. 두 앱 모두 같은 /studio 엔진으로 열립니다.",
      "The main manifest linked from index.html installs the ToonStudio app with id slash and start URL /studio. The drawing manifest linked from the draw-app install page installs Toon Draw with id /draw-app. Both apps open the same /studio engine.",
    ),
    nodes: [
      { id: "index", label: t("index.html", "index.html"), sub: t("link rel=manifest", "link rel=manifest"), tone: "neutral", at: [0, 0] },
      { id: "main", label: t("메인 매니페스트", "Main manifest"), sub: t("id / · 바로가기 4 · 스크린샷 2", "id /, 4 shortcuts, 2 screenshots"), tone: "local", at: [1, 0] },
      { id: "app", label: t("툰스튜디오 앱", "ToonStudio app"), sub: t("시작: /studio", "Starts at /studio"), tone: "good", at: [2, 0] },
      { id: "install", label: t("draw-app 설치 페이지", "draw-app install page"), sub: t("/draw-app/install.html", "/draw-app/install.html"), tone: "neutral", at: [0, 2] },
      { id: "draw", label: t("드로잉 매니페스트", "Drawing manifest"), sub: t("id /draw-app · 바로가기 2", "id /draw-app, 2 shortcuts"), tone: "local", at: [1, 2] },
      { id: "drawapp", label: t("툰드로잉 앱", "Toon Draw app"), sub: t("시작: 포커스 드로잉 모드", "Starts in focus drawing mode"), tone: "good", at: [2, 2] },
      { id: "engine", label: t("같은 /studio 엔진", "The same /studio engine"), sub: t("한 번 만든 편집기", "One editor, built once"), tone: "local", shape: "cylinder", at: [3, 1] },
    ],
    edges: [
      { from: "index", to: "main", label: t("연결", "link") },
      { from: "main", to: "app", label: t("설치", "install") },
      { from: "install", to: "draw", label: t("연결", "link") },
      { from: "draw", to: "drawapp", label: t("설치", "install") },
      { from: "app", to: "engine", label: t("열기", "opens") },
      { from: "drawapp", to: "engine", label: t("열기", "opens") },
    ],
    groups: [
      { id: "main-id", label: t("정체성 1 (id /)", "Identity 1 (id /)"), tone: "local", nodeIds: ["index", "main", "app"] },
      { id: "draw-id", label: t("정체성 2 (id /draw-app)", "Identity 2 (id /draw-app)"), tone: "local", nodeIds: ["install", "draw", "drawapp"] },
    ],
  },
  usage: [
    {
      feature: t("전 사이트 · 설치 가능한 PWA", "Whole site · an installable PWA"),
      role: t(
        "메인 매니페스트가 이름·아이콘·시작 주소(/studio)·바로가기 4개·스크린샷 2장·display_override를 선언하고, index.html이 이를 연결합니다.",
        "The main manifest declares the name, icons, start URL (/studio), four shortcuts, two screenshots and display_override, and index.html links it.",
      ),
      paths: ["apps/web/index.html", "apps/web/public/brand/spectrum-ribbon-v2/manifest.webmanifest", "apps/web/public/manifest.webmanifest"],
      route: "/",
    },
    {
      feature: t("툰드로잉 설치", "Installing Toon Draw"),
      role: t(
        "id가 다른 매니페스트와 전용 설치 페이지로 캔버스 중심 앱을 따로 설치하게 합니다. 바로가기는 ‘드로잉 스튜디오’와 ‘전체 툰스튜디오’ 2개입니다.",
        "A manifest with a different id and a dedicated install page let users install the canvas-first app separately, with two shortcuts: ‘Drawing studio’ and ‘Full ToonStudio’.",
      ),
      paths: ["apps/web/public/draw-app/manifest.webmanifest", "apps/web/public/draw-app/install.html", "apps/web/public/draw-app/install.js"],
      route: "/draw-app/install.html",
    },
    {
      feature: t("설치 안내 UI", "Install guidance UI"),
      role: t(
        "beforeinstallprompt·appinstalled·display-mode를 앱 진입 즉시 캡처해 설치 가능·설치됨·수동 안내(iOS) 상태를 화면에 알립니다.",
        "Captures beforeinstallprompt, appinstalled and display-mode at startup and reports installable, installed or manual-guide (iOS) states.",
      ),
      paths: [`${SHARED_LIB}/pwa-install-store.ts`, "apps/web/src/app/main.tsx"],
    },
    {
      feature: t("품질 게이트 · 매니페스트 검증", "Quality gate · manifest checks"),
      role: t(
        "아이콘·바로가기·스크린샷 파일이 실제로 있는지 루트 매니페스트 사본으로 전수 검사합니다.",
        "Checks in full that icon, shortcut and screenshot files exist, against the root copy of the manifest.",
      ),
      paths: [`${SHARED_LIB}/__tests__/pwa-manifest.test.ts`],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("툰드로잉 매니페스트의 정체성 필드", "Identity fields of the Toon Draw manifest"),
      language: "json",
      source: "apps/web/public/draw-app/manifest.webmanifest",
      code: [
        "{",
        '  "id": "/draw-app",',
        '  "name": "툰스튜디오 드로잉 · ToonStudio Draw",',
        '  "short_name": "툰드로잉",',
        '  "start_url": "/studio?drawingShell=app&uiMode=focus&startTool=draw&source=pwa",',
        '  "scope": "/",',
        '  "display": "standalone",',
        '  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],',
        '  "shortcuts": [',
        '    { "name": "드로잉 스튜디오", "url": "/studio?drawingShell=app&uiMode=focus&startTool=draw" },',
        '    { "name": "전체 툰스튜디오", "url": "/studio?drawingShell=integrated" }',
        "  ]",
        "}",
      ].join("\n"),
      explain: t(
        "id가 설치 정체성을 정합니다. 같은 scope(/) 안에서도 id가 다르면 브라우저는 서로 다른 앱으로 설치합니다. start_url에 붙은 쿼리가 같은 엔진을 캔버스 중심 모드로 엽니다.",
        "The id decides the install identity: within the same scope (/), a different id is installed as a different app. The query on start_url opens the same engine in canvas-first mode.",
      ),
    },
    {
      kind: "teaching",
      title: t("설치 이벤트를 앱 시작 때 붙잡기", "Capturing the install event at startup"),
      language: "ts",
      ...sampleLines([
        "type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: \"accepted\" | \"dismissed\" }> };",
        "let deferred: InstallEvent | null = null;",
        "",
        ['addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; }); // 앱 진입 즉시 붙잡아 둔다', 'addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; }); // capture it as soon as the app starts'],
        'addEventListener("appinstalled", () => { deferred = null; });',
        "",
        'export const isStandalone = (): boolean => matchMedia("(display-mode: standalone)").matches;',
        "",
        ["export async function install(): Promise<boolean> { // 버튼 클릭 핸들러 안에서 부른다", "export async function install(): Promise<boolean> { // call it inside a button click handler"],
        ["  if (!deferred) return false; // iOS 등 이벤트가 없는 환경은 수동 안내 UI로 대체", "  if (!deferred) return false; // where no event exists (iOS and others), show a manual guide instead"],
        "  await deferred.prompt();",
        '  return (await deferred.userChoice).outcome === "accepted";',
        "}",
      ]),
      explain: t(
        "beforeinstallprompt는 한 번만 오므로 앱이 뜨자마자 잡아 두어야 하고, 설치창은 사용자의 클릭이 있을 때 띄웁니다. display-mode 미디어 쿼리로 이미 설치된 앱 창인지도 알 수 있습니다.",
        "beforeinstallprompt fires only once, so it must be caught as soon as the app starts, and the dialog is shown on a user click. The display-mode media query also tells whether the window is already an installed app.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · Web app manifest", url: "https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest", kind: "docs" },
    { title: "web.dev · Installation criteria", url: "https://web.dev/articles/install-criteria", kind: "guide", note: t("설치 제안이 뜨는 조건", "What makes a browser offer installation") },
    { title: "W3C · Web Application Manifest", url: "https://www.w3.org/TR/appmanifest/", kind: "spec" },
    { title: "MDN · Manifest shortcuts", url: "https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts", kind: "docs" },
    { title: "MDN · Window Controls Overlay API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API", kind: "docs", note: t("display_override 첫 항목이 가리키는 기능", "The feature display_override lists first") },
    { title: "MDN · beforeinstallprompt event", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event", kind: "docs" },
  ],
  chapterIds: ["pwa-continuity"],
  talk: {
    pitch: t(
      "웹앱 매니페스트는 사이트를 앱으로 설치할 때의 신분증입니다. ToonStudio는 이름·아이콘·시작 주소와 함께 바로가기 4개와 스크린샷을 선언했고, 메인 앱과 별개로 캔버스 중심의 ‘툰드로잉’을 다른 id로 따로 설치할 수 있게 했습니다. 두 앱은 같은 스튜디오 엔진을 열 뿐 코드가 둘로 갈라진 것이 아닙니다.",
      "A web app manifest is the identity card for installing a site as an app. ToonStudio declares a name, icons and start URL along with four shortcuts and screenshots, and also lets users install a canvas-first ‘Toon Draw’ separately under a different id. The two apps simply open the same studio engine; the code is not forked.",
    ),
    analogy: t(
      "한 건물에 정문과 작업실 전용 출입구가 따로 있는 것과 같습니다. 출입증(id)이 다르면 별개의 방문자로 기록되지만 들어가는 곳은 같은 작업실입니다.",
      "Like one building with a main entrance and a separate studio-only door. Different passes (ids) are logged as different visitors, but both lead into the same studio.",
    ),
    questions: [
      {
        question: t("앱스토어에 올리는 건가요?", "Is this an app-store listing?"),
        answer: t(
          "아닙니다. 브라우저가 매니페스트를 보고 제안하는 설치(PWA)입니다. 모바일 앱 셸(Capacitor)이 따로 있지만 원격 웹을 그대로 싣는 얇은 껍데기로 알려져 있고, 그쪽 동작은 이 카드에서 검증하지 않았습니다.",
          "No. This is browser-offered installation (a PWA) driven by the manifest. A separate mobile shell (Capacitor) exists but is known to be a thin wrapper around the remote web app, and I did not verify its behavior in this card.",
        ),
      },
      {
        question: t("왜 매니페스트가 둘인가요?", "Why two manifests?"),
        answer: t(
          "하나는 전체 제작 스튜디오, 하나는 캔버스 중심 드로잉이라는 서로 다른 시작 경험을 별개의 앱으로 설치할 수 있게 하려는 것입니다. id가 다르면 브라우저가 서로 다른 앱으로 취급합니다.",
          "One is the full production studio and the other a canvas-first drawing experience, so each can be installed as its own app. A different id makes the browser treat them as different apps.",
        ),
      },
      {
        question: t("iOS에서는 설치 버튼이 없나요?", "No install button on iOS?"),
        answer: t(
          "beforeinstallprompt 이벤트가 없는 환경에서는 ‘홈 화면에 추가’를 안내하는 수동 UI를 보여 줍니다.",
          "Where the beforeinstallprompt event is absent, a manual UI explains how to use ‘Add to Home Screen’.",
        ),
      },
    ],
    pitfall: t(
      "‘창 컨트롤 오버레이를 지원한다’고 말하지 마세요. 선언만 했고 관련 CSS(env(titlebar-area-*))는 코드에 없어 실기 확인이 안 됐습니다. 매니페스트 파일이 루트와 brand 폴더에 두 벌인 점과, 테스트가 루트 사본만 검사한다는 점도 위험 요소입니다. 설치 가능 여부는 브라우저별 조건에 달려 있습니다.",
      "Do not say window-controls-overlay is supported: it is declared, but no related CSS (env(titlebar-area-*)) exists and it was not checked on a device. The manifest existing twice, at the root and in the brand folder, with tests covering only the root copy is also a risk. Whether installation is offered depends on each browser’s criteria.",
    ),
  },
  technologies: ["Web App Manifest", "Service Worker", "Window Controls Overlay"],
  facts: [
    { value: "4 · 2 · 5", label: t("메인 매니페스트의 바로가기 · 스크린샷 · 아이콘 수", "Main manifest: shortcuts, screenshots and icons"), source: "apps/web/public/brand/spectrum-ribbon-v2/manifest.webmanifest" },
    { value: "/ · /draw-app", label: t("두 설치 정체성의 id", "The ids of the two install identities"), source: "apps/web/public/draw-app/manifest.webmanifest" },
  ],
  reviewedAt: "2026-10-07",
};

export const VERIFIED_LOCALSTORAGE_TO_IDB_MIGRATION: EngineeringAtlasEntry = {
  id: "verified-localstorage-to-idb-migration",
  category: "local-first",
  name: "Verified migration",
  title: t("검증이 끝나기 전엔 지우지 않는 데이터 이사", "A data move that deletes nothing until verified"),
  status: "live",
  tagline: t(
    "읽고, 쓰고, 다시 읽어 같을 때만 옛 키를 지워서, 이사 중 사고가 나도 옛 사본이 남습니다.",
    "Read, write, read back, and delete the old key only if they match, so a mishap mid-move leaves the old copy in place.",
  ),
  background: [
    t(
      "localStorage는 작고(보통 수 MB) 읽고 쓸 때 화면이 멈추는 동기식 저장소입니다. 캐릭터 설정집처럼 이미지가 붙어 자라는 문서는 이 한도에 먼저 닿아, 한동안 이미지를 512px로 줄여 버티기도 했습니다. IndexedDB는 훨씬 크고 비동기라 이런 문서에 맞지만, 이삿짐을 옮기다 사고가 나면 유일한 사본을 잃을 수 있습니다. 그래서 ‘새 집에 잘 도착한 것을 확인하기 전에는 옛 집을 비우지 않는’ 이사 절차를 만들었습니다.",
      "localStorage is small (typically a few MB) and synchronous, so the screen can freeze while reading or writing. Documents that grow with attached images, like character canon sheets, hit that limit first, and for a while images were shrunk to 512px to cope. IndexedDB is far larger and asynchronous, which suits them, but an accident mid-move can lose the only copy. So a moving procedure was built that never empties the old house before the new one is confirmed.",
    ),
    t(
      "절차는 네 걸음입니다. ① 옛 localStorage 값을 읽고 ② IndexedDB에 쓴 뒤 ③ 다시 읽어 같은 값인지 비교하고 ④ 같을 때만 옛 키를 지웁니다. IndexedDB에 이미 값이 있으면 그쪽이 최신이므로 낡은 사본만 지웁니다. IndexedDB를 못 쓰거나 비교가 어긋나면 옛 키는 건드리지 않고 다음 실행에서 다시 시도합니다. 모든 연산은 예외 대신 null/false를 돌려줘 호출자가 폴백을 고릅니다.",
      "The procedure has four steps. ① Read the old localStorage value, ② write it to IndexedDB, ③ read it back and compare, ④ delete the old key only if they match. If IndexedDB already holds a value it is the newer one, so only the stale copy is removed. If IndexedDB is unusable or the comparison differs, the old key is left alone and retried on the next run. Every operation returns null or false instead of throwing, so the caller picks the fallback.",
    ),
    t(
      "모든 데이터를 옮기지는 않습니다. 로그인 세션이나 부팅 초기값처럼 첫 화면에서 동기로 읽어야 하는 작은 값은 localStorage에 남기고, 커져 가는 문서만 IndexedDB로 옮깁니다. 이것은 Studio의 V12 SQLite 저장소와는 별개의 이야기입니다. V12 정책(LEGACY_DATA_MIGRATION=FALSE)은 옛 키를 부팅 때 읽어 SQLite로 옮기지 않는 것이고, 이 도구는 localStorage에서 공용 IndexedDB(toonstudio-kv)로 옮기는 경로에만 쓰입니다.",
      "Not everything is moved. Small values that must be read synchronously on the first screen, like the login session or boot defaults, stay in localStorage, and only growing documents move to IndexedDB. This is separate from Studio’s V12 SQLite storage: the V12 policy (LEGACY_DATA_MIGRATION=FALSE) means old keys are not read into SQLite at boot, while this tool is used only on the path from localStorage to the shared IndexedDB (toonstudio-kv).",
    ),
    t(
      "한계: 이전 도중과 직후에는 두 저장소의 값이 갈라진 중간 상태가 있을 수 있고, 비동기 읽기가 끝나기 전에 도착한 편집을 잃지 않게 하는 일은 쓰는 화면의 몫입니다. 옮길 필요가 없는 작은 값까지 옮기면 복잡도만 늘어납니다. IndexedDB도 브라우저 저장소라 사이트 데이터 삭제에는 취약하므로 내보내기·백업은 여전히 필요합니다.",
      "Limits: during and just after a move the two stores can briefly disagree, and keeping edits that arrive before the asynchronous read finishes is the job of the screen using the helper. Moving small values that need no move only adds complexity. IndexedDB is also browser storage and vulnerable to site-data deletion, so export and backup are still needed.",
    ),
  ],
  keyPoints: [
    t("읽기 → 쓰기 → 다시 읽기 → 같을 때만 옛 키 삭제", "Read, write, read back; delete the old key only if equal"),
    t("IDB에 이미 값이 있으면 그쪽이 최신, 낡은 사본만 삭제", "If IDB already has a value it wins; only the stale copy goes"),
    t("실패하거나 어긋나면 옛 키는 그대로 보존", "On failure or mismatch the old key is preserved"),
  ],
  diagram: {
    id: "verified-localstorage-to-idb-migration-diagram",
    kind: "graph",
    title: t("검증 뒤에만 지우는 이사 절차", "A move that deletes only after verification"),
    caption: t(
      "옛 키는 ‘다시 읽어 같다’는 확인이 끝난 뒤에만 지워지고, 그 밖의 모든 경로에서는 보존됩니다.",
      "The old key is deleted only after the read-back check passes, and is preserved on every other path.",
    ),
    alt: t(
      "localStorage에서 옛 값을 읽고, IndexedDB에 이미 값이 있으면 낡은 사본인 옛 키만 지웁니다. 없으면 IndexedDB에 쓰고 다시 읽어 같은지 비교해, 같으면 옛 키를 지우고 다르거나 쓰기가 실패하면 옛 키를 보존합니다.",
      "The old value is read from localStorage. If IndexedDB already has a value, only the stale old key is removed. Otherwise the value is written to IndexedDB and read back for comparison: if equal, the old key is deleted; if different or the write failed, the old key is kept.",
    ),
    nodes: [
      { id: "read", label: t("localStorage 읽기", "Read localStorage"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "exists", label: t("IDB에 이미?", "Already in IDB?"), tone: "warn", shape: "diamond", at: [1, 1] },
      { id: "stale", label: t("옛 키만 삭제", "Delete old key only"), sub: t("IDB 값이 최신", "The IDB value is newer"), tone: "neutral", at: [1, 0] },
      { id: "write", label: t("IDB에 쓰기", "Write to IDB"), tone: "local", at: [2, 1] },
      { id: "reread", label: t("다시 읽기", "Read it back"), sub: t("쓴 값과 비교", "Compare with the written value"), tone: "local", at: [3, 1] },
      { id: "same", label: t("같은가?", "Equal?"), tone: "warn", shape: "diamond", at: [4, 1] },
      { id: "delete", label: t("옛 키 삭제", "Delete old key"), sub: t("검증이 끝난 뒤에만", "Only after verification"), tone: "good", at: [4, 0] },
      { id: "keep", label: t("옛 키 보존", "Keep old key"), sub: t("다음 실행에서 재시도", "Retry on the next run"), tone: "warn", at: [4, 2] },
    ],
    edges: [
      { from: "read", to: "exists" },
      { from: "exists", to: "stale", label: t("있음", "yes") },
      { from: "exists", to: "write", label: t("없음", "no") },
      { from: "write", to: "reread" },
      { from: "reread", to: "same" },
      { from: "same", to: "delete", label: t("예", "yes") },
      { from: "same", to: "keep", label: t("아니오", "no"), style: "dashed" },
      { from: "write", to: "keep", label: t("쓰기 실패", "write failed"), style: "dashed" },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 · 캐릭터 캐논 문서", "Studio · character canon documents"),
      role: t(
        "이미지가 붙은 캐릭터 설정집을 localStorage에서 IndexedDB로 검증 후 옮겨, 저장 한도에 걸리지 않게 합니다.",
        "Moves image-laden character canon sheets from localStorage to IndexedDB after verification so they stop hitting the storage limit.",
      ),
      paths: ["apps/web/src/domains/creator/ai/canon/useStudioCharacterCanon.ts", `${SHARED_LIB}/idb-kv.ts#migrateLocalStorageValueToIdb`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 작품별 대사 용어집", "Studio · per-work dialogue glossaries"),
      role: t(
        "작품별 용어집 값을 같은 도구로 이전하고, IndexedDB에 이미 값이 있으면 그쪽을 우선합니다.",
        "Migrates per-work glossary values with the same tool and prefers the value already in IndexedDB.",
      ),
      paths: ["apps/web/src/domains/creator/lettering/studio-dialogue-glossary-store.ts"],
    },
    {
      feature: t("상태 저장소 공용 어댑터", "Shared adapter for state stores"),
      role: t(
        "zustand persist 스토어가 처음 읽을 때 한 번 이전을 시도하고, IndexedDB를 못 쓰면 localStorage로 폴백합니다.",
        "A zustand persist store tries the move once on its first read and falls back to localStorage when IndexedDB is unusable.",
      ),
      paths: [`${SHARED_LIB}/idb-json-storage.ts#idbStateStorage`],
    },
    {
      feature: t("품질 게이트 · 이전 검증 테스트", "Quality gate · migration verification tests"),
      role: t(
        "이전 순서와 폴백 동작을 회귀 테스트로 고정합니다.",
        "Pins the order of the move and the fallback behavior with regression tests.",
      ),
      paths: [`${SHARED_LIB}/idb-kv.test.ts`],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("읽고 쓰고 다시 읽어 확인한 뒤에만 삭제", "Delete only after read, write and read-back"),
      language: "ts",
      source: `${SHARED_LIB}/idb-kv.ts`,
      ...sampleLines([
        "interface Kv { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<boolean> }",
        "",
        "export async function migrate(key: string, storage: Storage, idb: Kv): Promise<boolean> {",
        "  let legacy: string | null;",
        "  try { legacy = storage.getItem(key); } catch { return false; }",
        ["  if (legacy === null) return false; // ① 옮길 옛 값이 없다", "  if (legacy === null) return false; // ① nothing old to move"],
        "  if ((await idb.get(key)) !== null) {",
        ["    storage.removeItem(key); // IDB 값이 최신이므로 낡은 사본만 지운다", "    storage.removeItem(key); // the IDB value is newer, so drop only the stale copy"],
        "    return false;",
        "  }",
        ["  if (!(await idb.set(key, legacy))) return false; // ② 쓰기 실패 → 옛 키 보존", "  if (!(await idb.set(key, legacy))) return false; // ② write failed: keep the old key"],
        ["  if ((await idb.get(key)) !== legacy) return false; // ③ 다시 읽어 비교, 다르면 옛 키 보존", "  if ((await idb.get(key)) !== legacy) return false; // ③ read back and compare; mismatch keeps the old key"],
        ["  storage.removeItem(key); // ④ 검증이 끝난 뒤에야 옛 키를 지운다", "  storage.removeItem(key); // ④ delete the old key only after verification"],
        "  return true;",
        "}",
      ]),
      explain: t(
        "순서가 곧 안전장치입니다. 지우기는 맨 마지막에 한 번만 있고, 그 앞의 모든 실패 경로는 옛 키를 그대로 둔 채 false를 돌려줍니다. 실제 코드는 removeItem 실패도 try/catch로 삼켜 이전 결과에 영향을 주지 않습니다.",
        "The order is the safety net. Deletion happens once, at the very end, and every failure path before it returns false with the old key untouched. The real code also swallows a failing removeItem so it cannot affect the result.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · IndexedDB API", url: "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API", kind: "docs" },
    { title: "MDN · Web Storage API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API", kind: "docs", note: t("localStorage 의 한도와 동기식 특성", "localStorage limits and its synchronous nature") },
    { title: "MDN · Storage quotas and eviction criteria", url: "https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria", kind: "docs" },
  ],
  chapterIds: ["storage-migration", "storage"],
  talk: {
    pitch: t(
      "커지는 문서를 localStorage에서 IndexedDB로 옮길 때 가장 무서운 것은 이사 중 사고로 유일한 사본을 잃는 일입니다. 그래서 읽고, 쓰고, 다시 읽어 같은지 확인한 뒤에야 옛 키를 지웁니다. 어느 단계에서 실패해도 옛 값은 그대로이고 다음 실행에서 다시 시도합니다. 모든 데이터를 옮기는 것도 아니고, 스튜디오의 SQLite 저장소와는 별개의 경로입니다.",
      "The scariest part of moving a growing document from localStorage to IndexedDB is losing the only copy to a mishap mid-move. So the value is read, written and read back, and the old key is deleted only once they match. Failure at any step leaves the old value intact and the move is retried on the next run. Not everything is moved, and this is a separate path from the studio’s SQLite storage.",
    ),
    analogy: t(
      "이삿짐센터가 새 집에서 가구를 하나씩 목록과 대조한 뒤에야 옛 집 열쇠를 돌려주는 것과 같습니다.",
      "Like a moving company that returns the old house’s key only after checking every piece of furniture against the list at the new house.",
    ),
    questions: [
      {
        question: t("왜 전부 옮기지 않나요?", "Why not move everything?"),
        answer: t(
          "로그인 세션이나 부팅 초기값처럼 첫 화면에서 동기로 읽어야 하는 작은 값은 비동기인 IndexedDB로 옮기면 오히려 불편합니다. 커져 가는 문서만 옮깁니다.",
          "Small values that must be read synchronously on the first screen, such as the login session or boot defaults, are worse off in asynchronous IndexedDB. Only growing documents move.",
        ),
      },
      {
        question: t("IndexedDB가 막힌 환경에서는요?", "What if IndexedDB is blocked?"),
        answer: t(
          "연산이 예외 대신 null/false를 돌려주므로 이전은 건너뛰고 옛 키가 남으며, 상태 저장소 어댑터는 localStorage로 폴백해 기존 동작을 유지합니다.",
          "Operations return null or false instead of throwing, so the move is skipped and the old key stays; the state-store adapter falls back to localStorage and keeps the old behavior.",
        ),
      },
      {
        question: t("이전 도중 들어온 편집은요?", "And edits that arrive during the move?"),
        answer: t(
          "이 도구는 값 하나의 이전만 책임집니다. 비동기 읽기가 끝나기 전에 도착한 편집을 병합하는 일은 해당 화면이 정하고 테스트로 고정할 몫입니다.",
          "The helper is responsible only for moving one value. Merging edits that arrive before the asynchronous read finishes is for each screen to decide and pin down with tests.",
        ),
      },
    ],
    pitfall: t(
      "이 카드는 V12 SQLite 저장소로의 이전이 아닙니다. 스튜디오 V12 정책(LEGACY_DATA_MIGRATION=FALSE)은 옛 키를 부팅 때 읽어 옮기지 않습니다. 또 studio-opfs-migration.ts(localStorage→OPFS)는 코드에 있으나 제품에서 호출하는 곳이 없습니다. IndexedDB도 브라우저 저장소이므로 백업이 아닙니다.",
      "This card is not about moving data into V12 SQLite: the studio V12 policy (LEGACY_DATA_MIGRATION=FALSE) does not read old keys at boot. studio-opfs-migration.ts (localStorage to OPFS) exists in code but nothing in the product calls it. IndexedDB is browser storage too, so it is not a backup.",
    ),
  },
  technologies: ["IndexedDB", "Zustand"],
  facts: [
    { value: "toonstudio-kv", label: t("이전 대상이 되는 공용 IndexedDB 이름", "Name of the shared IndexedDB that receives the data"), source: `${SHARED_LIB}/idb-kv.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const ENGINEERING_ATLAS_LOCAL_FIRST_FILES: readonly EngineeringAtlasEntry[] = [
  OPFS_CONTENT_ADDRESSED_STORE,
  STORAGE_PERSISTENCE_QUOTA_SAFE_MODE,
  FILE_SYSTEM_ACCESS_RESAVE,
  WEB_APP_MANIFEST_INSTALL_IDENTITY,
  VERIFIED_LOCALSTORAGE_TO_IDB_MIGRATION,
];
