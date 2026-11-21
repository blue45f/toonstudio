// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  METALLIC_PIGMENT_PRESETS,
  REBELLE_PAPER_PRESETS,
  compositeWatercolorAndMetallicRgba,
  createFluidWatercolorSimulationState,
  depositWatercolorWash,
  generateProceduralPaperHeightmap,
  runRebelleWatercolorMetallicPreview,
  stepFluidWatercolorOnHeightmap,
  type MetallicPigmentId,
  type RebellePaperPresetId,
} from "../../brush/wet-paper/studio-rebelle-heightmap-metallic";
import {
  INITIAL_LEFT_HAND_HID_PARSER_STATE,
  LEFT_HAND_HID_DEVICE_PROFILES,
  buildWebHidDeviceFilters,
  createLeftHandKeymap,
  createWebHidLeftHandController,
  detectWebHidSupport,
  matchLeftHandHidProfile,
  parseLeftHandHidReport,
  rebindLeftHandControl,
  type WebHidDeviceLike,
  type WebHidInputReportEventLike,
  type WebHidNavigatorLike,
} from "../../drawing/studio-webhid-left-hand-device";
import {
  computeCmykSoftProofGamutOverlay,
  createDisplayP3TestChartBuffer,
  detectFileSystemAccessSupport,
  openLocalArtworkFile,
  saveLocalArtworkFile,
  type FileSystemAccessEnv,
  type FileSystemFileHandleLike,
} from "../../export/studio-fs-access-native-save";
import { ChromeWasm64PerformancePanel } from "../ChromeWasm64PerformancePanel";

afterEach(cleanup);

