/**
 * PackagePanel: 캐릭터 소스 고르기(모듈식 키트 · 제작 패키지 · 절차 소스) UI.
 *
 * 모듈식 키트(기본 소스, 계약 문서 6절): 베이스(여성/남성) 선택, 키트 다시 불러오기, 출처·라이선스(provenance)와 베이스별 제공 파츠 표.
 *  - 키트 정보는 셸이 주입하는 키트 플랜 등록소(`useKitPlans()`: `peek`·`ensure`·`subscribe`·`clear`)에서 읽는다. 패널이 따로 `kit.json`을 요청하지 않으므로
 *    적용 루프와 같은 캐시(같은 요청은 한 번만 받는다)를 쓰고, 다시 불러오기는 등록소 캐시를 비운다. 등록소가 없으면(null) 정보 영역에 사유만 보인다.
 *  - 베이스를 고르면 등록소로 `kit.json`을 검증해 받고 그 베이스의 능력 맵(`deriveKitCapabilities`)과 함께 `source/set`을 보낸다.
 *    엔진에 올리는 일은 적용 루프가 레시피(`source`)를 보고 한다(패널이 reloadSource를 직접 부르지 않는다).
 *  - 고르려는 베이스가 현재 선택(헤어·의상 등)을 제공하지 않으면 바꾸지 않고 사유를 보인다. 다른 프리셋으로 자동 대체하지 않는다.
 *  - "키트 다시 불러오기"는 적용 루프의 `retrySource()`(실패 기억·kit.json 캐시를 비우고 다시 만든다)를 부르고 패널의 manifest도 다시 받는다.
 *  - 키트 로드 실패(레시피 소스가 키트인데 `kit-*` 실패가 나고 아직 올라가지 않은 상태)는 사유와 함께 보이고, 절차 소스로 자동 전환하지 않는다.
 *    절차 소스는 "키트가 아닌 대체 휴머노이드"로 명시하는 버튼으로만 전환한다.
 *
 * 제작(authored) 패키지 레인:
 * index.json → 목록 → 선택 → manifest·slot-mapping·GLB fetch + SHA-256 검증 → AuthoredPackagePlan
 * → packagePlans.register → (엔진이 있으면) engineSession.reloadSource → `source/set` dispatch.
 * 15슬롯 능력표(선언/규칙 출처·불일치)·격차·경고·헤어 LOD·본/shape key 커버리지·VRM 메타(베타 파서)를 보여 준다.
 * 실패는 LabFailure 사유 그대로 표시하고 다른 패키지·절차 소스로 바꿔치기하지 않는다(ADR-0018).
 *
 * 제작 패키지 네트워크는 loader prop(기본: *.browser 모듈 동적 import)으로 분리해 jsdom 테스트는 가짜 로더를 쓴다.
 * 키트의 `kit-loader.browser`는 `app/composition.ts`만 정적으로 import한다(여기서 동적 import하면 한 모듈이 정적·동적으로 섞여 청크가 갈라지지 않는다).
 * 스타일 클래스 접두는 `cl-package-`(core CSS), 키트 영역은 `cl-package-kit-*`.
 */
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import {
  ALL_AVAILABLE_CAPABILITIES,
  CHARACTER_SLOT_KINDS,
  KIT_BASE_IDS,
  KIT_CURRENT_VERSION,
  KIT_DEFAULT_ID,
  KIT_PART_SLOTS,
  SLOT_LABELS_KO,
  SLOT_PRESET_IDS,
  failVisible,
  isLabFailure,
} from "../../../contracts";
import { deriveKitCapabilities } from "../../../domains/authored/kit-capability";
import { compareCapabilities } from "../../../domains/authored/package-capability";
import { parseVrmFromGlb } from "../../../domains/authored/vrm-extension-parser";
import { presetUnavailableReasonKo } from "../../../state/apply-plan";
import { useApplyLoop, useApplyPlan, useCatalog, useDispatch, useKitPlans, useLabContext, useLabState } from "../lab-store-context";

import type { KitBaseId, KitManifest, LabFailure, RecipeSource, SlotCapabilityStatus, SlotKind } from "../../../contracts";
import type { AuthoredIndexEntry } from "../../../domains/authored/package-index";
import type { AuthoredPackageLoadResult, PackageIndexLoadResult } from "../../../domains/authored/package-load-flow";
import type { VrmcVrmInfo } from "../../../domains/authored/vrm-extension-parser";
import type { KitPlanRegistry, KitRecipeSource } from "../kit-plan-registry";

export interface PackagePanelLoader {
  loadIndex(): Promise<PackageIndexLoadResult>;
  loadPackage(entry: AuthoredIndexEntry, options: { readonly preferredLod?: number }): Promise<AuthoredPackageLoadResult>;
}

