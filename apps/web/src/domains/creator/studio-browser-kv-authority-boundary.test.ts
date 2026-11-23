import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { compact, finding, type BrowserKvAllowance, type BrowserKvFinding, type FindingKind } from "./__fixtures__/studio-browser-kv-findings";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, "../../../../../");
const CREATOR_ROOT = resolve(WORKSPACE_ROOT, "apps/web/src/domains/creator");
const PACKAGE_ROOT = resolve(WORKSPACE_ROOT, "packages");
const PAGES_HISTORY_DURABLE_RUNTIME_SOURCE = readFileSync(
  resolve(CREATOR_ROOT, "studio-cuttoon-editor/runtime/history/studio-pages-history-durable-factory.ts"),
  "utf8",
);
const COMPANION_PAGE_SOURCE = readFileSync(
  resolve(CREATOR_ROOT, "StudioToolsCompanionPage.tsx"),
  "utf8",
);
const COMPANION_LAYOUT_HOOK_SOURCE = readFileSync(
  resolve(CREATOR_ROOT, "use-studio-companion-window-layout.ts"),
  "utf8",
);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const EXCLUDED_DIRECTORY_NAMES = new Set([
  "__fixtures__",
  "__tests__",
  "fixtures",
  "generated",
  "testing",
]);
const TEST_FILE_PATTERN = /(?:\.boundary)?\.(?:spec|test)\.[cm]?[jt]sx?$/u;
const DURABLE_AUTHORITY_PATTERN =
  /(?:asset|autosave|bible|brand|brush|calibration|catalog|checkpoint|clip|collab|crdt|document|effect|filter|font|journal|library|mannequin|marketplace|outbox|pack|palette|pose|preset|project|recovery|scene|snapshot|texture|timeline|translation|workspace)/iu;
// 계정별 검수 초안과 수신함의 주입 Storage 포트도 키 이름에 관계없이 검사한다.
const REVIEW_LOCAL_STORAGE_PORT_FILES = new Set([
  "apps/web/src/domains/creator/production-hub/production-review-local-state.ts",
  "apps/web/src/domains/creator/production-hub/compare-send-inbox.ts",
]);
const BROWSER_KV_LEXICAL_SURFACE_PATTERN =
  /\b(?:Dexie|IDBDatabase|IDBFactory|IDBObjectStore|indexedDB|localStorage|openDB|removeItem|sessionStorage|setItem)\b|["'](?:dexie|idb|idb-keyval)["']/u;

function slash(value: string): string {
  return value.replaceAll("\\", "/");
}

function sourceExtension(file: string): string {
  const match = file.match(/(\.[^.]+)$/u);
  return match?.[1] ?? "";
}

function isProductSourceFile(file: string): boolean {
  const name = file.slice(file.lastIndexOf("/") + 1);
  return SOURCE_EXTENSIONS.has(sourceExtension(name))
    && !name.endsWith(".d.ts")
    && !TEST_FILE_PATTERN.test(name)
    && !name.includes(".stories.");
}

function mayContainBrowserKvAuthority(source: string): boolean {
  // Every finding produced below requires at least one of these exact language/library surfaces.
  // This conservative prefilter only avoids building a TypeScript AST for provably inert files;
  // it does not narrow the repository roots, allowance checks, or finding rules.
  // A backslash may encode an identifier or string-literal escape that TypeScript normalises to
  // one of those surfaces (for example `set\u0049tem`), so those files always reach the AST gate.
  return source.includes("\\") || BROWSER_KV_LEXICAL_SURFACE_PATTERN.test(source);
}

function walkProductSources(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
      const absolute = resolve(directory, entry.name);
      const kind = entry.isSymbolicLink() ? statSync(absolute) : entry;
      if (kind.isDirectory()) visit(absolute);
      else if (kind.isFile() && isProductSourceFile(slash(absolute))) files.push(absolute);
    }
  };
  visit(root);
  return files.sort();
}

