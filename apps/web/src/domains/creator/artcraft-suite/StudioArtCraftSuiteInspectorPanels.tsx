/**
 * StudioArtCraftSuiteInspectorPanels.tsx
 *
 * 15종 ArtCraft Crafting Apps 선택 시 실시간 파라미터 조작과 클린룸 엔진 연산 결과를
 * 즉시 확인·적용할 수 있는 인터랙티브 인스펙터 패널 모음.
 */

import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  evaluateEffectCraftExpression,
  evaluateLightCraftDevelopPipeline,
  evaluateVectorCraftPipeline,
  planPhotoCraftTiledCanvas,
  simulateAniCraftCelScene,
  splitFilmCraftClipAtOffset,
  type AniCraftKomaMode,
  type VectorCraftBooleanOp,
  type VectorCraftBrushKind,
} from "./artcraft-creative-media-engines";
import {
  isConfinedArtCraftReleaseDownloadUrl,
  isSafeArtCraftWebLink,
  parseArtCraftPackageVersion,
  routeCraftAiTask,
  srgbTripletToHex,
  type ArtCraftAppCatalogEntry,
  type CraftAiRole,
} from "./artcraft-launcher-security-catalog";
import {
  auditPdfCraftRedactions,
  composeDesignCraftParagraphKnuthPlass,
  computeSoundCraftSessionAdcAndTimebase,
  convertWordCraftPoints,
  evaluateGridCraftEpisodeSettlement,
  interpolateDeckCraftMorphTransition,
  parseCadCraftPolarCommand,
   resolveWordCraftTrackChanges,
  solveCadCraftTwoDistanceConstraint,
  solveFigCraftHorizontalAutoLayout,
} from "./artcraft-publishing-office-cad-engines";