function makeDomError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe("T-019: Rebelle 7 물리 종이 높이맵 · 유체 수채화 · 메탈릭 피그먼트", () => {
  it("3종 종이 높이맵(황목·중목·캔버스 직물)의 0..1 높이와 단위 법선맵을 결정적으로 생성한다", () => {
    const presets: readonly RebellePaperPresetId[] = ["cold-press", "hot-press", "linen-canvas"];
    const maps = presets.map((presetId) =>
      generateProceduralPaperHeightmap({ presetId, width: 32, height: 32, seed: 42 }),
    );

    for (const map of maps) {
      expect(map.heights).toBeInstanceOf(Float32Array);
      expect(map.normals).toBeInstanceOf(Float32Array);
      expect(map.heights.length).toBe(32 * 32);
      expect(map.normals.length).toBe(32 * 32 * 3);
      expect(map.stats.minHeight).toBeGreaterThanOrEqual(0);
      expect(map.stats.maxHeight).toBeLessThanOrEqual(1);

      for (let i = 0; i < map.heights.length; i += 1) {
        const h = map.heights[i] ?? -1;
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
        const nx = map.normals[i * 3] ?? 0;
        const ny = map.normals[i * 3 + 1] ?? 0;
        const nz = map.normals[i * 3 + 2] ?? 0;
        expect(nz).toBeGreaterThan(0);
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        expect(len).toBeCloseTo(1, 4);
      }
    }

    const coldPress = maps[0]!;
    const hotPress = maps[1]!;
    const linenCanvas = maps[2]!;
    // 황목 수채화지는 중목보다 요철 표준편차가 뚜렷하게 크다.
    expect(coldPress.stats.roughnessStdDev).toBeGreaterThan(hotPress.stats.roughnessStdDev * 1.6);
    // 동일 시드 재생성 시 바이트 단위 결정성 보장
    const coldPressAgain = generateProceduralPaperHeightmap({
      presetId: "cold-press",
      width: 32,
      height: 32,
      seed: 42,
    });
    expect(Array.from(coldPressAgain.heights)).toEqual(Array.from(coldPress.heights));
    expect(REBELLE_PAPER_PRESETS[linenCanvas.presetId].label).toContain("캔버스 직물");
  });

  it("유체 수채화 스텝이 높이맵 계곡(valley) 침강과 경계 물감 띠(cauliflower)를 형성한다", () => {
    const heightmap = generateProceduralPaperHeightmap({
      presetId: "cold-press",
      width: 48,
      height: 48,
      seed: 1001,
    });
    const state = createFluidWatercolorSimulationState(heightmap, { r: 0.12, g: 0.34, b: 0.72 });
    depositWatercolorWash(state, heightmap, {
      centerX: 24,
      centerY: 24,
      radius: 16,
      waterAmount: 0.95,
      pigmentAmount: 0.8,
      metallicAmount: 0,
    });

    for (let s = 0; s < 12; s += 1) {
      stepFluidWatercolorOnHeightmap(state, heightmap, {
        edgeBackrunStrength: 0.42,
      });
    }

    const rendered = compositeWatercolorAndMetallicRgba(state, heightmap, {
      metallicPigment: "none",
    });

    expect(rendered.stepCount).toBe(12);
    expect(rendered.wetPixelCount).toBeGreaterThan(400);
    // 계곡(valley)의 안료 밀도가 봉우리(peak)보다 뚜렷하게 높다.
    expect(rendered.valleyPigmentMean).toBeGreaterThan(rendered.peakPigmentMean);
    expect(rendered.valleyToPeakGranulationRatio).toBeGreaterThan(1.15);
    // 젖음 경계(edge band)의 물감 띠 피크 밀도가 내부 평균보다 높다.
    expect(rendered.edgeBandPeakDensity).toBeGreaterThan(rendered.interiorMeanDensity);
    expect(rendered.edgeRingContrastRatio).toBeGreaterThan(1.08);
    expect(rendered.metallicSpecularHighlightMean).toBe(0);
  });

  it("4종 메탈릭 피그먼트(금·은·에메랄드·로즈골드)가 각각 고유한 스펙큘러 셰이딩을 합성한다", () => {
    const nonMetallic = runRebelleWatercolorMetallicPreview({
      presetId: "linen-canvas",
      metallicPigment: "none",
      width: 32,
      height: 32,
      steps: 8,
    });
    const metals: readonly MetallicPigmentId[] = ["gold", "silver", "emerald", "rose-gold"];
    const checksums = new Set<number>([nonMetallic.checksum32]);

    for (const metalId of metals) {
      expect(METALLIC_PIGMENT_PRESETS[metalId].label.length).toBeGreaterThan(0);
      const res = runRebelleWatercolorMetallicPreview({
        presetId: "linen-canvas",
        metallicPigment: metalId,
        width: 32,
        height: 32,
        steps: 8,
      });
      expect(res.metallicSpecularHighlightMean).toBeGreaterThan(0.02);
      expect(res.checksum32).not.toBe(nonMetallic.checksum32);
      checksums.add(res.checksum32);
    }

    // 비메탈릭 + 4종 메탈릭 모두 서로 다른 RGBA 출력
    expect(checksums.size).toBe(5);
  });
});