function studioSourceRoots(): readonly string[] {
  const packageSources = existsSync(PACKAGE_ROOT)
    ? readdirSync(PACKAGE_ROOT)
      .filter((name) => name.startsWith("studio-"))
      .map((name) => resolve(PACKAGE_ROOT, name, "src"))
      .filter(existsSync)
      .sort()
    : [];
  return Object.freeze([CREATOR_ROOT, ...packageSources]);
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".mts")) return ts.ScriptKind.TS;
  if (file.endsWith(".cts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.TS;
}

function receiverAndMethod(
  expression: ts.LeftHandSideExpression,
  sourceFile: ts.SourceFile,
): { readonly receiver: string; readonly method: string } | null {
  if (ts.isPropertyAccessExpression(expression)) {
    return {
      receiver: compact(expression.expression.getText(sourceFile)),
      method: expression.name.text,
    };
  }
  if (
    ts.isElementAccessExpression(expression)
    && expression.argumentExpression
    && ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return {
      receiver: compact(expression.expression.getText(sourceFile)),
      method: expression.argumentExpression.text,
    };
  }
  return null;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

type BrowserStorageName = "localStorage" | "sessionStorage";

function isDirectBrowserStorageReference(
  receiver: string,
  storageName: BrowserStorageName,
): boolean {
  return receiver === storageName
    || receiver === `globalThis.${storageName}`
    || receiver === `window.${storageName}`;
}

function collectStorageBindings(sourceFile: ts.SourceFile) {
  const localStorageAliases = new Set(["localStorage"]);
  const sessionStorageAliases = new Set(["sessionStorage"]);
  const candidates = new Map<string, Set<string>>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const name = node.name.text;
      const initializer = compact(unwrapExpression(node.initializer).getText(sourceFile));
      if (isDirectBrowserStorageReference(initializer, "localStorage")) localStorageAliases.add(name);
      if (isDirectBrowserStorageReference(initializer, "sessionStorage")) sessionStorageAliases.add(name);
      const values = candidates.get(name) ?? new Set<string>();
      values.add(initializer);
      candidates.set(name, values);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const initializers = new Map([...candidates]
    .filter(([, values]) => values.size === 1)
    .map(([name, values]) => [name, [...values][0]!] as const));
  return { localStorageAliases, sessionStorageAliases, initializers };
}

function resolvedKeyText(
  expression: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
  initializers: ReadonlyMap<string, string>,
): string {
  if (!expression) return "<none>";
  const unwrapped = unwrapExpression(expression);
  const direct = compact(unwrapped.getText(sourceFile));
  if (!ts.isIdentifier(unwrapped)) return direct;
  const initializer = initializers.get(unwrapped.text);
  if (!initializer) return direct;
  return /^[A-Z][A-Z0-9_]*$/u.test(unwrapped.text)
    || /^["'`]/u.test(initializer)
    || DURABLE_AUTHORITY_PATTERN.test(initializer)
    ? initializer
    : direct;
}

function isDirectBrowserStorageReceiver(
  receiver: string,
  storageName: BrowserStorageName,
  aliases: ReadonlySet<string>,
): boolean {
  return isDirectBrowserStorageReference(receiver, storageName) || aliases.has(receiver);
}

function isIndexedDbFactoryReceiver(receiver: string, source: string): boolean {
  if (/^(?:(?:globalThis|window)\.)?indexedDB$/u.test(receiver)) return true;
  if (!/\b(?:IDBFactory|IDBDatabase|indexedDB)\b/u.test(source)) return false;
  return /(?:factory|indexedDB|indexedDb)$/u.test(receiver);
}

/**
 * 제품 코드를 실행하지 않는 정적 권한 경계 검사다. 사례와 저장소 게이트는 이 동일한 검사기를 쓴다.
 * 결과의 불변 자료형·표현 정규화만 테스트 fixture로 분리한다.
 */
function analyzeBrowserKvSource(file: string, source: string): readonly BrowserKvFinding[] {
  if (!mayContainBrowserKvAuthority(source)) return Object.freeze([]);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const { localStorageAliases, sessionStorageAliases, initializers } = collectStorageBindings(sourceFile);
  const findings: BrowserKvFinding[] = [];
  const compactSource = compact(source);
  const wrapperModule =
    /(?:from|import\()["'](?:dexie|idb|idb-keyval)["']/u.test(compactSource);

  const visit = (node: ts.Node): void => {
    if (
      ts.isNewExpression(node)
      && (compact(node.expression.getText(sourceFile)) === "Dexie" || wrapperModule)
    ) {
      findings.push(finding(file, sourceFile, node, "indexeddb-wrapper", "Dexie"));
    }
    if (ts.isCallExpression(node)) {
      const call = receiverAndMethod(node.expression, sourceFile);
      if (call?.method === "setItem") {
        const key = resolvedKeyText(node.arguments[0], sourceFile, initializers);
        if (isDirectBrowserStorageReceiver(call.receiver, "localStorage", localStorageAliases)) {
          findings.push(finding(file, sourceFile, node, "local-storage-write", key));
        } else if (
          !isDirectBrowserStorageReceiver(
            call.receiver,
            "sessionStorage",
            sessionStorageAliases,
          )
          && (REVIEW_LOCAL_STORAGE_PORT_FILES.has(file)
            || DURABLE_AUTHORITY_PATTERN.test(`${file}:${key}:${call.receiver}`))
        ) {
          // Unknown/injected Storage-like receivers remain reviewable. Explicit sessionStorage is
          // tab-scoped and cannot become durable authority, even when its key describes a pose.
          findings.push(finding(file, sourceFile, node, "durable-storage-write", key));
        }
      } else if (
        call?.method === "removeItem"
        && isDirectBrowserStorageReceiver(call.receiver, "localStorage", localStorageAliases)
      ) {
        const key = resolvedKeyText(node.arguments[0], sourceFile, initializers);
        findings.push(finding(file, sourceFile, node, "local-storage-cleanup", key));
      } else if (call?.method === "open" && isIndexedDbFactoryReceiver(call.receiver, source)) {
        const key = resolvedKeyText(node.arguments[0], sourceFile, initializers);
        findings.push(finding(file, sourceFile, node, "indexeddb-open", key));
      } else if (
        call
        && /^(?:add|put)$/u.test(call.method)
        && (wrapperModule || /\b(?:IDBDatabase|IDBObjectStore|indexedDB)\b/u.test(source))
        && /(?:db|store|table|transaction)/iu.test(call.receiver)
      ) {
        findings.push(finding(file, sourceFile, node, "indexeddb-write", call.method));
      } else if (
        call?.method === "delete"
        && (wrapperModule || /\b(?:IDBDatabase|IDBObjectStore|indexedDB)\b/u.test(source))
        && /(?:db|store|table|transaction)/iu.test(call.receiver)
      ) {
        findings.push(finding(file, sourceFile, node, "indexeddb-cleanup", "delete"));
      } else if (
        wrapperModule
        && (compact(node.expression.getText(sourceFile)) === "openDB" || call?.method === "openDB")
      ) {
        const key = resolvedKeyText(node.arguments[0], sourceFile, initializers);
        findings.push(finding(file, sourceFile, node, "indexeddb-wrapper", key));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return Object.freeze(findings);
}

function analyzeWorkspace(): readonly BrowserKvFinding[] {
  return Object.freeze(studioSourceRoots().flatMap((root) =>
    walkProductSources(root).flatMap((absolute) => {
      const file = slash(relative(WORKSPACE_ROOT, absolute));
      return analyzeBrowserKvSource(file, readFileSync(absolute, "utf8"));
    })));
}

function allow(
  file: string,
  kind: FindingKind,
  key: string,
  occurrences: number,
  rationale: string,
  proof: string,
): BrowserKvAllowance {
  return Object.freeze({ file, kind, key, occurrences, rationale, proof });
}

const UI_ONLY =
  "UI preference, acknowledgement, tutorial, consent, recent-item, or clipboard state only; it is not project or creative-data authority.";
const UI_PROOF =
  "The exact key/call is bounded to presentation or session transfer and is not read by a SQLite/OPFS creative repository.";
const CLEANUP_ONLY =
  "Deletion-only compatibility cleanup; remove/delete cannot establish or refresh browser-KV authority.";
const CLEANUP_PROOF =
  "The allowance is limited to the exact cleanup method and occurrence count; any set/put call is a different finding kind.";
const INJECTED_COMPATIBILITY =
  "Injected storage compatibility codec or explicit legacy adapter; the product authority is separately wired to SQLite/OPFS and never silently selects this call.";
const INJECTED_PROOF =
  "The exact call is retained for tests, explicit import, or compatibility parsing; ambient product boot is guarded by existing V12 boundary tests.";
const LEGACY_IDB =
  "Explicit pre-V12 IndexedDB import/test or observable emergency rollback seam; SQLite/OPFS remains the product-default authority.";
const LEGACY_IDB_PROOF =
  "The legacy database name and exact operation count are pinned here; adding an open/write/delete or changing the key requires review.";
const VRM_LIBRARY_MIXED_PERSISTENCE =
  "Four calls belong to the explicit pre-V12 IndexedDB seam; two reviewed authorityStore writes persist hash-bound VRM license receipts through the product SQLite/OPFS database port.";
const VRM_LIBRARY_MIXED_PERSISTENCE_PROOF =
  "The exact total is pinned at six, while licenseAuthorityStore returns null for legacy or injected repositories and the product store delegates only to acquireStudioLocalDatabase().kvSet.";
const HISTORY_LEGACY_IDB =
  "Explicit pages-history emergency adapter only; the product factory cannot construct or infer this IndexedDB authority.";
const HISTORY_LEGACY_IDB_PROOF =
  "The default factory accepts only a caller-created legacyRecoveryVault and otherwise selects SQLite, native OPFS, or observable memory-only state.";
const BOUNDED_LOCAL_CACHE =
  "TTL-bound cache, one-shot handoff, device token, offline outbox, or storage-event transport; it does not replace canonical project persistence.";
const BOUNDED_LOCAL_CACHE_PROOF =
  "The exact file, key, method, and count are pinned while schema, expiry, consume, removal, or replay behavior stays independently testable.";
const OPTIONAL_LOCAL_TOOL_STATE =
  "Optional browser-local draft, preset, benchmark receipt, or device preference for a standalone Studio tool; losing it cannot corrupt a canonical project.";
const OPTIONAL_LOCAL_TOOL_STATE_PROOF =
  "The feature retains memory, export, or deterministic defaults when storage fails, and only the exact reviewed call is admitted here.";
const REVIEWED_LOCAL_WORKING_COPY =
  "Reviewed browser-local working copy for validated adjunct project metadata; it does not authorize new canonical browser-KV stores.";
const REVIEWED_LOCAL_WORKING_COPY_PROOF =
  "The injected storage port, parser or schema, exact key expression, and occurrence count are pinned so expansion requires a fresh architecture review.";
const STANDALONE_DRAFT_IDB =
  "Explicit IndexedDB draft for the standalone promo editor; JSON export and revision checks bound this local working copy.";
const STANDALONE_DRAFT_IDB_PROOF =
  "The database name, object-store operation, revision conflict check, and exact call count are pinned; no other Studio authority is covered.";
const THUMBNAIL_IDB_FALLBACK =
  "OPFS files are the canonical project-thumbnail store; this IndexedDB is its migration source and the designed fallback tier when OPFS is unavailable or a write fails.";
const THUMBNAIL_IDB_FALLBACK_PROOF =
  "studio-project-thumbnail-opfs.test.ts pins OPFS-first writes, migration that deletes the IDB original only after a verified OPFS write, and the fallback put when OPFS writes fail.";
const PLANNING_LOCAL_WORKING_COPY =
  "Reviewed browser-local working copy of project- or workspace-scoped planning metadata; it is not the canvas document, the ProjectGraph revision history, a permission grant, or shared collaboration state, and it is not synced to a server yet.";
const REVIEW_TOOL_LOCAL_STATE =
  "Device-local working state of a review or QC tool (compare session, compare comments, playlist verdicts, vote sessions, an unsent external-review draft, or a per-episode QC summary); losing it cannot alter the canvas document, the manuscript pin document, or server approval records.";

const ALLOWANCES: readonly BrowserKvAllowance[] = Object.freeze([
  // 2026-11-22: UI 프리셋·명시 주입 호환 저장소·SHA-256 내용 주소 지정 L2 캐시만 정확한 호출 수로 등록한다.
  allow("apps/web/src/domains/creator/camera-angles-pro/webtoon-camera-angles.ts", "local-storage-write", '"toonstudio.camera-angles-pro.bookmarks.v1"', 1, "3D 카메라 앵글 북마크(최대 64건) UI 프리셋 목록만 저장하는 기기 로컬 편의 상태이며 원고·장면·SQLite 정본을 소유하지 않는다.", "camera-angles-pro.test.tsx가 64건 한도·필드 검증(isValidBookmarkRecord) 기반 북마크 저장·복원과 저장 불가 시 빈 배열 기본값 복귀를 검증한다."),
  allow("apps/web/src/domains/creator/continuity-bible/continuity-bible-model.ts", "durable-storage-write", '`${STORAGE_PREFIX}${state.projectId}`', 1, "명시 주입된 Storage 포트로 작품별 작화 일관성 체크시트(상처·소품·복장 메모) 로컬 작업 사본만 저장하며 원고 캔버스·서버 정본을 대체하지 않는다.", "continuity-bible.test.tsx가 주입 storage 기반 projectId별 체크시트 저장·복원 및 마크다운 내보내기를 검증하고 storage 미주입 시 메모리 상태로 동작한다."),
  allow("apps/web/src/domains/creator/deadline-meter/deadline-meter-engine.ts", "local-storage-write", '"toonstudio.solo-deadline-meter.v1"', 1, "1인 작가 마감일·목표 컷 수·공정 타이머 세션(최대 240건)을 담는 개인 생산성 보조 도구 상태이며 작품 원고·서버 일정을 소유하지 않는다.", "deadline-meter.test.tsx가 로컬 타이머·세션·마감 설정 저장·복원을 검증하며, 읽기 실패·손상 시 결정적 기본 상태로 안전하게 복귀한다."),
  allow("apps/web/src/domains/creator/genre-skeleton-pro/genre-skeleton-engine.ts", "durable-storage-write", '`${STORAGE_PREFIX}${projectId}`', 1, "명시 주입된 Storage 포트로 작품별 장르 뼈대 선택·목표 컷 수·폭·클리프행어 4개 UI 설정값만 저장하며 원고·회차 정본을 소유하지 않는다.", "genre-skeleton-pro.test.tsx가 닫힌 장르 열거형·수치 클램프 기반 설정 왕복을 검증하며, 실제 회차 반영은 onSavePlan 콜백 경로와 분리되어 있다."),
  allow("apps/web/src/domains/creator/local-render-cache/hybrid-tier-cache-adapters.ts", "indexeddb-open", "dbName", 1, "OPFS 미지원 환경용 SHA-256 내용 주소 지정 L2 불변 에셋 캐시(LRU 축출·재수신 가능)이며 원고·프로젝트 정본 저장소가 아니다.", "local-render-cache.test.ts가 L3→L2→L1 승격·SHA-256 무결성 거절·LRU 축출을 검증하며, 캐시 삭제 시 R2 L3에서 무손실 복구된다."),
  allow("apps/web/src/domains/creator/local-render-cache/hybrid-tier-cache-adapters.ts", "indexeddb-write", "put", 2, "L2 SHA-256 불변 에셋 캐시 항목 저장 및 LRU 접근 시각(lastAccessedAtMs) 갱신 전용 쓰기이며 원고·프로젝트 정본을 기록하지 않는다.", "createIndexedDbCacheAdapter의 put 호출 2곳(put·touch)만 고정하며, 모든 바이트는 SHA-256 검증된 재생성 가능 캐시 사본으로 제한된다."),
  allow("apps/web/src/domains/creator/local-render-cache/hybrid-tier-cache-adapters.ts", "indexeddb-cleanup", "delete", 2, CLEANUP_ONLY, "인메모리 Map 어댑터(L224)와 IndexedDB L2 캐시 어댑터(L414)의 sha256 단건 삭제 정리 호출 2곳만 허용하며 새 권위를 생성하지 않는다."),
  allow("apps/web/src/domains/creator/sfx-typo-pro/sfx-typo-engine.ts", "local-storage-write", '`${SFX_LIBRARY_STORAGE_PREFIX}${projectId}`', 1, "작품별 자주 쓰는 SFX 타이포 벡터 스탬프 UI 프리셋(최대 48건)만 로컬 저장하며 캔버스 배치·원고 문서·SQLite 정본을 소유하지 않는다.", "sfx-typo-pro.test.tsx가 최대 48건 스탬프 저장·복원과 XML 이스케이프를 검증하며, 저장 불가 시 메모리 프리셋과 SVG 생성이 독립 동작한다."),
  allow("apps/web/src/domains/creator/hyper-automation-os/hyper-automation-catalog.ts", "local-storage-write", '"toonstudio.hyper-auto.artist-autonomy-presets.v1"', 1, "아홉 공정의 0~99 자율도와 설정 이름·id만 담는 기기 UI 프리셋이다. 파이프라인 산출물·원고·레이어·실행 이력과 SQLite 저장 성공을 소유하지 않는다.", "hyper-automation-os.test.tsx가 실제 저장·재읽기, 닫힌 공정 필드, 추가 원고 필드 제외, 손상 원본·quota·무시된 쓰기 보존과 현재 화면 설정의 저장 실패 안내를 검증한다."),
  allow("apps/web/src/domains/creator/support-chat-ai/support-ai-chat-client.ts", "local-storage-write", '"toonstudio:ai-support-handoff:v1"', 1, "사용자가 명시 준비한 최근 문의 한 건의 최대64KiB 인계 사본이다. 실제 지원 브리프는 현재 값 콜백으로 전달하고 이 키는 원고·상담 전체·티켓 접수 정본이 아니다.", "support-chat-ai.test.tsx가 닫힌 인계 필드와 재읽기, 원고·대화 필드 제외, 크기·형식·기존 손상 사본 보존 및 quota·무시된 쓰기 실패를 검증한다. 화면 전달 경로는 저장 실패와 분리돼 있다."),
  allow("apps/web/src/domains/creator/localization-sync-pro/studio-offline-sync-legacy-export.ts", "indexeddb-open", '"toonstudio_offline_sync_v1"', 1, "사용자가 출처를 선택해 명시 실행하는 이전 사본 원문 내보내기만 소유한다. 기존 DB 존재 확인·readonly 읽기 전용이며 자동 복원·DB 생성·쓰기·삭제·원고 적용은 하지 않는다.", "offline-sync-storage-boundary.test.tsx가 제품 부트·샘플 편집의 browser KV 접근 없음, DB 생성 중단, 출처 분리, 작품·형식·8MiB 검증, 실제 버튼 다운로드 원문 일치와 원본 보존을 검증한다."),
  // 2026-11-21: 기기 설정·명시 주입 레지스트리·범위가 확인된 작업 사본만 정확한 호출 수로 등록한다.
  allow("apps/web/src/domains/creator/StudioPressureCalibrationPanel.tsx", "local-storage-write", '"toonstudio:colordrop-settings:v1"', 1, UI_ONLY, "StudioPressureCalibrationPanel.storage.test.tsx가 임계값·대기 시간 두 수치만 저장하는 왕복, 잘못된 값 복원, 저장 거부 시 메모리 설정과 원고 원본 보존을 검증한다."),
  allow("apps/web/src/domains/creator/brush/studio-custom-pattern-tip-registrar.ts", "durable-storage-write", '"toonstudio:custom-pattern-tips:v1"', 1, "기본 레지스트리는 메모리 전용이며 storage를 명시 주입한 호출만 호환용 팁 사본을 저장한다. 제품 부팅에 ambient localStorage 권위를 추가하지 않는다.", "studio-custom-pattern-tip-registrar.test.ts가 기본 인스턴스 간 비영속성, 콘텐츠 해시 중복 제거, 주입 저장소 왕복, 저장 실패의 전파와 기존 원본 보존을 검증한다."),
  allow("apps/web/src/domains/creator/planning/StudioStoryLivingSpecWorkbench.tsx", "local-storage-write", "storyLivingSpecStorageKey(projectId)", 2, PLANNING_LOCAL_WORKING_COPY, "StudioStoryLivingSpecWorkbench.test.tsx가 봉투·state의 projectId 일치, 다른 작품·손상 원본의 시드 및 편집 덮어쓰기 거부, 저장 실패 시 메모리 초안 보존을 검증한다. 컷 승인 표시는 이 로컬 기획 사본의 상태이며 서버 권한을 부여하지 않는다."),
  allow("apps/web/src/domains/creator/studio-cuttoon-editor/studio-expanded-tool-live-adapters.ts", "durable-storage-write", "studioExpandedWorkspaceStorageKey(state.projectId)", 1, OPTIONAL_LOCAL_TOOL_STATE, "studio-expanded-tool-live-adapters.test.ts가 작품별 도구 설정·엔진 결과 왕복, 다른 작품·손상된 원본의 덮어쓰기 거부, 저장 거부 때 원본 보존을 검증한다. 원고 문서와 별개인 도구 작업 사본만 이 키를 사용한다."),
  allow("apps/web/src/domains/creator/studio-cuttoon-editor/studio-expanded-tool-live-adapters.ts", "durable-storage-write", "studioStoryLivingSpecStorageKey(projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "studio-expanded-tool-live-adapters.test.ts가 Workbench와 같은 키·봉투의 projectId 및 state.projectId 검증, 위조된 다른 작품 쓰기 거절, 손상 원본 및 저장 실패의 보존을 검증한다."),
  allow("apps/web/src/domains/creator/virtual-space/crdt/studio-virtual-space-yjs-doc.ts", "local-storage-write", "key", 1, "프로젝트·방별 가상 공간 Yjs 협업 작업 사본이다. 원고 정본과 분리되고 개인 사본을 합칠 때 저장·재읽기를 먼저 확인한다.", "studio-virtual-space-yjs-doc.test.tsx가 방별 복원, scope 전환 뒤 오래된 콜백 거절, 쓰기 거부·무시·원본 동시 변경·손상 업데이트 보존, 읽기 전용 및 개인 모드 거절을 검증한다."),
  allow("apps/web/src/domains/creator/virtual-space/crdt/studio-virtual-space-yjs-doc.ts", "local-storage-cleanup", "key", 1, CLEANUP_ONLY, "studio-virtual-space-yjs-doc.test.tsx가 대상 저장·재읽기 성공 뒤 읽었던 개인 원본과 여전히 같은 값만 제거하고 실패하면 재시도 상태를 유지함을 검증한다."),
  // 2026-11-21 main 동기화: 새 로컬 작업 사본과 닫힌 배지를 실제 저장·복원·실패 보존 검증 뒤 등록한다.
  allow("apps/web/src/domains/creator/ai/studio-ai-generation-queue-store.ts", "durable-storage-write", '`${STORAGE_KEY_PREFIX}${documentId}`', 1, "문서별 최대24개 생성 초안과 미리보기의 브라우저 작업 사본이다. 실제 원고 적용은 별도 승인·삽입 실행기가 담당하며 서버 작업·과금·원고 저장의 정본이 아니다.", "studio-ai-generation-queue-store.test.ts가 documentId 봉투 격리, 기존 v1 복원, 복원 전 초안 병합, 손상·다른 문서 원본 보존, quota 실패의 메모리 초안과24개 한도를 검증한다."),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-live-ink-bake-bridge.ts", "durable-storage-write", "storageKeyForDocument(docId)", 1, "명시적 굽기로 만든 문서별 최대24개 캡처·출처·재촬영 인계 사본이다. 2D 삽입과 원고 정본 저장은 별도 경로이며 이 키는 브라우저 로컬 인계 기록만 소유한다.", "studio-bg3d-live-ink-bake-bridge.test.ts가 메모리 캐시 제거 후 재읽기, 문서 범위 거절, 손상 원본 보존, 저장 실패 때 기존 사본을4개로 줄여 덮지 않음, 무시된 저장 검출과24개 한도를 검증한다."),
  allow("apps/web/src/domains/creator/fresh-ideas/serialization-pace-model.ts", "local-storage-write", '"toonstudio.serialization-pace-board.v1"', 1, "이 기기의 개인 연재 계획·공정 진행 작업 사본이다. 계정·작품 서버 정본이나 원고 내용은 저장하지 않으며 닫힌 프리셋과 유한 수치·회차 라벨만 직렬화한다.", "serialization-pace-model.storage.test.ts와 CreatorSerializationPaceBoard.test.tsx가 계획 왕복·재마운트, 수치 한도, 원고 필드 제외, 손상 원본과 비유한 입력 및 quota 실패 보존을 검증한다."),
  allow("apps/web/src/domains/creator/studio-shell/studio-project-team-kanban-store.ts", "durable-storage-write", "kanbanStorageKey(state.projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "studio-project-team-kanban-store.test.ts가 version·projectId 봉투, 닫힌 공정 상태, 담당자·인계 메모 왕복과30개 이력, 다른 작품·손상·미지원 원본 거절, 저장 거부·무시 보존을 검증한다. 이 로컬 보드는 팀 권한이나 서버 승인 기록을 부여하지 않는다."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-work-status.ts", "local-storage-write", '"toonstudio:virtual-space:work-status:v1"', 1, UI_ONLY, "studio-virtual-space-work-status.storage.test.ts가 다섯 업무 배지의 왕복, 알 수 없는 입력 거절, 원고 키 보존, 저장 거부 때 기존값 유지와 성공 이벤트 미발행을 검증한다."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-work-status.ts", "local-storage-cleanup", '"toonstudio:virtual-space:work-status:v1"', 1, CLEANUP_ONLY, "studio-virtual-space-work-status.storage.test.ts가 명시적 배지 해제 시 해당 키만 제거하고 삭제 실패 시 기존 배지·다른 키를 유지함을 검증한다."),
  // 2026-11-12: 함수/주입 포트로 감싸진 sessionStorage 두 곳만 아래 payload·기본 저장소 변이 계약과 함께 허용한다.
  allow("apps/web/src/domains/creator/studio-shell/ActiveProjectContextBridge.tsx", "durable-storage-write", '"toonstudio:active-project-bridge:return:v1"', 1, "현재 history entry의 작품 선택·메뉴·초점 복귀용 탭 표식이며 원고·검색 query·저장 상태는 포함하지 않는다.", "ActiveProjectContextBridge.test.tsx가 native Back/SPA POP 복원과 소비 후 제거·저장 거부를 검증한다. 아래 계약은 sessionStorage 전용 getter와 정확한 다섯 필드 payload를 고정한다."),
  allow("apps/web/src/domains/creator/studio-shell/guided-flow/studio-assistant-session-store.ts", "durable-storage-write", '`${SESSION_KEY_PREFIX}${projectId}`', 1, "프로젝트별 도우미 입력·모드·검증된 응답의 같은 탭 UI 초안이며 원고 또는 기획 데이터의 정본 저장소가 아니다.", "StudioProjectAssistantPanel.test.tsx가 빈 입력 제거·작품별 분리·취소 시 입력 보존을 검증한다. 아래 계약은 sessionStorage 기본값, 6000자 prompt, 검증 결과만 기록하는 정확한 호출을 고정한다."),
  // 2026-11-07: 문서 권위가 아닌 정리와 표시 설정을 실제 저장 payload·복원 테스트로 검토했다.
  allow("apps/web/src/domains/creator/studio-shell/StudioSaveFirstProjectLibraryPage.tsx", "local-storage-cleanup", "studioProjectDocumentStorageKey(project.id)", 1, CLEANUP_ONLY, "프로젝트 제거 성공 뒤 해당 project.id의 메타데이터 키만 removeItem 한다. 아래 변이 검증은 같은 소유자의 setItem·다른 키·추가 호출을 거부한다."),
  allow("apps/web/src/domains/creator/virtual-space/office2d/studio-virtual-space-stage-mode.ts", "local-storage-write", '"toonstudio:virtual-space-stage-mode:v1"', 1, UI_ONLY, "studio-virtual-space-stage-mode.test.ts가 2d/3d enum만 저장하고 잘못된 값과 저장 실패를 거부하며 URL 우선권과 기본값 복원을 검증한다."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-entry-preference.ts", "local-storage-write", '"toonspectrum:virtual-space-nickname:v1"', 1, UI_ONLY, "studio-virtual-space-entry-preference.test.ts가 기존 v2 입장 프로필과 같은 정규화 닉네임만 호환 키에 저장하고 이메일·예약 신원을 거부함을 검증한다."),
  allow("apps/web/src/domains/creator/virtual-space/three/studio-virtual-space-three-motion.ts", "durable-storage-write", '"toonstudio:three-lighting-preset:v1"', 1, UI_ONLY, "studio-virtual-space-three-motion.test.ts가 day/studio/night 표시 프리셋만 sessionStorage 포트에 저장하고 잘못된 값·저장 거부 시 기존 상태를 보존함을 검증한다."),
  allow("apps/web/src/domains/creator/virtual-space/use-studio-space-lighting.ts", "local-storage-write", '"toonstudio:virtual-space-lighting:v1"', 1, UI_ONLY, "use-studio-space-lighting.test.tsx가 주야 표시 boolean·주기·시간 네 필드만 저장하고 손상된 값은 기본값으로 복원하며 문서·월드 payload가 저장되지 않음을 검증한다."),
  // Deletion-only cleanup of browser compatibility remnants.
  // Intentional change (2026-09, 984251d8c): the key expression moved into
  // useStudioDocumentAccessRuntime as `const autosaveKey = studioAutosaveKey({ userId:
  // studioAuthUserId, workId, remixId })` and reaches the host destructured. Same value, same
  // single deletion — only the expression at the call site changed.
  allow("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx", "local-storage-cleanup", "autosaveKey", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx", "local-storage-cleanup", "studioLifecycleAutosaveSidecarKey(autosaveKey)", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx", "local-storage-cleanup", "LEGACY_STUDIO_AUTOSAVE_KEY", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  // Intentional change (2026-08, B-17): the recovery-banner "clear" browser-mirror cleanup moved
  // with clearAutosaveRecord into studio-page-autosave-runtime.ts. Same three deletions, same
  // durable-tombstone-first ordering — only the file changed.
  allow("apps/web/src/domains/creator/studio-page-autosave-runtime.ts", "local-storage-cleanup", "autosaveKey", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-page-autosave-runtime.ts", "local-storage-cleanup", "studioLifecycleAutosaveSidecarKey(autosaveKey)", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-page-autosave-runtime.ts", "local-storage-cleanup", "LEGACY_STUDIO_AUTOSAVE_KEY", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  // Intentional change (2026-08, B-09): the post-save tombstone cleanup moved with
  // the extracted handleSave orchestration into studio-page-save-pipeline.ts.
  allow("apps/web/src/domains/creator/studio-page-save-pipeline.ts", "local-storage-cleanup", "autosaveKey", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-page-save-pipeline.ts", "local-storage-cleanup", "studioLifecycleAutosaveSidecarKey(autosaveKey)", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-page-save-pipeline.ts", "local-storage-cleanup", "LEGACY_STUDIO_AUTOSAVE_KEY", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  // 제한 저장도 서버 ACK·현재 계정/세대·동일 원고/intent·후속 intent 부재를 확인한 뒤의 두 미러만 정리한다.
  allow("apps/web/src/domains/creator/studio-collab/studio-scoped-page-save-pipeline.ts", "local-storage-cleanup", "deps.autosaveKey", 1, CLEANUP_ONLY, "studio-scoped-page-save-pipeline.test.ts가 정확한 서버 ACK 뒤 primary·sidecar 정리와 권한/세대 변경·저장 거절·다른 원고·후속 intent의 보존을 검사한다. 다른 계정/작품과 legacy 키는 모든 case에서 보존하며 이 호출은 쓰기 권위를 만들지 않는다."),
  allow("apps/web/src/domains/creator/studio-collab/studio-scoped-page-save-pipeline.ts", "local-storage-cleanup", "studioLifecycleAutosaveSidecarKey(deps.autosaveKey)", 1, CLEANUP_ONLY, "studio-scoped-page-save-pipeline.test.ts가 durable intent ACK 실패와 ACK 중 계정/문서/프로젝트 세대 변경 때 primary·sidecar를 보존하고 정상 저장 때만 함께 정리하는지 검사한다. 허용한 key·removeItem 종류·1회 범위 밖은 계속 거절한다."),
  allow("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx", "local-storage-cleanup", "STUDIO_AI_RECENT_PROMPTS_KEY", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  // Intentional change (2026-08): clipboard remnant cleanup moved with poser state
  // into useStudioVrmPoserState.ts. Same two deletions — only the file changed.
  allow("apps/web/src/domains/creator/vrm/useStudioVrmPoserState.ts", "local-storage-cleanup", '"studio_pose_clipboard"', 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/vrm/useStudioVrmPoserState.ts", "local-storage-cleanup", '"studio_vrm_full_clip"', 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-data-destruction.ts", "local-storage-cleanup", "key", 2, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-server-revision-restore-controller.ts", "local-storage-cleanup", "autosaveKey", 1, CLEANUP_ONLY, CLEANUP_PROOF),

  // Legacy injected UI helpers. Product UI settings use SQLite/OPFS, while sensitive clipboard
  // state uses sessionStorage and
  // therefore does not need (and must not gain) a durable-browser-storage allowance.
  allow("apps/web/src/domains/creator/studio-feature-tutorials.ts", "local-storage-write", '"toonstudio.studio.tutorialProgress.v1"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-asset-favorites.ts", "durable-storage-write", "studioAssetFavoriteStorageKey(userId)", 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/brush/studio-brush-slots.ts", "durable-storage-write", '"toonstudio-studio-brush-slots:v2"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/studio-effect-favorites.ts", "durable-storage-write", '"toonstudio-studio-effect-favorites:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/vrm/studio-vrm-poser-ux.ts", "durable-storage-write", "key", 1, UI_ONLY, UI_PROOF),
  // Realtime collaboration v19 view preferences: remote-cursor visibility mode and trail on/off.
  // Presentation state for one viewer's own overlay — no room, document, or peer data is stored.
  allow("apps/web/src/domains/creator/live/studio-live-viewport-preferences.ts", "local-storage-write", "\"toonspectrum:studio-live:viewport-preferences:v1\"", 1, UI_ONLY, UI_PROOF),
  // Exact-resume checkpoint: bounded page/selection ids plus normalized zoom/scroll ratios only.
  // Project content, history, comments, collaboration and source files remain outside this store.
  allow("apps/web/src/domains/creator/studio-resume-checkpoint.ts", "durable-storage-write", "\"toonstudio:studio-resume-checkpoints:v1\"", 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/studio-workspaces.ts", "durable-storage-write", "studioWorkspaceStorageKey(userId)", 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-exact-resume-context.ts", "durable-storage-write", "studioExactResumeStorageKey(context.projectId,context.documentId)", 1, UI_ONLY, UI_PROOF),
  // Reviewed 2026-10 (main 병합분): 안내를 봤는지·패널 배치·오버레이 위치 같은 화면 상태만 저장한다.
  allow("apps/web/src/domains/creator/character-shaper/useCharacterShaperGestureGuide.ts", "local-storage-write", '"toonstudio.character-shaper.gesture-guide.v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/scene-3d/StudioReferenceOverlay.tsx", "local-storage-write", '"toonstudio.reference-overlay.pose.v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/scene-3d/StudioReferenceOverlay.tsx", "local-storage-write", '"toonstudio.reference-overlay.layout.v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/scene-3d/StudioShaperPanel.tsx", "local-storage-write", '"toonstudio.shaper.guide.v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/scene-3d/studio-pose-guide-storage.ts", "local-storage-write", "guideStorageKey(scope)", 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/scene-3d/studio-pose-guide-storage.ts", "local-storage-cleanup", "guideStorageKey(scope)", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/workspace/studio-workspace-tour-state.ts", "durable-storage-write", '"toonstudio:workspace-tour:v1:home"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/workspace-layout/workspace-layout-store.ts", "durable-storage-write", '"toontudio.workspace-layouts.v1"', 1, UI_ONLY, UI_PROOF),
  // 가상 스튜디오: 아바타 외형·첫 방문 투어·이동 손맛(감도·가속) 설정. 월드·작품 데이터는 담지 않는다.
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-entry-preference.ts", "local-storage-write", '"toonspectrum:virtual-space-tour:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-entry-preference.ts", "local-storage-cleanup", '"toonspectrum:virtual-space-tour:v1"', 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-game-feel-preference.ts", "local-storage-write", '"toonspectrum:virtual-space-game-feel:v1"', 1, UI_ONLY, UI_PROOF),
  // 가상 스튜디오: 효과음 켬/음량, 공간 테마(닫힌 열거형 키 하나), 마지막 위치(장소·좌표·시각)만 저장한다.
  // 마지막 위치는 세션 복원과 별개의 재방문 복원 기록이며 월드 상태 자체는 담지 않는다.
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-sound-preference.ts", "local-storage-write", '"toonspectrum:virtual-space-sound:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/studio-project-library-sync.ts", "durable-storage-write", '"toonspectrum:studio-project-library-deleted:v1"', 2, "Pending permanent-delete id list for the signed-in library account sync only; the server merge is the authority and the list carries ids that the user already deleted, never project content.", "Both writes persist or trim a string-id array that is validated on read and cleared once the server acknowledges it; corrupt or blocked storage only delays propagation and cannot create or restore a project."),
  // 가상 스튜디오 클래식 공간의 검토 항목 13건 복원(2026-10-15). 73d962da 가 클래식 공간 모듈을 지우면서
  // 이 항목들을 stale 로 함께 지웠고, 4d2c3200 이 모듈을 되살릴 때 검토 항목은 되살리지 않아 가드가 붉어졌다.
  // 파일·종류·키·횟수와 근거 문장은 73d962da 직전 버전 그대로이며, 현재 코드의 호출 표현식도 그대로다.
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-avatar-store.ts", "local-storage-write", '"toonspectrum:virtual-space-avatar-profile:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-avatar-store.ts", "local-storage-cleanup", '"toonspectrum:virtual-space-avatar-profile:v1"', 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-theme.ts", "local-storage-write", '"toonspectrum:virtual-space-theme:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-last-position.ts", "durable-storage-write", "studioVirtualSpaceLastPositionStorageKey(projectId)", 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePage.tsx", "local-storage-write", "\"toonspectrum:virtual-atmosphere:v1\"", 1, UI_ONLY, "StudioVirtualSpacePage.social.test.tsx verifies only focus/balanced/lively presentation values persist and reload; corrupt or blocked storage cannot write document, world, or consent state."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-experience-preference.ts", "local-storage-write", "\"toonspectrum:virtual-space-experience:v1\"", 1, UI_ONLY, "The experience preference stores only closed presentation enums and booleans for controls, camera, nameplates, text size, quality, effects and start location; it cannot grant permissions, start media, carry project content, or execute code."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-environment-preference.ts", "local-storage-write", "\"toonspectrum:virtual-space-environment:v1\"", 1, UI_ONLY, "The environment preference stores only allowlisted bundled backdrop, day-phase and weather presentation enums; it cannot carry URLs, world geometry, project content, permissions or executable data."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-rewards.ts", "local-storage-write", "\"toonspectrum:virtual-space-rewards:v1\"", 1, UI_ONLY, "studio-virtual-space-rewards.test.ts bounds the inventory to twelve allowlisted cosmetic reward IDs; it stores no currency, chance, project content, permissions, or executable payloads."),
  allow("apps/web/src/domains/creator/virtual-space/use-studio-virtual-space-p2p-board.ts", "local-storage-write", "storageKey(scope,storageOwnerId)", 1, REVIEWED_LOCAL_WORKING_COPY, "use-studio-virtual-space-p2p-board.test.tsx proves the bounded whiteboard cache is account-, world-, board-, and content-revision-scoped and restores only the local participant's notes/strokes."),
  allow("apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceGuide.tsx", "local-storage-write", "\"toonspectrum:virtual-studio-guide:v1\"", 1, UI_ONLY, "Only the seen marker is stored. StudioVirtualSpaceGuide.test.tsx verifies skip, replay and unavailable storage without automatic movement, tool execution or document writes."),
  allow("apps/web/src/domains/creator/virtual-space/studio-workspace-video-legacy.ts", "indexeddb-open", '"toonstudio-workspace-recordings"', 1, LEGACY_IDB, "구 녹화 원본을 작품·계정별로 이관할 때만 연다. 새 녹화는 SQLite와 OPFS에 저장한다."),
  allow("apps/web/src/domains/creator/virtual-space/studio-workspace-video-legacy.ts", "indexeddb-cleanup", "delete", 1, CLEANUP_ONLY, "사용자가 고른 구 녹화의 [scope, id]만 같은 트랜잭션으로 삭제한다. 새 녹화와 다른 범위의 원본을 보존한다."),
  // 3D 포즈 갤러리의 즐겨찾기(핀)·최근 사용 id 목록(최대 64개). 잃어도 기본 갤러리로 돌아갈 뿐이다.
  allow("apps/web/src/domains/creator/scene-3d/studio-pose-preset-storage.ts", "durable-storage-write", "key", 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/scene-3d/studio-webtoon-pose-preset-storage.ts", "durable-storage-write", "key", 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/assistant/studio-workflow-pack-store.ts", "durable-storage-write", '"toonstudio:custom-workflow-packs:v1"', 2, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/assistant/studio-workflow-pack-telemetry.ts", "durable-storage-write", '"toonstudio:workflow-pack-telemetry:v1"', 1, UI_ONLY, UI_PROOF),
  // 제작 허브의 로컬 우선 부가 메타데이터: 버전 스냅샷은 HEAD revision 참조(revisionId·rootGraphHash)와
  // 이름·메모만, 공유 링크는 클라이언트 발급 토큰 표, 예약 발행은 예약·주간 패턴이다. 모두 읽을 때 형태를
  // 검사하고(readTable·readPersistedState), ProjectGraph의 불변 revision 이력이나 원고 본문을 대신하지 않는다.
  allow("apps/web/src/domains/creator/production-hub/production-manuscript-snapshots.ts", "local-storage-write", '"toonstudio.manuscript-snapshots.v1"', 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/production-hub/one-click-version-share-model.ts", "local-storage-write", '"toonstudio.version-share-links.v1"', 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/publish/publish-schedule-store.ts", "local-storage-write", '"toonstudio.publish-schedule.v1"', 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  // 서버 정본 동기화(CT-1)의 이관 완료 표식: 아티팩트별 이관 시각만 기록하고, 동기화 분기는 이 표식을
  // 읽지 않는다. 스냅샷·공유 링크 본체는 위의 검토된 로컬 스토어 두 곳이 소유한다.
  allow("apps/web/src/domains/creator/production-hub/production-manuscript-version-share-sync.ts", "local-storage-write", '"toonstudio.manuscript-version-share.migrated.v1"', 1, "Migration-completion marker for the server-canonical manuscript snapshot/share sync; it stores only per-artifact timestamps and confers no local authority.", "markMigrated is the only writer of this key and no sync branch reads it; runSync always merges from the server lists, so the marker cannot establish or refresh local authority."),

  // Injected localStorage-compatible codecs retained outside product authority selection.
  allow("apps/web/src/domains/creator/studio-animatic-timeline.ts", "durable-storage-write", "studioAnimaticStorageKey(document.workScope)", 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-autosave.ts", "durable-storage-write", "preservePrimary?studioLifecycleAutosaveSidecarKey(primaryKey):primaryKey", 2, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-lt-preset-storage.ts", "durable-storage-write", '"toonstudio.studio.bg3d.lt-presets.v1"', 2, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-lt-preset-storage.ts", "durable-storage-write", '"toonstudio.studio.bg3d.lt-presets.corrupt.v1"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-brand-kit.ts", "durable-storage-write", '"toonstudio-studio-brand-kits"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/brush/studio-brush-library-repository.ts", "durable-storage-write", "key", 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/brush/studio-brush-library-sqlite-repository.ts", "durable-storage-write", '"toonstudio-studio-v12-brush-library-fallback"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/brush/studio-brush-library.ts", "durable-storage-write", '"toonstudio-studio-brush-library"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-character-bible.ts", "durable-storage-write", "key", 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-checkpoints.ts", "durable-storage-write", "key", 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-checkpoints.ts", "durable-storage-write", "durableFallbackKey(key)", 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-clips.ts", "durable-storage-write", '"toonstudio-studio-clips"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-creator-pack-runtime.ts", "durable-storage-write", '"toonstudio.studio-creator-filter-presets.v1"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-creator-pack-runtime.ts", "durable-storage-write", "key", 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-custom-fonts.ts", "durable-storage-write", '"toonstudio-studio-custom-fonts"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-emeres-library.ts", "durable-storage-write", '"toonstudio-studio-emeres-library"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/filter/studio-filter-library-sqlite-repository.ts", "durable-storage-write", "storageKey", 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-marketplace-packages.ts", "durable-storage-write", '"toonstudio.studio-marketplace-library.v1"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-palette-library.ts", "durable-storage-write", '"toonstudio-studio-palette-library"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-pose-material-library.ts", "durable-storage-write", '"toonstudio-studio-pose-material-library-v1"', 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),
  allow("apps/web/src/domains/creator/studio-translation-memory.ts", "durable-storage-write", "key", 1, INJECTED_COMPATIBILITY, INJECTED_PROOF),

  // Reviewed browser-KV UI-only additions (file/key/kind/count exact; non-creative preferences only).
  allow("apps/web/src/domains/creator/StudioFileControlCenter.tsx", "local-storage-write", '"toonstudio-studio-file-control-center:recent-files:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/StudioFileControlCenter.tsx", "local-storage-cleanup", '"toonstudio-studio-file-control-center:recent-files:v1"', 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/StudioHelpHubDialog.tsx", "local-storage-write", "key", 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/StudioShortcutsHelp.tsx", "durable-storage-write", '"toonstudio-studio-shortcut-preset:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/StudioProjectCenterSearch.tsx", "local-storage-write", "key", 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/StudioUnifiedAssetSmartLibrary.tsx", "local-storage-write", "STUDIO_UNIFIED_ASSET_LIBRARY_STORAGE_KEY", 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-professional-workspace-layout.ts", "durable-storage-write", "studioBg3dProfessionalWorkspaceStorageKey(scopeKey)", 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/brush/studio-pen-button-policy-store.ts", "durable-storage-write", '"toonstudio:pen-button-policy:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/brush/studio-stylus-pressure-profile-store.ts", "durable-storage-write", '"toonstudio:stylus-pressure-profile:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/brush/studio-stylus-tilt-mouse-policy.ts", "durable-storage-write", '"toonstudio:stylus-tilt-mouse-policy:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/lettering/studio-bubble-library.ts", "durable-storage-write", '"toonstudio.studio.bubble-library.v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/production-hub/ProductionVisualPlanningWorkspace.tsx", "local-storage-write", '`production-planning-view:${aggregate.projectId}:${showEpisodeRail?"project":"episode"}`', 1, UI_ONLY, UI_PROOF),
  // 제작 보드의 카드 직접 정렬은 이 기기에만 남는 보기 설정이다(작업 상태·승인과 무관, 저장이 막히면 탭 안에서만 유지).
  allow("apps/web/src/domains/creator/production-hub/board/board-order.ts", "durable-storage-write", '`${STORAGE_PREFIX}${projectId}`', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/spatial-reader/StudioSpatialReaderPage.tsx", "local-storage-write", '`toonstudio-spatial-progress:${book.id}`', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/studio-template-catalog.ts", "durable-storage-write", '"toonspectrum:studio-template-favorites:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/studio-workspace-arrangement.ts", "durable-storage-write", '`${STUDIO_WORKSPACE_ARRANGEMENT_KEY}:${id}`', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/studio-workspace-arrangement.ts", "durable-storage-write", '"toonspectrum:studio:arrangement:v1"', 1, UI_ONLY, UI_PROOF),

  allow("apps/web/src/domains/creator/brush-lab/StudioBrushV6DraftGuard.tsx", "local-storage-write", '`${key}:source-mixbox`', 1, "사용자가 명시적으로 이전 Mixbox 초안을 전환하기 전에 exact 원문을 충돌 없는 별도 키에 보관하는 필수 원문 백업이다. 기존 초안의 호환 이주만 소유하며 원고·자동 저장·복구의 새 browser-KV 권위나 선택적 UI 상태가 아니다.", "StudioBrushV6DraftGuard.test.tsx가 사용자 선택 전 쓰기 없음, namespace·collision 사본 보존, exact 원문 재해석, readback·source mismatch·quota 실패 시 편집기 미개방, 100 suffix 상한에서 기존 사본의 무삭제·무덮어쓰기를 검증한다. 아래 AST finding 계약은 정확한 sourceAuthoring 쓰기 1회만 소유한다."),
  allow("apps/web/src/domains/creator/brush-lab/StudioBrushIntegratedWorkbench.tsx", "local-storage-write", "brushStudioV6StorageKey(scope)", 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/brush-lab/StudioBrushV5Composer.tsx", "local-storage-write", '"toonstudio.brush-studio-v5.library"', 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/brush-lab/StudioBrushV5Composer.tsx", "local-storage-write", '`${DRAFT_KEY_PREFIX}${encodeURIComponent(scope)}`', 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/brush-lab/StudioBrushV5QualityWorkbench.tsx", "local-storage-write", '`toonstudio.brush-quality-v1:${encodeURIComponent(scope)}`', 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/brush-lab/StudioBrushV5RuntimeWorkbench.tsx", "local-storage-write", '`toonstudio.brush-runtime-benchmark-v1:${encodeURIComponent(scope)}`', 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/brush-lab/StudioBrushV6Workbench.tsx", "local-storage-write", '"toonstudio.brush-studio.experience"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/brush-lab/StudioBrushV6Workbench.tsx", "local-storage-write", '`toonstudio.brush-program-v6:${encodeURIComponent(scope)}`', 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/brush/StudioMaterialBrushControls.tsx", "local-storage-write", '`toonstudio.brush-program-v6:${encodeURIComponent(`brush:${editorId}`)}`', 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),
  allow("apps/web/src/domains/creator/layer/StudioLayerFilterPresetShelf.tsx", "local-storage-write", "STUDIO_LAYER_FILTER_PRESET_STORAGE_KEY", 1, OPTIONAL_LOCAL_TOOL_STATE, OPTIONAL_LOCAL_TOOL_STATE_PROOF),

  allow("apps/web/src/domains/creator/ai/studio-ai-project-handoff.ts", "durable-storage-write", '"toonstudio:ai-project-handoff:v1"', 1, BOUNDED_LOCAL_CACHE, BOUNDED_LOCAL_CACHE_PROOF),
  allow("apps/web/src/domains/creator/project-graph/studio-project-graph-cache.ts", "durable-storage-write", "key", 1, BOUNDED_LOCAL_CACHE, BOUNDED_LOCAL_CACHE_PROOF),
  allow("apps/web/src/domains/creator/project-graph/studio-project-graph-device.ts", "durable-storage-write", '"toonstudio:project-graph-device:v1"', 1, BOUNDED_LOCAL_CACHE, BOUNDED_LOCAL_CACHE_PROOF),
  allow("apps/web/src/domains/creator/studio-document-window-coordination.ts", "durable-storage-write", "this.storageKey", 1, BOUNDED_LOCAL_CACHE, BOUNDED_LOCAL_CACHE_PROOF),
  allow("apps/web/src/domains/creator/studio-draft-save-outbox.ts", "durable-storage-write", "key", 2, BOUNDED_LOCAL_CACHE, BOUNDED_LOCAL_CACHE_PROOF),
  allow("apps/web/src/domains/creator/studio-template-catalog.ts", "durable-storage-write", '"toonspectrum:studio-template-handoff:v1"', 1, BOUNDED_LOCAL_CACHE, BOUNDED_LOCAL_CACHE_PROOF),

  allow("apps/web/src/domains/creator/studio-asset-governance.ts", "durable-storage-write", "studioAssetGovernanceStorageKey(projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/studio-localization-project-store.ts", "durable-storage-write", "storageKey(parsed.projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/studio-marketplace-submission-store.ts", "durable-storage-write", "studioMarketplaceSubmissionStorageKey(sellerId)", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/studio-project-diagnostic-source-store.ts", "durable-storage-write", "storageKey(source.projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/studio-project-document-store.ts", "durable-storage-write", "studioProjectDocumentStorageKey(state.projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/studio-project-feature-suite-store.ts", "durable-storage-write", "studioProjectFeatureSuiteStorageKey(id)", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/studio-project-library-store.ts", "durable-storage-write", "STUDIO_PROJECT_LIBRARY_STORAGE_KEY", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/studio-project-readiness-store.ts", "durable-storage-write", "storageKey(snapshot.projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/studio-review-history-store.ts", "durable-storage-write", "keyFor(projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),
  allow("apps/web/src/domains/creator/studio-series-kit-store.ts", "durable-storage-write", "studioSeriesKitStorageKey(kit.projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, REVIEWED_LOCAL_WORKING_COPY_PROOF),

  allow("apps/web/src/domains/creator/studio-cuttoon-editor/StudioTemplateHandoffHost.tsx", "local-storage-cleanup", "STUDIO_TEMPLATE_HANDOFF_KEY", 2, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-shell/useStudioProjectLibraryManagementController.ts", "local-storage-cleanup", "studioProjectDocumentStorageKey(projectId)", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/promo/promo-draft.ts", "indexeddb-open", '"toonstudio-promo-drafts"', 1, STANDALONE_DRAFT_IDB, STANDALONE_DRAFT_IDB_PROOF),
  allow("apps/web/src/domains/creator/promo/promo-draft.ts", "indexeddb-write", "put", 1, STANDALONE_DRAFT_IDB, STANDALONE_DRAFT_IDB_PROOF),

  // 2026-09-20 review of existing main additions: only the exact adjunct-draft calls below.
  // These are not canvas/revision authority. Project switching and blocked storage are exercised
  // by StudioProjectDraftIsolation.test.tsx; no directory-level or key-prefix exemption is added.
  allow("apps/web/src/domains/creator/studio-shell/StudioAudiencePolicyPanel.tsx", "local-storage-write", "audiencePolicyStorageKey(projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, "StudioProjectDraftIsolation.test.tsx exercises actual render, project switching, exact per-project writes, reload, and blocked browser storage."),
  allow("apps/web/src/domains/creator/studio-shell/StudioIpOpportunityPanel.tsx", "local-storage-write", "ipOpportunityStorageKey(projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, "StudioProjectDraftIsolation.test.tsx exercises actual render, project switching, exact per-project writes, reload, and blocked browser storage."),
  allow("apps/web/src/domains/creator/studio-shell/StudioStaffingSourcingPanel.tsx", "local-storage-write", "staffingBriefStorageKey(projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, "StudioProjectDraftIsolation.test.tsx exercises actual render, project switching, exact per-project writes, reload, and blocked browser storage."),
  allow("apps/web/src/domains/creator/studio-shell/StudioStoryDevelopmentPanel.tsx", "local-storage-write", "storyDevelopmentStorageKey(projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, "StudioProjectDraftIsolation.test.tsx exercises actual render, project switching, exact per-project writes, reload, and blocked browser storage."),

  allow("apps/web/src/domains/creator/creator-intelligence/studio-creator-intelligence-store.ts", "durable-storage-write", "storageKey(next.projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, "studio-creator-intelligence-store.test.ts verifies isolated, bounded, provenance-preserving research metadata, not imported canvas assets."),
  allow("apps/web/src/domains/creator/studio-mode-handoff.ts", "durable-storage-write", "handoffStorageKey(record.projectId)", 1, REVIEWED_LOCAL_WORKING_COPY, "studio-mode-handoff.test.ts verifies the project-scoped, bounded source-to-derived-document provenance record and rejects invalid project identities."),
  allow("apps/web/src/domains/creator/studio-shell/StudioCreatorSupportPage.tsx", "local-storage-write", "\"toonstudio:creator-support-request:v1\"", 1, OPTIONAL_LOCAL_TOOL_STATE, "The explicitly local support-request form exports JSON on user action; no server ticket or canonical project save is claimed."),
  allow("apps/web/src/domains/creator/studio-shell/StudioWebtoonProductionCompanion.tsx", "local-storage-write", "progressKey(projectId,stageId)", 1, UI_ONLY, "StudioWebtoonProductionCompanion.test.tsx proves presentation-only helper checkmarks reload without modifying project production tasks."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-entry-preference.ts", "local-storage-write", "\"toonspectrum:virtual-space-entry:v2\"", 1, UI_ONLY, "The entry gate stores only confirmed state, the normalized built-in avatar index, and a bounded 2–16 grapheme public nickname that rejects email and reserved identities; it cannot carry authored images, world geometry, permissions, or collaboration consent."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-entry-preference.ts", "local-storage-write", "\"toonspectrum:virtual-space-avatar:v1\"", 1, UI_ONLY, "Legacy avatar compatibility stores one normalized built-in avatar index only."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-customization.ts", "local-storage-write", "\"toonspectrum:virtual-space-character-customization:v1\"", 1, UI_ONLY, "studio-virtual-space-customization.test.ts bounds the payload to four closed cosmetic enums and rejects arbitrary assets, scripts, permissions, or document state."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-customization.ts", "local-storage-write", "decorationStorageKey(scope)", 1, REVIEWED_LOCAL_WORKING_COPY, "studio-virtual-space-customization.test.ts bounds built-in decoration tokens, count, coordinates, scale, rotation, unique IDs, exact keys, invalid writes, and deterministic fallback without granting canonical world authority."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-art-style.ts", "local-storage-write", "\"toonspectrum:virtual-space-art-style:v2\"", 1, UI_ONLY, "studio-virtual-space-art-style.test.ts bounds the value to six presentation-only art-direction keys; no world geometry, document state, media consent, or remote authority is stored."),
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-art-style.ts", "local-storage-cleanup", "\"toonspectrum:virtual-space-art-style:v1\"", 1, CLEANUP_ONLY, "A successful v2 presentation preference write removes only the legacy v1 art-style key."),
  // 가상 스튜디오 빌드 모드 배치 목록과 타일 이펙트 초안: 꾸미기(decorations)는 서버 정본 계약이라
  // 얹을 수 없어 이 브라우저 로컬 범위로 확정한 작업 사본이다. 읽을 때 저장값을 다시 검증·살균한다.
  allow("apps/web/src/domains/creator/virtual-space/studio-virtual-space-placed-fixtures.ts", "local-storage-write", "storageKey(scope)", 1, REVIEWED_LOCAL_WORKING_COPY, "studio-virtual-space-placed-fixtures.test.ts verifies the localStorage round-trip, scope isolation, corrupt-value rejection, catalog/coordinate/rotation validation, and the 24-item placement cap."),

  // Explicit legacy IndexedDB seams. Operation counts prevent a file-level blanket exemption.
  allow("apps/web/src/domains/creator/bg3d/bg3d-model-library.ts", "indexeddb-open", '"toonstudio-studio-bg3d-model-library"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/bg3d/bg3d-model-library.ts", "indexeddb-write", "add", 2, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/bg3d/bg3d-model-library.ts", "indexeddb-write", "put", 3, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/bg3d/bg3d-model-library.ts", "indexeddb-cleanup", "delete", 2, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/bg3d/bg3d-template-library.ts", "indexeddb-open", '"toonstudio-studio-bg3d-template-library"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/bg3d/bg3d-template-library.ts", "indexeddb-write", "put", 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/bg3d/bg3d-template-library.ts", "indexeddb-cleanup", "delete", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-asset-library.ts", "indexeddb-open", '"toonstudio-studio-asset-library"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-asset-library.ts", "indexeddb-write", "put", 3, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-asset-library.ts", "indexeddb-cleanup", "delete", 2, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-asset-metadata-store.ts", "indexeddb-open", '"toonstudio-studio-bg3d-asset-metadata"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-asset-metadata-store.ts", "indexeddb-write", "put", 2, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-asset-metadata-store.ts", "indexeddb-cleanup", "delete", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-shot-batch-recovery-store.ts", "indexeddb-open", '"toonstudio-studio-bg3d-shot-batch-recovery"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-shot-batch-recovery-store.ts", "indexeddb-write", "put", 2, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/bg3d/studio-bg3d-shot-batch-recovery-store.ts", "indexeddb-cleanup", "delete", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-checkpoints.ts", "indexeddb-open", '"toonstudio-studio-checkpoints"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-checkpoints.ts", "indexeddb-write", "put", 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/live/studio-crdt-outbox.ts", "indexeddb-open", '"toonstudio-studio-crdt-outbox"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/live/studio-crdt-outbox.ts", "indexeddb-write", "put", 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/live/studio-crdt-outbox.ts", "indexeddb-cleanup", "delete", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/studio-pages-history-durable-runtime.ts", "indexeddb-open", '"toonstudio-studio-crdt-recovery-vault"', 1, HISTORY_LEGACY_IDB, HISTORY_LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-pages-history-durable-runtime.ts", "indexeddb-write", "put", 4, HISTORY_LEGACY_IDB, HISTORY_LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-production-bible.ts", "indexeddb-open", '"toonstudio-studio-production-bible"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-production-bible.ts", "indexeddb-write", "put", 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-production-bible.ts", "local-storage-write", "normalizeStudioProductionBibleStorageKey(key)", 2, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-scene-snapshot-library.ts", "indexeddb-open", '"toonstudio-studio-scene-snapshot-library"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-scene-snapshot-library.ts", "indexeddb-write", "put", 2, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/studio-scene-snapshot-library.ts", "indexeddb-cleanup", "delete", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/vrm/studio-vrm-texture-paint-library.ts", "indexeddb-open", '"toonstudio-studio-vrm-texture-paint-library"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/vrm/studio-vrm-texture-paint-library.ts", "indexeddb-write", "put", 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/vrm/studio-vrm-texture-paint-library.ts", "indexeddb-cleanup", "delete", 2, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/vrm/vrm-library.ts", "indexeddb-open", '"toonstudio-studio-vrm-library"', 1, LEGACY_IDB, LEGACY_IDB_PROOF),
  allow("apps/web/src/domains/creator/vrm/vrm-library.ts", "indexeddb-write", "put", 6, VRM_LIBRARY_MIXED_PERSISTENCE, VRM_LIBRARY_MIXED_PERSISTENCE_PROOF),
  allow("apps/web/src/domains/creator/vrm/vrm-library.ts", "indexeddb-cleanup", "delete", 2, CLEANUP_ONLY, CLEANUP_PROOF),

  // 프로젝트 썸네일: 저장 정본은 OPFS 파일 쌍이고, 이 IndexedDB는 이관 소스이자 OPFS를 못 쓰거나
  // OPFS 쓰기가 실패할 때만 쓰는 설계된 폴백 티어다 (이전 누락 잔재 아님 — 폴백 전용 테스트가 있다).
  allow("apps/web/src/domains/creator/studio-project-thumbnail.ts", "indexeddb-open", '"toonstudio-project-thumbnails"', 1, THUMBNAIL_IDB_FALLBACK, THUMBNAIL_IDB_FALLBACK_PROOF),
  allow("apps/web/src/domains/creator/studio-project-thumbnail.ts", "indexeddb-write", "put", 1, THUMBNAIL_IDB_FALLBACK, THUMBNAIL_IDB_FALLBACK_PROOF),
  allow("apps/web/src/domains/creator/studio-project-thumbnail.ts", "indexeddb-cleanup", "delete", 1, CLEANUP_ONLY, CLEANUP_PROOF),

  // 2026-10-15 CI 복구 검토: 고도화 마라톤(c5913641)·후속 정리(6faf6cd5)·내 이야기 핸드오프(c62f9ea0)가 더한
  // 브라우저 로컬 저장 25건. 파일·종류·키 표현식·횟수를 하나씩 고정하며 디렉터리·접두사 단위 면제는 없다.
  // canvas 문서·ProjectGraph revision 이력·권한·공유 협업 상태의 정본을 허용하는 것이 아니다. 서버 동기화가
  // 아직 없는 로컬 작업 사본은 근거 문장에 그 사실을 적었고, 서버 저장이나 SQLite/OPFS 저장소로 옮겨지면 이
  // 항목들도 함께 줄여야 한다(이 구역은 늘기만 하면 안 된다).

  // 기획·세계관 작업 사본: 주입된 저장소 포트로만 쓰고, 읽을 때 엄격 파서를 거쳐 다른 프로젝트·깨진 값은 걸러낸다.
  allow("apps/web/src/domains/creator/planning/studio-planning-store.ts", "durable-storage-write", "storageKey(state.projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "studio-planning-connection.test.ts covers first-open creation, save with a bumped revision, re-read, and rejection of another project's or malformed snapshots; writeStudioProjectPlanning stores only parseStudioProjectPlanning output under the projectId-scoped key."),
  allow("apps/web/src/domains/creator/planning/studio-world-lore-store.ts", "durable-storage-write", "storageKey(lore.projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "studio-world-lore.test.ts covers the empty ensure, the round trip, and rejection of another project's snapshot; writeStudioWorldLore stores only parseStudioWorldLore output under the projectId-scoped key."),
  allow("apps/web/src/domains/creator/studio-world-wiki-store.ts", "durable-storage-write", "storageKey(settings.projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "studio-world-wiki.test.ts covers the store round trip, rejection of another project, and a broken value reading as null; writeStudioWorldWikiSettings stores only parseStudioWorldWikiSettings output, and the public view is generated locally from it until a server publication contract exists."),
  allow("apps/web/src/domains/creator/planning/studio-foreshadow-ledger.ts", "durable-storage-write", "storageKey(state.projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "studio-foreshadow-ledger.test.ts covers the store round trip and rejection of malformed snapshots and of seeds from another project; writeStudioForeshadowLedger stores only parseStudioForeshadowLedger output, which also requires every seed to carry the ledger's projectId."),
  allow("apps/web/src/domains/creator/planning/studio-moodboard.ts", "durable-storage-write", "storageKey(normalizedProjectId)", 1, PLANNING_LOCAL_WORKING_COPY, "studio-moodboard.test.ts covers per-project isolation, reopening with the same layout, and rejection of broken boards; saveStudioProjectMoodboard re-deserializes the board and throws on an invalid card, column, or reference before the single setItem."),
  allow("apps/web/src/domains/creator/production-hub/team-playbook-model.ts", "durable-storage-write", "storageKey(state.projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "team-playbook-model.test.ts covers ensure, write, and re-read and rejection of broken or other-project snapshots; writeStudioPlaybook stores only parseStudioPlaybook output, which requires every card to carry the playbook's projectId."),
  allow("apps/web/src/domains/creator/production-hub/team-pilot-template-model.ts", "durable-storage-write", "storageKey(state.workspaceId)", 1, PLANNING_LOCAL_WORKING_COPY, "team-pilot-template-model.test.ts covers the ensure, upsert, write, and read round trip, refuses to mix another workspace's runs or templates, and recovers a broken snapshot as null; writeStudioTeamPilot stores only parseStudioTeamPilot output under the workspaceId-scoped key."),
  allow("apps/web/src/domains/creator/planning/studio-fact-concordance.ts", "local-storage-write", "factConcordanceStorageKey(projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "studio-fact-concordance.test.ts round-trips the side data and drops broken records on read; only check verdicts and the fix and lore-revision trails (before/after text of the corrected segment or lore field, keyed by episode, segment, or entry) are stored here, the lore entries and the manuscript live in their own stores, and a write failure is swallowed so the concordance index is not blocked."),
  allow("apps/web/src/domains/creator/lettering/studio-dialogue-spellcheck-qc.ts", "durable-storage-write", "dialogueSpellcheckQcStorageKey(record.projectId,record.episodeId)", 1, REVIEW_TOOL_LOCAL_STATE, "studio-dialogue-spellcheck-qc.test.ts covers save, load, per-episode isolation, rejection of forged records, and a throwing storage reading as no record; the record is a per-episode count summary plus a timestamp, a key/content mismatch reads as no record, and a storage exception returns false."),
  allow("apps/web/src/domains/creator/my-story/my-story-handoff.ts", "durable-storage-write", "storyDevelopmentStorageKey(projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "my-story-handoff.test.ts reads the written StudioStoryDevelopmentDocument back through storyDevelopmentStorageKey and covers rolling back the half-created project when the write fails; the key and document shape are those of the already reviewed StudioStoryDevelopmentPanel write, so no new storage format is introduced."),
  allow("apps/web/src/domains/creator/ai-quick-blueprint/ai-quick-blueprint-handoff.ts", "durable-storage-write", "storyDevelopmentStorageKey(projectId)", 1, PLANNING_LOCAL_WORKING_COPY, "ai-quick-blueprint-engine.test.ts가 같은 projectId 키의 version 1 대본을 실제 재읽고, 다른 작품의 문서·비트를 보존하며 대본 쓰기 거부 시 새 프로젝트 rollback과 기존 원문 보존을 검증한다. 기존 my-story 및 대본 패널과 같은 로컬 기획 작업 사본이며 원고 정본·권한·서버 동기화 저장소를 추가하지 않는다."),
  // 검수 도구의 이 기기 한정 작업 상태. 비교 댓글(ProductionEpisodeReviewRoom 주석)과 팀 투표(TeamVotePanel 주석)는
  // 서버 저장이 아직 없는 로컬 전용이라 후속 이관 대상이다 — 승인 기록과 원고 핀 문서는 별개다.
  allow("apps/web/src/domains/creator/production-hub/production-review-local-state.ts", "durable-storage-write", "key", 1, REVIEW_TOOL_LOCAL_STATE, "production-review-local-state.test.ts와 .react.test.tsx가 실제 로그인 UID·프로젝트·작품·회차별 비교 이미지/댓글 분리, 계정 전환의 메모리 초기화, 잘못된 봉투 거절과 소유자 없는 기존 원문 보존을 검사한다. 기존 세션·댓글 직렬화는 이 로컬 작업 사본 봉투 안에 유지한다."),
  allow("apps/web/src/domains/creator/production-hub/compare-send-inbox.ts", "durable-storage-write", "compareSendInboxKey(scope)", 1, REVIEW_TOOL_LOCAL_STATE, "compare-send-inbox.test.ts와 production-review-local-state.react.test.tsx가 실제 UID·작품별 격리, stale 쓰기 거절, 초안 저장·재확인 뒤 정확한 전송본만 ACK하고 새 전송·교체본과 저장 실패 원문을 보존하는 경로를 검사한다. 동일 PNG·항목 수 한도와 소유자 없는 기존 원문은 유지한다. 이 개인 로컬 수신함은 서버 원고·승인 기록의 정본이 아니다."),
  allow("apps/web/src/domains/creator/production-hub/ReviewPlaylistPanel.tsx", "local-storage-write", "reviewPlaylistStorageKey(aggregate.projectId)", 1, REVIEW_TOOL_LOCAL_STATE, "review-playlist-model.test.ts pins the serialize/parse round trip, null for broken values, and no verdict restore for a session of another date; approvals are recorded separately through the ReviewDecision command, and the panel only keeps the saved playlist verdicts."),
  allow("apps/web/src/domains/creator/production-hub/ReviewPlaylistPanel.tsx", "local-storage-cleanup", "reviewPlaylistStorageKey(aggregate.projectId)", 1, CLEANUP_ONLY, CLEANUP_PROOF),
  allow("apps/web/src/domains/creator/production-hub/TeamVotePanel.tsx", "local-storage-write", "teamVoteStorageKey(projectId,episodeId)", 1, REVIEW_TOOL_LOCAL_STATE, "team-vote-model.test.ts pins the serialize/parse round trip, rejection of broken JSON, a wrong version, ghost votes, and duplicate session ids, and project/episode key isolation; the panel stops writing while the stored value is broken so it never overwrites unreadable data."),
  allow("apps/web/src/domains/creator/production-hub/ProductionExternalReviewPage.tsx", "local-storage-write", "externalReviewDraftKey(params.reviewId)", 1, REVIEW_TOOL_LOCAL_STATE, "external-review-entry.test.ts pins the serialize/parse round trip, per-review key separation, and null for broken values; the draft is the reviewer's own unsent text and is removed after the review is submitted."),
  allow("apps/web/src/domains/creator/production-hub/ProductionExternalReviewPage.tsx", "local-storage-cleanup", "externalReviewDraftKey(params.reviewId)", 1, CLEANUP_ONLY, CLEANUP_PROOF),

  // 화면 설정·진행 표시: 닫힌 열거형이나 경계가 있는 값만 담는다.
  allow("apps/web/src/domains/creator/production-hub/collab-notification-landing-source.ts", "durable-storage-write", '"toonstudio.collab-inbox.read-ids.v1"', 1, UI_ONLY, "collab-notification-landing-source.test.ts pins the save/load round trip through an injected storage and a broken value degrading to an empty set; at most 500 read ids are kept, non-string entries are dropped on read, and a storage failure only keeps the read marks in the session."),
  allow("apps/web/src/domains/creator/production-hub/CutSignalLightsPanel.tsx", "local-storage-write", "CUT_SIGNAL_SETTINGS_STORAGE_KEY", 1, UI_ONLY, "cut-signal-lights.test.ts pins the serialize/parse round trip with broken values and unknown rules dropped; the value is the set of enabled signal rules, and the panel writes only when it owns the settings."),
  allow("apps/web/src/domains/creator/production-hub/use-preferred-process-lens.ts", "local-storage-write", "processLensStorageKey(projectId)", 1, UI_ONLY, "use-preferred-process-lens.test.ts pins parseProcessLens, which accepts only the closed lens values; an unreadable or invalid value falls back to the all-process lens and a write failure keeps the selection in session state."),
  allow("apps/web/src/domains/creator/studio-example-project-content.ts", "durable-storage-write", '"toonspectrum:studio-example-journey:v1"', 1, UI_ONLY, "studio-example-project-content.test.ts exercises the journey steps through an injected storage including corrupt storage; readExampleJourney keeps only known step ids and a boolean dismissed flag, and a broken value reads as an empty journey."),

  // 장비·도구 단위 선택 저장: 잃어도 기본값으로 돌아갈 뿐이고, 읽을 때 다시 검증한다.
  allow("apps/web/src/domains/creator/scene-3d/studio-shaper-style-pack.ts", "durable-storage-write", '"toonstudio.shaper.style-packs.v1"', 1, OPTIONAL_LOCAL_TOOL_STATE, "studio-shaper-style-pack.test.ts pins the save and reload round trip, per-pack fail-closed parseCharacterStylePack (broken entries are skipped and counted), rejection with pack-limit when the user pack limit would be exceeded, and an honest storage-unavailable failure."),
  allow("apps/web/src/domains/creator/submission-package/submission-package-draft-store.ts", "durable-storage-write", "submissionDraftStorageKey(projectId)", 1, OPTIONAL_LOCAL_TOOL_STATE, "submission-package-draft-store.test.ts covers the text-only round trip, per-project keys, rejection of malformed or other-version values, length and episode-count caps, storage-error swallowing with an observable result, and that picked image files are never stored; only the submission form text is written, so losing it cannot corrupt a project."),

  // 예제·샘플 원고 시딩: 라이브러리 진입 시 레거시 형식 자동저장 기록을 빈 슬롯에만 심고, 연습 사본은 버튼을 눌렀을 때
  // 새 사본의 문서 id 슬롯에 한 번 쓴다. 제품 자동저장 정본은 OPFS/SQLite 이고 브라우저 단독 기록은 복구가 막힌다.

  // 2026-10-29 CI 복구 검토: 가상 스튜디오 HUD(c2b7d489·0a00569c)·2D 사무실(40179e94)·일러스트 무대 HUD가 더한
  // 화면 설정 8건. 상태 배지·동행 펫·상태 모자·작업 앱 표시는 닫힌 열거형, 근접 설정은 불리언과 효과음 열거형,
  // 사무실은 내 지정석 id 와 음소거 여부만 담는다. 읽을 때 허용 목록이나 기본값으로 되돌리고(일러스트 무대의 걷기
  // 방향·방·이모트는 없을 때 기본값만 채운다), 저장이 막히면 메모리 상태만 유지한다. 월드·작품 데이터는 담지 않는다.
  // 일러스트 무대 키의 예전 이름은 2581998a 가 사용자 선택을 보존하려고 일부러 남겼다.
  allow("apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceIllustratedStageHud.tsx", "local-storage-write", '"toonspectrum:nano-banana-studio-selection:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/hud/space-dock-model.ts", "local-storage-write", '"toonspectrum:virtual-space-status-urgency:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/hud/space-dock-model.ts", "local-storage-write", '"toonspectrum:virtual-space-companion:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/hud/space-dock-model.ts", "local-storage-write", '"toonspectrum:virtual-space-proximity-prefs:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/hud/space-dock-model.ts", "local-storage-write", '"toonspectrum:virtual-space-status-hat:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/hud/space-dock-model.ts", "local-storage-write", '"toonspectrum:virtual-space-active-dcc:v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/office2d/office2d-stage-extensions.ts", "local-storage-write", '"toonstudio:office2d:my-seat-v1"', 1, UI_ONLY, UI_PROOF),
  allow("apps/web/src/domains/creator/virtual-space/office2d/office2d-stage-extensions.ts", "local-storage-write", '"toonstudio:office2d:sound-muted-v1"', 1, UI_ONLY, UI_PROOF),

  // 2026-11-23 CI 복구 검토: 오프라인 소유자 프리뷰 영수증(9b6417f2cc)은 원고나 인증 토큰을 localStorage에
  // 저장하지 않고, HTTP 캐시(Vary: Cookie + HttpOnly 쿠키 검증)를 선택하는 불투명 UUID 셀렉터와 공개 reader
  // 능력 헤더 문자열만 기록·정리한다. 만료 시각과 쿠키 검증은 서버 영수증이 전담한다.
  allow(
    "apps/web/src/domains/creator/offline/studio-offline-owner-receipt.ts",
    "local-storage-cleanup",
    "offlineWorkCacheKey(workId)",
    1,
    CLEANUP_ONLY,
    "studio-offline-owner-receipt.test.ts와 studio-offline-owner-bootstrap.test.ts가 401/403/404 또는 명시적 무효화 시 작품별 캐시 버전 셀렉터 키만 제거함을 검증한다.",
  ),
  allow(
    "apps/web/src/domains/creator/offline/studio-offline-owner-receipt.ts",
    "local-storage-write",
    "OFFLINE_PREVIEW_SCOPE_KEY",
    1,
    OPTIONAL_LOCAL_TOOL_STATE,
    "studio-offline-owner-receipt.test.ts와 studio-offline-owner-bootstrap.test.ts가 불투명 랜덤 UUID scope 셀렉터만 저장하고 원고·토큰 권한을 부여하지 않음을 검증한다.",
  ),
  allow(
    "apps/web/src/domains/creator/offline/studio-offline-owner-receipt.ts",
    "local-storage-write",
    "key",
    1,
    OPTIONAL_LOCAL_TOOL_STATE,
    "studio-offline-owner-receipt.test.ts가 작품별 불투명 랜덤 UUID HTTP 캐시 버전 셀렉터만 저장하고 실제 소유자 판정은 Vary: Cookie 서버 영수증과 expiresAt으로 검증함을 보장한다.",
  ),
  allow(
    "apps/web/src/domains/creator/offline/studio-offline-owner-receipt.ts",
    "local-storage-write",
    '"toonstudio:offline-preview:reader:v1"',
    1,
    OPTIONAL_LOCAL_TOOL_STATE,
    "studio-offline-owner-bootstrap.test.ts가 초기 로더용 공개 STUDIO_READER_CAPABILITY_HEADERS 문자열만 기록하며 사용자 신원·권한은 HttpOnly 쿠키로만 확인함을 검증한다.",
  ),
]);

function allowanceId(value: Pick<BrowserKvFinding | BrowserKvAllowance, "file" | "kind" | "key">) {
  return `${value.file}\u0000${value.kind}\u0000${value.key}`;
}

function unauthorizedFindings(
  findings: readonly BrowserKvFinding[],
  allowances: readonly BrowserKvAllowance[],
): readonly string[] {
  const allowanceById = new Map(allowances.map((entry) => [allowanceId(entry), entry] as const));
  const grouped = new Map<string, BrowserKvFinding[]>();
  for (const entry of findings) {
    const id = allowanceId(entry);
    const group = grouped.get(id) ?? [];
    group.push(entry);
    grouped.set(id, group);
  }
  const problems: string[] = [];
  for (const [id, entries] of grouped) {
    const allowance = allowanceById.get(id);
    if (!allowance) {
      problems.push(...entries.map((entry) =>
        `${entry.file}:${entry.line} ${entry.kind} key=${entry.key} call=${entry.call}`));
      continue;
    }
    if (entries.length !== allowance.occurrences) {
      problems.push(
        `${allowance.file} ${allowance.kind} key=${allowance.key}: `
        + `expected ${allowance.occurrences} occurrence(s), found ${entries.length}`,
      );
    }
  }
  for (const allowance of allowances) {
    if (!grouped.has(allowanceId(allowance))) {
      problems.push(
        `${allowance.file} ${allowance.kind} key=${allowance.key}: stale allowance (0 found)`,
      );
    }
  }
  return Object.freeze(problems.sort());
}

describe("Studio browser-KV authority boundary", () => {
  it("keeps companion layout and presentation-safe product paths free of localStorage authority", () => {
    for (const source of [COMPANION_PAGE_SOURCE, COMPANION_LAYOUT_HOOK_SOURCE]) {
      expect(source).not.toContain("localStorage");
      expect(source).not.toMatch(/\b(?:getItem|setItem|removeItem)\s*\(/u);
    }
    expect(COMPANION_LAYOUT_HOOK_SOURCE).toContain(
      "createStudioCompanionWindowPreferencesRuntime",
    );
    expect(COMPANION_PAGE_SOURCE).toContain("buildStudioCompanionPresentationSafe");
  });

  it("keeps pages-history IndexedDB behind an explicit legacy vault seam", () => {
    const factoryStart = PAGES_HISTORY_DURABLE_RUNTIME_SOURCE.indexOf(
      "export async function createDefaultStudioPagesHistoryDurableRuntime(",
    );
    expect(factoryStart).toBeGreaterThanOrEqual(0);
    const defaultFactory = PAGES_HISTORY_DURABLE_RUNTIME_SOURCE.slice(factoryStart);

    expect(defaultFactory).not.toContain("createStudioPagesHistoryIndexedDbRecoveryVault(");
    expect(defaultFactory).not.toContain("scope.indexedDB");
    expect(defaultFactory).toContain("existingRecoveryVault: options.legacyRecoveryVault ?? null");
    expect(defaultFactory).toContain("createStudioPagesHistoryMemoryRecovery(identity)");
    expect(defaultFactory).toContain('persistenceKind = "memory-only"');
  });

  it("rejects direct, aliased, key-obscured, native-IDB, and wrapper-IDB durable writes", () => {
    const fixtures = [
      `localStorage.setItem("toonstudio-studio-autosave", payload);`,
      `window.localStorage.setItem("studio-project-v12", payload);`,
      `globalThis.localStorage.setItem("studio-vrm-calibration", payload);`,
      `window.localStorage.setItem("studio_pose_clipboard", payload);`,
      `const browserKv = globalThis.localStorage; browserKv.setItem("brush-library", payload);`,
      `const typedKv = (globalThis.localStorage as Storage); typedKv["setItem"]("studio-project", payload);`,
      `const AUTOSAVE_KEY = "opaque"; storage.setItem(AUTOSAVE_KEY, payload);`,
      `const key = "toonstudio-studio-autosave"; storage.setItem(key, payload);`,
      `indexedDB.open("studio-crdt", 1);`,
      `function open(factory: IDBFactory) { return factory.open("studio-filter", 1); }`,
      `function write(store: IDBObjectStore) { store.put(payload); }`,
      `import Dexie from "dexie"; const db = new Dexie("studio-project"); db.table("p").put(payload);`,
      `import { openDB } from "idb"; openDB("studio-scene", 1);`,
      `const { openDB } = await import("idb"); openDB("studio-document", 1);`,
      String.raw`storage.set\u0049tem("studio-project", payload);`,
      String.raw`storage["set\Item"]("studio-project", payload);`,
    ] as const;

    for (const [index, fixture] of fixtures.entries()) {
      expect(mayContainBrowserKvAuthority(fixture), fixture).toBe(true);
      expect(
        analyzeBrowserKvSource(`fixture-${index}-studio-project.ts`, fixture),
        fixture,
      ).not.toHaveLength(0);
    }
  });

  it("검수 초안과 비교 수신함의 주입 저장 포트는 불투명한 키도 검사한다", () => {
    for (const file of REVIEW_LOCAL_STORAGE_PORT_FILES) {
      expect(analyzeBrowserKvSource(file, `storage.setItem("opaque", payload);`)).toEqual([
        expect.objectContaining({ file, kind: "durable-storage-write", key: '"opaque"' }),
      ]);
    }
  });

  it("skips AST construction only when no detectable browser-KV surface exists", () => {
    const inertSource = `
      export function renderStudioPreview(frame: Uint8Array): number {
        return frame.reduce((sum, value) => sum + value, 0);
      }
    `.repeat(2_000);

    expect(mayContainBrowserKvAuthority(inertSource)).toBe(false);
    expect(analyzeBrowserKvSource("large-inert-studio-source.ts", inertSource)).toEqual([]);
  });

  it("does not classify direct, qualified, or aliased sessionStorage writes as durable authority", () => {
    const fixtures = [
      `sessionStorage.setItem("studio_pose_clipboard", payload);`,
      `window.sessionStorage.setItem("studio_vrm_full_clip", payload);`,
      `globalThis.sessionStorage["setItem"]("studio-project-draft", payload);`,
      `const sessionKv = globalThis.sessionStorage; sessionKv.setItem("studio-scene", payload);`,
      `const typedSessionKv = (window.sessionStorage as Storage); typedSessionKv.setItem("studio-brush", payload);`,
    ] as const;

    for (const [index, fixture] of fixtures.entries()) {
      expect(
        analyzeBrowserKvSource(`fixture-${index}-studio-project.ts`, fixture),
        fixture,
      ).toEqual([]);
    }
  });

  it("accepts an exact UI preference, cleanup, and legacy-import allowance", () => {
    const fixtures = [
      {
        file: "fixture-ui.ts",
        source: `localStorage.setItem("studio-ui-density", "compact");`,
        kind: "local-storage-write" as const,
        key: `"studio-ui-density"`,
        rationale: "UI density only; no project or creative payload.",
        proof: "The key stores one closed enum and is not consumed by an IR repository.",
      },
      {
        file: "fixture-cleanup.ts",
        source: `globalThis.localStorage.removeItem("toonstudio-studio-autosave");`,
        kind: "local-storage-cleanup" as const,
        key: `"toonstudio-studio-autosave"`,
        rationale: "Deletion-only cleanup cannot create browser-KV authority.",
        proof: "The source contains removeItem and no setItem call.",
      },
      {
        file: "fixture-legacy.ts",
        source: `function legacy(factory: IDBFactory) { return factory.open("legacy-studio", 1); }`,
        kind: "indexeddb-open" as const,
        key: `"legacy-studio"`,
        rationale: "Explicit legacy import/test seam; product boot cannot call it.",
        proof: "The production factory owns SQLite/OPFS and LEGACY_DATA_MIGRATION is false.",
      },
    ] as const;

    const findings = fixtures.flatMap(({ file, source }) => analyzeBrowserKvSource(file, source));
    const allowances = fixtures.map(({ file, kind, key, rationale, proof }) => ({
      file,
      kind,
      key,
      occurrences: 1,
      rationale,
      proof,
    }));
    expect(unauthorizedFindings(findings, allowances)).toEqual([]);
  });

  it("requires cleanup allowances to match the exact finding kind and occurrence count", () => {
    const file = "fixture-cleanup-count.ts";
    const rationale = "Deletion-only compatibility cleanup cannot establish durable authority.";
    const proof = "The exact key and expected number of removeItem calls are independently pinned.";
    const allowance = allow(
      file,
      "local-storage-cleanup",
      '"legacy-studio-project"',
      1,
      rationale,
      proof,
    );
    const duplicateCleanup = analyzeBrowserKvSource(
      file,
      `localStorage.removeItem("legacy-studio-project");\nlocalStorage.removeItem("legacy-studio-project");`,
    );
    expect(unauthorizedFindings(duplicateCleanup, [allowance])).toContain(
      `${file} local-storage-cleanup key="legacy-studio-project": expected 1 occurrence(s), found 2`,
    );

    const writeInstead = analyzeBrowserKvSource(
      file,
      `localStorage.setItem("legacy-studio-project", payload);`,
    );
    expect(unauthorizedFindings(writeInstead, [allowance])).toEqual(expect.arrayContaining([
      expect.stringContaining("local-storage-write"),
      expect.stringContaining("stale allowance"),
    ]));
  });


  it("명시적 초안 원문 백업은 정확한 owner·key·sourceAuthoring 쓰기만 소유한다", () => {
    const file = "apps/web/src/domains/creator/brush-lab/StudioBrushV6DraftGuard.tsx";
    const source = readFileSync(resolve(WORKSPACE_ROOT, file), "utf8");
    const exact = (text: string) => {
      const findings = analyzeBrowserKvSource(file, text);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ file, kind: "local-storage-write", key: '`${key}:source-mixbox`',
        call: "globalThis.localStorage.setItem(backupKey,migration.sourceAuthoring)" });
      expect(unauthorizedFindings(findings, ALLOWANCES.filter((allowance) => allowance.file === file))).toEqual([]);
    };
    exact(source);
    expect(() => exact(source.replace("migration.sourceAuthoring);", "migration.program);"))).toThrow();
    expect(() => exact(source.replace("`${key}:source-mixbox`", "`${key}:new-authority`"))).toThrow();
    expect(() => exact(`${source}\nlocalStorage.setItem("studio-project", payload);`)).toThrow();
    const otherOwner = analyzeBrowserKvSource("apps/web/src/domains/creator/other-owner.tsx", source);
    expect(unauthorizedFindings(otherOwner, ALLOWANCES.filter((allowance) => allowance.file === file))).not.toEqual([]);
  });

  it.each([
    {
      owner: "studio-shell/ActiveProjectContextBridge.tsx",
      key: '"toonstudio:active-project-bridge:return:v1"',
      call: "contextStorage()?.setItem(RETURN_KEY,JSON.stringify({historyKey,pathname,routeProjectId:explicitProjectId,projectId:selectedProject.id,action}))",
      required: ['returntypeofwindow==="undefined"?null:window.sessionStorage;', 'raw.length>2048', 'contextStorage()?.removeItem(RETURN_KEY)'],
      payload: ["routeProjectId: explicitProjectId", "document: manuscript, routeProjectId: explicitProjectId"],
    },
    {
      owner: "studio-shell/guided-flow/studio-assistant-session-store.ts",
      key: '`${SESSION_KEY_PREFIX}${projectId}`',
      call: "storage.setItem(`${SESSION_KEY_PREFIX}${projectId}`,JSON.stringify({prompt:snapshot.prompt.slice(0,6_000),openAiMode:snapshot.openAiMode,lastResult:sanitizedResult,}),)",
      required: ['if(override!==undefined)returnoverride;', 'returntypeofwindow==="undefined"?null:window.sessionStorage;', 'conststorage=resolveStudioAssistantSessionStorage(storageOverride);', 'constSESSION_KEY_PREFIX="toonstudio:assistant-draft:v1:";', 'isValidStoredSuccess(snapshot.lastResult)', 'raw.length>64_000'],
      payload: ["lastResult: sanitizedResult,", "lastResult: snapshot.lastResult,"],
    },
  ])("$owner의 세션 허용은 원고·영구 저장·검증하지 않은 payload로 확장될 수 없다", ({ owner, key, call, required, payload }) => {
    const file = `apps/web/src/domains/creator/${owner}`;
    const source = readFileSync(resolve(WORKSPACE_ROOT, file), "utf8");
    const allowances = ALLOWANCES.filter((allowance) => allowance.file === file);
    const exact = (text: string) => {
      expect(text).not.toMatch(/\blocalStorage\b/u);
      for (const contract of required) expect(compact(text)).toContain(contract);
      const findings = analyzeBrowserKvSource(file, text);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ file, kind: "durable-storage-write", key, call });
      expect(unauthorizedFindings(findings, allowances)).toEqual([]);
    };
    exact(source);
    expect(() => exact(source.replaceAll("window.sessionStorage", "window.localStorage"))).toThrow();
    expect(() => exact(source.replace(payload[0]!, payload[1]!))).toThrow();
    expect(() => exact(`${source}\nlocalStorage.setItem("studio-project-document", payload);`)).toThrow();
    const findings = analyzeBrowserKvSource(file, source);
    expect(unauthorizedFindings([...findings, ...findings], allowances)).not.toEqual([]);
    expect(unauthorizedFindings(findings.map((item) => ({ ...item, key: "other-key" })), allowances)).not.toEqual([]);
    expect(unauthorizedFindings(analyzeBrowserKvSource(`${file}.other.ts`, source), allowances)).not.toEqual([]);
  });

  it("검토한 로컬 작업 사본·표시 설정·정리 허용은 정확한 소유자·키·호출 수에만 적용한다", () => {
    const reviewedFiles = [
      "ai-quick-blueprint/ai-quick-blueprint-handoff.ts",
      "studio-shell/StudioSaveFirstProjectLibraryPage.tsx",
      "virtual-space/office2d/studio-virtual-space-stage-mode.ts",
      "virtual-space/studio-virtual-space-entry-preference.ts",
      "virtual-space/three/studio-virtual-space-three-motion.ts",
      "virtual-space/use-studio-space-lighting.ts",
    ];
    for (const relativePath of reviewedFiles) {
      const file = `apps/web/src/domains/creator/${relativePath}`;
      const source = readFileSync(resolve(WORKSPACE_ROOT, file), "utf8");
      const allowances = ALLOWANCES.filter((allowance) => allowance.file === file);
      const findings = analyzeBrowserKvSource(file, source);
      expect(unauthorizedFindings(findings, allowances), file).toEqual([]);
      expect(unauthorizedFindings(findings.map((item) => ({ ...item, key: "other-key" })), allowances), file).not.toEqual([]);
      expect(unauthorizedFindings([...findings, ...findings], allowances), file).not.toEqual([]);
      expect(unauthorizedFindings(analyzeBrowserKvSource(`${file}.other.ts`, source), allowances), file).not.toEqual([]);
      const newAuthority = analyzeBrowserKvSource(file, `${source}\nlocalStorage.setItem("studio-project-document", payload);`);
      expect(unauthorizedFindings(newAuthority, allowances), file).not.toEqual([]);
      if (relativePath.startsWith("studio-shell/")) {
        expect(unauthorizedFindings(analyzeBrowserKvSource(file, source.replace(
          "window.localStorage.removeItem(studioProjectDocumentStorageKey(project.id))",
          "window.localStorage.setItem(studioProjectDocumentStorageKey(project.id), payload)",
        )), allowances)).not.toEqual([]);
      }
    }
  });
  it("추가 검토한 생성·인계·제작 메모·배지의 허용은 소유자·키·종류·호출 수를 넘지 않는다", () => {
    for (const relativePath of [
      "ai/studio-ai-generation-queue-store.ts",
      "bg3d/studio-bg3d-live-ink-bake-bridge.ts",
      "fresh-ideas/serialization-pace-model.ts",
      "studio-shell/studio-project-team-kanban-store.ts",
      "virtual-space/studio-virtual-space-work-status.ts",
      "hyper-automation-os/hyper-automation-catalog.ts",
      "support-chat-ai/support-ai-chat-client.ts",
      "localization-sync-pro/studio-offline-sync-legacy-export.ts",
    ]) {
      const file = `apps/web/src/domains/creator/${relativePath}`;
      const source = readFileSync(resolve(WORKSPACE_ROOT, file), "utf8");
      const allowances = ALLOWANCES.filter(entry => entry.file === file);
      const findings = analyzeBrowserKvSource(file, source);
      expect(unauthorizedFindings(findings, allowances), file).toEqual([]);
      expect(unauthorizedFindings([...findings, ...findings], allowances), file).not.toEqual([]);
      expect(unauthorizedFindings(findings.map(entry => ({ ...entry, key: "other-key" })), allowances), file).not.toEqual([]);
      expect(unauthorizedFindings(analyzeBrowserKvSource(`${file}.other.ts`, source), allowances), file).not.toEqual([]);
      expect(unauthorizedFindings(analyzeBrowserKvSource(file, `${source}\nlocalStorage.setItem("studio-project-document", payload);`), allowances), file).not.toEqual([]);
      const cleanup = findings.find(entry => entry.kind === "local-storage-cleanup");
      if (cleanup) expect(unauthorizedFindings(findings.map(entry => entry === cleanup
        ? { ...entry, kind: "local-storage-write" as const } : entry), allowances)).not.toEqual([]);
    }
  });

  it("keeps every allowance narrow, justified, and reviewable", () => {
    const ids = new Set<string>();
    for (const allowance of ALLOWANCES) {
      expect(allowance.file).toMatch(/^(?:apps\/web\/src\/domains\/creator|src\/domains\/creator|packages\/studio-[^/]+\/src)\//u);
      expect(allowance.file).not.toMatch(/[?*{}[\]]/u);
      expect(allowance.key.length).toBeGreaterThan(0);
      expect(allowance.key).not.toBe("*");
      expect(allowance.occurrences).toBeGreaterThan(0);
      expect(allowance.rationale.length).toBeGreaterThanOrEqual(24);
      expect(allowance.proof.length).toBeGreaterThanOrEqual(24);
      expect(ids.has(allowanceId(allowance))).toBe(false);
      ids.add(allowanceId(allowance));
    }
  });

  it(
    "scans creator plus every discovered studio package and admits no unreviewed authority",
    () => {
      const roots = studioSourceRoots().map((root) => slash(relative(WORKSPACE_ROOT, root)));
      expect(roots).toContain("apps/web/src/domains/creator");
      expect(roots).toContain("packages/studio-project-model/src");
      expect(roots).toContain("packages/studio-brush-platform/src");
      expect(roots.length).toBeGreaterThanOrEqual(8);

      expect(unauthorizedFindings(analyzeWorkspace(), ALLOWANCES)).toEqual([]);
    },
    60_000,
  );
});
