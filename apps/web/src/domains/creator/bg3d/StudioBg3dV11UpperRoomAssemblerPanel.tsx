import { useId, useMemo, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES,
  type Bg3dObjectClusterArchetypeId,
  type Bg3dObjectClutterDensity,
  type Bg3dObjectSurfaceTheme,
} from "./studio-bg3d-background-object-cluster";
import {
  STUDIO_BG3D_V11_UPPER_ARCHETYPES,
  assembleBg3dV11RoomPipeline,
  Bg3dV11PlacementError,
  type Bg3dV11RoomDimensions,
  type Bg3dV11UpperArchetypeId,
} from "./studio-bg3d-v11-upper-and-lived-in-engine";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";
import type { StudioBg3dOrganizationController } from "./studio-bg3d-organization-controller";

export interface StudioBg3dV11UpperRoomAssemblerPanelProps {
  readonly onInsertPrimitives?: StudioBg3dInsertScenePrimitives;
  readonly organization?: StudioBg3dOrganizationController;
  readonly roomDimensions?: Bg3dV11RoomDimensions;
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
}

const DEFAULT_ROOM: Bg3dV11RoomDimensions = {
  width: 6.4,
  depth: 5.2,
  wallHeight: 2.85,
};
const DEFAULT_LOWER_ARCHETYPE: Bg3dObjectClusterArchetypeId =
  "classroom-front-locker-rig";
const INITIAL_PIPELINE_OPTIONS = {
  lowerAnchor: "north-wall",
  density: "lived-in",
  theme: "daylight-neutral",
  seed: 20261113,
  messiness: 0.4,
} as const;
const CONTROL =
  "min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";
const UPPER_EN: Record<Bg3dV11UpperArchetypeId, string> = {
  "ceiling-hvac-cassette-duct": "Ceiling HVAC cassette and duct",
  "ceiling-track-spotlight-rig": "Ceiling track spotlights",
  "window-venetian-blind-pelmet": "Window blind and pelmet",
  "alley-projecting-sign-wires": "Alley sign and wires",
  "classroom-ceiling-speaker-projector":
    "Classroom projector, speaker and lights",
  "hanok-rafter-choma-lantern": "Hanok rafters and lantern",
};

/** 최초 추천만 방에 맞추고, 이후 선택과 방 크기 변경은 기존 상태를 유지한다. */
function chooseInitialLowerArchetype(
  room: Bg3dV11RoomDimensions,
): Bg3dObjectClusterArchetypeId {
  const candidates = [
    DEFAULT_LOWER_ARCHETYPE,
    ...STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.filter(
      ({ id }) => id !== DEFAULT_LOWER_ARCHETYPE,
    ).map(({ id }) => id),
  ];
  for (const lowerArchetype of candidates) {
    try {
      assembleBg3dV11RoomPipeline({
        ...INITIAL_PIPELINE_OPTIONS,
        room,
        lowerArchetype,
      });
      return lowerArchetype;
    } catch (error) {
      if (!(error instanceof Bg3dV11PlacementError)) throw error;
    }
  }
  return DEFAULT_LOWER_ARCHETYPE;
}