describe("T-020: Chrome WebHID 왼손 리모컨 바인딩 & 바이너리 리포트 파서", () => {
  it("3종 VID/PID 프로파일 매칭과 안전한 navigator.hid 피처 디텍션을 수행한다", () => {
    const filters = buildWebHidDeviceFilters();
    expect(filters.length).toBe(7);

    expect(matchLeftHandHidProfile(0x0483, 0x5740)?.id).toBe("tourbox");
    expect(matchLeftHandHidProfile(0x056a, 0x0331)?.id).toBe("wacom-ekr");
    expect(matchLeftHandHidProfile(0x28bd, 0x5202)?.id).toBe("xencelabs-quick-keys");
    expect(matchLeftHandHidProfile(0xffff, 0x0001)).toBeNull();

    expect(detectWebHidSupport({ hid: null, isSecureContext: true }).supported).toBe(false);
    const mockHid: WebHidNavigatorLike = {
      requestDevice: vi.fn(async () => []),
      getDevices: vi.fn(async () => []),
    };
    expect(detectWebHidSupport({ hid: mockHid, isSecureContext: false }).supported).toBe(false);
    expect(detectWebHidSupport({ hid: mockHid, isSecureContext: true }).supported).toBe(true);
    expect(Object.keys(LEFT_HAND_HID_DEVICE_PROFILES)).toHaveLength(3);
  });

  it("TourBox · Wacom EKR · Xencelabs Quick Keys 바이너리 리포트를 스튜디오 액션으로 파싱한다", () => {
    const inkingKeymap = createLeftHandKeymap("inking");

    // 1) TourBox: 다이얼 시계/반시계, 휠 회전, 버튼 눌림/중복 억제/릴리즈
    const tbKnobCw = parseLeftHandHidReport({
      profileId: "tourbox",
      reportId: 0x01,
      data: new Uint8Array([0x04, 0x02]),
      keymap: inkingKeymap,
    });
    expect(tbKnobCw.events).toHaveLength(1);
    expect(tbKnobCw.events[0]?.action).toBe("brush.size+");
    expect(tbKnobCw.events[0]?.delta).toBe(2);

    const tbWheelCcw = parseLeftHandHidReport({
      profileId: "tourbox",
      reportId: 0x01,
      data: new Uint8Array([0x49, 0x01]),
      keymap: inkingKeymap,
    });
    expect(tbWheelCcw.events[0]?.action).toBe("canvas.rotate");
    expect(tbWheelCcw.events[0]?.delta).toBe(-15);

    const tbPress1 = parseLeftHandHidReport({
      profileId: "tourbox",
      reportId: 0x01,
      data: new Uint8Array([0x00]),
      previousState: INITIAL_LEFT_HAND_HID_PARSER_STATE,
      keymap: inkingKeymap,
    });
    expect(tbPress1.events[0]?.action).toBe("history.undo");
    // 같은 버튼이 계속 눌려 있는 중복 프레임은 재트리거하지 않는다.
    const tbHold1 = parseLeftHandHidReport({
      profileId: "tourbox",
      reportId: 0x01,
      data: new Uint8Array([0x00]),
      previousState: tbPress1.nextState,
      keymap: inkingKeymap,
    });
    expect(tbHold1.events).toHaveLength(0);

    // 2) Wacom ExpressKey Remote: 72스텝 터치링 wrap-around (71 -> 1 = +2 CW) + 버튼 비트마스크
    const ekrTouchStart = parseLeftHandHidReport({
      profileId: "wacom-ekr",
      reportId: 0x11,
      data: new Uint8Array([0x80 | 71, 0x00, 0x00, 0x00]),
      keymap: inkingKeymap,
    });
    expect(ekrTouchStart.events).toHaveLength(0);

    const ekrWrapCwAndBtn3 = parseLeftHandHidReport({
      profileId: "wacom-ekr",
      reportId: 0x11,
      data: new Uint8Array([0x80 | 1, 0x04, 0x00, 0x00]),
      previousState: ekrTouchStart.nextState,
      keymap: inkingKeymap,
    });
    expect(ekrWrapCwAndBtn3.events.map((e) => e.action)).toEqual(["eyedropper", "brush.size+"]);
    expect(ekrWrapCwAndBtn3.events[1]?.delta).toBe(2);

    // 3) Xencelabs Quick Keys + 커스텀 키 리바인딩
    const customKeymap = rebindLeftHandControl(inkingKeymap, "button.2", "eyedropper");
    const xencePacket = parseLeftHandHidReport({
      profileId: "xencelabs-quick-keys",
      reportId: 0x02,
      data: new Uint8Array([0xf0, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x02]),
      keymap: customKeymap,
    });
    expect(xencePacket.events.map((e) => e.action)).toEqual(["eyedropper", "canvas.rotate"]);
    expect(xencePacket.events[1]?.delta).toBe(-15);
  });

  it("WebHID 컨트롤러가 장치 연결·리포트 수신·취소·권한 거부를 안전하게 처리한다", async () => {
    const listenerRef: { current: ((event: WebHidInputReportEventLike) => void) | null } = {
      current: null,
    };
    let isOpened = false;
    const fakeDevice: WebHidDeviceLike = {
      vendorId: 0x0483,
      productId: 0x5740,
      productName: "TourBox Neo",
      get opened() {
        return isOpened;
      },
      async open() {
        isOpened = true;
      },
      async close() {
        isOpened = false;
      },
      addEventListener(_type, listener) {
        listenerRef.current = listener;
      },
      removeEventListener() {
        listenerRef.current = null;
      },
    };

    const received: string[] = [];
    const controller = createWebHidLeftHandController({
      env: {
        isSecureContext: true,
        hid: {
          async requestDevice() {
            return [fakeDevice];
          },
          async getDevices() {
            return [fakeDevice];
          },
        },
      },
      onAction(evt) {
        received.push(evt.action);
      },
    });

    const connected = await controller.connect("tourbox");
    expect(connected.status).toBe("connected");
    expect(connected.profileId).toBe("tourbox");
    expect(isOpened).toBe(true);

    const payload = new Uint8Array([0x01]);
    listenerRef.current?.({
      reportId: 0x01,
      data: new DataView(payload.buffer),
      device: fakeDevice,
    });
    expect(received).toEqual(["history.redo"]);
    expect(controller.getSnapshot().processedReports).toBe(1);

    await controller.disconnect();
    expect(isOpened).toBe(false);

    // AbortError 취소 처리
    const cancelController = createWebHidLeftHandController({
      env: {
        isSecureContext: true,
        hid: {
          async requestDevice() {
            throw makeDomError("AbortError", "User cancelled");
          },
          async getDevices() {
            return [];
          },
        },
      },
    });
    const cancelled = await cancelController.connect();
    expect(cancelled.status).toBe("cancelled");
  });
});

