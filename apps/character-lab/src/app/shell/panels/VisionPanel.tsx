/**
 * VisionPanel: 온디바이스 비전(MediaPipe Tasks Vision).
 * ① 참고 이미지 → 이미지 임베더(MobileNet V3 small) 임베딩 vs 프리셋 썸네일 임베딩 코사인 유사도 → 슬롯별 Top-3 추천,
 *    결정적 OKLab k-means 팔레트 → 레시피 색 추천. ② 사진/카메라 → 포즈 랜드마커 33점·손 랜드마커 21점 → 원본 위 오버레이 →
 *    스코프·거울·가시성 옵션으로 `pose/set`(본 회전)·손 포즈 적용.
 * 모델은 세션(createVisionSession)이 한 번만 시도하고 실패는 failed로 남긴다(무음 대체 없음, ADR-0018). imageEmbedder·poseLandmarker 상태는
 * 계약 `vision/status` 이벤트로 store에 올리고 손 모델(계약 `MEDIAPIPE_MODELS.handLandmarker`)은 패널 안에서만 추적한다.
 * 브라우저 API(모델 로더 동적 import·이미지 디코드·카메라)는 deps prop으로 분리해 jsdom 테스트는 가짜를 주입한다.
 * 스타일 클래스 접두는 `cl-vision-`(core CSS). 오버레이 배치만 인라인 스타일(기능상 필수).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { CHANNEL_LABELS_KO, CHARACTER_SLOT_KINDS, RECIPE_COLOR_KEYS, SLOT_LABELS_KO, failVisible, isLabFailure } from "../../../contracts";
import { downsampleRgba } from "../../../domains/vision/image-sampling";
import { extractPalette } from "../../../domains/vision/kmeans-palette";
import { VISION_MODEL_SPECS, describeModelPinKo, isModelSpecPinned } from "../../../domains/vision/model-assets";
import { recommendColors } from "../../../domains/vision/recommend";
import { createThumbnailEmbeddingCache, recommendFromReference } from "../../../domains/vision/reference-recommender";
import { VISION_MODEL_KEYS, VISION_MODEL_LABELS_KO, toContractVisionStatus } from "../../../domains/vision/vision-ports";
import { createVisionSession } from "../../../domains/vision/vision-session";
import { useCatalog, useDispatch, useLabContext, useLabState } from "../lab-store-context";

import { useImageLifecycle } from "./vision-image-lifecycle";
import { createBrowserVisionDeps } from "./vision-panel-deps";
import { PhotoPoseSection } from "./vision-photo-pose-section";

import type { DecodedImage, VisionPanelDeps } from "./vision-panel-deps";
import type { LabFailure, RecipeColorKey, SlotKind } from "../../../contracts";
import type { PaletteEntry } from "../../../domains/vision/kmeans-palette";
import type { ReferenceRecommendation } from "../../../domains/vision/reference-recommender";
import type { VisionDelegate, VisionLoaders, VisionModelKey, VisionModelStatus } from "../../../domains/vision/vision-ports";
import type { VisionSession } from "../../../domains/vision/vision-session";

export { createBrowserVisionDeps } from "./vision-panel-deps";
export type { DecodedImage, VisionPanelDeps } from "./vision-panel-deps";

export interface VisionPanelProps {
  readonly deps?: VisionPanelDeps;
}

type ReferenceState =
  | { readonly phase: "idle" }
  | { readonly phase: "working"; readonly step: string }
  | { readonly phase: "ready"; readonly image: DecodedImage; readonly palette: readonly PaletteEntry[]; readonly colors: Partial<Record<RecipeColorKey, string>>; readonly recommendation: ReferenceRecommendation }
  | { readonly phase: "failed"; readonly failure: LabFailure };

/**
 * 기본 시각 함수. 렌더마다 새 함수를 만들면 `useMemo` 의존성이 매번 바뀌어 비전 세션(과 로드된 모델)이 렌더마다 폐기되므로
 * 모듈 상수로 둔다.
 */
const defaultNow = (): number => Date.now();

const COLOR_LABELS_KO: Readonly<Record<RecipeColorKey, string>> = CHANNEL_LABELS_KO; // 라벨 단일 기준: 계약 색 채널 라벨(레시피 v3)
const PALETTE_K = 6;
const PALETTE_SEED = 1;
const PALETTE_MAX_SIDE = 160;

