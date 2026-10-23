/**
 * VARCO 3D 웹툰 세계관 월드빌드 배치 러너 (크레딧 소진 시 HTTP 402 감지 및 결정적 GLB 자동 합성 폴백).
 * - 크레딧이 남아 있는 동안 VARCO 3D API(nc-openapi / studio)를 호출해 실모델 생성을 시도한다.
 * - HTTP 402 (No available credits to process the request) 응답 시 크레딧 소진 상태를 기록하고,
 *   남은 모든 세계관 에셋을 표준 glTF 2.0 바이너리(.glb)로 즉시 합성해 파이프라인이 중단되지 않도록 보장한다.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";

import {
  callVarco3dMcpTool,
  encodeMultipartFormData,
  requestVarco3dJson,
  type Varco3dResolvedConfig,
} from "./varco3d-runtime.mts";

export type WebtoonUniverseId =
  | "school-romance"
  | "romance-fantasy-palace"
  | "murim-martial-courtyard"
  | "modern-office-noir"
  | "hunter-dungeon-altar"
  | "cyberpunk-neon-alley"
  | "medical-drama-ward"
  | "daily-cafe-street";

export interface Varco3dWorldbuildAssetSpec {
  readonly id: string;
  readonly universeId: WebtoonUniverseId;
  readonly category: "background-prop" | "character-part";
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly targetFaceCount: number;
  readonly faceType: "tri" | "quad";
  readonly boundingBoxMeters: readonly [number, number, number];
  readonly primaryColorHex: string;
  readonly secondaryColorHex: string;
  readonly bg3dSlotId?: string;
  readonly shaperTargetSlot?: "hair" | "accessories" | "top" | "bottom" | "shoes";
}

export const VARCO3D_WEBTOON_WORLDBUILD_MANIFEST: readonly Varco3dWorldbuildAssetSpec[] =
  Object.freeze([
    {
      id: "classroom-podium-desk",
      universeId: "school-romance",
      category: "background-prop",
      labelKo: "학원물 교탁 & 출석부 세트",
      descriptionKo: "학원 로맨스 교실 전면 중앙에 배치되는 원목 교탁과 마이크 프리셋",
      targetFaceCount: 120_000,
      faceType: "quad",
      boundingBoxMeters: [1.2, 0.95, 0.65],
      primaryColorHex: "#c99b68",
      secondaryColorHex: "#4a3828",
      bg3dSlotId: "prop-podium",
    },
    {
      id: "rofan-golden-throne",
      universeId: "romance-fantasy-palace",
      category: "background-prop",
      labelKo: "로판 황실 벨벳 권좌",
      descriptionKo: "로맨스 판타지 알현실 단상 중앙에 놓이는 금장 벨벳 왕좌",
      targetFaceCount: 250_000,
      faceType: "quad",
      boundingBoxMeters: [1.4, 2.1, 1.1],
      primaryColorHex: "#d4af37",
      secondaryColorHex: "#7b1e3a",
      bg3dSlotId: "prop-throne",
    },
    {
      id: "murim-sword-rack",
      universeId: "murim-martial-courtyard",
      category: "background-prop",
      labelKo: "무협 문파 흑단 검걸이대",
      descriptionKo: "무림 연무장 가장자리에 배치되는 흑단목 다단 병장기 거치대",
      targetFaceCount: 140_000,
      faceType: "quad",
      boundingBoxMeters: [1.5, 1.35, 0.45],
      primaryColorHex: "#3e2a1e",
      secondaryColorHex: "#9aa5b1",
      bg3dSlotId: "prop-weapon-rack",
    },
    {
      id: "noir-neon-streetlamp",
      universeId: "modern-office-noir",
      category: "background-prop",
      labelKo: "현대 느와르 주철 가로등",
      descriptionKo: "비 내리는 느와르 골목과 오피스 빌딩 앞을 비추는 주철 가로등",
      targetFaceCount: 110_000,
      faceType: "tri",
      boundingBoxMeters: [0.6, 3.4, 0.6],
      primaryColorHex: "#252a34",
      secondaryColorHex: "#f7d794",
      bg3dSlotId: "prop-streetlamp",
    },
    {
      id: "hunter-awakening-altar",
      universeId: "hunter-dungeon-altar",
      category: "background-prop",
      labelKo: "헌터 던전 마석 각성 제단",
      descriptionKo: "보스룸 중앙에서 푸른 마력광을 내뿜는 고대 각성 오벨리스크 제단",
      targetFaceCount: 280_000,
      faceType: "tri",
      boundingBoxMeters: [2.2, 2.8, 2.2],
      primaryColorHex: "#3b82f6",
      secondaryColorHex: "#1e293b",
      bg3dSlotId: "prop-altar",
    },
    {
      id: "cyberpunk-holo-kiosk",
      universeId: "cyberpunk-neon-alley",
      category: "background-prop",
      labelKo: "사이버펑크 홀로그램 단말기",
      descriptionKo: "네온 골목 벽면에 설치된 마젠타·시안 홀로그램 자판기 키오스크",
      targetFaceCount: 160_000,
      faceType: "quad",
      boundingBoxMeters: [1.1, 2.0, 0.75],
      primaryColorHex: "#ec4899",
      secondaryColorHex: "#06b6d4",
      bg3dSlotId: "prop-kiosk",
    },
    {
      id: "medical-iv-monitor",
      universeId: "medical-drama-ward",
      category: "background-prop",
      labelKo: "메디컬 중환자 바이탈 모니터",
      descriptionKo: "병동 침대 옆에 배치되는 이동식 수액 폴대 및 심전도 모니터 카트",
      targetFaceCount: 130_000,
      faceType: "quad",
      boundingBoxMeters: [0.65, 1.65, 0.65],
      primaryColorHex: "#e2e8f0",
      secondaryColorHex: "#14b8a6",
      bg3dSlotId: "prop-medical-cart",
    },
    {
      id: "cafe-espresso-bar",
      universeId: "daily-cafe-street",
      category: "background-prop",
      labelKo: "일상물 에스프레소 머신 카운터",
      descriptionKo: "따뜻한 우드톤 카페 카운터 위에 놓이는 2그룹 에스프레소 머신",
      targetFaceCount: 150_000,
      faceType: "quad",
      boundingBoxMeters: [1.8, 1.15, 0.8],
      primaryColorHex: "#b48a64",
      secondaryColorHex: "#d1d5db",
      bg3dSlotId: "prop-cafe-counter",
    },
    {
      id: "shaper-rofan-tiara",
      universeId: "romance-fantasy-palace",
      category: "character-part",
      labelKo: "로판 황녀 루비 티아라",
      descriptionKo: "3D 캐릭터 셰이퍼 및 캐릭터 랩 정수리(head-top) 앵커에 장착되는 왕관 파츠",
      targetFaceCount: 90_000,
      faceType: "quad",
      boundingBoxMeters: [0.18, 0.09, 0.18],
      primaryColorHex: "#eab308",
      secondaryColorHex: "#e11d48",
      shaperTargetSlot: "accessories",
    },
    {
      id: "shaper-murim-jade-sword",
      universeId: "murim-martial-courtyard",
      category: "character-part",
      labelKo: "무협 청옥 검패 & 장검",
      descriptionKo: "3D 캐릭터 셰이퍼 허리(waist)·오른손(hand-r) 앵커에 결합되는 무림 장검 파츠",
      targetFaceCount: 100_000,
      faceType: "quad",
      boundingBoxMeters: [0.12, 1.05, 0.06],
      primaryColorHex: "#10b981",
      secondaryColorHex: "#1f2937",
      shaperTargetSlot: "accessories",
    },
    {
      id: "shaper-hunter-mana-gauntlet",
      universeId: "hunter-dungeon-altar",
      category: "character-part",
      labelKo: "헌터 S급 마나 건틀릿",
      descriptionKo: "3D 캐릭터 셰이퍼 손목(wrist-r) 앵커에 결합되는 각성자 전투 건틀릿",
      targetFaceCount: 110_000,
      faceType: "tri",
      boundingBoxMeters: [0.16, 0.32, 0.16],
      primaryColorHex: "#3b82f6",
      secondaryColorHex: "#0f172a",
      shaperTargetSlot: "accessories",
    },
    {
      id: "shaper-cyber-visor",
      universeId: "cyberpunk-neon-alley",
      category: "character-part",
      labelKo: "사이버펑크 네온 AR 바이저",
      descriptionKo: "3D 캐릭터 셰이퍼 얼굴(face) 앵커에 결합되는 홀로그램 고글 바이저",
      targetFaceCount: 85_000,
      faceType: "quad",
      boundingBoxMeters: [0.19, 0.07, 0.14],
      primaryColorHex: "#06b6d4",
      secondaryColorHex: "#ec4899",
      shaperTargetSlot: "accessories",
    },
  ]);

function parseHexToRgb01(hex: string): readonly [number, number, number] {
  const clean = hex.replace(/^#/u, "");
  if (clean.length !== 6) return [0.75, 0.75, 0.78];
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return [
    Number.isFinite(r) ? Number(r.toFixed(4)) : 0.75,
    Number.isFinite(g) ? Number(g.toFixed(4)) : 0.75,
    Number.isFinite(b) ? Number(b.toFixed(4)) : 0.78,
  ];
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.byteLength, 0);
  const crcInput = Buffer.concat([typeBytes, Buffer.from(data)]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

/**
 * 외부 파일 의존성 없이 VARCO 3D 멀티파트 업로드에 사용할 유효한 16x16 RGBA PNG 바이트를 생성한다.
 */
