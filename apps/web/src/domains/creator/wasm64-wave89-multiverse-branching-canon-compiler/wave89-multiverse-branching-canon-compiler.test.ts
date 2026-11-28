import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHOICE_HIT_TARGET_PX,
  INTERACTIVE_WEBTOON_BUNDLE_FORMAT_VERSION,
  MultiverseEpisodeDagStore,
  VISUAL_NOVEL_SCRIPT_FORMAT_VERSION,
  applyWorldStateEffects,
  auditMultiverseDagStructure,
  canonicalSerializeMultiverse,
  compileInteractiveWebtoonBundle,
  createInitialWorldStateSnapshot,
  evaluateWorldStateGuard,
  exportMultiverseMermaidAndVnScript,
  sha256MultiverseHex,
  verifyInteractiveWebtoonBundle,
  verifyMultiverseWorldStateInvariants,
  type InitialWorldStateConfig,
  type MultiverseEpisodeDag,
  type PanelLayerRef,
} from "./index";

function createBaseWorldState(): InitialWorldStateConfig {
  return {
    characters: [
      { characterId: "seoyeon", displayNameKo: "서연", status: "alive", costume: "intact", costumeLabelKo: "검은 트렌치코트" },
      { characterId: "minjae", displayNameKo: "민재", status: "alive", costume: "intact", costumeLabelKo: "회색 재킷" },
    ],
    inventory: { silver_key: true, intact_sword: true, sword_broken: false },
    relationships: { minjae: 20 },
    knownSecrets: [],
    itemLabelsKo: { silver_key: "은열쇠", intact_sword: "강철 검" },
    secretLabelsKo: { betrayer_identity: "배신자의 정체" },
  };
}

function bgLayer(assetHash: string): PanelLayerRef {
  return { layerId: "bg", kind: "background", assetHash, zIndex: 0 };
}

function createMiniStore(episodeId: string, startCutId = "cut-01"): { readonly store: MultiverseEpisodeDagStore; readonly bgHash: string } {
  const store = new MultiverseEpisodeDagStore({
    episodeId,
    episodeTitleKo: `테스트:${episodeId}`,
    startCutId,
    initialWorldState: createBaseWorldState(),
  });
  const bg = store.registerLayerBlob({ kind: "background", labelKo: "공통 배경", mimeType: "image/webp", payload: `BG::${episodeId}` });
  return { store, bgHash: bg.hash };
}

interface CleanFixture {
  readonly store: MultiverseEpisodeDagStore;
  readonly dag: MultiverseEpisodeDag;
  readonly bgStationHash: string;
}

