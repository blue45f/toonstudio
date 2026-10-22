/**
 * creator-bundle-render-rights.mjs
 *
 * 렌더 이미지 전달 경로(bundle-renders-v1)를 팩별 권리 원장(`config/creator-bundle-pack-rights.json`)에 잇는 판정·스탬프 모듈.
 *
 * 배경 — 이 경로의 매니페스트(apps/web/public/assets/studio/bundle-renders-v1/manifest.json)는 슬롯마다 `license` 블록을 스스로
 * 선언하고, 웹 로더(studio-bundle-asset-delivery.ts)는 원장을 읽지 않는다(원장은 클라이언트에 실리지 않는다). 그래서 3D 경로
 * (theme-packs.json의 팩별 `rights`)와 같은 구조로 닫는다:
 *   1) 슬롯의 `derivedFromPack`(공식 81팩 카탈로그 번호)으로 원장 항목을 찾는다. 하나로 특정되지 않으면 원장에 없는 팩이다 → hold.
 *   2) 원장이 그 팩을 열었고(allow + 증빙·grant·묶음 자격 — evaluateServeDecision) 슬롯이 완성(초안 아님)이면, 원장 투영
 *      (packRightsProjection)에 `ledgerPackId`를 더한 `rights` 블록을 슬롯에 스탬프한다. 로더는 이 블록이 없는 완성 슬롯을
 *      전달하지 않는다. 매니페스트의 자체 `license` 선언은 판정 근거가 아니다.
 *   3) 스탬프가 원장 투영과 다르거나, 닫힌 팩에서 파생한 슬롯이 완성 상태이거나, 전달 대상이 아닌 이미지 파일이 공개 폴더에 있으면
 *      검사(`--check`)가 실패한다. 로더가 믿는 블록의 진위는 이 검사가 지킨다 — 매니페스트·이미지를 손으로 고치면 CI에서 걸린다.
 *
 * 이 모듈은 팩을 열지 않는다(원장 시드·allow는 소유자 결정). 파일은 `listRenderPackFiles`만 읽고, 쓰기는 CLI(sync-creator-bundle-render-rights.mjs)가 한다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  evaluateServeDecision,
  findPackRightsByCatalogId,
  packRightsProjection,
} from "./creator-bundle-pack-rights.mjs";
import { isRecord } from "./creator-bundle-pack-rights-form.mjs";

/** 렌더 매니페스트와 이미지가 놓이는 정적 폴더(저장소 루트 기준). 이 아래 파일은 빌드 때 그대로 공개된다. */
export const RENDER_PACK_DIR = "apps/web/public/assets/studio/bundle-renders-v1";
export const RENDER_MANIFEST_FILE = "manifest.json";
/**
 * 전달 슬롯이 가지는 `rights` 블록의 키 전부. CI(rights-drift)가 블록이 이 키 집합과 원장 투영에 정확히 일치하는지 본다.
 * 웹 로더(studio-bundle-asset-delivery.ts)는 이 키들만 읽고 모르는 키는 무시한다(늦게 갱신된 JS와 새 매니페스트가 만나도 깨지지 않게).
 */
export const RENDER_RIGHTS_KEYS = Object.freeze([
  "ledgerPackId",
  "serve",
  "status",
  "licenseName",
  "commercialUse",
  "attributionRequired",
]);

/** 슬롯 파일 이름. 본 이미지(`path`)는 웹 로더가 webp만 받고, 미리보기(`previewPath`)는 webp·png·jpg를 받는다. */
const SLOT_FILE_NAMES = Object.freeze({ path: /^[A-Za-z0-9_-]+\.webp$/u, previewPath: /^[A-Za-z0-9_-]+\.(?:webp|png|jpg)$/u });
/** 웹 로더(studio-bundle-asset-delivery.ts)가 받는 슬롯 id 형식. 다르면 로더가 카탈로그 전체를 던지므로 CI가 먼저 잡는다. */
const SLOT_ID = /^[a-z0-9-]{1,200}$/u;
/** git이 일반 파일로 보는 모드. 심볼릭 링크(120000)·서브모듈(160000) 등은 공개 폴더에 둘 수 없다. */
const REGULAR_GIT_MODES = new Set(["100644", "100755"]);

/** 웹 로더와 같은 초안 판정(`curationStatus`가 `draft`로 시작). 한쪽만 바꾸면 초안/완성 구분이 어긋나므로 시험이 양쪽을 대조한다. */
export function isDraftRenderSlot(slot) {
  return typeof slot?.curationStatus === "string" && slot.curationStatus.startsWith("draft");
}

/** 키를 재귀적으로 정렬한다 — 기존 매니페스트의 직렬화 규칙(키 알파벳순)을 보존하는 데 쓴다. */
export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeysDeep(value[key])]));
  }
  return value;
}