export function StudioArtCraftAppLiveInspector({
  app,
}: {
  readonly app: ArtCraftAppCatalogEntry;
}) {
  const bt = useBilingual("StudioArtCraftAppLiveInspector");

  // [3] Launcher 상태
  const [testUrl, setTestUrl] = useState("https://getartcraft.com/docs");
  const [aiRole, setAiRole] = useState<CraftAiRole>("segmentation-sam3");

  // [3.1] PhotoCraft 상태
  const [pcraftHeightPx, setPcraftHeightPx] = useState(24000);
  const [pcraftDupRatio, setPcraftDupRatio] = useState(0.55);

  // [3.2] VectorCraft 상태
  const [vecBooleanOp, setVecBooleanOp] = useState<VectorCraftBooleanOp>("union");
  const [vecBrush, setVecBrush] = useState<VectorCraftBrushKind>("bristle");

  // [3.3] FilmCraft 상태
  const [clipReversed, setClipReversed] = useState(true);

  // [3.4] LightCraft 상태
  const [lcExposure, setLcExposure] = useState(0.8);
  const [lcIsRaw, setLcIsRaw] = useState(true);

  // [3.5] PdfCraft 상태
  const [simulateFauxRedaction, setSimulateFauxRedaction] = useState(true);

  // [3.6] EffectCraft 상태
  const [wiggleHz, setWiggleHz] = useState(3.5);
  const wiggleAmp = 28;

  // [3.7] DesignCraft 상태
  const [targetLineChars, setTargetLineChars] = useState(22);

  // [3.8] FigCraft 상태
  const [containerWidthPx, setContainerWidthPx] = useState(720);

  // [3.9] WordCraft 상태
  const [revisionDecision, setRevisionDecision] = useState<"accept-all" | "reject-all">("accept-all");

  // [3.10] SoundCraft 상태
  const [tempoBpm, setTempoBpm] = useState(128);

  // [3.11] DeckCraft 상태
  const [morphProgress, setMorphProgress] = useState(0.5);

  // [3.12] CADCraft 상태
  const [polarCmd, setPolarCmd] = useState("@120<45");
  const [cadDistA, setCadDistA] = useState(100);

  // [3.13] GridCraft 상태
  const [feePerCutKrw, setFeePerCutKrw] = useState(35000);

  // [4.1] AniCraft 상태
  const [komaMode, setKomaMode] = useState<AniCraftKomaMode>("2k-on-twos");
  const [aniDialogue, setAniDialogue] = useState("시계탑의 문이 열린다");

  const accentHex = srgbTripletToHex(app.inkDark);

  return (
    <div
      className="rounded-xl border border-line bg-panel p-4 space-y-3"
      data-testid={`artcraft-inspector-${app.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
        <div>
          <span
            className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: `${accentHex}22`, color: accentHex }}
          >
            [{app.namuSection}] {app.name} ({app.version})
          </span>
          <p className="mt-1 text-xs text-fg-2">
            {bt(app.taglineKo, app.taglineEn)} · {bt("대응 소프트웨어", "Counterpart")}:{" "}
            <strong className="text-fg">{app.industryCounterpart}</strong>
          </p>
        </div>
        <div className="text-right text-[11px] font-mono text-fg-3">
          <div>Bundle: {app.bundleId}</div>
          <div>REA: {app.reaViewEvidenceId.slice(0, 18)}…</div>
        </div>
      </div>

      {app.id === "artcraft-launcher" ? (
        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="space-y-2">
            <label className="block font-medium text-fg">
              {bt("CWE-78 외부 링크 쉘 메타문자 보안 검사", "CWE-78 Safe Web Link Guard")}
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                className="mt-1 w-full rounded border border-line bg-card px-2 py-1 font-mono text-xs"
              />
            </label>
            <div className="rounded bg-card p-2 font-mono">
              <div>
                safe_web_link:{" "}
                <strong className={isSafeArtCraftWebLink(testUrl) ? "text-good" : "text-bad"}>
                  {isSafeArtCraftWebLink(testUrl) ? "ALLOWED (안전)" : "BLOCKED (CWE-78 차단)"}
                </strong>
              </div>
              <div>
                CWE-180 Release Guard:{" "}
                {isConfinedArtCraftReleaseDownloadUrl(
                  "https://github.com/storytold/photocraft/releases/download/v0.16.0/photocraft-web-0.16.0.zip",
                  "https://github.com/storytold/photocraft",
                )
                  ? "VERIFIED"
                  : "REJECTED"}
              </div>
              <div>
                Debian/AUR Version Parser (1:0.16.0~beta1-1):{" "}
                {JSON.stringify(parseArtCraftPackageVersion("1:0.16.0~beta1-1"))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block font-medium text-ink">
              {bt("craft-ai-integrations 로컬/클라우드 AI 라우터", "craft-ai-integrations Router")}
              <select
                value={aiRole}
                onChange={(e) => setAiRole(e.target.value as CraftAiRole)}
                className="mt-1 w-full rounded border border-line bg-card px-2 py-1 text-xs"
              >
                <option value="segmentation-sam3">SAM 3 캐릭터/하늘 세그멘테이션</option>
                <option value="inpaint-outpaint">인페인팅 / 아웃페인팅 배경 확장</option>
                <option value="stt-whisper">Whisper 대사 음성 인식 (STT)</option>
                <option value="tts-kokoro">Kokoro-82M 가이드 보이스 합성 (TTS)</option>
              </select>
            </label>
            {(() => {
              const route = routeCraftAiTask(aiRole, true);
              return (
                <div className="rounded bg-card p-2 font-mono">
                  <div>Engine: {route.selectedEngine}</div>
                  <div>Target: {route.executionTarget}</div>
                  <div>Est. VRAM: {route.estimatedVramMb} MB</div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {app.id === "photocraft" ? (
        (() => {
          const plan = planPhotoCraftTiledCanvas({
            widthPx: 1600,
            heightPx: pcraftHeightPx,
            bitDepth: 16,
            layerCount: 18,
            emptyTileRatio: 0.42,
            duplicateTileRatio: pcraftDupRatio,
          });
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="space-y-2">
                <label className="block">
                  {bt("웹툰 세로 캔버스 높이 (px)", "Webtoon Vertical Height (px)")}: {pcraftHeightPx}px
                  <input
                    type="range"
                    min={4000}
                    max={60000}
                    step={2000}
                    value={pcraftHeightPx}
                    onChange={(e) => setPcraftHeightPx(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  {bt("BLAKE3 동일 타일 중복률", "BLAKE3 Duplicate Tile Ratio")}: {Math.round(pcraftDupRatio * 100)}%
                  <input
                    type="range"
                    min={0.1}
                    max={0.85}
                    step={0.05}
                    value={pcraftDupRatio}
                    onChange={(e) => setPcraftDupRatio(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              </div>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>Logical Tiles (256×256): {plan.totalLogicalTiles.toLocaleString()}</div>
                <div>Unique BLAKE3 Tiles: {plan.uniqueBlake3TilesStored.toLocaleString()}</div>
                <div>
                  Storage: {plan.uncompressedMegabytes} MB →{" "}
                  <strong className="text-good">{plan.deduplicatedZstdMegabytes} MB (-{plan.savingsPercent}%)</strong>
                </div>
                <div>finite::check Guard: {plan.finiteCheckPassed ? "PASSED (No NaN/Inf)" : "FAILED"}</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "vectorcraft" ? (
        (() => {
          const res = evaluateVectorCraftPipeline({
            booleanOp: vecBooleanOp,
            brushKind: vecBrush,
            pathCount: 6,
            anchorCount: 32,
            mode3d: "extrude-bevel",
            extrudeDepthPt: 36,
          });
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="flex gap-2">
                <select
                  aria-label={bt("베지어 불리언 연산", "Bezier Boolean Operation")}
                  value={vecBooleanOp}
                  onChange={(e) => setVecBooleanOp(e.target.value as VectorCraftBooleanOp)}
                  className="rounded border border-line bg-card px-2 py-1"
                >
                  <option value="union">Union (합집합)</option>
                  <option value="subtract">Subtract (차집합)</option>
                  <option value="intersect">Intersect (교집합)</option>
                  <option value="exclude">Exclude (배타합)</option>
                  <option value="divide">Divide (평면 영역 분할)</option>
                </select>
                <select
                  aria-label={bt("벡터 브러시 종류", "Vector Brush Kind")}
                  value={vecBrush}
                  onChange={(e) => setVecBrush(e.target.value as VectorCraftBrushKind)}
                  className="rounded border border-line bg-card px-2 py-1"
                >
                  <option value="calligraphic">Calligraphic (캘리그라피)</option>
                  <option value="scatter">Scatter (산포)</option>
                  <option value="art">Art (아트 스트로크)</option>
                  <option value="pattern">Pattern (패턴 반복)</option>
                  <option value="bristle">Bristle (강모 시뮬레이션)</option>
                </select>
              </div>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>Regions: {res.resultingRegionCount} · Cubic Segments: {res.exactBezierSegments}</div>
                <div>Brush Stamps: {res.generatedBrushStamps} · 3D Faces: {res.shaded3dFaces}</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "filmcraft" ? (
        (() => {
          const split = splitFilmCraftClipAtOffset(
            {
              id: "clip-pv-01",
              name: "웹툰 PV 하이라이트 컷",
              timelineStartTicks: 0,
              durationTicks: 1000,
              sourceInTicks: 800,
              speed: clipReversed ? -1.0 : 1.0,
              syncLocked: true,
            },
            400,
          );
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={clipReversed}
                  onChange={(e) => setClipReversed(e.target.checked)}
                />
                {bt("역방향 재생 클립(speed = -1.0) 분할 연속성 검증", "Reverse Playback Clip Split Continuity")}
              </label>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>Left Clip: dur={split.leftClip.durationTicks} ticks, srcIn={split.leftClip.sourceInTicks}</div>
                <div>Right Clip: dur={split.rightClip.durationTicks} ticks, srcIn={split.rightClip.sourceInTicks}</div>
                <div>Continuity Preserved: {split.reverseContinuityPreserved ? "YES" : "NO"}</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "lightcraft" ? (
        (() => {
          const report = evaluateLightCraftDevelopPipeline({
            isRaw: lcIsRaw,
            patch: { exposure: lcExposure, vibrance: 24 },
            enableSam3SubjectMask: true,
            enableSkyMask: true,
            hdrBracketCount: 3,
          });
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={lcIsRaw}
                    onChange={(e) => setLcIsRaw(e.target.checked)}
                  />
                  {bt("RAW 프로파일 기본값 (sharpen=40, nrColor=25)", "RAW Profile Defaults")}
                </label>
                <label className="block">
                  Exposure EV: {lcExposure > 0 ? `+${lcExposure}` : lcExposure}
                  <input
                    type="range"
                    min={-4}
                    max={4}
                    step={0.2}
                    value={lcExposure}
                    onChange={(e) => setLcExposure(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              </div>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>FNV-1a 64-bit Cache Key: {report.previewCacheHash}</div>
                <div>Sharpen / Color NR: {report.settings.sharpenAmount} / {report.settings.nrColor}</div>
                <div>HDR Dynamic Range: {report.effectiveDynamicRangeStops} EV stops</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "pdfcraft" ? (
        (() => {
          const audit = auditPdfCraftRedactions([
            {
              pageNumber: 4,
              targetText: "최종 보스 정체 스포일러 대사",
              hasOpaqueOverlayRect: true,
              glyphsRemovedFromContentStream: !simulateFauxRedaction,
            },
            {
              pageNumber: 9,
              targetText: "작가 주민등록번호 앞자리",
              hasOpaqueOverlayRect: true,
              glyphsRemovedFromContentStream: true,
            },
          ]);
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={simulateFauxRedaction}
                  onChange={(e) => setSimulateFauxRedaction(e.target.checked)}
                />
                {bt("위장 먹칠(검은 사각형 아래 텍스트 잔류) 시뮬레이션", "Simulate Faux Redaction Risk")}
              </label>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>
                  Faux Redactions:{" "}
                  <strong className={audit.fauxRedactionCount > 0 ? "text-bad" : "text-good"}>
                    {audit.fauxRedactionCount}건 (True: {audit.trueRedactionCount}건)
                  </strong>
                </div>
                <div>PDF/UA Rules Passed: {audit.pdfUaPassedRules}/{audit.pdfUaTotalRules}</div>
                <div>Bates Numbering: {audit.sampleBatesStamp}</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "effectcraft" ? (
        (() => {
          const expr = evaluateEffectCraftExpression({
            timeSeconds: 1.25,
            baseValue: 100,
            wiggleFreqHz: wiggleHz,
            wiggleAmp,
            loopDurationSeconds: 2.0,
          });
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="space-y-1">
                <label className="block">
                  wiggle({wiggleHz} Hz, {wiggleAmp} px)
                  <input
                    type="range"
                    min={1}
                    max={12}
                    step={0.5}
                    value={wiggleHz}
                    onChange={(e) => setWiggleHz(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              </div>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>Evaluated Value @ 1.25s: {expr.evaluatedValue}</div>
                <div>Lottie Keyframes: {expr.lottieKeyframeCount} · NCC Track: {expr.nccTrackingConfidence}</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "designcraft" ? (
        (() => {
          const kp = composeDesignCraftParagraphKnuthPlass(
            "시계탑 꼭대기에서 내려다본 왕도의 밤하늘에는 열두 개의 붉은 달이 차례대로 떠올랐다.",
            targetLineChars,
          );
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <label className="block">
                {bt("말풍선/단행본 목표 글자 폭", "Target Line Width (chars)")}: {targetLineChars}
                <input
                  type="range"
                  min={12}
                  max={34}
                  value={targetLineChars}
                  onChange={(e) => setTargetLineChars(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>
                  Demerits: {kp.totalDemerits} (Greedy: {kp.greedyDemerits}, -{kp.demeritReductionPercent}%)
                </div>
                <div className="text-ink">{kp.lines.join(" / ")}</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "figcraft" ? (
        (() => {
          const layout = solveFigCraftHorizontalAutoLayout({
            containerWidthPx,
            paddingPx: 16,
            gapPx: 12,
            children: [
              { id: "badge", sizing: "fixed", baseSizePx: 80 },
              { id: "title-fill", sizing: "fill", baseSizePx: 200 },
              { id: "cta-hug", sizing: "hug", baseSizePx: 110 },
            ],
          });
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <label className="block">
                Auto Layout Width: {containerWidthPx}px
                <input
                  type="range"
                  min={420}
                  max={1080}
                  step={20}
                  value={containerWidthPx}
                  onChange={(e) => setContainerWidthPx(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>
                  Solved Widths:{" "}
                  {layout.solvedChildren.map((c) => `${c.id}=${c.widthPx}px(${c.fractionalOrderKey})`).join(", ")}
                </div>
                <div className="truncate">{layout.reactTailwindSnippet}</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "wordcraft" ? (
        (() => {
          const mergedText = resolveWordCraftTrackChanges(
            [
              { text: "제1화: ", revision: "unchanged" },
              { text: "부서진 회중시계", revision: "deleted" },
              { text: "열두 번째 시계탑의 귀환", revision: "inserted" },
            ],
            revisionDecision,
          );
          const units = convertWordCraftPoints(12);
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRevisionDecision("accept-all")}
                  className="rounded border border-line bg-card px-2 py-1"
                >
                  {bt("변경 모두 수락", "Accept All")}
                </button>
                <button
                  type="button"
                  onClick={() => setRevisionDecision("reject-all")}
                  className="rounded border border-line bg-card px-2 py-1"
                >
                  {bt("변경 모두 거부", "Reject All")}
                </button>
              </div>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>Result: {mergedText}</div>
                <div>12pt = {units.twips} twips = {units.emu.toLocaleString()} EMU ({units.millimeters} mm)</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "soundcraft" ? (
        (() => {
          const adc = computeSoundCraftSessionAdcAndTimebase({
            positionSamples: 48000 * 14,
            sampleRateHz: 48000,
            tempoBpm,
            tracks: [
              { trackId: "dialogue", pluginLatencySamples: 128 },
              { trackId: "sfx-bus", pluginLatencySamples: 512 },
              { trackId: "master-limiter", pluginLatencySamples: 1024 },
            ],
          });
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <label className="block">
                Tempo BPM: {tempoBpm}
                <input
                  type="range"
                  min={72}
                  max={180}
                  value={tempoBpm}
                  onChange={(e) => setTempoBpm(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>24fps TC: {adc.timecode24Fps} · 35mm Feet+Frames: {adc.feetAndFrames35mm}</div>
                <div>Bars|Beats: {adc.barsBeats} · Max ADC: {adc.maxLatencySamples} samples</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "deckcraft" ? (
        (() => {
          const morphed = interpolateDeckCraftMorphTransition(
            { matchName: "!!cut-card", x: 40, y: 60, width: 240, height: 160, rotationDeg: 0, color: [47, 123, 245] },
            { matchName: "!!cut-card", x: 360, y: 120, width: 420, height: 280, rotationDeg: 12, color: [240, 122, 30] },
            morphProgress,
          );
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <label className="block">
                Morph Transition t = {Math.round(morphProgress * 100)}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={morphProgress}
                  onChange={(e) => setMorphProgress(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>Pos: ({morphed.x}, {morphed.y}) · Size: {morphed.width}×{morphed.height}</div>
                <div>Rot: {morphed.rotationDeg}° · sRGB: rgb({morphed.color.join(", ")})</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "cadcraft" ? (
        (() => {
          const pt = parseCadCraftPolarCommand(polarCmd, { x: 100, y: 100 });
          const solved = solveCadCraftTwoDistanceConstraint({
            bx: 120,
            targetDistOrigin: cadDistA,
            targetDistB: 100,
          });
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="space-y-1">
                <label className="block">
                  Polar Command (@dist&lt;angle):
                  <input
                    type="text"
                    value={polarCmd}
                    onChange={(e) => setPolarCmd(e.target.value)}
                    className="mt-0.5 w-full rounded border border-line bg-card px-2 py-1 font-mono"
                  />
                </label>
                <label className="block">
                  Constraint Dist A: {cadDistA}
                  <input
                    type="range"
                    min={70}
                    max={150}
                    value={cadDistA}
                    onChange={(e) => setCadDistA(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              </div>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>Polar Endpoint: {pt ? `(${pt.x}, ${pt.y})` : "Invalid syntax"}</div>
                <div>Gauss-Newton Solved P: ({solved.x}, {solved.y}) in {solved.iterations} iters</div>
                <div>Residual: {solved.residualNorm} ({solved.converged ? "CONVERGED" : "OPEN"})</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "gridcraft" ? (
        (() => {
          const sheet = evaluateGridCraftEpisodeSettlement({
            variableNames: ["단가_ß", "보너스_ς"],
            cutCountsPerEpisode: [68, 72, 75, 80],
            feePerCutKrw,
            platformBonusKrw: 200000,
          });
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <label className="block">
                {bt("컷당 원고료 (KRW)", "Fee per Cut (KRW)")}: {feePerCutKrw.toLocaleString()}원
                <input
                  type="range"
                  min={20000}
                  max={80000}
                  step={5000}
                  value={feePerCutKrw}
                  onChange={(e) => setFeePerCutKrw(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>Unicode Folded LET Keys: {sheet.foldedVariableKeys.join(", ")}</div>
                <div>Dynamic Array Spill: {sheet.spilledCutFeesKrw.map((v) => v.toLocaleString()).join(" / ")}</div>
                <div>Total Settlement: ₩{sheet.totalSettlementKrw.toLocaleString()}</div>
              </div>
            </div>
          );
        })()
      ) : null}

      {app.id === "anicraft" ? (
        (() => {
          const ani = simulateAniCraftCelScene({
            durationSeconds: 3,
            fps: 24,
            komaMode,
            prevOnionFrames: 2,
            nextOnionFrames: 2,
            dialogueLine: aniDialogue,
          });
          return (
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="space-y-2">
                <select
                  aria-label={bt("작화 코마 모드", "Animation Koma Hold Mode")}
                  value={komaMode}
                  onChange={(e) => setKomaMode(e.target.value as AniCraftKomaMode)}
                  className="w-full rounded border border-line bg-card px-2 py-1"
                >
                  <option value="1k-on-ones">1코마 (On Ones · 24 drawings/sec)</option>
                  <option value="2k-on-twos">2코마 (On Twos · 12 drawings/sec)</option>
                  <option value="3k-on-threes">3코마 (On Threes · 8 drawings/sec)</option>
                </select>
                <input
                  type="text"
                  aria-label={bt("립싱크 대사 입력", "Lip-Sync Dialogue Line")}
                  value={aniDialogue}
                  onChange={(e) => setAniDialogue(e.target.value)}
                  className="w-full rounded border border-line bg-card px-2 py-1"
                />
              </div>
              <div className="rounded bg-card p-2 font-mono space-y-1">
                <div>Unique Cels Needed (3s @ {ani.fps}fps): {ani.uniqueDrawingsRequired}매 (Closed Gaps: {ani.closedLineGapCount})</div>
                <div>
                  Onion Skin Opacity:{" "}
                  {ani.onionSkinWeights.map((w) => `${w.direction}(${w.frameOffset})=${w.opacity}`).join(", ")}
                </div>
                <div>
                  Lip-Sync Cues:{" "}
                  {ani.lipSyncCues.slice(0, 6).map((c) => `${c.syllable}[${c.mouthCode}@f${c.frame}]`).join(" ")}
                </div>
              </div>
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
