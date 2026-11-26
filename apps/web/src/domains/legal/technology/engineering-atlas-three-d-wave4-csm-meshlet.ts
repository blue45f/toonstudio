import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · three-d · Wave-4 HyperCore:
 * 정적/동적 분리 캐스케이드 그림자 맵(Split CSM) 더티 타일 캐시 +
 * WebGPU 컴퓨트 메시렛(Meshlet) 수밀 동적 변위 세분화기 + 3D 공간 해시 입자 충돌 솔버.
 */
export const THREE_D_WAVE4_CSM_MESHLET_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "split-csm-shadow-compute-meshlet-spatial-hash",
    category: "three-d",
    name: "Split CSM Cache · Compute Meshlet · Spatial Hash",
    title: t("정적/동적 분리 CSM 그림자 · 수밀 컴퓨트 메시렛 · 공간 해시 충돌", "Split CSM shadow cache, watertight compute meshlet & spatial hash"),
    status: "experimental",
    tagline: t(
      "단위 테스트에서 그림자 갱신 대상 타일을 85% 이상 줄이고, 정팔면체 세분화 뒤 열린 경계 모서리가 0개임을 확인했습니다.",
      "Unit tests selected over 85% fewer shadow tiles and found zero open boundary edges after subdividing an octahedron.",
    ),
    background: [
      t(
        "거대한 정적 건축물 3D 배경 안에서 캐릭터 팔다리만 움직일 때 매 프레임 4개 캐스케이드 그림자 맵 전체를 다시 그리면 GPU 패스 비용이 낭비됩니다. 또한 WebGPU 에는 레거시 지오메트리 셰이더가 없어 동적 변위 세분화 시 인접 삼각형 경계 균열(Crack)을 막는 현대적 컴퓨트 경로가 필요합니다.",
        "Redrawing all four shadow cascades when only character limbs move inside static architecture wastes GPU passes, while WebGPU omits legacy geometry shaders.",
      ),
      t(
        "SplitCsmDirtyTileCache(hybrid-compute-shadow-ink-meshlet.ts)는 광원 방향이 고정된 동안 정적 배경 깊이 타일은 캐시로 유지하고, 이동한 캐릭터 본의 이전·현재 AABB 가 겹치는 캐스케이드 타일만 더티로 표시해 원거리 정적 캐스케이드를 통째로 건너뜁니다.",
        "SplitCsmDirtyTileCache retains static background depth tiles while light direction is steady, marking only cascade tiles touched by moving character bone AABBs.",
      ),
      t(
        "subdivideAndDisplaceMeshlets는 공유 모서리를 용접해 1→4로 세분화하고 64정점·126삼각형 한도로 메시렛을 묶습니다. 정팔면체 단위 테스트에서 열린 경계 모서리 0개를 확인했습니다. 입자 충돌도 별도 단위 테스트로 확인했으며 3D 배경 뷰포트 연결은 후속 단계입니다.",
        "The meshlet module welds shared edges during 1-to-4 subdivision and packs at most 64 vertices and 126 triangles per meshlet. An octahedron unit fixture had zero open boundary edges. Particle collisions have separate unit coverage. 3D viewport integration is a follow-up.",
      ),
    ],
    keyPoints: [
      t("단위 장면에서 캐릭터 본 AABB가 닿은 타일만 골라 갱신 대상 85% 이상 감소", "Unit scene selects bone-AABB dirty tiles and reduces the update list by over 85%"),
      t("원거리 무접촉 캐스케이드 패스 전체 스킵으로 그림자 드로우콜 절감", "Skips untouched far shadow cascades completely"),
      t("레거시 지오메트리 셰이더를 대체하는 64v/126t 수밀(균열 0) 컴퓨트 메시렛", "64v/126t watertight (0-crack) compute meshlets replacing GS"),
      t("균일 3D 공간 해시 격자 기반 O(N) 근방 탐색 및 탄성 충격량 입자 충돌", "O(N) uniform 3D spatial-hash broadphase & impulse collision"),
    ],
    diagram: {
      id: "split-csm-shadow-compute-meshlet-spatial-hash-diagram",
      kind: "layers",
      title: t("정적/동적 분리 CSM · 수밀 컴퓨트 메시렛 · 3D 공간 해시", "Split CSM shadow cache, watertight compute meshlet & 3D spatial hash"),
      caption: t(
        "변한 캐릭터 본 타일만 그림자를 다시 굽고, 동적 곡면과 소품 입자는 컴퓨트 메시렛과 공간 해시로 처리합니다.",
        "Re-bakes only bone-dirty shadow tiles while handling dynamic surfaces and particles via compute meshlets and spatial hashing.",
      ),
      alt: t(
        "상단 씬 변경 감지가 광원 불변 시 정적/동적 분리 CSM 더티 타일 캐시로 원거리 캐스케이드를 건너뛰게 하고, 중단 수밀 컴퓨트 메시렛 세분화기와 하단 3D 공간 해시 입자 솔버가 균열 없는 변위 메시와 충돌을 계산합니다.",
        "Scene delta tracking feeds the Split CSM dirty-tile cache to skip untouched cascades, followed by the watertight compute meshlet subdivider and 3D spatial-hash collision solver.",
      ),
      layers: [
        { id: "scene", label: t("3D 배경 + VRM 캐릭터 본 이동", "3D stage + VRM bone motion"), sub: t("정적 건축 배경 · 동적 관절 AABB 추적", "Static stage vs moving bone AABBs"), tone: "local", chips: ["Three.js", "VRM"] },
        { id: "csm", label: t("Split CSM 더티 타일 캐시", "Split CSM dirty-tile cache"), sub: t("무접촉 캐스케이드 스킵 · 더티 타일만 재렌더", "Skip clean cascades, redraw dirty tiles"), tone: "good", chips: ["85%+ saved"] },
        { id: "meshlet", label: t("수밀 WebGPU 컴퓨트 메시렛", "Watertight compute meshlets"), sub: t("공유 모서리 용접 1→4 세분화 · 64v/126t 클러스터", "Shared-edge weld 1→4, 64v/126t"), tone: "ai", chips: ["WebGPU", "WGSL"] },
        { id: "hash", label: t("3D 공간 해시 입자 솔버", "3D spatial-hash particle solver"), sub: t("27셀 인접 탐색 O(N) · 침투 보정 + 탄성 충격량", "27-cell O(N) broadphase & impulse"), tone: "neutral", chips: ["O(N)"] },
      ],
    },
    usage: [
      {
        feature: t("Split CSM 그림자 캐시 · 수밀 컴퓨트 메시렛 · 3D 공간 해시 솔버", "Split CSM cache, watertight compute meshlet & 3D spatial hash"),
        role: t(
          "실험 모듈에서 CSM 더티 타일, 메시렛 변위, 입자 충돌을 단위 테스트로 확인했습니다. /studio 3D 배경 뷰포트 연결은 후속 단계입니다.",
          "Unit tests cover CSM dirty tiles, meshlet displacement and particle collisions. Integration into the /studio 3D background viewport is a follow-up.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/hybrid-compute-shadow-ink-meshlet.ts",
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("공유 모서리 정규 키 용접으로 T-정션 균열 원천 차단", "Shared-edge canonical key welding to prevent T-junction cracks"),
        language: "ts",
        ...sampleSource([
          ["export function canonicalEdgeKey(v0: number, v1: number): string {"],
          ["  return v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;", "양쪽 삼각형이 정확히 같은 중점 정점 ID를 공유", "adjacent triangles share the exact midpoint vertex ID"],
          ["}"],
          ["export function spatialCellKey(x: number, y: number, z: number, invCell: number): string {"],
          ["  return `${Math.floor(x * invCell)},${Math.floor(y * invCell)},${Math.floor(z * invCell)}`;"],
          ["}"],
        ]),
        explain: t(
          "정방향(v0→v1)과 역방향(v1→v0) 반모서리가 동일한 중점 인덱스를 재사용하므로 법선 변위 후에도 인접 삼각형 사이에 틈이 절대 벌어지지 않습니다.",
          "Both half-edges reuse the identical midpoint index, keeping the displaced surface watertight with zero cracks.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/hybrid-compute-shadow-ink-meshlet.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Meshoptimizer · Cluster / Meshlet Rendering Pipeline",
        url: "https://github.com/zeux/meshoptimizer",
        kind: "repo",
        note: t("64정점·126삼각형 메시렛 경계 패킹 설계 참고", "Reference for 64-vertex / 126-triangle meshlet bounds"),
      },
      {
        title: "W3C · WebGPU Compute Shader Specification",
        url: "https://www.w3.org/TR/webgpu/",
        kind: "spec",
        note: t("지오메트리 셰이더 없는 현대 GPU 컴퓨트 지오메트리 파이프라인 표준", "Modern compute geometry pipeline standard"),
      },
    ],
    chapterIds: ["web-3d-engine", "performance"],
    talk: {
      pitch: t(
        "단위 장면에서 움직인 관절과 겹치는 타일만 골라 갱신 대상 수를 85% 이상 줄였습니다. 별도 정팔면체 입력의 세분화 결과에는 열린 경계 모서리가 없었습니다.",
        "A unit scene selected over 85% fewer shadow tiles. A separate octahedron fixture produced subdivision geometry with zero open boundary edges.",
      ),
      analogy: t(
        "배경 세트장 조명은 그대로 사진으로 찍어 두고 배우가 발을 옮긴 바닥 타일만 다시 칠하며, 천 주름은 이음새 실밥을 맞물려 찢어지지 않게 늘리는 무대 기법입니다.",
        "Like keeping a matte snapshot of static stage shadows, repainting only tiles where actors step, and stitching cloth seams so subdivision never tears.",
      ),
      questions: [
        {
          question: t("태양 조명 각도 자체가 바뀌면 캐시된 정적 그림자는 어떻게 되나요?", "What happens to cached static shadows when sun direction changes?"),
          answer: t(
            "SplitCsmDirtyTileCache 가 광원 방향 벡터 변화량을 먼저 감지해 임계값을 넘으면 즉시 전체 캐스케이드 타일을 갱신 모드로 전환해 잔상을 남기지 않습니다.",
            "SplitCsmDirtyTileCache checks light-direction delta first and marks all cascade tiles dirty whenever the light rotates.",
          ),
        },
      ],
    },
    technologies: ["WebGPU", "WGSL", "Three.js", "VRM", "TypeScript"],
    reviewedAt: "2026-11-26",
  },
];