function lazyLoaders(create: () => Promise<VisionLoaders>): VisionLoaders {
  let promise: Promise<VisionLoaders> | null = null;
  const get = (): Promise<VisionLoaders> => {
    if (!promise) {
      promise = create().catch((error: unknown) => {
        promise = null;
        throw error;
      });
    }
    return promise;
  };
  return {
    imageEmbedder: () => get().then((loaders) => loaders.imageEmbedder()),
    poseLandmarker: () => get().then((loaders) => loaders.poseLandmarker()),
    handLandmarker: () => get().then((loaders) => loaders.handLandmarker()),
  };
}

function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

function describeStatus(status: VisionModelStatus): string {
  switch (status.phase) {
    case "idle":
      return "대기";
    case "loading":
      return "불러오는 중…";
    case "ready":
      return `준비됨 (${status.delegate}, SHA ${status.observedSha256.slice(0, 12)}…${status.pinned ? "" : " 관측값"})`;
    case "failed":
      return `실패: ${status.failure.reasonKo} (${status.failure.code})`;
    default:
      return "";
  }
}

interface ModelStatusListProps {
  readonly session: VisionSession;
  readonly delegate: VisionDelegate;
  readonly onDelegateChange: (delegate: VisionDelegate) => void;
}

function ModelStatusList({ session, delegate, onDelegateChange }: ModelStatusListProps) {
  const statuses = useSyncExternalStore(session.subscribe, session.statuses, session.statuses);
  const ids = useId();
  return (
    <div className="cl-vision-models">
      <div className="cl-vision-row">
        <label htmlFor={`${ids}-delegate`}>델리게이트(생성 전 고정, 자동 전환 없음)</label>
        <select id={`${ids}-delegate`} value={delegate} onChange={(event) => onDelegateChange(event.target.value === "GPU" ? "GPU" : "CPU")}>
          <option value="CPU">CPU</option>
          <option value="GPU">GPU(WebGL2, 브라우저 미검증)</option>
        </select>
      </div>
      <ul className="cl-vision-model-list" aria-label="비전 모델 상태">
        {VISION_MODEL_KEYS.map((key: VisionModelKey) => {
          const spec = VISION_MODEL_SPECS[key];
          const status = statuses[key];
          const pinned = isModelSpecPinned(spec);
          return (
            <li key={key} className="cl-vision-model" data-model={key} data-phase={status.phase}>
              <span className="cl-vision-model-name">{VISION_MODEL_LABELS_KO[key]}</span>
              <span className={`cl-vision-badge ${pinned ? "cl-vision-badge--pinned" : "cl-vision-badge--beta"}`}>{describeModelPinKo(spec)}</span>
              <span className="cl-vision-model-status">{describeStatus(status)}</span>
              {status.phase === "idle" ? (
                <button type="button" onClick={() => void session.retry(key)}>
                  불러오기
                </button>
              ) : null}
              {status.phase === "failed" ? (
                <button type="button" onClick={() => void session.retry(key)}>
                  다시 시도
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="cl-vision-hint">wasm은 앱 번들, 모델 파일만 공식 CDN(storage.googleapis.com/mediapipe-models)에서 받습니다. 오프라인이면 실패로 표시됩니다.</p>
    </div>
  );
}

interface ReferenceSectionProps {
  readonly session: VisionSession;
  readonly deps: VisionPanelDeps;
  readonly now: () => number;
}

function ReferenceSection({ session, deps, now }: ReferenceSectionProps) {
  const state = useLabState();
  const catalog = useCatalog();
  const dispatch = useDispatch();
  const { store } = useLabContext();
  const ids = useId();
  const [reference, setReference] = useState<ReferenceState>({ phase: "idle" });
  const cache = useRef(createThumbnailEmbeddingCache());
  const mounted = useRef(true);
  const images = useImageLifecycle();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const analyze = useCallback(
    async (file: Blob): Promise<void> => {
      const update = (next: ReferenceState): void => {
        if (mounted.current) setReference(next);
      };
      let image: DecodedImage | null = null;
      try {
        update({ phase: "working", step: "이미지 디코드" });
        image = await deps.decodeImage(file);
        if (!images.track(image)) return;
        update({ phase: "working", step: "이미지 임베더 로드" });
        const embedder = await session.ensure("imageEmbedder");
        update({ phase: "working", step: "참고 이미지 임베딩" });
        const queryEmbedding = await embedder.port.embed(image.source);
        const small = downsampleRgba({ width: image.width, height: image.height, rgba: image.rgba }, PALETTE_MAX_SIDE);
        const palette = extractPalette(small.rgba, { k: PALETTE_K, seed: PALETTE_SEED });
        const colors = recommendColors(palette);
        update({ phase: "working", step: "프리셋 썸네일 임베딩" });
        const recommendation = await recommendFromReference({
          queryEmbedding,
          thumbnails: store.getState().thumbnails,
          catalog,
          embedRaster: (raster) => embedder.port.embed(deps.rasterToImage(raster)),
          cache: cache.current,
          onProgress: (done, total) => update({ phase: "working", step: `프리셋 썸네일 임베딩 ${done}/${total}` }),
        });
        update({ phase: "ready", image, palette, colors, recommendation });
      } catch (error) {
        if (image) images.discard(image);
        const failure = toFailure("vision-reference-failed", "참고 이미지 분석에 실패했습니다.", error, now());
        update({ phase: "failed", failure });
        store.applyEvent({ type: "failure", failure });
      } finally {
        // 추정이 끝났으니(성공·실패 모두) 입력 비트맵을 닫는다. 이후에는 width·height·미리보기만 쓴다.
        image?.releaseSource?.();
      }
    },
    [catalog, deps, images, now, session, store],
  );

  const onFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) void analyze(file);
  };

  const applyColors = (): void => {
    if (reference.phase !== "ready") return;
    for (const key of RECIPE_COLOR_KEYS) {
      const value = reference.colors[key];
      if (value) dispatch({ type: "color/set", key, value });
    }
  };

  const applyTop = (): void => {
    if (reference.phase !== "ready") return;
    for (const slot of CHARACTER_SLOT_KINDS) {
      const first = reference.recommendation.recommendations[slot][0];
      if (first && state.capabilities[slot].status !== "unavailable") dispatch({ type: "slot/apply", slot, presetId: first.presetId });
    }
  };

  const slotsWithRecommendations = reference.phase === "ready" ? CHARACTER_SLOT_KINDS.filter((slot) => reference.recommendation.recommendations[slot].length > 0) : [];
  const colorEntries = reference.phase === "ready" ? RECIPE_COLOR_KEYS.filter((key) => reference.colors[key] !== undefined) : [];

  return (
    <section className="cl-vision-reference" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>참고 이미지 추천</h3>
      <div className="cl-vision-row">
        <label htmlFor={`${ids}-file`}>참고 이미지 파일</label>
        <input id={`${ids}-file`} type="file" accept="image/*" onChange={onFile} disabled={reference.phase === "working"} />
      </div>
      {reference.phase === "working" ? (
        <p className="cl-vision-progress" role="status">
          분석 중: {reference.step}
        </p>
      ) : null}
      {reference.phase === "failed" ? (
        <p className="cl-vision-failure" role="alert">
          {reference.failure.reasonKo} ({reference.failure.code})
        </p>
      ) : null}
      {reference.phase === "ready" ? (
        <div className="cl-vision-reference-result">
          {reference.image.previewUrl ? <img className="cl-vision-preview" src={reference.image.previewUrl} alt={`참고 이미지 ${reference.image.label}`} /> : null}
          <p className="cl-vision-coverage" role="status">
            후보 {reference.recommendation.coverage.candidates}/{reference.recommendation.coverage.total}개 · 썸네일 임베딩 {reference.recommendation.thumbnails.embedded}개(재사용 {reference.recommendation.thumbnails.reused}개) · 제외 {reference.recommendation.thumbnails.skipped.length}개
          </p>
          {reference.recommendation.thumbnails.skipped.length > 0 ? (
            <details className="cl-vision-skipped">
              <summary>추천에서 제외된 프리셋(썸네일 없음·실패)</summary>
              <ul>
                {reference.recommendation.thumbnails.skipped.map((entry) => (
                  <li key={entry.presetId}>
                    {entry.presetId}: {entry.reasonKo}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="cl-vision-palette">
            <h4>팔레트(OKLab k-means, k={PALETTE_K}, 시드 {PALETTE_SEED})</h4>
            <ul className="cl-vision-swatches" aria-label="팔레트">
              {reference.palette.map((entry) => (
                <li key={entry.hex} className="cl-vision-swatch" style={{ background: entry.hex }} title={`${entry.hex} ${(entry.weight * 100).toFixed(1)}%`}>
                  <span className="cl-vision-swatch-label">
                    {entry.hex} · {(entry.weight * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
            {colorEntries.length > 0 ? (
              <>
                <ul className="cl-vision-color-recs" aria-label="색 추천">
                  {colorEntries.map((key) => (
                    <li key={key}>
                      {COLOR_LABELS_KO[key]}: <span className="cl-vision-swatch-inline" style={{ background: reference.colors[key] }} /> {reference.colors[key]}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={applyColors}>
                  추천 색 적용({colorEntries.length}개)
                </button>
              </>
            ) : (
              <p className="cl-vision-hint">조건에 맞는 색 군집이 없어 색 추천이 없습니다(임의 기본색을 넣지 않습니다).</p>
            )}
          </div>
          <div className="cl-vision-recs">
            <h4>슬롯별 추천(코사인 유사도 상위 3)</h4>
            {slotsWithRecommendations.length === 0 ? <p className="cl-vision-hint">임베딩된 썸네일이 없어 추천할 수 없습니다. 슬롯을 열어 썸네일을 먼저 만드세요.</p> : null}
            {slotsWithRecommendations.length > 0 ? (
              <button type="button" onClick={applyTop}>
                1순위 전체 적용
              </button>
            ) : null}
            {slotsWithRecommendations.map((slot: SlotKind) => {
              const capability = state.capabilities[slot];
              const disabled = capability.status === "unavailable";
              return (
                <div key={slot} className="cl-vision-rec-slot" data-slot={slot}>
                  <h5>
                    {SLOT_LABELS_KO[slot]}
                    {capability.status !== "available" ? <span className={`cl-vision-badge cl-vision-badge--${capability.status}`}>{capability.status === "partial" ? "부분 지원" : "미지원"}</span> : null}
                  </h5>
                  {disabled ? <p className="cl-vision-hint">{capability.reasonKo}</p> : null}
                  <ul>
                    {reference.recommendation.recommendations[slot].map((item, rank) => {
                      const entry = catalog.get(item.presetId);
                      const label = entry?.labelKo ?? item.presetId;
                      const selected = state.recipe.slots[slot] === item.presetId;
                      return (
                        <li key={item.presetId}>
                          <button type="button" aria-pressed={selected} disabled={disabled} title={disabled ? capability.reasonKo : undefined} onClick={() => dispatch({ type: "slot/apply", slot, presetId: item.presetId })}>
                            {rank + 1}. {label} · {item.score.toFixed(2)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function VisionPanel({ deps: providedDeps }: VisionPanelProps) {
  const { store } = useLabContext();
  const ids = useId();
  const deps = useMemo(() => providedDeps ?? createBrowserVisionDeps(), [providedDeps]);
  const now = deps.now ?? defaultNow;
  const [delegate, setDelegate] = useState<VisionDelegate>("CPU");
  const session = useMemo(
    () =>
      createVisionSession({
        loaders: lazyLoaders(() => deps.createLoaders({ delegate })),
        onStatus: (_key, status) => {
          const contractStatus = toContractVisionStatus(status);
          if (contractStatus) store.applyEvent({ type: "vision/status", status: contractStatus });
        },
        now,
      }),
    [delegate, deps, now, store],
  );
  useEffect(() => () => session.dispose(), [session]);

  return (
    <section className="cl-vision-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>비전(온디바이스)</h2>
      <ModelStatusList session={session} delegate={delegate} onDelegateChange={setDelegate} />
      <ReferenceSection session={session} deps={deps} now={now} />
      <PhotoPoseSection session={session} deps={deps} now={now} />
    </section>
  );
}