/** 브라우저 기본 로더: 두 *.browser 모듈을 지연 import한다(별도 청크). */
export const browserPackageLoader: PackagePanelLoader = {
  loadIndex: () => import("../../../domains/authored/package-index.browser").then((module) => module.loadCharacterPackageIndex()),
  loadPackage: (entry, options) => import("../../../domains/authored/package-loader.browser").then((module) => module.loadAuthoredPackage(entry, options)),
};

export interface PackagePanelProps {
  readonly loader?: PackagePanelLoader;
  /** 마운트 시 index.json 자동 로드(기본 true) */
  readonly autoLoadIndex?: boolean;
  /** 현재 소스가 키트일 때 마운트 시 등록소로 kit.json 자동 로드(기본 true). 키트가 아닌 소스에서는 베이스를 고를 때 받는다. */
  readonly autoLoadKit?: boolean;
  /** 헤어 LOD 선호(기본 0 = 가장 상세) */
  readonly preferredLod?: number;
  readonly now?: () => number;
}

/** 패널이 직접 시작한 `kit.json` 요청의 진행 상태. 받은 manifest 자체는 등록소(`peek`)가 가진다. */
type KitFetchState = { readonly phase: "idle" } | { readonly phase: "loading" } | { readonly phase: "failed"; readonly failure: LabFailure };

type KitFetchOutcome = { readonly ok: true; readonly manifest: KitManifest } | { readonly ok: false; readonly failure: LabFailure };

const KIT_BASE_LABELS_KO: Readonly<Record<KitBaseId, string>> = { female: "여성", male: "남성" };

/** 키트가 아닌 소스에서 키트 정보를 조회할 때 쓰는 기본 키트 요청(베이스는 캐시 키에 들어가지 않는다) */
const DEFAULT_KIT_LOOKUP: KitRecipeSource = { kind: "kit", kitId: KIT_DEFAULT_ID, kitVersion: KIT_CURRENT_VERSION, baseId: "female" };

const noopSubscribe = (): (() => void) => () => undefined;

