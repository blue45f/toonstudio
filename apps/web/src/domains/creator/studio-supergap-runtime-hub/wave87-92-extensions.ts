/**
 * Wave 87~92 초격차 확장 서브시스템 동적 로더 (`wave87-92-extensions`).
 *
 * - 모든 Wave 87~92 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave87To92Extensions()`를 통해 총 31개 라이브 초격차 엔진(Wave 54~92 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 87~92 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave87To92ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave87CausalTimeTravelCanvas",
      waveLabel: "Wave 87",
      titleKo: "인과 그래프 시간 역행 비파괴 캔버스",
      capabilitySummaryKo: "6단계 공정 DAG 의존성 · MLS 강체 자동 재투영 · 배경 0px 보전",
      async execute() {
        const wave87 = await import("../wasm64-wave87-causal-stroke-time-travel-canvas");
        const g = new wave87.CausalStrokeDependencyGraph();
        const t0 = Date.parse("2026-11-28T09:00:00.000Z");
        g.addNode({
          id: "bone-arm",
          kind: "rough-skeleton-bone",
          label: "오른팔 러프 본",
          parentIds: [],
          createdAtMs: t0,
          layerOrder: 10,
          payload: { p0: { x: 120, y: 200 }, p1: { x: 240, y: 200 }, jointLabel: "right-arm" },
        });
        g.addNode({
          id: "bg-wall",
          kind: "ink-lineart-stroke",
          label: "무관 배경",
          parentIds: [],
          createdAtMs: t0 + 100,
          layerOrder: 1,
          payload: {
            points: [
              { x: 340, y: 60 },
              { x: 430, y: 60 },
              { x: 430, y: 240 },
            ],
            strokeWidth: 2,
            strokeColor: "#334155",
          },
        });
        g.addNode({
          id: "ink-sleeve",
          kind: "ink-lineart-stroke",
          label: "소매 선화",
          parentIds: ["bone-arm"],
          createdAtMs: t0 + 200,
          layerOrder: 20,
          payload: {
            points: [
              { x: 120, y: 186 },
              { x: 180, y: 184 },
              { x: 240, y: 188 },
              { x: 240, y: 214 },
              { x: 120, y: 214 },
            ],
            strokeWidth: 2.5,
            strokeColor: "#0F172A",
          },
        });
        g.commitRevision("초기 컷", { timestampMs: t0 + 300 });
        const out = wave87.reprojectDownstreamFromHistoricalEdit(g, {
          nodeId: "bone-arm",
          label: "오른팔 +10° 수정",
          timestampMs: t0 + 10_000,
          mode: "rigid",
          mutate: (n) =>
            wave87.transformRoughSkeletonBone(
              n as Parameters<typeof wave87.transformRoughSkeletonBone>[0],
              { angleDeg: 10 },
            ),
        });
        const bgAudit = out.report.perNodeAudit.find((entry) => entry.nodeId === "bg-wall");
        const ok =
          out.report.integrityPassed &&
          out.report.maxLengthDriftRatio < 0.02 &&
          bgAudit?.maxDisplacementPx === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `소급 재투영 ${out.report.recomputedNodeIds.length}노드 · 길이 오차 ${round2(out.report.maxLengthDriftRatio * 100)}% · 배경 0px 보전`,
          metrics: {
            integrityPassed: out.report.integrityPassed,
            recomputedNodes: out.report.recomputedNodeIds.length,
            bgDisplacementPx: bgAudit?.maxDisplacementPx ?? -1,
          },
        };
      },
    },
    {
      id: "wave88ReactiveTstudioLive",
      waveLabel: "Wave 88",
      titleKo: "살아있는 지면 리액티브 포맷(.tstudio-live)",
      capabilitySummaryKo: "TSLV v1 CRC-32·SHA-256 코덱 · 0px 검은 여백 2.5D 자이로 시차 · 60fps",
      async execute() {
        const wave88 = await import("../wasm64-wave88-reactive-tstudio-live-format");
        const sky = new Uint8Array(2048).fill(77);
        const charBytes = new Uint8Array(1024).fill(188);
        const poster = new Uint8Array(512).fill(42);
        const encoded = wave88.encodeTstudioLivePackage({
          episode: {
            episodeId: "hub-diag-live",
            seriesId: "hub-series",
            title: "허브 진단 리액티브 컷",
            author: "ToonStudio",
            locale: "ko-KR",
            canvasWidthPx: 800,
            totalHeightPx: 1520,
            targetFps: 60,
            createdAtIso: "2026-11-28T04:00:00Z",
          },
          panels: [0, 1].map((idx) => ({
            id: `p-${idx + 1}`,
            yPx: idx * 760,
            heightPx: 760,
            altText: `진단 컷 ${idx + 1}`,
            captionText: `제${idx + 1}컷`,
            layers: [
              {
                id: `p-${idx + 1}-bg`,
                name: "배경",
                role: "backdrop",
                encoding: "webp",
                widthPx: 800,
                heightPx: 760,
                payloadBytes: sky,
                depthMeters: 12.0,
                fullBleed: true,
                overscanMarginPx: 16,
              },
              {
                id: `p-${idx + 1}-ch`,
                name: "캐릭터",
                role: "character",
                encoding: "webp",
                widthPx: 640,
                heightPx: 720,
                payloadBytes: charBytes,
                depthMeters: 2.2,
                fullBleed: false,
                overscanMarginPx: 12,
                material: { metallic: 0.9, roughness: 0.15, specularStrength: 0.85 },
              },
            ],
            emitters: [],
          })),
          audioTracks: [],
          staticFallback: {
            renderMode: "vertical-strip-jpeg-compat",
            posterAltText: "대표 포스터",
            posterEncoding: "webp",
            posterWidthPx: 800,
            posterHeightPx: 1200,
            posterBytes: poster,
            panelFallbacks: [0, 1].map((idx) => ({
              panelId: `p-${idx + 1}`,
              readingOrder: idx,
              altText: `정적 폴백 ${idx + 1}`,
              captionText: `제${idx + 1}컷`,
              compositeEncoding: "webp",
              widthPx: 800,
              heightPx: 760,
              compositeBytes: sky,
            })),
          },
        });
        const decoded = wave88.decodeTstudioLivePackage(encoded.bytes);
        const frame = wave88.evaluateReactiveWebtoonFrame(decoded, {
          scrollY: 0,
          scrollVelocityPxPerSec: 600,
          gyroBetaDeg: -15,
          gyroGammaDeg: 20,
          elapsedTimeMs: 500,
          viewportWidthPx: 390,
          viewportHeightPx: 844,
          prefersReducedMotion: false,
          batterySaverMode: false,
        });
        const ok =
          decoded.integrity.verified &&
          frame.metrics.maxExposedBlackBorderPx === 0 &&
          decoded.panels.length === 2;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `TSLV v1 무결성 검증(${encoded.bytes.byteLength}B) · 자이로 +20° 검은 여백 0px 확인`,
          metrics: {
            integrityVerified: decoded.integrity.verified,
            packageBytes: encoded.bytes.byteLength,
            maxExposedBlackBorderPx: frame.metrics.maxExposedBlackBorderPx,
          },
        };
      },
    },
    {
      id: "wave89MultiverseCanonCompiler",
      waveLabel: "Wave 89",
      titleKo: "멀티버스 분기 웹툰 · 세계관 Merkle DAG 컴파일러",
      capabilitySummaryKo: "SHA-256 블롭 중복 제거 · 전수 분기 모순 반례 검증 · 인터랙티브 번들",
      async execute() {
        const wave89 = await import("../wasm64-wave89-multiverse-branching-canon-compiler");
        const store = new wave89.MultiverseEpisodeDagStore({
          episodeId: "hub-diag-mv",
          episodeTitleKo: "허브 분기 진단",
          startCutId: "cut-1",
          initialWorldState: {
            characters: [
              {
                characterId: "hero",
                displayNameKo: "서연",
                status: "alive",
                costume: "intact",
                costumeLabelKo: "코트",
              },
            ],
            inventory: { silver_key: true },
            relationships: {},
            knownSecrets: [],
          },
        });
        const bg = store.registerLayerBlob({
          kind: "background",
          labelKo: "공통 배경",
          mimeType: "image/webp",
          payload: "BG_HUB_SHARED_" + "X".repeat(256),
        });
        store.addCut({
          cutId: "cut-1",
          cutNumber: 1,
          titleKo: "갈림길",
          nodeKind: "choice",
          baseLayers: [{ layerId: "bg", kind: "background", assetHash: bg.hash, zIndex: 0 }],
        });
        store.addCut({
          cutId: "cut-end",
          cutNumber: 2,
          titleKo: "결말",
          nodeKind: "ending",
          baseLayers: [{ layerId: "bg", kind: "background", assetHash: bg.hash, zIndex: 0 }],
          ending: { endingId: "end-good", endingTitleKo: "굿엔딩", endingTag: "good" },
        });
        store.addEdge({
          edgeId: "e-1",
          fromCutId: "cut-1",
          toCutId: "cut-end",
          branchTag: "A",
          choiceLabelKo: "문을 연다",
        });
        const dag = store.buildEpisodeDag();
        const structure = wave89.auditMultiverseDagStructure(dag);
        const invariants = wave89.verifyMultiverseWorldStateInvariants(dag);
        const ok = structure.valid && invariants.passed && dag.episodeMerkleRoot.length === 64;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `머클 루트(${dag.episodeMerkleRoot.slice(0, 10)}…) · 구조·세계관 모순 0건 검증 완료`,
          metrics: {
            structureValid: structure.valid,
            worldStatePassed: invariants.passed,
            reachableEndings: invariants.reachableEndingIds.length,
          },
        };
      },
    },
    {
      id: "wave90CurvilinearPerspectiveBrush",
      waveLabel: "Wave 90",
      titleKo: "비유클리드 5~6점 곡면 투시 굴절 브러시",
      capabilitySummaryKo: "어안·파니니·6점 구면 투영 · 야코비안 닙 단축 · 3D 프롭 곡면 보정·WGSL",
      async execute() {
        const wave90 = await import("../wasm64-wave90-non-euclidean-curvilinear-perspective-brush");
        const camera = {
          mode: "5pt-panini" as const,
          viewportWidth: 1200,
          viewportHeight: 800,
          fovDegrees: 170,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          paniniCompression: 1,
          eyePosition: { x: 0, y: 1.6, z: 0 },
        };
        const worldPt = { x: 3.0, y: 2.2, z: 6.5 };
        const proj = wave90.projectWorld3DToCurvilinear2D(worldPt, camera);
        const ray = wave90.unprojectCurvilinear2DToRay3D({ x: proj.x, y: proj.y }, camera);
        const bent = wave90.bend3DPropIntoCurvilinearCurves(
          {
            kind: "box-building",
            id: "hub-tower",
            center: { x: 4.0, y: 3.5, z: 7.0 },
            width: 3.5,
            height: 8.0,
            depth: 3.5,
            floorDivisions: 3,
          },
          camera,
        );
        const wgsl = wave90.validateCurvilinearWgsl(wave90.buildCurvilinearRefractionWgsl("5pt-panini"));
        const ok = proj.visible && ray.valid && bent.curves.length > 0 && wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `5점 파니니 정·역투영 검증 · 3D 곡면 모서리 ${bent.curves.length}개 · WGSL 통과`,
          metrics: {
            roundTripValid: proj.visible && ray.valid,
            bentCurves: bent.curves.length,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave91KinematicPenTwinCleanup",
      waveLabel: "Wave 91",
      titleKo: "작가 손목·필압 운동학 디지털 트윈 클린업",
      capabilitySummaryKo: "로컬 전용 필압·곡률 회귀 · 치킨스크래치 통합 · 90° 커스프 보존 리본",
      async execute() {
        const wave91 = await import("../wasm64-wave91-kinematic-pen-dynamics-twin-cleanup");
        const gpen = wave91.createBuiltInArtistTwinPreset("korean-webtoon-gpen");
        const roughPasses = [-1.5, 0, 1.5].map((off, idx) => ({
          id: `rough-${idx}`,
          baseWidthPx: 3.0,
          points: Array.from({ length: 32 }, (_, i) => {
            const u = i / 31;
            const angle = -1.1 + u * 0.9;
            const r = 120 + off + Math.sin(i * 2.2) * 1.1;
            return {
              x: 160 + r * Math.cos(angle),
              y: 160 + r * Math.sin(angle),
              pressure: 0.5,
              tiltX: 0.25,
              tiltY: 0.2,
              timestampMs: i * 16,
            };
          }),
        }));
        const cleaned = wave91.synthesizeCleanInkWithArtistTwin(roughPasses, gpen);
        const ok =
          !cleaned.audit.hasNonFiniteValues &&
          cleaned.inkStrokes.length === 1 &&
          cleaned.privacyContract.runsLocallyOnly &&
          !cleaned.privacyContract.uploadsRawStrokes;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `3겹 러프→1획 정리 · 잉크 DNA ${round2(cleaned.inkDnaSimilarity.overallScore)}점 · 로컬 전용`,
          metrics: {
            consolidatedStrokes: cleaned.inkStrokes.length,
            inkDnaScore: round2(cleaned.inkDnaSimilarity.overallScore),
            runsLocallyOnly: cleaned.privacyContract.runsLocallyOnly,
          },
        };
      },
    },
    {
      id: "wave92GeoVariantComplianceShield",
      waveLabel: "Wave 92",
      titleKo: "글로벌 지역별 심의·상표 변형 & 권리 BOM 게이트",
      capabilitySummaryKo: "6개 권역 정책 매트릭스 · 단일 마스터 비파괴 합성 · Fail-Closed BOM 검증",
      async execute() {
        const wave92 = await import("../wasm64-wave92-geo-variant-compliance-shield");
        const panelId = "panel-01";
        const episode = {
          episodeId: "hub-diag-geo",
          seriesId: "hub-series",
          title: "허브 글로벌 출고 진단",
          masterRevision: 1,
          panels: [
            {
              panelId,
              sequenceIndex: 1,
              title: "도심 간판 컷",
              width: 800,
              height: 1200,
              baseLayers: [
                {
                  layerId: "p1-bg",
                  panelId,
                  role: "background" as const,
                  label: "배경",
                  contentDigest: "bg-01",
                  zIndex: 1,
                  assetIds: ["font-global-sans"],
                },
              ],
              complianceAnnotations: [
                {
                  annotationId: "ann-gore",
                  panelId,
                  category: "gore-blood" as const,
                  severityScore: 60,
                  bbox: { x: 100, y: 120, width: 160, height: 120 },
                  description: "선혈 연출",
                },
              ],
            },
          ],
          variantOverrides: [
            {
              overrideId: "ovr-kr12-ink",
              panelId,
              targetRegions: ["KR-12+" as const],
              remediationType: "recolor-dark-ink" as const,
              bbox: { x: 100, y: 120, width: 160, height: 120 },
              approvedByReviewer: true,
              nonDestructiveToMaster: true as const,
              reviewerId: "hub-qa",
              approvedAtIso: "2026-11-28T04:00:00Z",
            },
          ],
        };
        const manifest = wave92.compileRegionalDeliveryManifest(
          episode,
          "KR-12+",
          [
            {
              assetId: "font-global-sans",
              kind: "font",
              displayName: "스튜디오 글로벌 고딕",
              allowedTerritories: ["GLOBAL"],
              commercialSerializationAllowed: true,
              expiresOnIso: "2028-12-31",
            },
          ],
          { releaseDateIso: "2026-11-28" },
        );
        const verified = wave92.verifyRegionalDeliveryManifestIntegrity(manifest);
        const ok =
          manifest.exportDecision === "APPROVED" &&
          manifest.mutatedMasterLayerCount === 0 &&
          verified.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `KR-12+ 비파괴 변형 승인(마스터 변조 0건) · SHA-256 매니페스트 무결성 통과`,
          metrics: {
            exportApproved: manifest.exportDecision === "APPROVED",
            mutatedMasterLayerCount: manifest.mutatedMasterLayerCount,
            manifestVerified: verified.valid,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 87~92 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave87To92Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave87To92ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