/** 매니페스트 직렬화: 키 알파벳순·최소 직렬화·끝 개행 없음(커밋된 파일 형식과 같다). */
export function serializeRenderManifest(manifest) {
  return JSON.stringify(sortKeysDeep(manifest));
}

/**
 * 원장 투영이 이 경로로 전달할 수 있는 권리인가. 상업 이용이 가능하고 귀속 표기가 필요 없어야 한다 — 서비스 안에서 쓰는 렌더라 귀속 문구를
 * 보여 줄 자리가 없고(원장 스키마에도 문구 필드가 없다) 비상업 grant는 상업 서비스에서 쓸 수 없다. 웹 로더도 같은 조건으로 닫는다.
 */
export function renderRightsDeliverable(rights) {
  return isRecord(rights) && rights.commercialUse === true && rights.attributionRequired === false;
}

function slotDirProblem(slot) {
  const directory = `assets/${slot.id}/`;
  const problems = [];
  for (const field of ["path", "previewPath"]) {
    const value = slot[field];
    if (value === undefined) continue;
    const name = typeof value === "string" && value.startsWith(directory) ? value.slice(directory.length) : null;
    if (name === null || !SLOT_FILE_NAMES[field].test(name)) {
      problems.push(`${field}(${String(value)})는 ${directory} 바로 아래의 ${field === "path" ? ".webp" : ".webp/.png/.jpg"} 파일이어야 합니다 — 다른 슬롯의 파일을 가리킬 수 없습니다.`);
    }
  }
  return problems;
}

/**
 * 슬롯 하나를 원장에 대조한다.
 * 반환: { slotId, draft, entry, decision, expected, deliverable, problems, stamped }
 * - expected: 원장이 이 슬롯에 싣게 하는 `rights` 블록(열린 팩이고 완성 슬롯일 때만, 아니면 null)
 * - deliverable: 완성이고 원장이 열었으며 상업 이용·귀속 표기 없음 조건을 채워 실제로 전달돼야 하는 슬롯
 * - stamped: 스탬프를 반영한 슬롯 사본(초안·닫힌 슬롯에서는 `rights`를 지운다. 닫힌 완성 슬롯은 오류로 남는다)
 */
export function planRenderSlot(ledger, slot, { now } = {}) {
  const slotId = isRecord(slot) && typeof slot.id === "string" ? slot.id : null;
  const problems = [];
  const fail = (code, message) => problems.push({ code, slotId, message });
  if (!isRecord(slot) || slotId === null || !SLOT_ID.test(slotId)) {
    fail("slot-malformed", "슬롯이 소문자·숫자·하이픈(1~200자) id를 가진 객체가 아닙니다 — 웹 로더가 받지 않는 id는 카탈로그 전체를 막습니다.");
    return { slotId, draft: false, entry: null, decision: null, expected: null, deliverable: false, problems, stamped: slot };
  }
  const draft = isDraftRenderSlot(slot);
  const found = findPackRightsByCatalogId(ledger, slot.derivedFromPack);
  let decision = { serve: false, reason: "missing-entry", entry: null, problems: [] };
  if (found) {
    // 항목이 가진 신원(번호·제목·제작사)으로 판정한다 — 서빙 판정은 3D 경로와 같은 한 함수를 거친다.
    decision = evaluateServeDecision(
      ledger,
      { catalogIds: found.catalogIds, title: found.title, creator: found.creator },
      { now },
    );
    // 같은 키로 다른 항목이 잡히는 원장(검증기가 거부하는 형태)은 닫는다.
    if (decision.entry !== found) decision = { serve: false, reason: "missing-entry", entry: null, problems: [] };
  }
  const entry = decision.entry;
  if (!entry) {
    fail("pack-unmapped", `derivedFromPack(${JSON.stringify(slot.derivedFromPack)})이 원장 항목 하나로 특정되지 않습니다 — 원장에 없는 팩은 hold입니다.`);
  } else if (!isRecord(slot.license) || slot.license.provider !== entry.creator) {
    fail("provider-mismatch", `license.provider(${JSON.stringify(slot.license?.provider)})가 원장 제작사(${entry.creator})와 다릅니다.`);
  }
  for (const message of slotDirProblem(slot)) fail("slot-path", message);

  // 원장이 연 팩의 완성 슬롯만 블록을 가진다. 상업 이용 불가·귀속 표기 필요 grant는 이 경로가 받지 않으므로 닫는다.
  const projection = !draft && decision.serve ? { ledgerPackId: entry.id, ...packRightsProjection(entry) } : null;
  const deliverable = projection !== null && renderRightsDeliverable(projection);
  const expected = deliverable ? projection : null;
  const hasRights = Object.hasOwn(slot, "rights");

  if (draft) {
    if (hasRights) fail("rights-stale", "초안 슬롯에는 rights 블록이 없어야 합니다 — `pnpm run sync:creator-bundle-render-rights`로 지우세요.");
  } else if (!decision.serve) {
    const why = entry
      ? `원장 판정 ${decision.reason}${decision.problems.length > 0 ? ` (${decision.problems.slice(0, 2).join(" / ")})` : ""}`
      : "원장에 없는 팩";
    fail("rights-hold", `완성 슬롯인데 원장이 팩을 열지 않았습니다 (${why}) — 슬롯을 초안(curationStatus: draft-…)으로 내리고 rights 블록·이미지 파일을 지우세요.`);
  } else if (!deliverable) {
    fail("rights-hold", "완성 슬롯인데 원장 grant가 상업 이용 가능·귀속 표기 없음 조건을 채우지 않습니다 — 슬롯을 초안으로 내리세요.");
  } else if (!hasRights) {
    fail("rights-missing", "원장이 연 팩의 완성 슬롯에 rights 블록이 없습니다 — `pnpm run sync:creator-bundle-render-rights`로 스탬프하세요.");
  } else if (!isDeepStrictEqual(slot.rights, expected)) {
    fail("rights-drift", "rights 블록이 원장 투영과 다릅니다 — `pnpm run sync:creator-bundle-render-rights`로 다시 스탬프하세요.");
  }

  // 초안과 열린 슬롯은 블록을 새로 정한다(초안은 지운다). 닫힌 완성 슬롯은 오류로 남기고 건드리지 않는다 — 사람이 초안으로 내린다.
  const withoutRights = { ...slot };
  delete withoutRights.rights;
  let stamped = withoutRights;
  if (expected !== null) stamped = { ...withoutRights, rights: expected };
  else if (!draft) stamped = slot;
  return { slotId, draft, entry, decision, expected, deliverable, problems, stamped };
}