describe("T-021 & T-022: File System Access 로컬 디스크 저장 & Display-P3 CMYK 소프트 프루프", () => {
  it("showSaveFilePicker 직결 저장, 기존 핸들 권한 검증, 취소(AbortError), 미지원 다운로드 폴백을 완비한다", async () => {
    const writtenChunks: Uint8Array[] = [];
    let closed = false;
    const mockHandle: FileSystemFileHandleLike = {
      name: "ep01.toonstudio",
      async getFile() {
        return new File([new Uint8Array([1, 2, 3, 4])], "ep01.toonstudio", {
          type: "application/x-toonstudio-project",
        });
      },
      async queryPermission() {
        return "granted";
      },
      async createWritable() {
        return {
          async write(data) {
            if (data instanceof Uint8Array) writtenChunks.push(data);
          },
          async close() {
            closed = true;
          },
        };
      },
    };

    const nativeEnv: FileSystemAccessEnv = {
      isSecureContext: true,
      showOpenFilePicker: async () => [mockHandle],
      showSaveFilePicker: async () => mockHandle,
    };

    expect(detectFileSystemAccessSupport(nativeEnv).mode).toBe("native-fs-access");

    const saved = await saveLocalArtworkFile({
      suggestedName: "ep01.toonstudio",
      data: new Uint8Array([10, 20, 30, 40, 50]),
      env: nativeEnv,
    });
    expect(saved.status).toBe("saved-direct");
    expect(saved.method).toBe("fs-access");
    expect(saved.bytesWritten).toBe(5);
    expect(closed).toBe(true);
    expect(writtenChunks[0]).toEqual(new Uint8Array([10, 20, 30, 40, 50]));

    const opened = await openLocalArtworkFile({ env: nativeEnv });
    expect(opened.status).toBe("opened");
    if (opened.status === "opened") {
      expect(opened.fileName).toBe("ep01.toonstudio");
      expect(opened.sizeBytes).toBe(4);
    }

    // 권한 거부 시 permission-denied 반환
    const deniedHandle: FileSystemFileHandleLike = {
      ...mockHandle,
      async queryPermission() {
        return "prompt";
      },
      async requestPermission() {
        return "denied";
      },
    };
    const denied = await saveLocalArtworkFile({
      suggestedName: "ep01.toonstudio",
      data: "hello",
      existingHandle: deniedHandle,
      env: nativeEnv,
    });
    expect(denied.status).toBe("permission-denied");

    // 사용자 취소(AbortError)는 다운로드 폴백을 호출하지 않고 cancelled 반환
    const clickSpy = vi.fn();
    const cancelEnv: FileSystemAccessEnv = {
      isSecureContext: true,
      showSaveFilePicker: async () => {
        throw makeDomError("AbortError", "User aborted");
      },
      document: {
        createElement: () => ({ href: "", download: "", click: clickSpy }),
      },
      urlApi: {
        createObjectURL: () => "blob:mock",
        revokeObjectURL: vi.fn(),
      },
    };
    const cancelled = await saveLocalArtworkFile({
      suggestedName: "ep01.toonstudio",
      data: "hello",
      env: cancelEnv,
    });
    expect(cancelled.status).toBe("cancelled");
    expect(clickSpy).not.toHaveBeenCalled();

    // 미지원 브라우저에서는 안전 <a download> 다운로드 폴백 + ObjectURL 회수
    const revokeSpy = vi.fn();
    let downloadedName = "";
    const fallbackEnv: FileSystemAccessEnv = {
      isSecureContext: true,
      showSaveFilePicker: null,
      showOpenFilePicker: null,
      document: {
        createElement: () => ({
          href: "",
          set download(val: string) {
            downloadedName = val;
          },
          get download() {
            return downloadedName;
          },
          click: clickSpy,
        }),
      },
      urlApi: {
        createObjectURL: () => "blob:fallback-url",
        revokeObjectURL: revokeSpy,
      },
    };
    expect(detectFileSystemAccessSupport(fallbackEnv).mode).toBe("download-fallback");
    const fallbackSaved = await saveLocalArtworkFile({
      suggestedName: "fallback-art.png",
      data: new Uint8Array([1, 2, 3]),
      env: fallbackEnv,
    });
    expect(fallbackSaved.status).toBe("saved-fallback-download");
    expect(fallbackSaved.method).toBe("download-fallback");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:fallback-url");
    expect(downloadedName).toBe("fallback-art.png");
  });

  it("Display-P3 테스트 차트에서 인쇄 안전 영역과 광색역 CMYK 이탈 영역을 정밀 구분한다", () => {
    const width = 40;
    const height = 20;
    const chart = createDisplayP3TestChartBuffer(width, height);

    const coated = computeCmykSoftProofGamutOverlay({
      width,
      height,
      rgba: chart,
      sourceColorSpace: "display-p3",
      profileId: "japan-color-2011-coated",
      highlightMode: "warning-overlay",
    });

    const uncoated = computeCmykSoftProofGamutOverlay({
      width,
      height,
      rgba: chart,
      sourceColorSpace: "display-p3",
      profileId: "swop-v2-uncoated",
      highlightMode: "warning-overlay",
    });

    expect(coated.totalOpaquePixels).toBe(width * height);
    // 왼쪽 절반(인쇄 안전 피부·회색톤)은 색역 내(0), 오른쪽 절반(네온 광색역)은 색역 이탈(1)
    let leftOutCount = 0;
    let rightOutCount = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const flag = coated.gamutMask[y * width + x] ?? 0;
        if (x < width / 2) leftOutCount += flag;
        else rightOutCount += flag;
      }
    }
    expect(leftOutCount).toBe(0);
    expect(rightOutCount).toBe((width / 2) * height);
    expect(coated.outOfGamutRatio).toBeCloseTo(0.5, 3);
    expect(coated.maxDeltaE).toBeGreaterThan(8);

    // 비코팅 단행본 내지는 코팅지보다 평균 색차(ΔE)가 더 크다.
    expect(uncoated.meanDeltaE).toBeGreaterThan(coated.meanDeltaE);
    // 경고 오버레이 픽셀이 소프트 프루프 원본 픽셀과 다르게 하이라이트된다.
    const sampleRightIdx = (4 * width + (width - 4)) * 4;
    expect(coated.overlayRgba[sampleRightIdx]).not.toBe(coated.softProofRgba[sampleRightIdx]);
  });
});