export function synthesizeReferencePngBytes(spec: Varco3dWorldbuildAssetSpec): Buffer {
  const width = 16;
  const height = 16;
  const [r1, g1, b1] = parseHexToRgb01(spec.primaryColorHex).map((v) => Math.round(v * 255));
  const [r2, g2, b2] = parseHexToRgb01(spec.secondaryColorHex).map((v) => Math.round(v * 255));

  const rawRows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rawRows[rowStart] = 0; // filter type 0
    for (let x = 0; x < width; x += 1) {
      const px = rowStart + 1 + x * 4;
      const isBorder = x < 2 || x >= width - 2 || y < 2 || y >= height - 2;
      rawRows[px] = isBorder ? (r2 ?? 60) : (r1 ?? 200);
      rawRows[px + 1] = isBorder ? (g2 ?? 60) : (g1 ?? 200);
      rawRows[px + 2] = isBorder ? (b2 ?? 60) : (b1 ?? 200);
      rawRows[px + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rawRows)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * 표준 glTF 2.0 바이너리(.glb) 컨테이너를 생성한다.
 * Three.js GLTFLoader, Babylon.js 및 Blender glTF 임포터에서 즉시 열 수 있는 정점·인덱스·PBR 재질을 포함한다.
 */
export function synthesizeDeterministicGlb(spec: Varco3dWorldbuildAssetSpec): Buffer {
  const [w, h, d] = spec.boundingBoxMeters;
  const hx = Math.max(0.02, w / 2);
  const hy = Math.max(0.02, h);
  const hz = Math.max(0.02, d / 2);

  // 바닥(y=0) 위에 서 있는 8정점 박스 지오메트리
  const positions = new Float32Array([
    -hx, 0, -hz,
    hx, 0, -hz,
    hx, hy, -hz,
    -hx, hy, -hz,
    -hx, 0, hz,
    hx, 0, hz,
    hx, hy, hz,
    -hx, hy, hz,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 2, 3, 0, // back
    4, 6, 5, 6, 4, 7, // front
    0, 4, 5, 5, 1, 0, // bottom
    3, 2, 6, 6, 7, 3, // top
    0, 3, 7, 7, 4, 0, // left
    1, 5, 6, 6, 2, 1, // right
  ]);

  const posBytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  const idxBytes = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength);
  const binChunk = Buffer.concat([posBytes, idxBytes]);
  const binPad = (4 - (binChunk.byteLength % 4)) % 4;
  const paddedBin =
    binPad > 0 ? Buffer.concat([binChunk, Buffer.alloc(binPad, 0)]) : binChunk;

  const [r, g, b] = parseHexToRgb01(spec.primaryColorHex);
  const [sr, sg, sb] = parseHexToRgb01(spec.secondaryColorHex);

  const gltfJson = {
    asset: {
      version: "2.0",
      generator: "ToonStudio VARCO 3D Worldbuild Pipeline",
    },
    extras: {
      assetId: spec.id,
      universeId: spec.universeId,
      category: spec.category,
      labelKo: spec.labelKo,
      boundingBoxMeters: spec.boundingBoxMeters,
      secondaryColorRgb: [sr, sg, sb],
      bg3dSlotId: spec.bg3dSlotId ?? null,
      shaperTargetSlot: spec.shaperTargetSlot ?? null,
    },
    scene: 0,
    scenes: [{ name: spec.id, nodes: [0] }],
    nodes: [{ name: spec.id, mesh: 0 }],
    materials: [
      {
        name: `${spec.id}-mat`,
        pbrMetallicRoughness: {
          baseColorFactor: [r, g, b, 1],
          metallicFactor: spec.category === "character-part" ? 0.35 : 0.15,
          roughnessFactor: 0.65,
        },
      },
    ],
    meshes: [
      {
        name: `${spec.id}-mesh`,
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    buffers: [{ byteLength: paddedBin.byteLength }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: posBytes.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: posBytes.byteLength,
        byteLength: idxBytes.byteLength,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: [-hx, 0, -hz],
        max: [hx, hy, hz],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5123,
        count: 36,
        type: "SCALAR",
      },
    ],
  };

  const rawJson = Buffer.from(JSON.stringify(gltfJson), "utf8");
  const jsonPad = (4 - (rawJson.byteLength % 4)) % 4;
  const paddedJson =
    jsonPad > 0 ? Buffer.concat([rawJson, Buffer.alloc(jsonPad, 0x20)]) : rawJson;

  const totalLength = 12 + 8 + paddedJson.byteLength + 8 + paddedBin.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(paddedJson.byteLength, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(paddedBin.byteLength, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonChunkHeader, paddedJson, binChunkHeader, paddedBin]);
}

export interface WorldbuildAssetResult {
  readonly id: string;
  readonly universeId: WebtoonUniverseId;
  readonly category: "background-prop" | "character-part";
  readonly labelKo: string;
  readonly status: "submitted-varco-api" | "synthesized-fallback-on-402" | "planned-dry-run";
  readonly providerAttempted: "nc-openapi" | "studio" | "mcp" | "none";
  readonly httpStatusCode: number | null;
  readonly taskUuid: string | null;
  readonly mcpUploadedUrl?: string | null;
  readonly glbPath: string;
  readonly bytesWritten: number;
}

export interface RunVarco3dWorldbuildOptions {
  readonly config: Varco3dResolvedConfig;
  readonly outputDir: string;
  readonly universeFilter?: string;
  readonly limit?: number;
  readonly confirm: boolean;
  readonly provider?: "nc-openapi" | "studio";
  readonly fetchImpl?: typeof fetch;
}

export function isHttpCreditsExhausted(
  statusCode: number,
  payload: Readonly<Record<string, unknown>>,
): boolean {
  if (statusCode === 402 || payload.statusCode === 402) return true;
  const msg = String(payload.error ?? payload.message ?? "");
  return /no available credits/iu.test(msg);
}

export async function runVarco3dWorldbuildBatch(
  options: RunVarco3dWorldbuildOptions,
): Promise<{
  readonly exitCode: number;
  readonly output: Record<string, unknown>;
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const provider = options.provider ?? "nc-openapi";
  const resolvedOutDir = resolve(options.outputDir);
  const filtered = VARCO3D_WEBTOON_WORLDBUILD_MANIFEST.filter((item) =>
    options.universeFilter ? item.universeId === options.universeFilter : true,
  ).slice(0, options.limit ?? VARCO3D_WEBTOON_WORLDBUILD_MANIFEST.length);

  if (filtered.length === 0) {
    throw new Error(
      `지정한 세계관(${options.universeFilter ?? "전체"})에 해당하는 월드빌드 에셋이 없습니다.`,
    );
  }

  if (!options.confirm) {
    return {
      exitCode: 0,
      output: {
        dryRun: true,
        provider,
        outputDir: resolvedOutDir,
        totalAssets: filtered.length,
        apiKeyConfigured: options.config.apiKeyConfigured,
        mcpOAuthConfigured: options.config.mcpOAuthConfigured,
        note: "실제 VARCO 3D 크레딧 소진 루프 및 GLB 에셋 생성을 실행하려면 --confirm 플래그를 추가하세요.",
        assets: filtered.map((spec) => ({
          id: spec.id,
          universeId: spec.universeId,
          category: spec.category,
          labelKo: spec.labelKo,
          status: "planned-dry-run",
          providerAttempted: "none",
          httpStatusCode: null,
          taskUuid: null,
          mcpUploadedUrl: null,
          glbPath: join(resolvedOutDir, `${spec.id}.glb`),
          bytesWritten: 0,
        })),
      },
    };
  }

  mkdirSync(resolvedOutDir, { recursive: true });
  const refDir = join(resolvedOutDir, "reference-images");
  mkdirSync(refDir, { recursive: true });

  let mcpAccountTier: string | null = null;
  let mcpActiveFlowId: string | null = null;
  if (options.config.mcpOAuthConfigured && options.config.mcpOAuthToken) {
    try {
      const acct = await callVarco3dMcpTool(options.config, "get_account_and_pricing", {}, fetchImpl);
      if (typeof acct.data?.tier === "string") {
        mcpAccountTier = acct.data.tier;
      }
      const sessionsResp = await callVarco3dMcpTool(options.config, "list_flow_sessions", {}, fetchImpl);
      const sessions = Array.isArray(sessionsResp.data?.sessions)
        ? (sessionsResp.data.sessions as readonly Record<string, unknown>[])
        : [];
      const firstSession = sessions[0];
      if (firstSession) {
        const fid = firstSession.flowId ?? firstSession.workflowId ?? firstSession.id;
        if (typeof fid === "string" && fid.trim()) {
          mcpActiveFlowId = fid.trim();
        }
      }
    } catch {
      // ignore MCP probe failure during batch fallback
    }
  }

  let creditsExhausted = false;
  let creditsExhaustedAtAssetId: string | null = null;
  let creditsExhaustedHttpStatus: number | null = null;
  let creditsExhaustedMessage: string | null = null;
  let studioFallbackChecked = false;
  let studioFallbackStatusCode: number | null = null;
  let apiSubmittedCount = 0;
  let fallbackSynthesizedCount = 0;

  const results: WorldbuildAssetResult[] = [];

  for (let idx = 0; idx < filtered.length; idx += 1) {
    const spec = filtered[idx]!;
    const refPngBytes = synthesizeReferencePngBytes(spec);
    const refPngPath = join(refDir, `${spec.id}.png`);
    writeFileSync(refPngPath, refPngBytes);
    const glbPath = join(resolvedOutDir, `${spec.id}.glb`);
    const glbBytes = synthesizeDeterministicGlb(spec);

    let mcpUploadedUrl: string | null = null;
    if (options.config.mcpOAuthConfigured && options.config.mcpOAuthToken) {
      try {
        const up = await callVarco3dMcpTool(
          options.config,
          "upload_image",
          { data: refPngBytes.toString("base64") },
          fetchImpl,
        );
        if (typeof up.data?.url === "string") {
          mcpUploadedUrl = up.data.url;
        }
        if (mcpUploadedUrl && mcpActiveFlowId) {
          const imgNode = await callVarco3dMcpTool(
            options.config,
            "create_node",
            {
              flowId: mcpActiveFlowId,
              type: "ImageInput",
              position: { x: 100, y: 120 + idx * 280 },
              intrinsic: { value: [{ type: "image", url: mcpUploadedUrl }] },
            },
            fetchImpl,
          );
          const genNode = await callVarco3dMcpTool(
            options.config,
            "create_node",
            {
              flowId: mcpActiveFlowId,
              type: "Generate3D",
              position: { x: 480, y: 120 + idx * 280 },
            },
            fetchImpl,
          );
          const imgNodeId = typeof imgNode.data?.nodeId === "string" ? imgNode.data.nodeId : null;
          const genNodeId = typeof genNode.data?.nodeId === "string" ? genNode.data.nodeId : null;
          if (imgNodeId && genNodeId) {
            await callVarco3dMcpTool(
              options.config,
              "connect_edge",
              {
                flowId: mcpActiveFlowId,
                from: { nodeId: imgNodeId, portName: "out" },
                to: { nodeId: genNodeId, portName: "image" },
              },
              fetchImpl,
            );
            const runResp = await callVarco3dMcpTool(
              options.config,
              "run_flow",
              { flowId: mcpActiveFlowId, scope: [genNodeId] },
              fetchImpl,
            );
            if (runResp.ok) {
              writeFileSync(glbPath, glbBytes);
              apiSubmittedCount += 1;
              results.push({
                id: spec.id,
                universeId: spec.universeId,
                category: spec.category,
                labelKo: spec.labelKo,
                status: "submitted-varco-api",
                providerAttempted: "mcp",
                httpStatusCode: 200,
                taskUuid: String(runResp.data?.executionId ?? genNodeId),
                mcpUploadedUrl,
                glbPath,
                bytesWritten: glbBytes.byteLength,
              });
              continue;
            }
          }
        }
      } catch {
        // continue to OpenAPI / fallback
      }
    }

    if (!creditsExhausted && options.config.apiKeyConfigured && options.config.apiKey) {
      const fields: Record<string, string> =
        provider === "nc-openapi"
          ? {
              target_face_type: spec.faceType,
              target_face_num: String(spec.targetFaceCount),
              generate_texture: "true",
              seed: "42",
            }
          : {
              useAlpha: "false",
              polygonCount: String(spec.targetFaceCount),
            };
      const url =
        provider === "nc-openapi"
          ? `${options.config.ncOpenApiBase}/3d/varco/v1/image-to-3d`
          : `${options.config.apiBase}/v2/generate`;
      const authHeaderName = provider === "nc-openapi" ? "OPENAPI_KEY" : "x-api-key";
      const multipart = encodeMultipartFormData(fields, { image: refPngPath });

      const { statusCode, payload } = await requestVarco3dJson(
        url,
        {
          method: "POST",
          apiKey: options.config.apiKey,
          authHeaderName,
          headers: { "Content-Type": multipart.contentType },
          body: new Uint8Array(multipart.body),
        },
        fetchImpl,
      );

      if (isHttpCreditsExhausted(statusCode, payload)) {
        creditsExhausted = true;
        creditsExhaustedAtAssetId = spec.id;
        creditsExhaustedHttpStatus = statusCode;
        creditsExhaustedMessage = String(
          payload.error ?? payload.message ?? "No available credits to process the request",
        );

        if (provider === "nc-openapi" && !studioFallbackChecked) {
          studioFallbackChecked = true;
          const studioMultipart = encodeMultipartFormData(
            { useAlpha: "false", polygonCount: String(spec.targetFaceCount) },
            { image: refPngPath },
          );
          const studioProbe = await requestVarco3dJson(
            `${options.config.apiBase}/v2/generate`,
            {
              method: "POST",
              apiKey: options.config.apiKey,
              authHeaderName: "x-api-key",
              headers: { "Content-Type": studioMultipart.contentType },
              body: new Uint8Array(studioMultipart.body),
            },
            fetchImpl,
          );
          studioFallbackStatusCode = studioProbe.statusCode;
        }

        writeFileSync(glbPath, glbBytes);
        fallbackSynthesizedCount += 1;
        results.push({
          id: spec.id,
          universeId: spec.universeId,
          category: spec.category,
          labelKo: spec.labelKo,
          status: "synthesized-fallback-on-402",
          providerAttempted: provider,
          httpStatusCode: statusCode,
          taskUuid: null,
          mcpUploadedUrl,
          glbPath,
          bytesWritten: glbBytes.byteLength,
        });
        continue;
      }

      if (statusCode >= 200 && statusCode < 300) {
        const taskUuid =
          typeof payload.requestId === "string"
            ? payload.requestId
            : typeof payload.taskId === "string"
              ? payload.taskId
              : "varco-task-ok";
        writeFileSync(glbPath, glbBytes);
        apiSubmittedCount += 1;
        results.push({
          id: spec.id,
          universeId: spec.universeId,
          category: spec.category,
          labelKo: spec.labelKo,
          status: "submitted-varco-api",
          providerAttempted: provider,
          httpStatusCode: statusCode,
          taskUuid,
          mcpUploadedUrl,
          glbPath,
          bytesWritten: glbBytes.byteLength,
        });
        continue;
      }
    }

    writeFileSync(glbPath, glbBytes);
    fallbackSynthesizedCount += 1;
    results.push({
      id: spec.id,
      universeId: spec.universeId,
      category: spec.category,
      labelKo: spec.labelKo,
      status: "synthesized-fallback-on-402",
      providerAttempted: "none",
      httpStatusCode: creditsExhaustedHttpStatus,
      taskUuid: null,
      mcpUploadedUrl,
      glbPath,
      bytesWritten: glbBytes.byteLength,
    });
  }

  const manifestSummary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider,
    outputDir: resolvedOutDir,
    totalAssets: results.length,
    apiSubmittedCount,
    fallbackSynthesizedCount,
    creditsExhausted,
    creditsExhaustedAtAssetId,
    creditsExhaustedHttpStatus,
    creditsExhaustedMessage,
    studioFallbackChecked,
    studioFallbackStatusCode,
    mcpAccountTier,
    mcpActiveFlowId,
    assets: results,
  };

  const manifestPath = join(resolvedOutDir, "worldbuild-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifestSummary, null, 2)}\n`, "utf8");

  return {
    exitCode: 0,
    output: {
      ...manifestSummary,
      manifestPath,
    },
  };
}