/**
 * 매니페스트 전체를 원장에 대조한다. 반환: { problems, slots, stamped, summary }
 * stamped: 열린 완성 슬롯에 rights를 싣고 초안에서는 지운 매니페스트 사본(닫힌 완성 슬롯은 오류로 남아 그대로다).
 */
export function planRenderManifestRights(ledger, manifest, { now } = {}) {
  if (!isRecord(manifest) || !Array.isArray(manifest.assets)) {
    return {
      problems: [{ code: "manifest-malformed", slotId: null, message: "매니페스트가 assets 배열을 가진 객체가 아닙니다." }],
      slots: [],
      stamped: manifest,
      summary: { total: 0, draft: 0, delivered: 0, closed: 0 },
    };
  }
  const problems = [];
  const seen = new Set();
  const slots = manifest.assets.map((slot) => {
    const planned = planRenderSlot(ledger, slot, { now });
    if (planned.slotId !== null) {
      if (seen.has(planned.slotId)) {
        planned.problems.push({ code: "duplicate-slot-id", slotId: planned.slotId, message: `슬롯 id가 중복됩니다 (${planned.slotId}).` });
      }
      seen.add(planned.slotId);
    }
    problems.push(...planned.problems);
    return planned;
  });
  const summary = {
    total: slots.length,
    draft: slots.filter((slot) => slot.draft).length,
    delivered: slots.filter((slot) => slot.deliverable).length,
    closed: slots.filter((slot) => !slot.draft && !slot.deliverable).length,
  };
  return { problems, slots, stamped: { ...manifest, assets: slots.map((slot) => slot.stamped) }, summary };
}

/**
 * 공개 폴더의 파일 점검. `files`는 폴더 기준 상대 경로(POSIX) 목록이다.
 * `manifest.json`과, 전달 대상(deliverable) 슬롯이 `path`/`previewPath`로 가리키는 파일만 허용한다 — 이 폴더는 빌드 때 그대로
 * 공개되므로 닫힌 팩·초안 슬롯·참조 없는 이미지는 매니페스트가 걸러도 그대로 서빙된다.
 */
export function findRenderFileProblems(slots, files) {
  const allowed = new Set();
  for (const slot of slots) {
    if (!slot.deliverable) continue;
    for (const field of ["path", "previewPath"]) {
      if (typeof slot.stamped?.[field] === "string") allowed.add(slot.stamped[field]);
    }
  }
  return files
    .filter((file) => file !== RENDER_MANIFEST_FILE && !allowed.has(file))
    .map((file) => ({
      code: "orphan-file",
      slotId: null,
      message: `${file}은(는) 전달 대상 슬롯이 가리키는 파일이 아닙니다 — 이 폴더의 파일은 빌드 때 그대로 공개되므로 닫힌 팩·초안·참조 없는 이미지를 둘 수 없습니다.`,
    }));
}

function gitText(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
}