describe("ChromeProHardwareAndMediaSection 지연 패널 통합 UI", () => {
  it("ChromeWasm64PerformancePanel 안에서 4종 프로 기능을 1클릭 체험할 수 있다", async () => {
    const mockHandle: FileSystemFileHandleLike = {
      name: "sample.toonstudio",
      async getFile() {
        return new File(["{}"], "sample.toonstudio");
      },
      async queryPermission() {
        return "granted";
      },
      async createWritable() {
        return {
          async write() {},
          async close() {},
        };
      },
    };

    render(
      <ChromeWasm64PerformancePanel
        proHardwareEnv={{
          webHid: {
            isSecureContext: true,
            hid: {
              async requestDevice() {
                return [];
              },
              async getDevices() {
                return [];
              },
            },
          },
          fileSystem: {
            isSecureContext: true,
            showOpenFilePicker: async () => [mockHandle],
            showSaveFilePicker: async () => mockHandle,
          },
        }}
      />,
    );

    expect(screen.getByTestId("chrome-pro-hardware-media-section")).toBeTruthy();

    // 1) 물리 수채화 · 메탈릭 미리보기 실행
    fireEvent.click(screen.getByTestId("pro-rebelle-run-btn"));
    expect(screen.getByTestId("pro-rebelle-results")).toBeTruthy();
    expect(screen.getByTestId("pro-rebelle-valley-ratio").textContent).toMatch(/^\d+\.\d{2}×$/u);
    expect(screen.getByTestId("pro-rebelle-specular").textContent).toMatch(/^\+\d+\.\d%$/u);

    // 2) WebHID 왼손 리모컨 탭 전환 · 파싱 테스트
    fireEvent.click(screen.getByTestId("pro-tab-webhid-remote"));
    expect(screen.getByTestId("pro-webhid-support-pill").textContent).toContain("WebHID 연결 가능");
    fireEvent.click(screen.getByTestId("pro-webhid-simulate-btn"));
    expect(screen.getByTestId("pro-webhid-last-event").textContent).toContain("brush.size+");

    // 3) 로컬 디스크 직접 저장 탭 전환 · 샘플 저장
    fireEvent.click(screen.getByTestId("pro-tab-fs-access"));
    expect(screen.getByTestId("pro-fs-mode-pill").textContent).toContain("로컬 디스크 직결 활성");
    fireEvent.click(screen.getByTestId("pro-fs-save-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("pro-fs-save-result").textContent).toContain("saved-direct");
    });

    // 4) Display-P3 · CMYK 소프트 프루프 탭 전환 · 시뮬레이션 실행
    fireEvent.click(screen.getByTestId("pro-tab-cmyk-proof"));
    fireEvent.click(screen.getByTestId("pro-cmyk-run-btn"));
    expect(screen.getByTestId("pro-cmyk-results")).toBeTruthy();
    expect(screen.getByTestId("pro-cmyk-oog-ratio").textContent).toContain("50.0%");

    // 접힘/펼침 토글 동작 확인
    const toggle = screen.getByTestId("pro-hardware-media-toggle");
    fireEvent.click(toggle);
    expect(screen.queryByTestId("pro-panel-cmyk-proof")).toBeNull();
  });

  it("신규 UI 컴포넌트와 모듈이 하드코딩 HEX · transition-all · 금지 모션을 사용하지 않는다", () => {
    const uiSource = readFileSync(
      resolve(
        process.cwd(),
        "apps/web/src/domains/creator/kernel/ChromeProHardwareAndMediaSection.tsx",
      ),
      "utf8",
    );
    expect(uiSource).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(uiSource).not.toMatch(/transition-all/u);
    expect(uiSource).not.toMatch(/animate-(?:bounce|ping|spin)/u);
    expect(uiSource).not.toMatch(/@ts-nocheck/u);
  });
});