/** 등록소에 이미 받아 둔 manifest를 구독한다(받으면 다시 그린다). 등록소가 없거나 아직 안 받았으면 undefined. */
function useKitManifest(kitPlans: KitPlanRegistry | null, source: KitRecipeSource): KitManifest | undefined {
  const subscribe = useCallback((listener: () => void) => (kitPlans ? kitPlans.subscribe(listener) : noopSubscribe()), [kitPlans]);
  const getSnapshot = useCallback(() => kitPlans?.peek(source), [kitPlans, source]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 출처 목록의 라이선스 합집합(`KitPlan.licenseNote`와 같은 규칙: 요약 + 라이선스 목록). 플랜은 비동기라 패널은 manifest에서 같은 문장을 만든다. */
function licenseNoteOf(manifest: KitManifest): string {
  const licenses = [...new Set(manifest.provenance.sources.map((entry) => entry.license))];
  return `${manifest.provenance.summaryKo} (라이선스: ${licenses.join(", ")})`;
}

/** 키트 로드 단계에서 나는 실패인지(코드 접두 `kit-`, 또는 키트 소스 로드가 만든 일반 소스 실패) */
function isKitFailure(failure: LabFailure): boolean {
  return failure.code.startsWith("kit-") || failure.code === "source-build-failed";
}

function describeSourceKo(source: RecipeSource): string {
  switch (source.kind) {
    case "kit":
      return `모듈식 키트 ${source.kitId} v${source.kitVersion} (${KIT_BASE_LABELS_KO[source.baseId]} 베이스)`;
    case "package":
      return `제작 패키지 ${source.characterId} (SHA ${shortSha(source.sha256)})`;
    case "procedural":
      return "절차적 휴머노이드(키트가 아닌 대체 소스)";
    default: {
      const exhaustive: never = source;
      return String((exhaustive as { kind?: unknown }).kind);
    }
  }
}

type IndexState =
  | { readonly phase: "idle" }
  | { readonly phase: "loading" }
  | { readonly phase: "ready"; readonly entries: readonly AuthoredIndexEntry[] }
  | { readonly phase: "failed"; readonly failure: LabFailure };

type LoadedPackage = Extract<AuthoredPackageLoadResult, { ok: true }>;

type PackageState =
  | { readonly phase: "loading"; readonly step: string }
  | { readonly phase: "ready"; readonly result: LoadedPackage; readonly vrm: VrmcVrmInfo | null; readonly vrmNoteKo: string; readonly applied: "engine" | "registry" }
  | { readonly phase: "failed"; readonly failure: LabFailure };

const STATUS_LABELS_KO: Readonly<Record<SlotCapabilityStatus, string>> = { available: "지원", partial: "부분 지원", unavailable: "미지원" };

function shortSha(sha: string | null | undefined): string {
  return sha ? `${sha.slice(0, 12)}…` : "-";
}

function describeFailure(failure: LabFailure): string {
  return failure.detail ? `${failure.reasonKo} (${failure.code})` : `${failure.reasonKo} (${failure.code})`;
}

interface CapabilityTableProps {
  readonly result: LoadedPackage;
}

function CapabilityTable({ result }: CapabilityTableProps) {
  const { judgement } = result.detail;
  const comparison = compareCapabilities(judgement.ruleOnly, result.plan.capabilities);
  const divergent = new Map<SlotKind, SlotCapabilityStatus>(comparison.divergent.map((entry) => [entry.slot, entry.rule]));
  return (
    <table className="cl-package-capabilities">
      <caption>
        15슬롯 능력(선언 = Blender 레인 slot-mapping.json, 규칙 = manifest 판정) · 불일치 {comparison.divergent.length}개
      </caption>
      <thead>
        <tr>
          <th scope="col">슬롯</th>
          <th scope="col">상태</th>
          <th scope="col">출처</th>
          <th scope="col">사유</th>
        </tr>
      </thead>
      <tbody>
        {CHARACTER_SLOT_KINDS.map((slot) => {
          const capability = result.plan.capabilities[slot];
          const ruleStatus = divergent.get(slot);
          return (
            <tr key={slot} data-slot={slot} data-status={capability.status}>
              <th scope="row">{SLOT_LABELS_KO[slot]}</th>
              <td>
                <span className={`cl-package-badge cl-package-badge--${capability.status}`}>{STATUS_LABELS_KO[capability.status]}</span>
              </td>
              <td>
                {judgement.basis[slot] === "declared" ? "선언" : "규칙"}
                {ruleStatus ? ` (규칙 판정: ${STATUS_LABELS_KO[ruleStatus]})` : ""}
              </td>
              <td className="cl-package-reason">{capability.reasonKo ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface PackageDetailProps {
  readonly state: Extract<PackageState, { phase: "ready" }>;
}

function PackageDetail({ state }: PackageDetailProps) {
  const { result, vrm, vrmNoteKo, applied } = state;
  const { plan, detail } = result;
  const { bones, shapeKeys, meshes } = detail.judgement.mappings;
  const quality = plan.manifest.quality;
  return (
    <div className="cl-package-detail">
      <p className="cl-package-status" role="status">
        {applied === "engine" ? "엔진에 올렸습니다" : "플랜을 등록했습니다(엔진이 준비되면 적용 루프가 올립니다)"} · GLB SHA-256 {shortSha(detail.observedSha256)} 검증 일치 · {plan.glbBytes.toLocaleString("ko-KR")} B
      </p>
      <dl className="cl-package-facts">
        <dt>품질</dt>
        <dd>
          {quality.score} / 최소 {quality.minimumScore} · {quality.passed ? "통과" : "미통과"}
        </dd>
        <dt>라이선스</dt>
        <dd>{plan.licenseNote}</dd>
        <dt>헤어</dt>
        <dd>
          {detail.hairLod.style ?? "없음"} · LOD {detail.hairLod.lods.join("/") || "-"} · 표시 LOD {detail.hairLod.chosen ?? "-"} · 숨김 {detail.hairLod.hidden.length}개 · 삼각형 {plan.manifest.capabilities.authoredHair.lodTriangles.join("/") || "-"}
        </dd>
        <dt>본 매핑</dt>
        <dd>
          필수 {bones.required.covered.length}/15 · 손가락 {bones.fingers.covered.length}/30 · 전체 {bones.all.covered.length}/55 · 미매핑 {bones.unmapped.length}개
        </dd>
        <dt>shape key</dt>
        <dd>
          매핑 {Object.keys(shapeKeys.mapped).length}개 · 규약 밖 {shapeKeys.unmapped.length}개 · FACS 유닛 {detail.judgement.facsUnits.length}개
        </dd>
        <dt>메시 역할</dt>
        <dd>
          분류 {Object.keys(meshes.roles).length}개 · 미분류 {meshes.unknown.length}개 · 외곽선 셸 {meshes.outlines.length}개
        </dd>
        <dt>VRM 확장(베타 파서)</dt>
        <dd>{vrm ? `${vrm.family} · ${vrm.meta.name ?? "이름 없음"} · 저자 ${vrm.meta.authors.join(", ") || "-"} · 라이선스 ${vrm.meta.licenseName ?? "-"} · humanoid ${Object.keys(vrm.humanoid).length}본 · 표정 ${vrm.expressions.length}개` : vrmNoteKo}</dd>
      </dl>
      {detail.warnings.length > 0 ? (
        <ul className="cl-package-warnings" aria-label="경고">
          {detail.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <CapabilityTable result={result} />
      {detail.gaps.length > 0 ? (
        <details className="cl-package-gaps">
          <summary>패키지 격차 {detail.gaps.length}개</summary>
          <ul>
            {detail.gaps.map((gap) => (
              <li key={gap.id}>
                [{gap.severity}] {gap.id}: {gap.summary}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {shapeKeys.unmapped.length > 0 || bones.unmapped.length > 0 || meshes.unknown.length > 0 ? (
        <details className="cl-package-unmapped">
          <summary>규약 밖 이름(사유)</summary>
          <ul>
            {shapeKeys.unmapped.map((entry) => (
              <li key={`sk:${entry.name}`}>shape key {entry.reasonKo}</li>
            ))}
            {bones.unmapped.map((entry) => (
              <li key={`bone:${entry.name}`}>본 {entry.reasonKo}</li>
            ))}
            {meshes.unknown.map((entry) => (
              <li key={`mesh:${entry.name}`}>메시 {entry.reasonKo}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

interface KitProvenanceProps {
  readonly manifest: KitManifest;
}

/** 출처·라이선스(provenance)와 키트 메타. CC0 파생물인지 원본인지, 무엇을 가공했는지를 숨기지 않고 보인다. */
function KitProvenance({ manifest }: KitProvenanceProps) {
  const { provenance } = manifest;
  return (
    <div className="cl-package-kit-provenance">
      <dl className="cl-package-facts">
        <dt>키트</dt>
        <dd>
          {manifest.displayName} · {manifest.kitId} v{manifest.kitVersion} · 생성 {manifest.generatedAt}
        </dd>
        <dt>제작 도구</dt>
        <dd>
          {manifest.generator.tool} · Blender {manifest.generator.blender}
        </dd>
        <dt>스켈레톤</dt>
        <dd>joint {manifest.skeleton.joints.length}개 (모든 GLB가 같은 순서)</dd>
        <dt>출처 요약</dt>
        <dd>{provenance.summaryKo}</dd>
        <dt>라이선스</dt>
        <dd>{licenseNoteOf(manifest)}</dd>
      </dl>
      <ul className="cl-package-kit-sources" aria-label="출처와 라이선스">
        {provenance.sources.map((entry) => (
          <li key={entry.id} data-source-id={entry.id}>
            <strong>{entry.name}</strong>
            {entry.version ? ` ${entry.version}` : ""} · 라이선스 {entry.license} · {entry.derivative ? "파생물" : "원본 디자인"}
            <br />
            변경 내용: {entry.changesKo}
            {entry.url ? (
              <>
                <br />
                내려받은 곳: {entry.url}
              </>
            ) : null}
            {entry.zipSha256 ? (
              <>
                <br />
                원본 SHA-256 {shortSha(entry.zipSha256)}
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="cl-package-hint cl-package-kit-hint">출처 고지 파일: {provenance.noticeFile}</p>
    </div>
  );
}

interface KitPartsTableProps {
  readonly manifest: KitManifest;
}

/** 베이스별 제공 파츠 수(어휘 대비)와 미제공 사유. 미제공은 선택할 수 없는 카드로 SlotPanel에 나타난다. */
function KitPartsTable({ manifest }: KitPartsTableProps) {
  const bases = KIT_BASE_IDS.filter((baseId) => manifest.bases[baseId] !== undefined);
  return (
    <table className="cl-package-kit-parts">
      <caption>베이스별 제공 파츠(어휘 대비)</caption>
      <thead>
        <tr>
          <th scope="col">슬롯</th>
          {bases.map((baseId) => (
            <th key={baseId} scope="col">
              {KIT_BASE_LABELS_KO[baseId]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {KIT_PART_SLOTS.map((slot) => {
          const parts = manifest.parts.filter((part) => part.slot === slot);
          const total = SLOT_PRESET_IDS[slot].length;
          return (
            <tr key={slot} data-slot={slot}>
              <th scope="row">{SLOT_LABELS_KO[slot]}</th>
              {bases.map((baseId) => {
                const provided = parts.filter((part) => part.variants[baseId] !== undefined).length;
                const missing = parts.filter((part) => part.variants[baseId] === undefined);
                const title = missing.map((part) => `${part.id}: ${part.unavailable[baseId] ?? "미제공"}`).join(" / ");
                return (
                  <td key={baseId} data-base={baseId} title={title || undefined}>
                    {provided}/{total}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function PackagePanel({ loader = browserPackageLoader, autoLoadIndex = true, autoLoadKit = true, preferredLod = 0, now = () => Date.now() }: PackagePanelProps) {
  const state = useLabState();
  const dispatch = useDispatch();
  const { store, packagePlans, engineSession } = useLabContext();
  const kitPlans = useKitPlans();
  const applyLoop = useApplyLoop();
  const catalog = useCatalog();
  // 적용 루프가 게시할 때마다(소스 로드·실패·재시도) 다시 그려 "불러오는 중"/"올렸음" 표시를 맞춘다.
  useApplyPlan();
  const ids = useId();
  const [index, setIndex] = useState<IndexState>({ phase: "idle" });
  const [packages, setPackages] = useState<Readonly<Record<string, PackageState>>>({});
  const [kitFetch, setKitFetch] = useState<KitFetchState>({ phase: "idle" });
  const [kitNotice, setKitNotice] = useState<string | null>(null);
  /** 이 시각 이전의 키트 실패는 이미 사용자가 다시 시도한 것이라 숨긴다 */
  const [kitFailuresHiddenBefore, setKitFailuresHiddenBefore] = useState(0);
  const mounted = useRef(true);
  const indexRequested = useRef(false);
  const kitRequested = useRef<string | null>(null);
  const kitFetchSeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** 등록소로 `kit.json`을 받아 진행 상태에 반영한다(같은 요청은 등록소가 합친다). 더 늦게 시작한 요청이 있으면 이 결과는 상태에 반영하지 않는다. */
  const fetchKit = useCallback(
    async (request: KitRecipeSource): Promise<KitFetchOutcome> => {
      if (kitPlans === null) {
        const failure = failVisible("kit-loader-unavailable", "모듈식 키트 등록소가 조립되지 않아 kit.json을 불러올 수 없습니다. 절차 소스로 대체하지 않습니다.", undefined, now());
        setKitFetch({ phase: "failed", failure });
        return { ok: false, failure };
      }
      kitFetchSeq.current += 1;
      const seq = kitFetchSeq.current;
      setKitFetch({ phase: "loading" });
      let outcome: KitFetchOutcome;
      try {
        outcome = { ok: true, manifest: await kitPlans.ensure(request) };
      } catch (error) {
        outcome = { ok: false, failure: isLabFailure(error) ? error : failVisible("kit-manifest-fetch-failed", "키트 manifest(kit.json)를 불러오는 중 예기치 않은 오류가 났습니다.", error, now()) };
      }
      if (mounted.current && seq === kitFetchSeq.current) setKitFetch(outcome.ok ? { phase: "idle" } : { phase: "failed", failure: outcome.failure });
      return outcome;
    },
    [kitPlans, now],
  );

  const kitSource = state.recipe.source.kind === "kit" ? state.recipe.source : null;
  const kitId = kitSource?.kitId ?? null;
  const kitVersion = kitSource?.kitVersion ?? null;
  const kitPin = kitSource?.manifestSha256;
  // 현재 소스가 키트면 그 요청의, 아니면 기본 키트 요청의 manifest를 등록소에서 읽는다(받은 뒤 구독으로 다시 그린다).
  const manifest = useKitManifest(kitPlans, kitSource ?? DEFAULT_KIT_LOOKUP);

  // 현재 소스가 키트면 kit.json을 받아 출처·제공 파츠를 보인다(실패는 이 패널에만 보인다 — 적용 루프가 자기 실패를 따로 노출한다).
  useEffect(() => {
    if (!autoLoadKit || kitSource === null || kitId === null || kitVersion === null) return;
    const key = `${kitId}@${kitVersion}#${kitPin ?? "-"}`;
    if (kitRequested.current === key) return;
    kitRequested.current = key;
    void fetchKit(kitSource);
  }, [autoLoadKit, fetchKit, kitId, kitPin, kitSource, kitVersion]);

  const reportFailure = useCallback(
    (failure: LabFailure): void => {
      store.applyEvent({ type: "failure", failure });
    },
    [store],
  );

  const loadIndex = useCallback(async (): Promise<void> => {
    setIndex({ phase: "loading" });
    let result: PackageIndexLoadResult;
    try {
      result = await loader.loadIndex();
    } catch (error) {
      result = { ok: false, failure: isLabFailure(error) ? error : failVisible("package-index-fetch-failed", "index.json을 불러오지 못했습니다.", error, now()) };
    }
    if (!mounted.current) return;
    if (result.ok) setIndex({ phase: "ready", entries: result.entries });
    else {
      setIndex({ phase: "failed", failure: result.failure });
      reportFailure(result.failure);
    }
  }, [loader, now, reportFailure]);

  useEffect(() => {
    if (!autoLoadIndex || indexRequested.current) return;
    indexRequested.current = true;
    void loadIndex();
  }, [autoLoadIndex, loadIndex]);

  const setPackage = useCallback((characterId: string, next: PackageState): void => {
    if (!mounted.current) return;
    setPackages((previous) => ({ ...previous, [characterId]: next }));
  }, []);

  const loadPackage = useCallback(
    async (entry: AuthoredIndexEntry): Promise<void> => {
      const id = entry.characterId;
      setPackage(id, { phase: "loading", step: "manifest·slot-mapping·GLB 받는 중" });
      let result: AuthoredPackageLoadResult;
      try {
        result = await loader.loadPackage(entry, { preferredLod });
      } catch (error) {
        result = { ok: false, failure: isLabFailure(error) ? error : failVisible("package-load-failed", `제작 패키지 '${id}' 로드에 실패했습니다.`, error, now()) };
      }
      if (!result.ok) {
        setPackage(id, { phase: "failed", failure: result.failure });
        reportFailure(result.failure);
        return;
      }
      const parsedVrm = parseVrmFromGlb(result.detail.glbBytes);
      const vrm = parsedVrm.ok ? parsedVrm.info : null;
      const vrmNoteKo = parsedVrm.ok ? (parsedVrm.info ? "" : "GLB에 VRM 확장 없음(humanoid·표정 bind는 manifest.json이 담당)") : `GLB JSON 청크를 읽지 못함: ${parsedVrm.reasonKo}`;

      setPackage(id, { phase: "loading", step: "플랜 등록·엔진 적용" });
      packagePlans.register(result.plan);
      let capabilities = result.plan.capabilities;
      let applied: "engine" | "registry" = "registry";
      if (engineSession.engine()) {
        try {
          const reloaded = await engineSession.reloadSource({ kind: "package", plan: result.plan });
          if (reloaded) {
            capabilities = reloaded.capabilities;
            applied = "engine";
          }
        } catch (error) {
          const failure = isLabFailure(error) ? error : failVisible("package-engine-load-failed", `엔진이 제작 패키지 '${id}' GLB를 올리지 못했습니다.`, error, now());
          setPackage(id, { phase: "failed", failure });
          reportFailure(failure);
          return;
        }
      }
      dispatch({ type: "source/set", source: { kind: "package", characterId: result.plan.manifest.characterId, sha256: result.plan.glbSha256 }, capabilities });
      setPackage(id, { phase: "ready", result, vrm, vrmNoteKo, applied });
    },
    [dispatch, engineSession, loader, now, packagePlans, preferredLod, reportFailure, setPackage],
  );

  const backToProcedural = useCallback((): void => {
    setKitNotice(null);
    setKitFailuresHiddenBefore(now());
    dispatch({ type: "source/set", source: { kind: "procedural" }, capabilities: ALL_AVAILABLE_CAPABILITIES });
  }, [dispatch, now]);

  /**
   * 키트 베이스를 고른다. kit.json이 유효하고 그 베이스가 현재 선택(헤어·의상…)을 모두 제공할 때만 `source/set`을 보낸다.
   * 제공하지 않는 선택이 있으면 바꾸지 않고 사유를 보인다 — 다른 프리셋으로 자동 대체하지 않는다(AGENTS 3절 9항).
   */
  const pickBase = useCallback(
    async (baseId: KitBaseId): Promise<void> => {
      setKitNotice(null);
      const recipe = store.getState().recipe;
      const current = recipe.source;
      const request: KitRecipeSource = current.kind === "kit" ? { ...current, baseId } : { ...DEFAULT_KIT_LOOKUP, baseId };
      let picked: KitManifest | undefined = kitPlans?.peek(request);
      if (picked === undefined) {
        const loaded = await fetchKit(request);
        if (!loaded.ok) {
          reportFailure(loaded.failure);
          return;
        }
        picked = loaded.manifest;
      }
      if (picked.bases[baseId] === undefined) {
        reportFailure(failVisible("kit-base-missing", `키트에 ${KIT_BASE_LABELS_KO[baseId]} 베이스가 없습니다.`, undefined, now()));
        return;
      }
      const capabilities = deriveKitCapabilities(picked, baseId);
      const blocked: string[] = [];
      for (const slot of KIT_PART_SLOTS) {
        const presetId = recipe.slots[slot];
        if (presetId === null) continue;
        const capability = capabilities[slot];
        const reason = capability.status === "unavailable" ? (capability.reasonKo ?? "이 베이스가 제공하지 않습니다.") : presetUnavailableReasonKo(capability, presetId);
        if (reason !== null) blocked.push(`${SLOT_LABELS_KO[slot]} ${catalog.get(presetId)?.labelKo ?? presetId}: ${reason}`);
      }
      if (blocked.length > 0) {
        if (!mounted.current) return;
        setKitNotice(`${KIT_BASE_LABELS_KO[baseId]} 베이스로 바꾸지 못했습니다. 현재 선택을 이 베이스가 제공하지 않습니다 — ${blocked.join(" / ")}. 다른 프리셋을 먼저 고르세요(자동으로 바꾸지 않습니다).`);
        return;
      }
      setKitFailuresHiddenBefore(now());
      dispatch({
        type: "source/set",
        source: { kind: "kit", kitId: picked.kitId, baseId, kitVersion: picked.kitVersion, ...(current.kind === "kit" && current.manifestSha256 !== undefined ? { manifestSha256: current.manifestSha256 } : {}) },
        capabilities,
      });
    },
    [catalog, dispatch, fetchKit, kitPlans, now, reportFailure, store],
  );

  /**
   * 키트 다시 불러오기: 등록소의 kit.json 캐시를 비우고 적용 루프의 실패 기억을 지워 소스를 다시 만들며, 패널의 manifest도 다시 받는다.
   * 런타임도 `retrySource` 직전에 캐시를 비우지만(`beforeRetrySource`) 패널이 먼저 비워 루프가 없는 조립에서도 재요청이 보장된다.
   * 비운 직후 시작한 두 요청(루프·패널)은 등록소가 하나로 합친다.
   */
  const reloadKit = useCallback((): void => {
    setKitNotice(null);
    setKitFailuresHiddenBefore(now());
    kitPlans?.clear();
    applyLoop?.retrySource();
    const current = store.getState().recipe.source;
    if (current.kind === "kit") void fetchKit(current);
  }, [applyLoop, fetchKit, kitPlans, now, store]);

  const source = state.recipe.source;
  const kitFailures = kitSource === null ? [] : state.failures.filter((failure) => isKitFailure(failure) && failure.at > kitFailuresHiddenBefore);
  const latestKitFailure = kitFailures.length > 0 ? kitFailures[kitFailures.length - 1] : undefined;
  const engineReady = state.engine.phase === "ready";
  const kitSettled = applyLoop !== null && applyLoop.settled();
  // 올라간 키트에는 지난 실패를 보이지 않는다. 아직 올라가지 않았으면(실패했거나 받는 중) 마지막 실패를 보인다.
  const shownKitFailure = latestKitFailure !== undefined && !kitSettled ? latestKitFailure : undefined;
  const panelKitFailure =
    kitFetch.phase === "failed" && kitSource !== null && !(shownKitFailure?.code === kitFetch.failure.code && shownKitFailure.reasonKo === kitFetch.failure.reasonKo) ? kitFetch.failure : undefined;
  const kitLoading = kitSource !== null && engineReady && applyLoop !== null && !kitSettled && shownKitFailure === undefined;

  return (
    <section className="cl-package-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>제작 패키지</h2>
      <p className="cl-package-source" role="status">
        현재 소스: {describeSourceKo(source)}
        {source.kind === "package" ? (
          <button type="button" className="cl-package-back" onClick={backToProcedural}>
            절차 소스로 돌아가기
          </button>
        ) : null}
      </p>
      <section className="cl-package-kit" aria-labelledby={`${ids}-kit-title`}>
        <h3 id={`${ids}-kit-title`}>모듈식 키트(기본 소스)</h3>
        <div className="cl-package-kit-bases" role="group" aria-label="키트 베이스">
          {KIT_BASE_IDS.map((baseId) => {
            const selected = source.kind === "kit" && source.baseId === baseId;
            const missing = manifest !== undefined && manifest.bases[baseId] === undefined;
            return (
              <button
                key={baseId}
                type="button"
                className={`cl-package-kit-base${selected ? " cl-package-kit-base--selected" : ""}`}
                aria-pressed={selected}
                disabled={selected || missing || kitFetch.phase === "loading"}
                title={missing ? "이 키트에는 해당 베이스가 없습니다." : undefined}
                data-base={baseId}
                onClick={() => void pickBase(baseId)}
              >
                {KIT_BASE_LABELS_KO[baseId]} 베이스
              </button>
            );
          })}
          <button
            type="button"
            className="cl-package-kit-reload"
            disabled={source.kind !== "kit" || applyLoop === null}
            title={source.kind !== "kit" ? "현재 소스가 키트일 때만 다시 불러올 수 있습니다." : applyLoop === null ? "적용 루프가 연결되지 않아 다시 불러올 수 없습니다." : "실패 기억과 kit.json 캐시를 비우고 키트를 다시 받습니다."}
            onClick={reloadKit}
          >
            키트 다시 불러오기
          </button>
        </div>
        {kitPlans === null ? (
          <p className="cl-package-hint cl-package-kit-hint">키트 등록소가 조립되지 않아 출처·제공 파츠 정보를 불러올 수 없습니다.</p>
        ) : source.kind !== "kit" && manifest === undefined && kitFetch.phase === "idle" ? (
          <p className="cl-package-hint cl-package-kit-hint">키트 정보(출처·제공 파츠)는 베이스를 고르면 불러옵니다.</p>
        ) : null}
        {kitNotice ? (
          <p className="cl-package-kit-notice cl-package-reason" role="note">
            {kitNotice}
          </p>
        ) : null}
        {source.kind === "kit" && !engineReady && shownKitFailure === undefined ? (
          <p className="cl-package-hint cl-package-kit-hint">엔진을 고르면 베이스·선택 파츠(GLB)를 받아 올립니다. 엔진 선택 전에는 파츠 파일을 받지 않습니다.</p>
        ) : null}
        {kitLoading ? (
          <p className="cl-package-kit-loading" role="status">
            키트를 불러오는 중… (베이스·선택 파츠 GLB 받기, 크기·SHA-256 검증, 스켈레톤 결합)
          </p>
        ) : null}
        {source.kind === "kit" && engineReady && kitSettled && shownKitFailure === undefined ? <p className="cl-package-hint cl-package-kit-hint">키트를 엔진에 올렸습니다.</p> : null}
        {shownKitFailure ? (
          <p className="cl-package-failure cl-package-kit-failure" role="alert">
            {describeFailure(shownKitFailure)}
          </p>
        ) : null}
        {panelKitFailure ? (
          <p className="cl-package-failure cl-package-kit-failure" role="alert">
            {describeFailure(panelKitFailure)}
          </p>
        ) : null}
        {kitFetch.phase === "failed" && kitSource === null ? (
          <p className="cl-package-failure cl-package-kit-failure" role="alert">
            {describeFailure(kitFetch.failure)}
          </p>
        ) : null}
        {kitFetch.phase === "loading" ? <p className="cl-package-hint cl-package-kit-hint">kit.json을 받는 중…</p> : null}
        {manifest !== undefined ? (
          <>
            <KitProvenance manifest={manifest} />
            <KitPartsTable manifest={manifest} />
          </>
        ) : null}
        {source.kind === "kit" ? (
          <div className="cl-package-kit-procedural">
            <button type="button" className="cl-package-kit-to-procedural" onClick={backToProcedural}>
              절차 소스로 전환
            </button>
            <span className="cl-package-hint">절차 소스는 키트가 아닌 대체 휴머노이드입니다. 키트 로드가 실패해도 자동으로 바뀌지 않으며, 이 버튼으로만 전환합니다.</span>
          </div>
        ) : null}
      </section>
      <h3 className="cl-package-subtitle">제작(Blender) 패키지</h3>
      <div className="cl-package-toolbar">
        <button type="button" onClick={() => void loadIndex()} disabled={index.phase === "loading"}>
          {index.phase === "loading" ? "목록 불러오는 중…" : "목록 새로고침"}
        </button>
        <span className="cl-package-hint">public/assets/characters/index.json</span>
      </div>
      {index.phase === "failed" ? (
        <p className="cl-package-failure" role="alert">
          {describeFailure(index.failure)}
        </p>
      ) : null}
      {index.phase === "idle" ? <p className="cl-package-hint">목록을 아직 불러오지 않았습니다.</p> : null}
      {index.phase === "ready" ? (
        <ul className="cl-package-list" aria-label="제작 패키지 목록">
          {index.entries.map((entry) => {
            const packageState = packages[entry.characterId];
            return (
              <li key={entry.characterId} className="cl-package-item" data-character-id={entry.characterId}>
                <div className="cl-package-item-head">
                  <strong>{entry.displayName}</strong>
                  {entry.primary ? <span className="cl-package-badge cl-package-badge--primary">주 캐릭터</span> : null}
                  {entry.role ? <span className="cl-package-role">{entry.role}</span> : null}
                  <span className="cl-package-id">{entry.characterId}</span>
                </div>
                <p className="cl-package-summary">
                  품질 {entry.summary.qualityScore ?? "-"} · 스켈레톤 {entry.summary.skeleton === null ? "-" : entry.summary.skeleton ? "있음" : "없음"} · 의미 기반 shape key {entry.summary.semanticShapeKeys ?? "-"}개 · 헤어 LOD 삼각형 {entry.summary.hairLodTriangles.join("/") || "-"} · GLB 삼각형 {entry.summary.glbTriangles ?? "-"} · 라이선스 {entry.licenseNote ?? "미기재"} · GLB SHA {shortSha(entry.glbSha256)}
                </p>
                <button type="button" onClick={() => void loadPackage(entry)} disabled={packageState?.phase === "loading"} aria-label={`${entry.displayName} 불러오기`}>
                  {packageState?.phase === "loading" ? `불러오는 중… (${packageState.step})` : packageState?.phase === "ready" ? "다시 불러오기" : "불러오기"}
                </button>
                {packageState?.phase === "failed" ? (
                  <p className="cl-package-failure" role="alert">
                    {describeFailure(packageState.failure)}
                  </p>
                ) : null}
                {packageState?.phase === "ready" ? <PackageDetail state={packageState} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