/** 존재하는 가장 가까운 상위 폴더 — 스파스 체크아웃에서는 공개 폴더 자체가 디스크에 없을 수 있다. */
function nearestExistingDirectory(path) {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

/** 심볼릭 링크를 푼 실제 경로(폴더가 아직 없으면 있는 가장 가까운 상위 폴더만 푼다) — git은 작업 트리 루트를 실제 경로로 돌려준다. */
function realPathOf(path) {
  const ancestor = nearestExistingDirectory(path);
  return join(realpathSync(ancestor), relative(ancestor, resolve(path)));
}

/** git 작업 트리의 루트. 작업 트리 밖이거나 git이 없으면 null. */
function gitTopLevel(directory) {
  try {
    return gitText(nearestExistingDirectory(directory), ["rev-parse", "--show-toplevel"]).trim() || null;
  } catch {
    return null;
  }
}

function listGit(top, directory) {
  const pathspec = relative(top, realPathOf(directory)).split(sep).join("/") || ".";
  const prefix = pathspec === "." ? "" : `${pathspec}/`;
  const files = [];
  const irregular = [];
  const strip = (path) => (prefix !== "" && path.startsWith(prefix) ? path.slice(prefix.length) : path);
  // 인덱스만 읽는다: 스파스·blobless 체크아웃에서도 제외된 파일까지 전체 경로가 보이고 오브젝트를 내려받지 않는다.
  for (const entry of gitText(top, ["ls-files", "-z", "-s", "--", pathspec]).split("\0").filter(Boolean)) {
    const tab = entry.indexOf("\t");
    const mode = entry.slice(0, entry.indexOf(" "));
    const path = strip(entry.slice(tab + 1));
    (REGULAR_GIT_MODES.has(mode) ? files : irregular).push(path);
  }
  // 아직 add하지 않은 파일도 커밋하면 공개된다. 무시 규칙에 걸린 파일은 git이 못 보므로 auto에서 디스크 목록이 보탠다.
  for (const path of gitText(top, ["ls-files", "-z", "--others", "--exclude-standard", "--", pathspec]).split("\0").filter(Boolean)) {
    files.push(strip(path));
  }
  return { files, irregular };
}

function listDisk(directory) {
  const files = [];
  const irregular = [];
  const walk = (relativePath) => {
    for (const dirent of readdirSync(join(directory, relativePath), { withFileTypes: true })) {
      const next = relativePath === "" ? dirent.name : `${relativePath}/${dirent.name}`;
      if (dirent.isDirectory()) walk(next);
      else if (dirent.isFile()) files.push(next);
      else irregular.push(next);
    }
  };
  walk("");
  return { files, irregular };
}

/**
 * 폴더 안 파일을 나열한다(폴더 기준 상대 경로, 정렬·중복 제거). 반환: { files, irregular, source }
 * - "git": 추적 파일(`git ls-files -s`)과 추적 안 된 비무시 파일. 추적 항목 중 일반 파일(100644·100755)이 아닌 것(심볼릭 링크·서브모듈)은
 *   `irregular`다. 커밋에 실리는 파일이 기준이라 CI 체크아웃(스파스 포함)의 기준 모드다.
 * - "fs": 디스크 전체(숨김·무시 파일 포함). 일반 파일이 아닌 항목은 `irregular`. 빌드 산출물(dist) 점검용.
 * - "auto": git 작업 트리 안이면 git ∪ fs, 아니면 fs. `.gitignore`에 걸린 이름(`__tmp*`·`__diag*`)은 git이 못 보지만 로컬 빌드는 그대로
 *   복사하므로 로컬 점검은 둘을 합친다.
 * git 작업 트리 안인데 git이 실패하면 던진다 — 조용히 디스크 목록으로 내려가면 스파스 체크아웃에서 점검이 통째로 비게 된다.
 */
export function listRenderPackFiles(directory, { mode = "auto" } = {}) {
  const top = mode === "fs" ? null : gitTopLevel(directory);
  if (mode === "git" && top === null) throw new Error(`${directory}은(는) git 작업 트리 안이 아니거나 git을 쓸 수 없습니다.`);
  const fromGit = top === null ? { files: [], irregular: [] } : listGit(top, directory);
  // 디스크 목록은 fs 모드와, git 작업 트리 밖이거나 폴더가 디스크에 있는 auto 모드에서 읽는다(스파스로 폴더가 없으면 인덱스만 본다).
  const diskWanted = mode === "fs" || (mode === "auto" && (top === null || existsSync(directory)));
  const fromDisk = diskWanted ? listDisk(directory) : { files: [], irregular: [] };
  const unique = (values) => [...new Set(values)].sort();
  return {
    files: unique([...fromGit.files, ...fromDisk.files]),
    irregular: unique([...fromGit.irregular, ...fromDisk.irregular]),
    source: top === null ? "fs" : mode === "git" ? "git" : "git+fs",
  };
}