/** 3분기(A/B/C) + 다이아몬드 재합류(찢어진 코트 조건부 변형) + 3엔딩 정상 에피소드 픽스처. */
function buildCleanDiamondEpisode(): CleanFixture {
  const store = new MultiverseEpisodeDagStore({
    episodeId: "ep-89-neon-crossroads",
    episodeTitleKo: "네온 교차로의 선택",
    startCutId: "cut-01-start",
    initialWorldState: createBaseWorldState(),
  });

  const bgStation = store.registerLayerBlob({
    kind: "background", labelKo: "비 오는 지하철역 배경", mimeType: "image/webp",
    payload: "BG_STATION::" + "A".repeat(4000), widthPx: 1600, heightPx: 2560,
  });
  const bgRooftop = store.registerLayerBlob({
    kind: "background", labelKo: "네온 옥상 배경", mimeType: "image/webp",
    payload: "BG_ROOFTOP::" + "B".repeat(4000), widthPx: 1600, heightPx: 2560,
  });
  const seoyeonIntact = store.registerLayerBlob({
    kind: "character", labelKo: "서연(멀쩡한 코트)", mimeType: "image/png",
    payload: "SEOYEON_INTACT::" + "C".repeat(2600), widthPx: 900, heightPx: 1800,
  });
  const seoyeonTorn = store.registerLayerBlob({
    kind: "character", labelKo: "서연(찢어진 코트)", mimeType: "image/png",
    payload: "SEOYEON_TORN::" + "D".repeat(2600), widthPx: 900, heightPx: 1800,
  });
  const minjae = store.registerLayerBlob({
    kind: "character", labelKo: "민재 스탠딩", mimeType: "image/png",
    payload: "MINJAE::" + "E".repeat(2400), widthPx: 900, heightPx: 1800,
  });
  const dlgA = store.registerLayerBlob({ kind: "dialogue", labelKo: "A 대사", mimeType: "application/json", payload: '{"b":"A"}' });
  const dlgB = store.registerLayerBlob({ kind: "dialogue", labelKo: "B 대사", mimeType: "application/json", payload: '{"b":"B"}' });
  const dlgC = store.registerLayerBlob({ kind: "dialogue", labelKo: "C 대사", mimeType: "application/json", payload: '{"b":"C"}' });

  // 동일 페이로드 재등록 시 동일 SHA-256 블롭 재사용 확인
  const dupBg = store.registerLayerBlob({
    kind: "background", labelKo: "복제 배경", mimeType: "image/webp",
    payload: "BG_STATION::" + "A".repeat(4000), widthPx: 1600, heightPx: 2560,
  });
  expect(dupBg.hash).toBe(bgStation.hash);

  const seoyeonIntactRef: PanelLayerRef = {
    layerId: "seoyeon", kind: "character", assetHash: seoyeonIntact.hash, zIndex: 10, characterId: "seoyeon", depictedCostume: "intact",
  };
  const seoyeonTornRef: PanelLayerRef = {
    layerId: "seoyeon", kind: "character", assetHash: seoyeonTorn.hash, zIndex: 10, characterId: "seoyeon", depictedCostume: "torn",
  };
  const minjaeRef: PanelLayerRef = { layerId: "minjae", kind: "character", assetHash: minjae.hash, zIndex: 11 };

  store.addCut({
    cutId: "cut-01-start", cutNumber: 1, titleKo: "갈림길에 선 서연", nodeKind: "choice",
    baseLayers: [bgLayer(bgStation.hash), seoyeonIntactRef, minjaeRef],
    dialogue: [{ lineId: "l-01", speakerCharacterId: "seoyeon", speakerNameKo: "서연", textKo: "어느 쪽으로 움직일지 결정해야 해." }],
  });
  store.addCut({
    cutId: "cut-02a-rooftop", cutNumber: 2, titleKo: "옥상 격투", nodeKind: "scene",
    baseLayers: [bgLayer(bgRooftop.hash), seoyeonTornRef, { layerId: "dlg", kind: "dialogue", assetHash: dlgA.hash, zIndex: 20 }],
    onEnterEffects: [
      { kind: "set-costume", characterId: "seoyeon", costume: "torn", reasonKo: "옥상 격투 중 코트 파손" },
      { kind: "reveal-secret", secretId: "betrayer_identity", labelKo: "배신자의 정체" },
      { kind: "adjust-relationship", targetId: "minjae", delta: 35 },
    ],
    requirements: { requiredItems: [{ itemId: "intact_sword", itemLabelKo: "강철 검", forbiddenBrokenFlagId: "sword_broken" }] },
  });
  store.addCut({
    cutId: "cut-02b-subway", cutNumber: 3, titleKo: "지하 통로 잠입", nodeKind: "scene",
    baseLayers: [bgLayer(bgStation.hash), seoyeonIntactRef, minjaeRef, { layerId: "dlg", kind: "dialogue", assetHash: dlgB.hash, zIndex: 20 }],
    requirements: { requiredItems: [{ itemId: "silver_key", itemLabelKo: "은열쇠" }] },
  });
  store.addCut({
    cutId: "cut-02c-deal", cutNumber: 4, titleKo: "역 앞 대치", nodeKind: "scene",
    baseLayers: [bgLayer(bgStation.hash), seoyeonIntactRef, minjaeRef, { layerId: "dlg", kind: "dialogue", assetHash: dlgC.hash, zIndex: 20 }],
    onEnterEffects: [{ kind: "adjust-relationship", targetId: "minjae", delta: -15 }],
  });
  store.addCut({
    cutId: "cut-05-merge", cutNumber: 5, titleKo: "중앙 광장 재합류", nodeKind: "merge",
    baseLayers: [bgLayer(bgStation.hash), seoyeonIntactRef, minjaeRef],
    dialogue: [{ lineId: "l-05-base", speakerCharacterId: "minjae", speakerNameKo: "민재", textKo: "무사히 합류했네." }],
    conditionalVariants: [
      {
        variantId: "var-torn-coat",
        labelKo: "옥상 격투 후 찢어진 코트 반영",
        priority: 10,
        when: { kind: "costume-is", characterId: "seoyeon", allowed: ["torn"] },
        overrideLayers: [seoyeonTornRef],
        overrideDialogueKo: [
          {
            lineId: "l-05-torn", speakerCharacterId: "seoyeon", speakerNameKo: "서연",
            textKo: "코트가 찢어졌지만 배신자의 정체는 알아냈어.", referencedSecretIds: ["betrayer_identity"],
          },
        ],
      },
    ],
  });
  store.addCut({
    cutId: "cut-06-end-true", cutNumber: 6, titleKo: "진실의 새벽", nodeKind: "ending",
    baseLayers: [bgLayer(bgRooftop.hash), seoyeonTornRef],
    ending: { endingId: "end-true", endingTitleKo: "진엔딩: 새벽의 폭로", endingTag: "true" },
  });
  store.addCut({
    cutId: "cut-07-end-good", cutNumber: 7, titleKo: "은밀한 탈출", nodeKind: "ending",
    baseLayers: [bgLayer(bgStation.hash), seoyeonIntactRef],
    ending: { endingId: "end-good", endingTitleKo: "굿엔딩: 조용한 귀환", endingTag: "good" },
  });
  store.addCut({
    cutId: "cut-08-end-neutral", cutNumber: 8, titleKo: "불안한 휴전", nodeKind: "ending",
    baseLayers: [bgLayer(bgStation.hash), minjaeRef],
    ending: { endingId: "end-neutral", endingTitleKo: "노말엔딩: 보류된 계약", endingTag: "neutral" },
  });

  store.addEdge({ edgeId: "e-1a", fromCutId: "cut-01-start", toCutId: "cut-02a-rooftop", branchTag: "A", choiceLabelKo: "옥상으로 추격한다" });
  store.addEdge({ edgeId: "e-1b", fromCutId: "cut-01-start", toCutId: "cut-02b-subway", branchTag: "B", choiceLabelKo: "지하 통로로 우회한다" });
  store.addEdge({ edgeId: "e-1c", fromCutId: "cut-01-start", toCutId: "cut-02c-deal", branchTag: "C", choiceLabelKo: "정면에서 협상한다" });
  store.addEdge({ edgeId: "e-2a-m", fromCutId: "cut-02a-rooftop", toCutId: "cut-05-merge", choiceLabelKo: "광장 합류", isAutoAdvance: true });
  store.addEdge({ edgeId: "e-2b-m", fromCutId: "cut-02b-subway", toCutId: "cut-05-merge", choiceLabelKo: "광장 합류", isAutoAdvance: true });
  store.addEdge({
    edgeId: "e-m-true", fromCutId: "cut-05-merge", toCutId: "cut-06-end-true", choiceLabelKo: "배신자를 고발한다",
    guard: { kind: "secret-known", secretId: "betrayer_identity", expected: true },
  });
  store.addEdge({
    edgeId: "e-m-good", fromCutId: "cut-05-merge", toCutId: "cut-07-end-good", choiceLabelKo: "은열쇠로 비상문을 연다",
    guard: {
      kind: "all",
      conditions: [
        { kind: "item-has", itemId: "silver_key", expected: true },
        { kind: "secret-known", secretId: "betrayer_identity", expected: false },
      ],
    },
  });
  store.addEdge({ edgeId: "e-2c-end", fromCutId: "cut-02c-deal", toCutId: "cut-08-end-neutral", choiceLabelKo: "휴전 수락", isAutoAdvance: true });

  return { store, dag: store.buildEpisodeDag(), bgStationHash: bgStation.hash };
}