/** 삽입·태그 변경은 정본 명령의 결과를 사용하고 가시성은 매 렌더의 읽기 모델에서 가져온다. */
export function StudioBg3dV11UpperRoomAssemblerPanel({
  onInsertPrimitives,
  organization,
  roomDimensions = DEFAULT_ROOM,
  disabled = false,
  defaultExpanded = true,
}: StudioBg3dV11UpperRoomAssemblerPanelProps) {
  const bt = useBilingual("StudioBg3dV11UpperRoomAssemblerPanel");
  const id = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [lowerArchetype, setLowerArchetype] =
    useState<Bg3dObjectClusterArchetypeId>(() =>
      chooseInitialLowerArchetype(roomDimensions),
    );
  const [upperOverride, setUpperOverride] = useState<
    Bg3dV11UpperArchetypeId | "auto"
  >("auto");
  const [lowerAnchor, setLowerAnchor] = useState<"north-wall" | "nw-corner">(
    INITIAL_PIPELINE_OPTIONS.lowerAnchor,
  );
  const [density, setDensity] = useState<Bg3dObjectClutterDensity>(
    INITIAL_PIPELINE_OPTIONS.density,
  );
  const [theme, setTheme] =
    useState<Bg3dObjectSurfaceTheme>(INITIAL_PIPELINE_OPTIONS.theme);
  const [messinessPct, setMessinessPct] = useState(
    INITIAL_PIPELINE_OPTIONS.messiness * 100,
  );
  const [seed, setSeed] = useState<number>(INITIAL_PIPELINE_OPTIONS.seed);
  const [ordinal, setOrdinal] = useState(1);
  const [status, setStatus] = useState<
    "inserted" | "hidden" | "shown" | "failed" | null
  >(null);
  const computed = useMemo(() => {
    try {
      return {
        ok: true as const,
        preview: assembleBg3dV11RoomPipeline({
          room: roomDimensions,
          lowerArchetype,
          upperArchetype: upperOverride === "auto" ? undefined : upperOverride,
          lowerAnchor,
          density,
          theme,
          seed,
          messiness: messinessPct / 100,
          instancePrefix: `v11r${ordinal}`,
        }),
      };
    } catch (error) {
      if (!(error instanceof Bg3dV11PlacementError)) throw error;
      return { ok: false as const, code: error.code };
    }
  }, [
    roomDimensions,
    lowerArchetype,
    upperOverride,
    lowerAnchor,
    density,
    theme,
    seed,
    messinessPct,
    ordinal,
  ]);
  const upperTag = organization?.view.tags.find(
    ({ tag }) => tag === "BgV11_Upper",
  );
  const hideUpper = organization?.view.hiddenTags.has("BgV11_Upper") ?? false;
  const insert = (upperOnly: boolean) => {
    if (disabled || !computed.ok || !onInsertPrimitives) return;
    try {
      const accepted = onInsertPrimitives(
        upperOnly
          ? computed.preview.upperPrimitives
          : computed.preview.combinedPrimitives,
        bt(
          upperOnly ? "상부 설비 배치" : "상·하부 룸 세트 배치",
          upperOnly
            ? "Insert upper fixtures"
            : "Insert upper and lower room set",
        ),
      );
      setStatus(accepted ? "inserted" : "failed");
      if (accepted) setOrdinal((value) => value + 1);
    } catch {
      setStatus("failed");
    }
  };
  const toggleUpper = () => {
    if (disabled || !organization || !upperTag) return;
    const result = organization.toggleTagVisibility("BgV11_Upper");
    setStatus(result.ok ? (hideUpper ? "shown" : "hidden") : "failed");
  };
  const statusCopy =
    status === "inserted"
      ? bt("장면에 세트를 배치했어요.", "Inserted the set into the scene.")
      : status === "hidden"
        ? bt(
            "상부 설비를 숨겼어요. 컷을 저장하면 표시 상태도 함께 저장돼요.",
            "Upper fixtures are hidden. Save a shot to keep this visibility.",
          )
        : status === "shown"
          ? bt(
              "상부 설비를 다시 표시했어요.",
              "Upper fixtures are visible again.",
            )
          : status === "failed"
            ? bt(
                "변경하지 못했어요. 장면 잠금·도형 한도를 확인한 뒤 다시 시도해 주세요.",
                "Change rejected. Check scene locks and object limits, then retry.",
              )
            : bt(
                "방 규격에 맞는 설비와 인체 배치 기준점을 준비해요.",
                "Prepare fixtures and human placement reference points for this room.",
              );

  return (
    <section
      aria-label={bt(
        "V11 상·하부 룸 어셈블러",
        "V11 upper and lower room assembler",
      )}
      className="rounded-xl border border-line bg-panel p-3 text-fg"
    >
      <button
        type="button"
        className={`${CONTROL} flex w-full items-center justify-between text-left font-semibold`}
        disabled={disabled}
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-body` : undefined}
        onClick={() => setExpanded((v) => !v)}
      >
        {bt(
          "V11 상부 설비 · 원클릭 룸 조립",
          "V11 upper fixtures · one-click room assembly",
        )}
        <span className="text-fg-2">
          {expanded ? bt("접기", "Collapse") : bt("펼치기", "Expand")}
        </span>
      </button>
      <p role="status" aria-live="polite" className="mt-2 text-xs text-fg-2">
        {statusCopy}
      </p>
      {expanded && (
        <div id={`${id}-body`} className="mt-3 space-y-3">
          <p className="text-xs text-fg-2">
            {bt(
              "천장·창호·골목 상단 설비와 하부 가구를 함께 배치해요.",
              "Place ceiling, window and alley fixtures with lower furniture.",
            )}{" "}
            {roomDimensions.width} × {roomDimensions.depth} ×{" "}
            {roomDimensions.wallHeight}m
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs" htmlFor={`${id}-lower`}>
              {bt("하부 메인 클러스터", "Lower cluster")}
              <select
                id={`${id}-lower`}
                className={`${CONTROL} mt-1 w-full`}
                disabled={disabled}
                value={lowerArchetype}
                onChange={(e) => {
                  const item = STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.find(
                    ({ id: key }) => key === e.target.value,
                  );
                  if (item) setLowerArchetype(item.id);
                }}
              >
                {STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {bt(item.labelKo, item.id.replaceAll("-", " "))}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs" htmlFor={`${id}-upper`}>
              {bt(
                "상부 페어링 설비 (천장·창호·간판)",
                "Upper fixtures (ceiling, window, sign)",
              )}
              <select
                id={`${id}-upper`}
                className={`${CONTROL} mt-1 w-full`}
                disabled={disabled}
                value={upperOverride}
                onChange={(e) => {
                  const value = e.target.value;
                  const item = STUDIO_BG3D_V11_UPPER_ARCHETYPES.find(
                    ({ id: key }) => key === value,
                  );
                  if (value === "auto") setUpperOverride("auto");
                  else if (item) setUpperOverride(item.id);
                }}
              >
                <option value="auto">
                  {bt("자동 추천 페어링 사용", "Use recommended pairing")}
                </option>
                {STUDIO_BG3D_V11_UPPER_ARCHETYPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {bt(item.labelKo, UPPER_EN[item.id])}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs" htmlFor={`${id}-density`}>
              {bt("소품 밀도", "Prop density")}
              <select
                id={`${id}-density`}
                className={`${CONTROL} mt-1 w-full`}
                disabled={disabled}
                value={density}
                onChange={(e) => {
                  const value = e.target.value;
                  if (
                    value === "essential" ||
                    value === "detailed" ||
                    value === "lived-in"
                  )
                    setDensity(value);
                }}
              >
                <option value="essential">
                  {bt("핵심 구조", "Essential")}
                </option>
                <option value="detailed">{bt("표준 소품", "Detailed")}</option>
                <option value="lived-in">
                  {bt("고밀도 생활감", "Lived-in")}
                </option>
              </select>
            </label>
            <label className="text-xs" htmlFor={`${id}-theme`}>
              {bt("표면 테마", "Surface theme")}
              <select
                id={`${id}-theme`}
                className={`${CONTROL} mt-1 w-full`}
                disabled={disabled}
                value={theme}
                onChange={(e) => {
                  const value = e.target.value;
                  if (
                    value === "daylight-neutral" ||
                    value === "weathered-urban" ||
                    value === "night-glow" ||
                    value === "warm-wood"
                  )
                    setTheme(value);
                }}
              >
                <option value="daylight-neutral">
                  {bt("주간 뉴트럴", "Daylight neutral")}
                </option>
                <option value="weathered-urban">
                  {bt("도심 생활감", "Weathered urban")}
                </option>
                <option value="night-glow">
                  {bt("야간 발광", "Night glow")}
                </option>
                <option value="warm-wood">
                  {bt("원목·전통", "Warm wood")}
                </option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={CONTROL}
              disabled={disabled}
              onClick={() =>
                setLowerAnchor((v) =>
                  v === "north-wall" ? "nw-corner" : "north-wall",
                )
              }
            >
              {bt("벽면 기준", "Wall anchor")}:{" "}
              {lowerAnchor === "north-wall"
                ? bt("북측 정면벽", "North wall")
                : bt("북서 코너", "Northwest corner")}
            </button>
            <button
              type="button"
              className={CONTROL}
              disabled={disabled}
              onClick={() => setSeed((v) => v + 137)}
            >
              {bt("생활감 시드 변경", "Change lived-in seed")} (#{seed % 1000})
            </button>
            <button
              type="button"
              className={CONTROL}
              disabled={disabled || !organization || !upperTag}
              aria-pressed={hideUpper}
              onClick={toggleUpper}
            >
              {hideUpper
                ? bt("상부 설비 다시 표시", "Show upper fixtures")
                : bt("컷별 상부 설비 숨김", "Hide upper fixtures for a shot")}
            </button>
          </div>
          <label className="block text-xs" htmlFor={`${id}-messiness`}>
            {bt("생활감 어질러짐", "Lived-in variation")} ({messinessPct}%)
            <input
              id={`${id}-messiness`}
              type="range"
              min={0}
              max={100}
              step={5}
              disabled={disabled}
              value={messinessPct}
              onChange={(e) => setMessinessPct(Number(e.target.value))}
              className="min-h-11 w-full"
            />
          </label>
          {!computed.ok ? (
            <p role="alert" className="text-xs text-bad">
              {computed.code === "room-too-small"
                ? bt(
                    "선택한 세트가 방보다 커요. 방 치수를 늘리거나 더 작은 클러스터를 선택해 주세요.",
                    "The set does not fit. Increase room dimensions or choose a smaller cluster.",
                  )
                : bt(
                    "방 치수·높이를 유효한 숫자로 입력해 주세요.",
                    "Enter valid room dimensions and height.",
                  )}
            </p>
          ) : (
            <div className="rounded-lg bg-card p-2 text-xs text-fg-2">
              <p>
                {bt(
                  "기하 추정 · 선화 밀도(상/중/하)",
                  "Geometry estimate · edge density (upper/middle/lower)",
                )}
                :{" "}
                {Math.round(
                  computed.preview.afterUpperEdgeMetrics.upperBandRatio * 100,
                )}
                % /{" "}
                {Math.round(
                  computed.preview.afterUpperEdgeMetrics.midBandRatio * 100,
                )}
                % /{" "}
                {Math.round(
                  computed.preview.afterUpperEdgeMetrics.lowerBandRatio * 100,
                )}
                % · {bt("벽면 피복 추정", "Estimated wall coverage")}{" "}
                {
                  computed.preview.afterUpperEdgeMetrics
                    .wallBlankAreaReductionPct
                }
                %
              </p>
              <p className="mt-1">
                {bt(
                  "인체 배치 기준점 (자동 포즈 적용 전 좌표)",
                  "Human placement references (coordinates before posing)",
                )}
              </p>
              <ul>
                {computed.preview.humanSnapPoints.map((point) => (
                  <li key={point.id}>
                    {bt(point.labelKo, `${point.role} reference`)}: (
                    {point.worldPosition.map((v) => v.toFixed(2)).join(", ")})m
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!onInsertPrimitives && (
            <p className="text-xs text-fg-2">
              {bt(
                "편집 가능한 3D 장면을 열어 배치해 주세요.",
                "Open an editable 3D scene to insert this set.",
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${CONTROL} flex-1 font-semibold`}
              disabled={disabled || !computed.ok || !onInsertPrimitives}
              onClick={() => insert(false)}
            >
              {bt("상·하부 세트 원클릭 배치", "Insert upper and lower set")}
            </button>
            <button
              type="button"
              className={CONTROL}
              disabled={disabled || !computed.ok || !onInsertPrimitives}
              onClick={() => insert(true)}
            >
              {bt("상부 설비만 단독 배치", "Insert upper fixtures only")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
