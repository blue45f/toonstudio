import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { sampleLines, t } from "./engineering-atlas-local-first-kit";

/**
 * 기술 도감 · local-first 카드 — 검증된 저장소 이전(localStorage → IndexedDB).
 * 핵심 메시지: 서버가 없어도 작업은 남지만, 브라우저 저장소는 영구 백업이 아니다.
 * 한 파일이 1,000줄을 넘지 않도록 engineering-atlas-local-first-files.ts 에서 나눴고, 그쪽에서 이 배열을 이어 붙인다.
 */

const SHARED_LIB = "apps/web/src/shared/lib";

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

export const ENGINEERING_ATLAS_LOCAL_FIRST_MIGRATION: readonly EngineeringAtlasEntry[] = [
  VERIFIED_LOCALSTORAGE_TO_IDB_MIGRATION,
];