describe("Wave 89: 순수 SHA-256 및 콘텐츠 주소 지정 레이어 중복 제거", () => {
  it("FIPS 180-4 SHA-256 표준 벡터와 한글 다중 블록 입력을 정확히 해싱한다", () => {
    expect(sha256MultiverseHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256MultiverseHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const longKo = "멀티버스 분기 웹툰 세계관 검증기 ".repeat(8);
    expect(sha256MultiverseHex(longKo)).toHaveLength(64);
    expect(sha256MultiverseHex(longKo)).toBe(sha256MultiverseHex(longKo));
  });

  it("정규 직렬화는 객체 키 순서가 달라도 동일한 문자열과 해시를 산출한다", () => {
    const a = canonicalSerializeMultiverse({ z: 1, a: { c: true, b: -0 } });
    const b = canonicalSerializeMultiverse({ a: { b: 0, c: true }, z: 1 });
    expect(a).toBe(b);
    expect(sha256MultiverseHex(a)).toBe(sha256MultiverseHex(b));
  });

  it("3개 분기가 배경·캐릭터 레이어를 공유하면 단일 SHA-256 블롭으로 중복 제거되어 절감률 40% 이상을 달성한다", () => {
    const { dag } = buildCleanDiamondEpisode();
    expect(dag.deduplicationMetrics.uniqueBlobCount).toBe(8);
    expect(dag.deduplicationMetrics.sharedBlobCount).toBeGreaterThanOrEqual(5);
    expect(dag.deduplicationMetrics.sharedAssetDeduplicationRatio).toBeGreaterThanOrEqual(0.4);
    expect(dag.deduplicationMetrics.deduplicationSavingsRatio).toBeGreaterThanOrEqual(0.4);
    expect(dag.deduplicationMetrics.savedBytes).toBeGreaterThan(0);
  });

  it("에피소드 Merkle 루트는 결정론적이며 컷 내용 변경 시 즉시 달라진다", () => {
    const f1 = buildCleanDiamondEpisode();
    const f2 = buildCleanDiamondEpisode();
    expect(f1.dag.episodeMerkleRoot).toBe(f2.dag.episodeMerkleRoot);
    const startCut = f2.dag.cuts["cut-01-start"];
    expect(startCut).toBeDefined();
    if (startCut) f2.store.addCut({ ...startCut, titleKo: "수정된 시작 컷" });
    expect(f2.store.buildEpisodeDag().episodeMerkleRoot).not.toBe(f1.dag.episodeMerkleRoot);
  });

  it("중복 분기 엣지 ID 등록을 차단한다", () => {
    const { store } = buildCleanDiamondEpisode();
    expect(() =>
      store.addEdge({ edgeId: "e-1a", fromCutId: "cut-01-start", toCutId: "cut-02b-subway", choiceLabelKo: "중복" }),
    ).toThrow(/이미 등록된 분기 엣지/);
  });
});

describe("Wave 89: 멀티버스 DAG 구조 결함 감사기", () => {
  it("정상 다이아몬드 재합류 및 멀티 엔딩 그래프는 구조 감사를 통과한다", () => {
    const report = auditMultiverseDagStructure(buildCleanDiamondEpisode().dag);
    expect(report.valid).toBe(true);
    expect(report.defects).toHaveLength(0);
    expect(report.reconvergenceCutIds).toContain("cut-05-merge");
    expect(report.declaredEndingCutIds).toEqual(["cut-06-end-true", "cut-07-end-good", "cut-08-end-neutral"]);
  });

  it("도달할 수 없는 고아 컷을 탐지한다", () => {
    const { store, bgStationHash } = buildCleanDiamondEpisode();
    store.addCut({ cutId: "cut-99-orphan", cutNumber: 99, titleKo: "버려진 회상 컷", nodeKind: "scene", baseLayers: [bgLayer(bgStationHash)] });
    const report = auditMultiverseDagStructure(store.buildEpisodeDag());
    expect(report.valid).toBe(false);
    expect(report.orphanCutIds).toContain("cut-99-orphan");
    expect(report.defectCountsByCode["unreachable-orphan-cut"]).toBe(1);
  });

  it("엔딩 태그가 없는 막다른 컷을 탐지한다", () => {
    const { store, bgStationHash } = buildCleanDiamondEpisode();
    store.addCut({ cutId: "cut-09-deadend", cutNumber: 9, titleKo: "미완성 골목", nodeKind: "scene", baseLayers: [bgLayer(bgStationHash)] });
    store.addEdge({ edgeId: "e-dead", fromCutId: "cut-02c-deal", toCutId: "cut-09-deadend", choiceLabelKo: "골목 도주" });
    const report = auditMultiverseDagStructure(store.buildEpisodeDag());
    expect(report.valid).toBe(false);
    expect(report.defectCountsByCode["dead-end-non-ending-cut"]).toBe(1);
  });

  it("종료 조건이 없는 무한 순환 루프를 탐지한다", () => {
    const { store } = buildCleanDiamondEpisode();
    store.addEdge({ edgeId: "e-loop-inf", fromCutId: "cut-05-merge", toCutId: "cut-01-start", choiceLabelKo: "무한 되감기" });
    const report = auditMultiverseDagStructure(store.buildEpisodeDag());
    expect(report.valid).toBe(false);
    expect(report.defectCountsByCode["unguarded-infinite-cycle"]).toBeGreaterThanOrEqual(1);
    expect(report.defects.find((d) => d.code === "unguarded-infinite-cycle")?.cycleNodeIds?.length).toBeGreaterThanOrEqual(3);
  });

  it("루프 내부 상태 변화로 종료되는 가드 순환은 무한 루프로 오탐하지 않는다", () => {
    const { store } = buildCleanDiamondEpisode();
    store.addEdge({
      edgeId: "e-guarded-loop", fromCutId: "cut-02b-subway", toCutId: "cut-01-start", choiceLabelKo: "1회 재탐색",
      guard: { kind: "item-has", itemId: "retry_used", expected: false },
      effects: [{ kind: "set-item", itemId: "retry_used", value: true }],
    });
    const report = auditMultiverseDagStructure(store.buildEpisodeDag());
    expect(report.defectCountsByCode["unguarded-infinite-cycle"]).toBe(0);
    expect(report.valid).toBe(true);
  });

  it("존재하지 않는 레이어 자산 해시 참조를 탐지한다", () => {
    const { store } = buildCleanDiamondEpisode();
    store.addCut({
      cutId: "cut-02c-deal", cutNumber: 4, titleKo: "해시 누락 컷", nodeKind: "scene",
      baseLayers: [{ layerId: "bg-broken", kind: "background", assetHash: "deadbeef".repeat(8), zIndex: 0 }],
    });
    const report = auditMultiverseDagStructure(store.buildEpisodeDag());
    expect(report.valid).toBe(false);
    expect(report.defectCountsByCode["missing-asset-hash"]).toBe(1);
  });

  it("존재하지 않는 컷을 가리키는 엣지와 누락 시작 컷을 탐지한다", () => {
    const { store } = createMiniStore("ep-broken-start", "cut-missing-start");
    store.addEdge({ edgeId: "e-dangling", fromCutId: "cut-missing-start", toCutId: "cut-ghost", choiceLabelKo: "유령 컷" });
    const report = auditMultiverseDagStructure(store.buildEpisodeDag());
    expect(report.valid).toBe(false);
    expect(report.defectCountsByCode["missing-start-cut"]).toBe(1);
    expect(report.defectCountsByCode["dangling-edge-target"]).toBe(1);
  });
});

describe("Wave 89: 세계관 상태 불변식 검증기 및 5대 서사 모순 반례 추적", () => {
  it("정상 다이아몬드 재합류(A 분기 찢어진 코트 조건부 오버라이드 vs B 분기 멀쩡한 코트)는 전수 검증을 통과한다", () => {
    const report = verifyMultiverseWorldStateInvariants(buildCleanDiamondEpisode().dag);
    expect(report.passed).toBe(true);
    expect(report.contradictions).toHaveLength(0);
    expect(report.reachableEndingIds).toEqual(["cut-06-end-true", "cut-07-end-good", "cut-08-end-neutral"]);
    expect(report.unreachableEndingIds).toHaveLength(0);
  });

  it("모순 1(impossible-item-usage): 열쇠를 버린 B 분기의 12컷에서 은열쇠 사용을 정확한 최소 반례로 잡는다", () => {
    const { store, bgHash } = createMiniStore("ep-item-bug");
    store.addCut({ cutId: "cut-01", cutNumber: 1, titleKo: "선택", nodeKind: "choice", baseLayers: [bgLayer(bgHash)] });
    store.addCut({
      cutId: "cut-12", cutNumber: 12, titleKo: "잠긴 금고 개봉", nodeKind: "ending", baseLayers: [bgLayer(bgHash)],
      requirements: { requiredItems: [{ itemId: "silver_key", itemLabelKo: "은열쇠" }] },
      ending: { endingId: "end-vault", endingTitleKo: "금고 엔딩", endingTag: "good" },
    });
    store.addEdge({ edgeId: "e-keep", fromCutId: "cut-01", toCutId: "cut-12", branchTag: "A", choiceLabelKo: "열쇠를 챙긴다" });
    store.addEdge({
      edgeId: "e-drop", fromCutId: "cut-01", toCutId: "cut-12", branchTag: "B", choiceLabelKo: "열쇠를 버린다",
      effects: [{ kind: "set-item", itemId: "silver_key", value: false }],
    });

    const report = verifyMultiverseWorldStateInvariants(store.buildEpisodeDag());
    expect(report.passed).toBe(false);
    expect(report.contradictionCountsByCode["impossible-item-usage"]).toBe(1);
    const c = report.contradictions[0];
    expect(c?.cutNumber).toBe(12);
    expect(c?.messageKo).toContain("B 분기('열쇠를 버린다')");
    expect(c?.messageKo).toContain("은열쇠");
    expect(c?.counterexample.pathNodeIds).toEqual(["cut-01", "cut-12"]);
    expect(c?.counterexample.choiceLabelsKo).toEqual(["열쇠를 버린다"]);
    expect(c?.counterexample.stateAtFailure.inventory.silver_key).toBe(false);
  });

  it("모순 1b(impossible-item-usage): 이미 부러진 강철 검을 사용하는 분기를 탐지한다", () => {
    const { store, bgHash } = createMiniStore("ep-broken-sword");
    store.addCut({ cutId: "cut-01", cutNumber: 1, titleKo: "돌파", nodeKind: "scene", baseLayers: [bgLayer(bgHash)] });
    store.addCut({
      cutId: "cut-15", cutNumber: 15, titleKo: "최종 결투", nodeKind: "ending", baseLayers: [bgLayer(bgHash)],
      requirements: { requiredItems: [{ itemId: "intact_sword", itemLabelKo: "강철 검", forbiddenBrokenFlagId: "sword_broken" }] },
      ending: { endingId: "end-duel", endingTitleKo: "결투 엔딩", endingTag: "true" },
    });
    store.addEdge({
      edgeId: "e-break", fromCutId: "cut-01", toCutId: "cut-15", branchTag: "A", choiceLabelKo: "방벽을 막아낸다",
      effects: [{ kind: "set-item", itemId: "sword_broken", value: true }],
    });
    const report = verifyMultiverseWorldStateInvariants(store.buildEpisodeDag());
    expect(report.passed).toBe(false);
    expect(report.contradictions[0]?.messageKo).toContain("파손된 '강철 검'");
  });

  it("모순 2(costume-state-contradiction): 옥상 격투로 코트가 찢어진 뒤 조건부 변형 없이 멀쩡한 코트로 그린 합류 컷을 탐지한다", () => {
    const { store, dag } = buildCleanDiamondEpisode();
    const mergeCut = dag.cuts["cut-05-merge"];
    expect(mergeCut).toBeDefined();
    if (mergeCut) store.addCut({ ...mergeCut, conditionalVariants: [] });

    const report = verifyMultiverseWorldStateInvariants(store.buildEpisodeDag());
    expect(report.passed).toBe(false);
    const bug = report.contradictions.find((c) => c.code === "costume-state-contradiction");
    expect(bug?.cutId).toBe("cut-05-merge");
    expect(bug?.counterexample.pathNodeIds).toEqual(["cut-01-start", "cut-02a-rooftop", "cut-05-merge"]);
    expect(bug?.counterexample.stateAtFailure.characters.seoyeon?.costume).toBe("torn");
  });

  it("의상 훼손 후 명시적 갈아입기(explicitChange: true)가 있으면 통과하고, 무근거 원복은 모순으로 탐지한다", () => {
    const init = createInitialWorldStateSnapshot(createBaseWorldState());
    const torn = applyWorldStateEffects(init, [{ kind: "set-costume", characterId: "seoyeon", costume: "torn" }]).nextState;
    const silent = applyWorldStateEffects(torn, [{ kind: "set-costume", characterId: "seoyeon", costume: "intact" }]);
    expect(silent.silentCostumeRegressions).toHaveLength(1);
    expect(silent.nextState.characters.seoyeon?.costume).toBe("torn");

    const explicit = applyWorldStateEffects(torn, [{ kind: "set-costume", characterId: "seoyeon", costume: "changed", explicitChange: true }]);
    expect(explicit.silentCostumeRegressions).toHaveLength(0);
    expect(explicit.nextState.characters.seoyeon?.costume).toBe("changed");
  });

  it("모순 3(character-availability-violation): B 분기에서 부재중이 된 캐릭터가 14컷에서 복귀 없이 대사를 말하는 모순을 탐지한다", () => {
    const { store, bgHash } = createMiniStore("ep-absent-speaker");
    store.addCut({ cutId: "cut-01", cutNumber: 1, titleKo: "대피", nodeKind: "choice", baseLayers: [bgLayer(bgHash)] });
    store.addCut({
      cutId: "cut-14", cutNumber: 14, titleKo: "작전 회의", nodeKind: "ending", baseLayers: [bgLayer(bgHash)],
      dialogue: [{ lineId: "l-14", speakerCharacterId: "minjae", speakerNameKo: "민재", textKo: "지금 바로 진입하자!" }],
      ending: { endingId: "end-op", endingTitleKo: "작전 엔딩", endingTag: "good" },
    });
    store.addEdge({
      edgeId: "e-evac", fromCutId: "cut-01", toCutId: "cut-14", branchTag: "B", choiceLabelKo: "민재를 대피시킨다",
      effects: [{ kind: "set-character-status", characterId: "minjae", status: "absent" }],
    });

    const report = verifyMultiverseWorldStateInvariants(store.buildEpisodeDag());
    expect(report.passed).toBe(false);
    expect(report.contradictionCountsByCode["character-availability-violation"]).toBe(1);
    expect(report.contradictions[0]?.cutNumber).toBe(14);
    expect(report.contradictions[0]?.messageKo).toContain("부재중");
  });

  it("모순 3b: 의식 불명(unconscious) 캐릭터 발화를 탐지하고 회복 효과 추가 시 통과한다", () => {
    const { store, bgHash } = createMiniStore("ep-unconscious");
    store.addCut({
      cutId: "cut-01", cutNumber: 1, titleKo: "기절", nodeKind: "scene", baseLayers: [bgLayer(bgHash)],
      onEnterEffects: [{ kind: "set-character-status", characterId: "minjae", status: "unconscious" }],
    });
    store.addCut({
      cutId: "cut-02", cutNumber: 2, titleKo: "대화", nodeKind: "ending", baseLayers: [bgLayer(bgHash)],
      requirements: { speakingCharacters: [{ characterId: "minjae", dialogueExcerptKo: "괜찮아..." }] },
      ending: { endingId: "end-wake", endingTitleKo: "엔딩", endingTag: "neutral" },
    });
    store.addEdge({ edgeId: "e-12", fromCutId: "cut-01", toCutId: "cut-02", choiceLabelKo: "다음", isAutoAdvance: true });
    expect(verifyMultiverseWorldStateInvariants(store.buildEpisodeDag()).contradictionCountsByCode["character-availability-violation"]).toBe(1);

    const cut02 = store.buildEpisodeDag().cuts["cut-02"];
    if (cut02) store.addCut({ ...cut02, onEnterEffects: [{ kind: "set-character-status", characterId: "minjae", status: "injured" }] });
    expect(verifyMultiverseWorldStateInvariants(store.buildEpisodeDag()).passed).toBe(true);
  });

  it("모순 4(unreachable-ending): 상호 모순되는 조건식으로 도달 불가능한 엔딩을 탐지한다", () => {
    const { store, bgHash } = createMiniStore("ep-unreachable-end");
    store.addCut({ cutId: "cut-01", cutNumber: 1, titleKo: "분기", nodeKind: "choice", baseLayers: [bgLayer(bgHash)] });
    store.addCut({ cutId: "cut-02", cutNumber: 2, titleKo: "일반", nodeKind: "ending", baseLayers: [bgLayer(bgHash)], ending: { endingId: "end-n", endingTitleKo: "일반 엔딩", endingTag: "neutral" } });
    store.addCut({ cutId: "cut-20", cutNumber: 20, titleKo: "히든", nodeKind: "ending", baseLayers: [bgLayer(bgHash)], ending: { endingId: "end-h", endingTitleKo: "히든 엔딩: 완벽한 화해", endingTag: "secret" } });
    store.addEdge({ edgeId: "e-ok", fromCutId: "cut-01", toCutId: "cut-02", choiceLabelKo: "현실적 선택" });
    store.addEdge({
      edgeId: "e-bad", fromCutId: "cut-01", toCutId: "cut-20", choiceLabelKo: "히든 진입",
      guard: {
        kind: "all",
        conditions: [
          { kind: "item-has", itemId: "silver_key", expected: true },
          { kind: "item-has", itemId: "silver_key", expected: false },
        ],
      },
    });
    const report = verifyMultiverseWorldStateInvariants(store.buildEpisodeDag());
    expect(report.passed).toBe(false);
    expect(report.unreachableEndingIds).toEqual(["cut-20"]);
    expect(report.contradictionCountsByCode["unreachable-ending"]).toBe(1);
    expect(report.contradictions[0]?.messageKo).toContain("히든 엔딩: 완벽한 화해");
  });

  it("모순 5(dialogue-spoiler-leak): A 분기에서만 공개되는 비밀을 B 분기 16컷 대사에서 언급하는 스포일러 유출을 탐지한다", () => {
    const { store, bgHash } = createMiniStore("ep-spoiler");
    store.addCut({ cutId: "cut-01", cutNumber: 1, titleKo: "조사", nodeKind: "choice", baseLayers: [bgLayer(bgHash)] });
    store.addCut({
      cutId: "cut-16", cutNumber: 16, titleKo: "진실 대면", nodeKind: "ending", baseLayers: [bgLayer(bgHash)],
      dialogue: [{ lineId: "l-16", speakerCharacterId: "seoyeon", speakerNameKo: "서연", textKo: "네가 배신자였군!", referencedSecretIds: ["betrayer_identity"] }],
      ending: { endingId: "end-c", endingTitleKo: "대면 엔딩", endingTag: "true" },
    });
    store.addEdge({
      edgeId: "e-read", fromCutId: "cut-01", toCutId: "cut-16", branchTag: "A", choiceLabelKo: "비밀 문서를 읽는다",
      effects: [{ kind: "reveal-secret", secretId: "betrayer_identity", labelKo: "배신자의 정체" }],
    });
    store.addEdge({ edgeId: "e-skip", fromCutId: "cut-01", toCutId: "cut-16", branchTag: "B", choiceLabelKo: "문서를 무시한다" });

    const report = verifyMultiverseWorldStateInvariants(store.buildEpisodeDag());
    expect(report.passed).toBe(false);
    expect(report.contradictionCountsByCode["dialogue-spoiler-leak"]).toBe(1);
    const leak = report.contradictions[0];
    expect(leak?.messageKo).toContain("다른 분기에서만 공개되는 비밀");
    expect(leak?.messageKo).toContain("배신자의 정체");
    expect(leak?.counterexample.choiceLabelsKo).toEqual(["문서를 무시한다"]);
  });

  it("관계도 점수 유계 클램핑과 복합 가드(all / any / not)를 정확히 평가한다", () => {
    const init = createInitialWorldStateSnapshot(createBaseWorldState());
    const hi = applyWorldStateEffects(init, [{ kind: "adjust-relationship", targetId: "minjae", delta: 500 }]).nextState;
    const lo = applyWorldStateEffects(init, [{ kind: "adjust-relationship", targetId: "minjae", delta: -500 }]).nextState;
    expect(hi.relationships.minjae).toBe(100);
    expect(lo.relationships.minjae).toBe(-100);
    expect(
      evaluateWorldStateGuard(
        {
          kind: "all",
          conditions: [
            { kind: "relationship-range", targetId: "minjae", min: 80, max: 100 },
            { kind: "any", conditions: [{ kind: "secret-known", secretId: "none", expected: true }, { kind: "not", condition: { kind: "item-has", itemId: "sword_broken", expected: true } }] },
          ],
        },
        hi,
      ),
    ).toBe(true);
  });

  it("상태 메모이제이션과 BFS 순서로 가드 순환을 안전하게 종료하고 최단 반례를 반환한다", () => {
    const { store, bgHash } = createMiniStore("ep-bfs-shortest");
    store.addCut({ cutId: "cut-01", cutNumber: 1, titleKo: "시작", nodeKind: "choice", baseLayers: [bgLayer(bgHash)] });
    store.addCut({ cutId: "cut-02", cutNumber: 2, titleKo: "우회", nodeKind: "scene", baseLayers: [bgLayer(bgHash)] });
    store.addCut({
      cutId: "cut-03", cutNumber: 3, titleKo: "오류 엔딩", nodeKind: "ending", baseLayers: [bgLayer(bgHash)],
      requirements: { requiredItems: [{ itemId: "silver_key", itemLabelKo: "은열쇠" }] },
      ending: { endingId: "end-err", endingTitleKo: "엔딩", endingTag: "bad" },
    });
    store.addEdge({ edgeId: "e-short", fromCutId: "cut-01", toCutId: "cut-03", choiceLabelKo: "즉시 버림", effects: [{ kind: "set-item", itemId: "silver_key", value: false }] });
    store.addEdge({ edgeId: "e-long1", fromCutId: "cut-01", toCutId: "cut-02", choiceLabelKo: "우회" });
    store.addEdge({ edgeId: "e-long2", fromCutId: "cut-02", toCutId: "cut-03", choiceLabelKo: "우회 버림", effects: [{ kind: "set-item", itemId: "silver_key", value: false }] });
    store.addEdge({ edgeId: "e-loop", fromCutId: "cut-02", toCutId: "cut-01", choiceLabelKo: "1회 복귀", guard: { kind: "item-has", itemId: "loop_done", expected: false }, effects: [{ kind: "set-item", itemId: "loop_done", value: true }] });

    const report = verifyMultiverseWorldStateInvariants(store.buildEpisodeDag());
    expect(report.explorationTruncated).toBe(false);
    expect(report.contradictions[0]?.counterexample.pathNodeIds).toEqual(["cut-01", "cut-03"]);
  });
});

describe("Wave 89: 인터랙티브 웹툰 패키지 및 비주얼 노벨·Mermaid 내보내기", () => {
  it("인터랙티브 웹툰 패키지는 중복 제거 자산 테이블·44px 터치 영역·Merkle 서명을 포함하고 변조를 감지한다", () => {
    const { dag } = buildCleanDiamondEpisode();
    const bundle = compileInteractiveWebtoonBundle(dag, verifyMultiverseWorldStateInvariants(dag));
    expect(bundle.formatVersion).toBe(INTERACTIVE_WEBTOON_BUNDLE_FORMAT_VERSION);
    expect(bundle.verificationStatus).toBe("verified");
    expect(bundle.assetTable).toHaveLength(Object.keys(dag.blobs).length);
    const startCut = bundle.cuts.find((c) => c.cutId === "cut-01-start");
    expect(startCut?.choiceOverlays).toHaveLength(3);
    expect(startCut?.choiceOverlays[0]?.minHitTargetPx).toBeGreaterThanOrEqual(DEFAULT_CHOICE_HIT_TARGET_PX);
    expect(verifyInteractiveWebtoonBundle(bundle).valid).toBe(true);
    expect(verifyInteractiveWebtoonBundle({ ...bundle, episodeTitleKo: "변조" }).signatureMatches).toBe(false);
  });

  it("비주얼 노벨 스크립트와 Mermaid 플로차트는 안전한 따옴표 라벨(id[\"Label\"])을 사용하고 NaN을 포함하지 않는다", () => {
    const { store, dag: initialDag } = buildCleanDiamondEpisode();
    const startCut = initialDag.cuts["cut-01-start"];
    if (startCut) store.addCut({ ...startCut, titleKo: '갈림길("비 오는 밤" / A-B)' });
    const dag = store.buildEpisodeDag();
    const exported = exportMultiverseMermaidAndVnScript(dag, verifyMultiverseWorldStateInvariants(dag));

    expect(exported.vnScript.formatVersion).toBe(VISUAL_NOVEL_SCRIPT_FORMAT_VERSION);
    expect(exported.vnScript.scenes).toHaveLength(8);
    expect(exported.vnScript.scriptTextKo).toContain("[엔딩:true]");
    expect(exported.mermaidFlowchart.startsWith("flowchart TD")).toBe(true);
    expect(exported.mermaidFlowchart).toMatch(/cut_01_start\["[^"]+"\]/);
    expect(exported.mermaidFlowchart).toMatch(/cut_05_merge\["\[재합류\][^"]+"\]/);
    expect(exported.mermaidFlowchart).toMatch(/-->\|"[^"]+"\|/);
    expect(JSON.stringify(exported)).not.toContain("NaN");
    expect(exported.metricsSummary.endingCount).toBe(3);
    expect(exported.metricsSummary.reconvergenceCount).toBe(1);
  });

  it("전체 컴파일 파이프라인에서 모순이 존재하면 웹툰 패키지에 failed-invariants 상태를 정확히 전파한다", () => {
    const { store, dag } = buildCleanDiamondEpisode();
    const mergeCut = dag.cuts["cut-05-merge"];
    if (mergeCut) store.addCut({ ...mergeCut, conditionalVariants: [] });
    const brokenDag = store.buildEpisodeDag();
    const worldAudit = verifyMultiverseWorldStateInvariants(brokenDag);
    const bundle = compileInteractiveWebtoonBundle(brokenDag, worldAudit);
    const exported = exportMultiverseMermaidAndVnScript(brokenDag, worldAudit);

    expect(auditMultiverseDagStructure(brokenDag).valid).toBe(true);
    expect(worldAudit.passed).toBe(false);
    expect(bundle.verificationStatus).toBe("failed-invariants");
    expect(verifyInteractiveWebtoonBundle(bundle).valid).toBe(true);
    expect(exported.episodeMerkleRoot).toBe(brokenDag.episodeMerkleRoot);
  });
});
