import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { commentedCode, t } from "./engineering-atlas-drawing-kit";

/**
 * 기술 도감 · drawing · 색과 재료, 합성, 필터 카드.
 * 물감이 섞이는 방식(분광 혼색), 종이와 붓의 물리, 블렌드 모드의 합성 단위, GPU 보정 필터의 정확성을 다룬다.
 */

const KERNELS = "apps/web/src/domains/creator/render/studio-gpu-filter-kernels.ts";
const SPECTRAL = "apps/web/src/domains/creator/studio-spectral-wgm-mix-v1.ts";

export const ENGINEERING_ATLAS_DRAWING_PAINT: readonly EngineeringAtlasEntry[] = [
  {
    id: "spectral-color-mixing-mixbox",
    category: "drawing",
    name: "Spectral mixing",
    title: t("파랑 + 노랑 = 초록: 물감처럼 섞이는 분광 혼색", "Blue + yellow = green: paint-like spectral mixing"),
    status: "live",
    tagline: t("RGB 를 평균 내는 대신 반사율을 곱해 섞어서, 파랑과 노랑이 초록이 됩니다.", "Instead of averaging RGB, reflectances are multiplied so blue and yellow make green."),
    background: [
      t(
        "화면의 RGB 는 빛을 더하는 방식이라 물감처럼 섞으면 탁해집니다. 파랑과 노랑을 RGB 로 평균 내면 초록이 아니라 칙칙한 올리브색이 됩니다. 실제 물감은 색마다 '어느 파장의 빛을 얼마나 반사하는가'가 정해져 있고, 두 물감이 겹치면 반사율이 대략 곱해져서 둘이 공통으로 반사하는 초록만 남습니다. ToonStudio 의 유화 붓은 이 원리를 흉내 냅니다.",
        "Screen RGB adds light, so mixing it like paint turns muddy: averaging blue and yellow in RGB gives a dull olive, not green. A real pigment has a fixed reflectance per wavelength, and when two pigments overlap those reflectances roughly multiply, leaving only the green both reflect. ToonStudio's oil brush imitates that principle.",
      ),
      t(
        "구현은 libmypaint 의 10밴드 가중 기하평균(WGM)을 그대로 포팅한 것입니다(ISC 라이선스). RGB 색을 빨강·초록·파랑의 기본 반사 스펙트럼 3개로 가중합해 10칸 스펙트럼으로 올리고, 두 스펙트럼을 칸마다 a의 w제곱 × b의 (1−w)제곱으로 섞은 뒤 3×10 행렬로 RGB 로 되돌립니다. paintMode 0 이면 선형 보간, 1 이면 순수 분광이고 유화 레시피는 0.88 입니다.",
        "It is a direct port of libmypaint's 10-band weighted geometric mean (WGM), under the ISC license. An RGB color is lifted to a 10-band spectrum as a weighted sum of three base reflectance spectra, the two spectra are mixed band by band as a^w times b^(1-w), and a 3x10 matrix converts back to RGB. paintMode 0 is plain linear blending, 1 is pure spectral, and the oil recipe uses 0.88.",
      ),
      t(
        "규칙 변경이 옛 작품을 바꾸지 않도록 옵트인 핀(spectral-wgm-v1)이 있는 브러시 레인만 이 혼색을 쓰고, 핀 없는 레인은 옛 선형 보간을 바이트 단위로 유지합니다. 유화 리본과 젖은 위 젖은 유화는 기본이 spectral-wgm 이고, 오일파스텔 'wgm-mix' 레인이 핀을 가집니다.",
        "So that rule changes do not alter old artwork, only brush lanes with the opt-in pin (spectral-wgm-v1) use this mixing, and unpinned lanes keep the old linear blend byte for byte. The oil ribbon and wet-into-wet oil default to spectral-wgm, and the oil-pastel 'wgm-mix' lane carries the pin.",
      ),
      t(
        "Mixbox(안료를 잠재 공간에서 보간하는 고품질 방식)는 CC BY-NC 4.0(비상업) 라이선스라 제품 라이브 혼색에 쓰지 않고, 브러시 스튜디오(제작 도구)의 비교 provider 한 곳에만 격리했습니다. 라이선스 프로필 기본값이 noncommercial-full 이라 상업 배포 전에는 프로필 확인이 필요하다고 저장소 문서가 적고 있습니다. 이 카드는 법률 판단을 하지 않고 저장소의 처리 방식만 설명합니다.",
        "Mixbox, a high-quality method that interpolates pigments in a latent space, is CC BY-NC 4.0 (non-commercial), so it is not used for live mixing in the product and is isolated in a single comparison provider of the brush studio (an authoring tool). The default license profile is noncommercial-full, and repository documents say the profile must be checked before any commercial release. This card gives no legal judgment; it only describes how the repository handles it.",
      ),
    ],
    keyPoints: [
      t("RGB 평균 대신 분광 반사율의 가중 기하평균", "Weighted geometric mean of spectra, not an RGB average"),
      t("라이브 혼색은 libmypaint 포팅(ISC), 핀이 있는 레인만", "Live mixing is a libmypaint port (ISC), pinned lanes only"),
      t("Mixbox(CC BY-NC)는 제작 도구의 한 곳에 격리", "Mixbox (CC BY-NC) is isolated in one authoring-tool file"),
    ],
    diagram: {
      id: "spectral-color-mixing-mixbox-diagram",
      kind: "graph",
      title: t("같은 두 색, 두 가지 섞는 법", "The same two colors, two ways to mix"),
      caption: t("RGB 평균은 탁한 올리브가 되고, 스펙트럼을 곱해 섞으면 초록이 됩니다.", "An RGB average gives muddy olive; multiplying spectra gives green."),
      alt: t(
        "파랑과 노랑을 입력으로, 위쪽 경로는 RGB 를 단순 평균해 탁한 올리브가 됩니다. 아래쪽 경로는 색을 10칸 스펙트럼으로 올리고 칸마다 가중 기하평균으로 섞은 뒤 행렬로 RGB 로 되돌려 초록이 됩니다.",
        "With blue and yellow as input, the upper path simply averages RGB and ends in a muddy olive. The lower path lifts each color to a 10-band spectrum, mixes it band by band with a weighted geometric mean and converts back to RGB with a matrix, ending in green.",
      ),
      nodes: [
        { id: "in", label: t("두 물감 색", "Two pigment colors"), sub: t("파랑 + 노랑", "Blue + yellow"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "lerp", label: t("RGB 평균", "RGB average"), sub: t("비교용 선형 보간", "Linear blend for contrast"), tone: "neutral", at: [2, 0] },
        { id: "mud", label: t("탁한 올리브", "Muddy olive"), sub: t("(126, 122, 67)", "(126, 122, 67)"), tone: "warn", shape: "pill", at: [4, 0] },
        { id: "lift", label: t("스펙트럼으로", "To a spectrum"), sub: t("RGB → 반사율 10칸", "RGB -> 10 bands"), tone: "local", at: [1, 1] },
        { id: "mix", label: t("가중 기하평균", "Weighted geometric mean"), sub: t("칸마다 a^w · b^(1−w)", "Per band: a^w * b^(1-w)"), tone: "local", at: [2, 1] },
        { id: "back", label: t("RGB 로 복원", "Back to RGB"), sub: t("3×10 행렬", "3x10 matrix"), tone: "local", at: [3, 1] },
        { id: "green", label: t("초록", "Green"), sub: t("(45, 124, 19)", "(45, 124, 19)"), tone: "good", shape: "pill", at: [4, 1] },
      ],
      edges: [
        { from: "in", to: "lerp", style: "dashed", label: t("단순 평균", "average") },
        { from: "lerp", to: "mud" },
        { from: "in", to: "lift" },
        { from: "lift", to: "mix" },
        { from: "mix", to: "back" },
        { from: "back", to: "green" },
      ],
    },
    usage: [
      {
        feature: t("유화 붓 · 젖은 물감 집어 올려 섞기", "Oil brush · picking up and mixing wet paint"),
        role: t(
          "캔버스의 젖은 물감과 붓의 물감을 분광 가중 기하평균으로 섞어, 파랑과 노랑이 초록이 되게 합니다.",
          "Mixes the wet paint on the canvas with the paint on the brush using the spectral weighted geometric mean, so blue and yellow become green.",
        ),
        paths: [
          `${SPECTRAL}#mixStudioSpectralWgm`,
          "apps/web/src/domains/creator/brush/studio-wet-mix.ts",
          "apps/web/src/domains/creator/brush/studio-oil-wet-into-wet.ts",
          "apps/web/src/domains/creator/brush/studio-oil-ribbon-paint.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("오일파스텔 'wgm-mix' 레인(브로큰 컬러)", "Oil-pastel 'wgm-mix' lane (broken color)"),
        role: t(
          "색 동역학 스냅샷에 spectral-wgm-v1 핀이 있을 때만 붓 자국마다 분광 혼색을 쓰고, 종이톤 배경과 섞여 브로큰 컬러가 됩니다.",
          "Uses spectral mixing per dab only when the color-dynamics snapshot carries the spectral-wgm-v1 pin, blending with a paper-tone background into broken color.",
        ),
        paths: [
          "apps/web/src/domains/creator/brush/studio-brush-material-dynamics.ts",
          "apps/web/src/domains/creator/brush/studio-brush-engine-lane-catalog.ts#ENGINE_LANE_COLOR_PIGMENT_TUNING",
        ],
        route: "/studio",
      },
      {
        feature: t("브러시 스튜디오 · 안료 비교 패널(제작 도구)", "Brush studio · pigment comparison panel (authoring tool)"),
        role: t(
          "RGB·분광 WGM·Mixbox 등 여러 혼색을 나란히 비교합니다. Mixbox 는 이 provider 한 곳에서만 import 되고 비상업으로 분류됩니다.",
          "Compares RGB, spectral WGM, Mixbox and others side by side. Mixbox is imported only in this provider and classified as non-commercial.",
        ),
        paths: [
          "apps/web/src/domains/creator/brush-lab/brush-studio-v6-pigment-provider.ts",
          "apps/web/src/domains/creator/brush-lab/brush-studio-v6-license-profile.ts",
          "third_party/mixbox/README.md",
          "THIRD_PARTY_NOTICES.md",
        ],
        route: "/studio/assets/brushes/new",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("3밴드 장난감으로 보는 분광 혼색", "Spectral mixing with a 3-band toy"),
        language: "ts",
        ...commentedCode(
          [
            "type Spectrum = readonly [short: number, mid: number, long: number];",
            "const blue: Spectrum = [0.8, 0.3, 0.05];",
            "const yellow: Spectrum = [0.05, 0.8, 0.9];",
            "",
            "// @0@",
            "const wgm = (a: Spectrum, b: Spectrum, w: number): Spectrum => [",
            "  a[0] ** w * b[0] ** (1 - w),",
            "  a[1] ** w * b[1] ** (1 - w),",
            "  a[2] ** w * b[2] ** (1 - w),",
            "];",
            "// @1@",
            "const lerp = (a: Spectrum, b: Spectrum, w: number): Spectrum => [",
            "  a[0] * w + b[0] * (1 - w),",
            "  a[1] * w + b[1] * (1 - w),",
            "  a[2] * w + b[2] * (1 - w),",
            "];",
            "",
            "console.log('WGM ', wgm(blue, yellow, 0.5).map((v) => v.toFixed(2))); // @2@",
            "console.log('lerp', lerp(blue, yellow, 0.5).map((v) => v.toFixed(2))); // @3@",
          ].join("\n"),
          [
            "가중 기하평균(WGM): 칸마다 a^w * b^(1-w) → 반사율이 곱해지는 감산 혼합",
            "선형 보간: 칸마다 평균 → 칸들이 고르게 섞여 회색빛",
            "[0.20, 0.49, 0.21] 가운데(초록) 칸이 두드러진다",
            "[0.43, 0.55, 0.48] 고르게 섞여 탁하다",
          ],
          [
            "weighted geometric mean (WGM): a^w * b^(1-w) per band -> reflectances multiply, a subtractive mix",
            "linear interpolation: the average per band -> bands even out into grayish",
            "[0.20, 0.49, 0.21] the middle (green) band stands out",
            "[0.43, 0.55, 0.48] evened out and muddy",
          ],
        ),
        explain: t(
          "제품은 10밴드이고 이 예제는 3밴드 장난감입니다. 같은 입력에서 곱셈 혼합은 가운데 밴드가 살아남고 평균은 밴드가 고르게 섞여 탁해집니다(Node 로 실행해 확인한 값).",
          "The product uses 10 bands; this toy uses 3. With the same input, multiplicative mixing keeps the middle band while averaging evens the bands out into mud (values checked by running it in Node).",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Mixbox — Secret Weapons", url: "https://scrtwpns.com/mixbox/", kind: "article", note: t("Mixbox 제작자의 설명 페이지", "The authors' explanation page") },
      { title: "Creative Commons · CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/", kind: "docs", note: t("Mixbox 의 라이선스 원문", "The license text that governs Mixbox") },
      { title: "libmypaint", url: "https://github.com/mypaint/libmypaint", kind: "repo", note: t("분광 혼색을 포팅해 온 원본(ISC)", "The ISC-licensed source of the ported spectral mixing") },
      { title: "libmypaint · helpers.c", url: "https://github.com/mypaint/libmypaint/blob/master/helpers.c", kind: "repo", note: t("Burns 의 가중 기하평균 방식을 구현한 원본 코드", "The original code implementing Burns' weighted-geometric-mean method") },
      { title: "Sochorová & Jamriška · Practical Pigment Mixing for Digital Painting (ACM TOG 2021)", url: "https://doi.org/10.1145/3478513.3480549", kind: "article", note: t("Mixbox 를 소개한 논문", "The paper that introduced Mixbox") },
      { title: "Wikipedia · Kubelka–Munk theory", url: "https://en.wikipedia.org/wiki/Kubelka%E2%80%93Munk_theory", kind: "article" },
    ],
    chapterIds: ["brush-engine", "licenses"],
    talk: {
      pitch: t(
        "RGB 는 빛을 더하는 방식이라 파랑과 노랑을 평균 내면 탁해집니다. 물감은 반사율이 곱해지는 방식이라 초록이 됩니다. 유화 붓은 libmypaint 의 10밴드 분광 혼색을 포팅해 이 느낌을 내고, 라이선스가 까다로운 Mixbox 는 제작 도구의 비교 기능 한 곳에만 격리했습니다.",
        "RGB adds light, so averaging blue and yellow turns muddy; paint multiplies reflectances, so it turns green. The oil brush ports libmypaint's 10-band spectral mixing for that feel, and Mixbox, with its demanding license, is isolated to one comparison feature in an authoring tool.",
      ),
      analogy: t(
        "색 셀로판 안경 두 개를 겹쳐 보는 것과 같습니다. 파란 안경과 노란 안경을 겹치면 둘 다 통과시키는 초록빛만 남습니다.",
        "It is like stacking two colored cellophane filters: a blue one and a yellow one together pass only the green light both allow through.",
      ),
      questions: [
        {
          question: t("Mixbox 를 쓰나요?", "Do you use Mixbox?"),
          answer: t(
            "제품 라이브 혼색은 libmypaint 포팅(ISC)입니다. Mixbox 는 브러시 스튜디오의 비교 provider 한 곳에서만 import 되고, 비상업으로 분류돼 허용형(permissive-only)·소스공개형 프로필 빌드에서는 거부됩니다.",
            "Live mixing in the product is the libmypaint port (ISC). Mixbox is imported in just one comparison provider of the brush studio and is classified non-commercial, so permissive-only and source-available profile builds reject it.",
          ),
        },
        {
          question: t("Mixbox 를 상업적으로 써도 되나요?", "Can Mixbox be used commercially?"),
          answer: t(
            "법률 판단은 이 카드의 범위 밖입니다. 저장소 문서는 상업·유료 배포나 상업 포크에서는 provider 를 제거하거나 별도 라이선스가 필요하다고 적고, 기본 프로필이 noncommercial-full 이므로 운영 배포 프로필을 배포 전에 확인하라고 둡니다.",
            "Legal judgment is outside this card. The repository states that commercial or paid distribution and commercial forks must remove the provider or obtain a separate license, and since the default profile is noncommercial-full, the production profile should be checked before release.",
          ),
        },
        {
          question: t("어느 렌더러에서든 색이 똑같나요?", "Is the color identical in every renderer?"),
          answer: t(
            "아닙니다. 자바스크립트 double 로 계산해 같은 엔진 안에서는 결정적이지만 C 의 float 과 비트가 같지는 않고, 렌더러(Canvas2D·GPU·WASM)마다 같은 색을 보장하지 않습니다.",
            "No. It is computed in JavaScript doubles, so it is deterministic within one engine but not bit-equal to C floats, and no renderer (Canvas2D, GPU, WASM) is guaranteed to give the same color.",
          ),
        },
      ],
      pitfall: t(
        "세미나 자료에서 Mixbox 나 spectral.js 를 라이브 혼색 도구처럼 앞세우면 사실과 다릅니다. 본문 수치는 요청 비율 0.5 기준이며 물감 50:50 이 아닙니다(알파 가중으로 스펙트럼 비율은 1:2). 실제 화면의 체감 색은 이 카드에서 확인하지 못했습니다.",
        "Presenting Mixbox or spectral.js as the live mixing tool contradicts the code. The figures here are for a requested ratio of 0.5, which is not a 50:50 paint mix (alpha weighting makes the spectral ratio 1:2). The perceived color on a real screen was not verified for this card.",
      ),
    },
    technologies: ["libmypaint", "Mixbox", "spectral.js"],
    facts: [
      { value: "10", label: t("분광 혼색의 밴드(반사율 칸) 수", "Number of spectral bands used for mixing"), source: SPECTRAL },
      { value: "(45,124,19) vs (126,122,67)", label: t("같은 요청(0.5)의 파랑(0,33,133)+노랑(252,211,0): 분광 혼색 vs 선형 보간 — 함수를 직접 실행한 값", "Blue (0,33,133) + yellow (252,211,0) at the same 0.5 request: spectral vs linear, from running the function directly"), source: SPECTRAL },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "material-physics-paper-tooth",
    category: "drawing",
    name: "Paper tooth model",
    title: t("종이의 '이빨'과 물감의 번짐: 입력과 문서 좌표에서만 정해지는 재료 물리", "Paper tooth and spreading paint: material physics fixed by input and document coordinates"),
    status: "live",
    tagline: t("필압이 종이 접촉면을 바꾸고, 번짐과 붓털도 같은 입력이면 같은 결과가 나옵니다.", "Pressure changes how the paper is touched, and bleeding and bristles also repeat for the same input."),
    background: [
      t(
        "같은 연필이라도 가볍게 그으면 종이의 볼록한 부분(이빨)만 긁혀 하얀 구멍이 많고, 세게 누르면 골짜기까지 채워집니다. 디지털 브러시의 질감은 보통 텍스처를 곱하는 정도지만, ToonStudio 는 종이를 높이 지도(height field)로 보고 '필압이 접촉 평면을 내린다'는 단순한 가정으로 이 차이를 만듭니다. 건식 매체는 봉우리에, 수채는 골짜기에, 유화는 캔버스 직조가 드러나는 쪽으로 반응합니다.",
        "With the same pencil, a light stroke scrapes only the raised parts of the paper (the tooth) and leaves many white pits, while a hard press fills the valleys too. Digital brush texture is often just a multiplied image, but ToonStudio treats paper as a height field and creates the difference with one simple assumption: pressure lowers a contact plane. Dry media land on the peaks, watercolor settles in the valleys, and oil lets the canvas weave show.",
      ),
      t(
        "종이 표면은 문서 좌표 (x, y, 시드)만의 함수라 줌이나 획 순서에 영향을 받지 않고, 반복 무늬가 보이지 않도록 황금비(0.618…)만큼 어긋나고 회전한 두 번째 조회를 0.38 의 가중치로 더합니다. 수채 가장자리 번짐(커피링), 종이 섬유를 따라 퍼지는 입자감, 유화 붓털(고정 8ms 스텝의 2D 시뮬레이션)도 '입력 + 시드 + 설정'의 순수 함수라, 재계획 카드와 같은 결정성을 지킵니다.",
        "The paper surface is a function of document coordinates (x, y, seed) only, so zoom and stroke order do not affect it, and a second lookup offset by the golden ratio (0.618...) and rotated is added with weight 0.38 to hide tiling. Watercolor edge bloom (coffee ring), grain that spreads along paper fibers, and oil bristles (a 2D simulation on a fixed 8 ms step) are also pure functions of input, seed and settings, keeping the determinism described in the replay card.",
      ),
      t(
        "재료 모델은 모두 키가 있는 옵트인 프로그램입니다. 종이 모델 contact-tooth-v2 는 새 획에만 붙고, 키 없는 옛 획은 옛 규칙(모든 매체가 골짜기에 쌓이고 128텍셀마다 반복)을 바이트 단위로 유지합니다. 수채 번짐은 붓 자국 단위의 결정적 후처리(가장자리 어두워짐·입자)로, Curtis 등의 수채 모델은 설계 참고일 뿐 얕은 물 방정식을 푸는 시뮬레이션이 아닙니다. 유화는 WetBrush 강모 시뮬레이션의 2D 축소판입니다. 다만 수묵 계열 붓(inkwash-pen 등)은 별도의 유체 워시 런타임(Stam 방식)을 씁니다.",
        "Every material model is a keyed, opt-in program. The paper model contact-tooth-v2 is attached to new strokes only, and keyless old strokes keep the old rule (all media pile into the valleys, with a 128-texel repeat) byte for byte. Watercolor bleeding is a deterministic per-dab post effect (edge darkening, grain); Curtis et al.'s watercolor model is a design reference, not a simulation that solves shallow-water equations. Oil is a 2D reduction of WetBrush's bristle simulation. Ink-wash brushes (such as inkwash-pen), however, use a separate fluid wash runtime (Stam-style).",
      ),
      t(
        "한계: 완전한 유체 시뮬레이션(Living Ink)은 비용이 커서 긴 웹툰 캔버스에서 품질 하한을 지키지 못해, 새 물리 획은 지금 꺼져 있습니다(STUDIO_LIVING_INK_NEW_PHYSICAL_STROKES_ENABLED 가 false). 12개 표면과 48개 시그니처 레시피를 담은 V7 표면 라이브러리는 브러시 스튜디오(제작 도구)용입니다.",
        "A limit: full fluid simulation (Living Ink) is too costly to hold its quality floor on long webtoon canvases, so new physical strokes are currently off (STUDIO_LIVING_INK_NEW_PHYSICAL_STROKES_ENABLED is false). The V7 surface library, with 12 surfaces and 48 signature recipes, is for the brush studio, an authoring tool.",
      ),
    ],
    keyPoints: [
      t("필압이 접촉 평면을 내린다: 가볍게=봉우리, 세게=골짜기", "Pressure lowers a contact plane: light hits peaks, hard fills valleys"),
      t("종이·번짐·붓털은 입력+시드+설정의 순수 함수", "Paper, bleeding and bristles are pure functions of input"),
      t("전면 유체 시뮬레이션(Living Ink)은 새 획에서 꺼져 있음", "Full fluid simulation (Living Ink) is off for new strokes"),
    ],
    diagram: {
      id: "material-physics-paper-tooth-diagram",
      kind: "graph",
      title: t("필압과 종이가 만나는 곳", "Where pressure meets paper"),
      caption: t("필압이 접촉 평면의 높이를 정하고, 매체마다 안료가 앉는 자리가 달라집니다.", "Pressure sets the contact plane's height, and each medium deposits pigment in a different place."),
      alt: t(
        "필압 입력과 문서 좌표만으로 정해지는 종이 높이장이 접촉 평면에서 만납니다. 그 결과가 매체 극성에서 갈라져, 건식은 봉우리에 안착하고 수채는 골짜기에 고이며 유화는 캔버스 직조가 드러나고, 모두 붓 자국의 농도로 모입니다.",
        "Pressure input and a paper height field, set only by document coordinates, meet at a contact plane. The result splits by medium polarity: dry media land on peaks, watercolor settles in valleys and oil reveals the canvas weave, and all merge into the density of the mark.",
      ),
      nodes: [
        { id: "pressure", label: t("필압 입력", "Pen pressure"), sub: t("0 ~ 1", "0 to 1"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "paper", label: t("종이 높이장", "Paper height field"), sub: t("(x, y, 시드)만의 함수", "A function of (x, y, seed)"), tone: "local", at: [1, 0] },
        { id: "plane", label: t("접촉 평면", "Contact plane"), sub: t("필압↑ → 평면↓", "More pressure, lower plane"), tone: "local", at: [1, 1] },
        { id: "medium", label: t("매체 극성", "Medium"), sub: t("건식·수채·유화", "Dry, wet, oil"), tone: "neutral", shape: "diamond", at: [2, 1] },
        { id: "dry", label: t("건식: 봉우리", "Dry: peaks"), sub: t("연필·목탄·파스텔", "Pencil, charcoal, pastel"), tone: "good", at: [3, 0] },
        { id: "wet", label: t("수채: 골짜기", "Wet: valleys"), sub: t("물이 안료를 나름", "Water carries pigment"), tone: "good", at: [3, 1] },
        { id: "oil", label: t("유화: 직조", "Oil: weave"), sub: t("캔버스 결이 드러남", "Canvas weave shows"), tone: "good", at: [3, 2] },
        { id: "mark", label: t("붓 자국 농도", "Mark density"), tone: "good", shape: "pill", at: [4, 1] },
      ],
      edges: [
        { from: "pressure", to: "plane" },
        { from: "paper", to: "plane", label: t("높이", "height") },
        { from: "plane", to: "medium" },
        { from: "medium", to: "dry" },
        { from: "medium", to: "wet" },
        { from: "medium", to: "oil" },
        { from: "dry", to: "mark" },
        { from: "wet", to: "mark" },
        { from: "oil", to: "mark" },
      ],
    },
    usage: [
      {
        feature: t("연필·목탄·수채 · 종이 질감 반응", "Pencil, charcoal, watercolor · paper texture response"),
        role: t(
          "획 시작 때 paperModel 키(contact-tooth-v2)를 붙이고, 필압과 문서 좌표 높이장으로 안료가 앉는 자리를 정합니다.",
          "Stamps the paperModel key (contact-tooth-v2) at stroke start and decides where pigment lands from pressure and the document-coordinate height field.",
        ),
        paths: [
          "apps/web/src/domains/creator/brush/studio-paper-substrate-model.ts",
          "apps/web/src/domains/creator/studio-element-model.ts#DrawEl",
        ],
        route: "/studio",
      },
      {
        feature: t("건식 매체 입자(연필·목탄·파스텔)", "Dry-media grain (pencil, charcoal, pastel)"),
        role: t(
          "접두 안정 이방성 입자 커널이 스트리밍 청크 경계와 상관없이 바이트 단위로 같은 입자를 만듭니다.",
          "A prefix-stable anisotropic grain kernel produces byte-identical grain regardless of streaming chunk boundaries.",
        ),
        paths: ["apps/web/src/domains/creator/brush/studio-dry-media-anisotropic-grain-v1.ts"],
        route: "/studio",
      },
      {
        feature: t("수채 가장자리 번짐", "Watercolor edge bloom"),
        role: t(
          "획 가장자리에 커피링처럼 진해지는 띠와 입자감을 붓 자국 단위의 순수 함수로 더합니다.",
          "Adds a coffee-ring style darker rim and grain at stroke edges as a pure per-dab function.",
        ),
        paths: ["apps/web/src/domains/creator/brush/studio-wet-edge-bloom-v1.ts"],
        route: "/studio",
      },
      {
        feature: t("유화 붓털", "Oil bristles"),
        role: t(
          "2D 로 줄인 강모 시뮬레이션을 8ms 고정 스텝으로 돌려, 붓이 퍼지고 갈라지고 마르는 모양을 리본에 곱합니다.",
          "Runs a reduced 2D bristle simulation on a fixed 8 ms step and multiplies the ribbon by how bristles spread, split and run dry.",
        ),
        paths: [
          "apps/web/src/domains/creator/brush/studio-bristle-physics-oil-v1.ts",
          "apps/web/src/domains/creator/brush/studio-oil-ribbon-carrier.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("필압이 접촉 평면을 내리는 종이 이빨", "Paper tooth where pressure lowers the contact plane"),
        language: "ts",
        ...commentedCode(
          [
            "// @0@",
            "const height = (u: number, v: number): number =>",
            "  0.5 + 0.5 * Math.sin(u * 12.9898 + v * 78.233) * Math.sin(v * 5.1 - u * 3.7);",
            "",
            "// @1@",
            "function dryCoverage(u: number, v: number, pressure: number): number {",
            "  const plane = 1 - pressure;",
            "  return Math.min(1, Math.max(0, (height(u, v) - plane) * 4 + 0.5));",
            "}",
            "",
            "function meanCoverage(pressure: number): string {",
            "  let sum = 0;",
            "  for (let i = 0; i < 64; i++) {",
            "    for (let j = 0; j < 64; j++) sum += dryCoverage(i / 8, j / 8, pressure);",
            "  }",
            "  return (sum / (64 * 64)).toFixed(2);",
            "}",
            "console.log('light', meanCoverage(0.2), 'heavy', meanCoverage(0.9)); // @2@",
          ].join("\n"),
          [
            "종이 높이: 문서 좌표 (u, v) 만의 함수 → 줌이나 획 순서와 무관 (0..1)",
            "필압↑ → 접촉 평면↓: 가벼우면 봉우리만, 세게 누르면 골짜기까지 안료가 닿는다",
            "light 0.15, heavy 0.93 — 세게 누를수록 더 많이 채워진다",
          ],
          [
            "paper height: a function of document coordinates (u, v) only, so zoom and stroke order do not matter (0..1)",
            "more pressure lowers the plane: a light touch reaches only the peaks, a hard press reaches the valleys too",
            "light 0.15, heavy 0.93 - the harder the press, the more it fills",
          ],
        ),
        explain: t(
          "제품의 contact-tooth-v2 를 아주 줄인 장난감입니다. 높이 함수와 계수는 임의로 정한 값이고, '필압이 평면을 내린다'는 생각만 같습니다(Node 로 실행한 값).",
          "A very small toy of the product's contact-tooth-v2. The height function and coefficients are arbitrary; only the idea that pressure lowers the plane is shared (values from running it in Node).",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Curtis et al. · Computer-Generated Watercolor (SIGGRAPH 1997)", url: "https://doi.org/10.1145/258734.258896", kind: "article", note: t("수채 모델의 고전 논문(입자 침착·가장자리 어두워짐 설계 참고)", "The classic watercolor paper (design reference for granulation and edge darkening)") },
      { title: "Chen et al. · WetBrush (ACM TOG 2015)", url: "https://doi.org/10.1145/2816795.2818066", kind: "article", note: t("강모 단위 유화 시뮬레이션", "Bristle-level oil painting simulation") },
      { title: "GPU Gems · Fast Fluid Dynamics Simulation on the GPU", url: "https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu", kind: "guide", note: t("Living Ink 같은 유체 방식의 배경", "Background for fluid approaches such as Living Ink") },
    ],
    chapterIds: ["brush-engine"],
    talk: {
      pitch: t(
        "같은 연필도 가볍게 그으면 종이의 봉우리만 긁히고 세게 누르면 골짜기까지 채워집니다. 우리는 필압이 접촉 평면을 내린다는 단순한 가정으로 그 차이를 만들고, 종이 표면은 문서 좌표만의 함수라서 줌을 해도 결과가 같습니다.",
        "The same pencil scrapes only the paper's peaks when light and fills the valleys when pressed hard. We create that difference with one simple assumption, that pressure lowers a contact plane, and because the paper is a function of document coordinates alone, zooming does not change the result.",
      ),
      analogy: t(
        "울퉁불퉁한 사포 위에 손바닥을 얹는 것과 같습니다. 살짝 얹으면 볼록한 알갱이에만 닿고, 힘주어 누르면 오목한 곳까지 닿습니다.",
        "It is like resting a palm on rough sandpaper: a light touch reaches only the raised grains, while pressing hard reaches the dips as well.",
      ),
      questions: [
        {
          question: t("수채가 진짜 물 시뮬레이션인가요?", "Is watercolor a real water simulation?"),
          answer: t(
            "아닙니다. 수채 가장자리 번짐은 붓 자국 단위의 결정적 후처리(커피링·입자·색 번짐)입니다. 전면 유체 시뮬레이션인 Living Ink 는 새 획에서 현재 꺼져 있고, 기존 문서의 Living Ink 레이어만 읽기 전용으로 남습니다. 다만 수묵 계열 붓(inkwash-pen·inkwash-water-brush 등)은 별도의 유체 워시 런타임(Stam 방식)을 씁니다.",
            "No. Watercolor edge bleeding is a deterministic per-dab post effect (coffee ring, grain, color bleed). Living Ink, the full fluid simulation, is currently off for new strokes, and only existing Living Ink layers in old documents remain read-only. Ink-wash brushes (inkwash-pen, inkwash-water-brush and others), however, use a separate fluid wash runtime (Stam-style).",
          ),
        },
        {
          question: t("다른 앱의 코드를 가져왔나요?", "Was code copied from other apps?"),
          answer: t(
            "수채 번짐 모듈의 주석은 LICENSE 가 없는 참조의 코드를 복사하지 않고 매개변수만 참고한 clean-room 방식이라고 밝힙니다. 법적 검토는 이 카드의 범위 밖입니다.",
            "The watercolor module's comments say it follows a clean-room, parameters-only approach for references without a license rather than copying their code. Legal review is outside this card.",
          ),
        },
        {
          question: t("앱에서 직접 확인하려면요?", "How can I see it in the app?"),
          answer: t(
            "같은 연필로 가볍게 그은 선과 세게 누른 선을 나란히 그어 보세요. 정확한 설정 메뉴 이름은 이 카드에서 확인하지 못했습니다.",
            "Draw a light line and a hard-pressed line side by side with the same pencil. The exact settings menu name was not verified for this card.",
          ),
        },
      ],
      pitfall: t(
        "'물리 시뮬레이션'이라고 크게 말하지 마세요. 접촉 평면, 번짐, 붓털은 단순화한 모델이고 Living Ink 는 꺼져 있습니다. 반대로 수묵 계열 붓은 유체 워시 런타임을 쓰므로 '유체 계산이 전혀 없다'고도 말하지 마세요. V7 표면 라이브러리의 처리량 수치는 문서에만 있고 현재 빌드에서 재측정한 값을 확인하지 못해 인용하지 않았습니다.",
        "Do not call it a 'physics simulation' loudly. The contact plane, bleeding and bristles are simplified models and Living Ink is off. Conversely, ink-wash brushes use a fluid wash runtime, so do not say there is no fluid computation at all either. Throughput figures for the V7 surface library exist only in a document and were not re-measured on the current build, so they are not quoted.",
      ),
    },
    technologies: ["Canvas2D", "Height field", "WetBrush"],
    facts: [
      { value: "contact-tooth-v2", label: t("새 획에 붙는 종이 모델 키", "Paper-model key attached to new strokes"), source: "apps/web/src/domains/creator/brush/studio-paper-substrate-model.ts" },
      { value: "8 ms", label: t("유화 붓털 시뮬레이션의 고정 스텝", "Fixed step of the oil bristle simulation"), source: "apps/web/src/domains/creator/brush/studio-bristle-physics-oil-v1.ts" },
      { value: "1.35 · 0.55", label: t("수채 가장자리 번짐 기본값(가장자리 어둡기 · 입자감)", "Watercolor edge-bloom defaults (edge darkening, granulation)"), source: "apps/web/src/domains/creator/brush/studio-wet-edge-bloom-v1.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "layer-compositing-blend-flatten",
    category: "drawing",
    name: "Blend isolation",
    title: t("스탬프마다 블렌드하면 검정으로 무너진다: 한 장으로 굽고 한 번만 합성하기", "Per-stamp blending collapses to black: flatten first, blend once"),
    status: "live",
    tagline: t("혼합 모드는 획 전체를 비트맵 한 장으로 굽고 나서 딱 한 번만 적용합니다.", "A blend mode is applied exactly once, after the whole stroke is flattened into one bitmap."),
    background: [
      t(
        "'곱하기' 같은 혼합 모드는 '아래 픽셀과 위 픽셀을 어떻게 섞을지' 정한 수식입니다. 그런데 자유곡선 한 획은 수십 개의 붓 자국(스탬프)으로 그려지고, Konva 그룹에 혼합 모드를 걸면 그룹이 하나로 합성되는 대신 자식 하나하나가 따로 합성됩니다. 같은 수식을 수십 번 겹쳐 쓰는 셈입니다.",
        "A blend mode such as multiply is a formula for how to combine the pixel below with the pixel above. But a freehand stroke is drawn as dozens of stamps, and when a blend mode is set on a Konva group, the group is not composited as one: each child is composited separately. The same formula is applied dozens of times over.",
      ),
      t(
        "그러면 대부분의 모드가 반복 적용의 고정점으로 무너집니다. 코드 주석의 실측은 곱하기가 검정, 제외가 정확히 127, 색상 번이 검정입니다. 어둡게·밝게만 멀쩡했던 이유는 두 모드가 반복해도 결과가 변하지 않는 성질(멱등)을 갖기 때문입니다. 해법은 그룹을 cache() 해서 자식을 먼저 오프스크린 캔버스에 그리게 하는 것입니다. 캐시된 노드는 비트맵 한 장으로 그려지므로 합성이 획 전체에 정확히 한 번 적용됩니다.",
        "Most modes then collapse to the fixed point of repeated application. The measurements in code comments are black for multiply, exactly 127 for exclusion and black for color burn. Only darken and lighten looked right because they are idempotent: repeating them changes nothing. The fix is to cache() the group so children are first drawn to an offscreen canvas; a cached node is drawn as one bitmap, so the blend is applied exactly once to the whole stroke.",
      ),
      t(
        "클리핑 마스크 쪽(ClipMaskGroup)은 배치가 반대입니다. 거기서는 합성(source-in)이 자식에 붙고 캐시는 그 합성을 그룹 안에 가두는 역할이며, 블렌드 격리 그룹에서는 합성이 캐시된 그룹 자신에 붙어 평탄화된 결과가 아래 레이어와 섞입니다. 셰이더로 직접 블렌드하는 길은 WebGPU 타일 합성기가 따로 있지만, 문서 표시 권위는 지금 Konva 와 Skia 섬입니다.",
        "The clipping-mask side (ClipMaskGroup) is arranged the other way around: there the composite (source-in) is on the children and the cache traps it inside the group, whereas in the blend-isolation group the composite sits on the cached group itself so the flattened result mixes with the layers below. Blending directly in a shader is possible through a separate WebGPU tile compositor, but document display authority currently belongs to Konva and the Skia island.",
      ),
      t(
        "한계: 캐시 비트맵은 메모리를 쓰고 큰 레이어는 비싸며, 이미지가 늦게 로드되면 그룹 크기가 0 이라 캐시가 실패할 수 있어 120·350·700·1200ms 에 다시 시도합니다. 끝내 캐시하지 못하면 예전의 스탬프별 블렌드로 돌아가는데, 획이 사라지는 것보다는 낫다는 판단이 코드 주석에 적혀 있습니다.",
        "Limits: the cached bitmap uses memory, large layers are expensive, and if an image loads late the group has zero size and caching can fail, so it retries at 120, 350, 700 and 1200 ms. If caching never succeeds it reverts to per-stamp blending, which a code comment judges better than the stroke disappearing.",
      ),
    ],
    keyPoints: [
      t("그룹에 모드를 걸면 자식마다 합성돼 곱하기가 검정으로 붕괴", "A group-level mode composites each child; multiply collapses to black"),
      t("cache() 로 비트맵 한 장을 만들어 한 번만 합성", "cache() makes one bitmap, so the blend runs once"),
      t("어둡게·밝게만 멀쩡했던 이유는 멱등성", "Only darken and lighten survived because they are idempotent"),
    ],
    diagram: {
      id: "layer-compositing-blend-flatten-diagram",
      kind: "graph",
      title: t("같은 획, 두 가지 합성 순서", "The same stroke, two compositing orders"),
      caption: t("스탬프마다 합성하면 무너지고, 먼저 한 장으로 굽고 합성하면 이론값이 나옵니다.", "Blending per stamp collapses; flattening first and blending once gives the theoretical value."),
      alt: t(
        "획 하나가 스탬프 수십 개로 이루어져 있습니다. 위 경로는 스탬프마다 같은 혼합 모드를 겹쳐 적용해 검정으로 무너집니다. 아래 경로는 cache() 로 비트맵 한 장으로 평탄화한 뒤 아래 레이어와 한 번만 합성해 이론값 그대로의 결과를 얻습니다.",
        "One stroke consists of dozens of stamps. The upper path applies the same blend mode to each stamp repeatedly and collapses to black. The lower path flattens the stamps into one bitmap with cache() and blends it with the layer below just once, getting the theoretical result.",
      ),
      nodes: [
        { id: "stamps", label: t("획 하나", "One stroke"), sub: t("스탬프 수십 개", "Dozens of stamps"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "wrong", label: t("스탬프마다 합성", "Blend per stamp"), sub: t("같은 모드를 30번 반복", "Same mode, 30 times"), tone: "warn", at: [1, 0] },
        { id: "crash", label: t("고정점으로 붕괴", "Collapses"), sub: t("곱하기=검정 · 제외=127", "Multiply=black, exclusion=127"), tone: "warn", shape: "pill", at: [2, 0] },
        { id: "cache", label: t("cache()", "cache()"), sub: t("자식을 오프스크린에 먼저", "Children go offscreen first"), tone: "good", at: [1, 2] },
        { id: "flat", label: t("비트맵 한 장", "One bitmap"), sub: t("평탄화된 획", "The flattened stroke"), tone: "good", at: [2, 2] },
        { id: "once", label: t("한 번만 합성", "Blend once"), sub: t("아래 레이어와 섞임", "Mixes with layers below"), tone: "good", at: [3, 2] },
        { id: "right", label: t("이론값 그대로", "Theoretical value"), sub: t("곱하기 0.8×0.5=0.4", "Multiply 0.8 x 0.5 = 0.4"), tone: "good", shape: "pill", at: [4, 2] },
      ],
      edges: [
        { from: "stamps", to: "wrong", style: "dashed", label: t("잘못된 순서", "wrong") },
        { from: "wrong", to: "crash" },
        { from: "stamps", to: "cache", label: t("올바른 순서", "right") },
        { from: "cache", to: "flat" },
        { from: "flat", to: "once" },
        { from: "once", to: "right" },
      ],
    },
    usage: [
      {
        feature: t("레이어·요소 인스펙터 · 혼합 모드 16종", "Layer and element inspector · 16 blend modes"),
        role: t(
          "보통·곱하기·스크린·오버레이 등 16종을 고르면 요소 전체를 한 장으로 평탄화한 뒤 한 번만 합성합니다.",
          "Choosing one of 16 modes such as normal, multiply, screen or overlay flattens the whole element into one bitmap and blends it once.",
        ),
        paths: [
          "apps/web/src/domains/creator/BlendIsolationGroup.tsx",
          "apps/web/src/domains/creator/canvas/StudioCanvasViewportDocumentLayer.tsx",
          "apps/web/src/domains/creator/StudioInspectorSelectionSection.tsx",
        ],
        route: "/studio",
      },
      {
        feature: t("클리핑 마스크 · 레이어 마스크", "Clipping mask and layer mask"),
        role: t(
          "source-in 합성을 캐시된 그룹 안에 가두어 마스크의 알파로 정확히 잘라냅니다.",
          "Traps the source-in composite inside a cached group so content is cut exactly by the mask's alpha.",
        ),
        paths: ["apps/web/src/domains/creator/ClipMaskGroup.tsx"],
        route: "/studio",
      },
      {
        feature: t("조정 레이어(레벨·곡선 등)", "Adjustment layers (levels, curves, ...)"),
        role: t(
          "조정 레이어는 CPU 에서 W3C 합성 수식(분리형 모드와 색조·채도 같은 비분리형 모드)을 직접 계산합니다.",
          "Adjustment layers compute the W3C compositing formulas (separable modes and non-separable ones such as hue and saturation) directly on the CPU.",
        ),
        paths: ["apps/web/src/domains/creator/studio-adjustment-layer-runtime.ts"],
        route: "/studio",
      },
      {
        feature: t("내보내기 · PSD·SVG·OpenRaster", "Export · PSD, SVG, OpenRaster"),
        role: t(
          "같은 혼합 모드를 외부 포맷의 이름으로 바꿔 보존합니다(예: color-dodge 를 PSD 의 'color dodge' 로).",
          "Keeps the same blend mode under each external format's name (for example color-dodge becomes 'color dodge' in PSD).",
        ),
        paths: [
          "apps/web/src/domains/creator/export/studio-psd-export.ts",
          "apps/web/src/domains/creator/export/studio-svg-export-elements.ts",
          "apps/web/src/domains/creator/studio-openraster-interchange.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("30번 겹쳐 합성하면 무너지는 이유", "Why 30 stacked blends collapse"),
        language: "ts",
        ...commentedCode(
          [
            "const multiply = (base: number, src: number): number => base * src;",
            "const exclusion = (base: number, src: number): number => base + src - 2 * base * src;",
            "",
            "// @0@",
            "let m = 0.8;",
            "let x = 0.8;",
            "for (let i = 0; i < 30; i++) {",
            "  m = multiply(m, 0.5);",
            "  x = exclusion(x, 0.5);",
            "}",
            "console.log('stamp-by-stamp multiply:', m.toExponential(1), 'exclusion:', x); // @1@",
            "",
            "// @2@",
            "console.log('flatten-then-blend multiply:', multiply(0.8, 0.5)); // @3@",
          ].join("\n"),
          [
            "한 획 = 스탬프 30개. 블렌드를 스탬프마다 적용하면 같은 연산이 30번 겹쳐 고정점으로 붕괴한다.",
            "곱하기 ≈ 0(검정), 제외 = 0.5(회색)",
            "스탬프를 먼저 한 장의 비트맵으로 평탄화한 뒤 블렌드를 한 번만 적용하면 이론값이 나온다.",
            "0.4",
          ],
          [
            "One stroke = 30 stamps. Blending per stamp stacks the same operation 30 times and collapses to a fixed point.",
            "multiply is about 0 (black), exclusion is 0.5 (gray)",
            "Flatten the stamps into one bitmap first and blend once to get the theoretical value.",
            "0.4",
          ],
        ),
        explain: t(
          "곱하기에 0.5 를 30번 곱하면 7.5e-10 으로 사실상 검정이 되고, 제외는 0.5 로 수렴합니다. 반면 먼저 한 장으로 합친 뒤 한 번 곱하면 0.4 입니다. 화면 캡처가 아니라 수식 계산입니다.",
          "Multiplying by 0.5 thirty times gives 7.5e-10, effectively black, and exclusion converges to 0.5, whereas blending once after flattening gives 0.4. This is a formula calculation, not a screen capture.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "W3C · Compositing and Blending Level 1", url: "https://www.w3.org/TR/compositing-1/", kind: "spec", note: t("블렌드 모드 수식의 표준 정의", "The standard definition of blend-mode formulas") },
      { title: "MDN · globalCompositeOperation", url: "https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation", kind: "docs" },
      { title: "MDN · isolation", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/isolation", kind: "docs", note: t("합성 격리 그룹의 CSS 판", "The CSS version of an isolated group") },
      { title: "Konva · Shape caching", url: "https://konvajs.org/docs/performance/Shape_Caching.html", kind: "docs" },
    ],
    chapterIds: ["brush-engine", "troubleshooting-evidence"],
    talk: {
      pitch: t(
        "곱하기 같은 혼합 모드를 굵은 브러시 획에 걸었더니 이론값이 아니라 검정이 나왔습니다. 한 획이 수십 개의 스탬프라 같은 수식이 수십 번 겹쳐졌기 때문입니다. 그룹을 비트맵 한 장으로 굽고 한 번만 합성하도록 고쳤습니다.",
        "Applying a blend mode like multiply to a thick brush stroke gave black instead of the theoretical value, because a stroke is dozens of stamps and the same formula was stacked dozens of times. We fixed it by flattening the group into one bitmap and blending once.",
      ),
      analogy: t(
        "색 셀로판지를 한 장씩 따로 덧대는 대신, 먼저 한 장으로 합쳐 붙인 뒤 한 번만 덧대는 것과 같습니다. 30장을 따로 덧대면 점점 어두워집니다.",
        "It is like gluing cellophane sheets into one sheet first and applying it once, instead of laying 30 sheets on separately, which keeps getting darker.",
      ),
      questions: [
        {
          question: t("왜 어둡게·밝게만 멀쩡했나요?", "Why did only darken and lighten look fine?"),
          answer: t(
            "두 모드는 같은 값을 여러 번 적용해도 결과가 바뀌지 않는 멱등 연산이라서입니다(코드 주석 설명). 청중에게 먼저 물어보면 좋은 질문입니다.",
            "They are idempotent: applying them repeatedly with the same value changes nothing (as the code comment explains). It is a good question to put to the audience first.",
          ),
        },
        {
          question: t("GPU 로 하면 이런 문제가 없나요?", "Doesn't doing it on the GPU avoid this?"),
          answer: t(
            "WebGPU 타일 합성기가 따로 있지만 문서 표시 권위는 Konva 와 Skia 섬입니다. 어느 엔진이든 혼합 모드를 적용할 격리 단위를 먼저 정해야 한다는 점은 같습니다.",
            "A separate WebGPU tile compositor exists, but document display authority is Konva and the Skia island. Whatever the engine, you must first decide the isolation unit to which a blend mode applies.",
          ),
        },
        {
          question: t("비용은 없나요?", "Is there a cost?"),
          answer: t(
            "캐시 비트맵 메모리와 다시 굽는 비용이 듭니다. 큰 레이어는 비싸고, 늦게 로드되는 이미지는 재시도 타이머로 따라잡습니다.",
            "The cached bitmap takes memory and re-baking takes time. Large layers are costly, and late-loading images are caught up with retry timers.",
          ),
        },
      ],
      pitfall: t(
        "'곱하기가 검정이 됐다'는 값은 코드 주석에 적힌 실측이고, 이 카드가 브라우저에서 재현한 것이 아닙니다. 샘플은 수식 계산이며 화면 캡처가 아닙니다. 캐시 비용의 실제 크기는 확인하지 못했습니다.",
        "The 'multiply turned black' figures are measurements recorded in a code comment, not something this card reproduced in a browser. The sample is a formula calculation, not a screen capture. The real size of the cache cost was not measured.",
      ),
    },
    technologies: ["Konva", "Canvas2D", "WebGPU"],
    facts: [
      { value: "16", label: t("인스펙터가 제공하는 혼합 모드 수", "Blend modes offered by the inspector"), source: "apps/web/src/domains/creator/StudioInspectorSelectionSection.tsx" },
      { value: "120 · 350 · 700 · 1200 ms", label: t("늦게 로드된 이미지를 따라잡는 재캐시 시점", "Re-cache times that catch up with late-loading images"), source: "apps/web/src/domains/creator/BlendIsolationGroup.tsx" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "gpu-filter-lut-bit-identical",
    category: "drawing",
    name: "GPU filter LUT",
    title: t("256칸 표는 CPU 가 굽고 GPU 는 찾아보기만: 보정 결과를 비트까지 똑같이", "A 256-entry table baked on the CPU, only looked up on the GPU"),
    status: "live",
    tagline: t("밝기·레벨·커브는 CPU 가 만든 표를 GPU 가 조회만 해서 결과가 비트까지 같습니다.", "Brightness, levels and curves use a CPU-made table the GPU only reads, giving bit-identical results."),
    background: [
      t(
        "이미지 보정(밝기/대비·레벨·톤 커브·색조/채도·컬러 밸런스)은 모든 픽셀에 같은 계산을 하는 일이라 GPU 에 잘 맞습니다. 다만 GPU 와 CPU 의 계산 결과가 미묘하게 다르면 같은 작품이 기기마다 다르게 보이고, 미리보기와 저장 결과가 어긋납니다. 그래서 '빠르게'만큼 '똑같이'가 중요한 설계 조건입니다.",
        "Image adjustments (brightness/contrast, levels, tone curves, hue/saturation, color balance) do the same math on every pixel, which suits the GPU well. But if GPU and CPU results differ subtly, one artwork looks different per device and the preview disagrees with the saved result. So being identical matters as much as being fast.",
      ),
      t(
        "밝기·대비·레벨·커브는 모두 '0~255 바이트 입력 → 0~255 바이트 출력'인 1차원 함수입니다. 그래서 CPU 가 정확한 256칸 표(LUT, 찾아보기 표)를 R·G·B 채널별로 구워(768칸) GPU 에 올리면, GPU 는 dst = lut[src] 라는 정수 조회만 합니다. 조회에는 반올림 오차가 끼어들 틈이 없어 CPU 결과와 비트 단위로 같습니다. 레벨과 커브는 CPU 엔진의 표 만드는 함수를 그대로 호출합니다.",
        "Brightness, contrast, levels and curves are all one-dimensional functions from a 0-255 byte to a 0-255 byte. So the CPU bakes exact 256-entry tables (LUTs) per R, G and B channel (768 entries) and uploads them, and the GPU only does an integer lookup, dst = lut[src]. A lookup leaves no room for rounding error, so it is bit-identical to the CPU. Levels and curves call the CPU engine's own table builders as they are.",
      ),
      t(
        "표로 만들 수 없는 색조/채도와 컬러 밸런스는 계수를 CPU 와 같은 64비트 수식으로 먼저 계산해 uniform 에 싣고, 픽셀별 나머지 연산만 GPU(f32)에서 하므로 반올림 경계에서 ±1 정도 차이가 날 수 있다고 코드 주석이 밝힙니다. '비트 동일 구간'과 '±1 허용 구간'의 경계를 정직하게 말하는 것이 신뢰 포인트입니다.",
        "Hue/saturation and color balance cannot be a table, so their coefficients are computed in advance with the same 64-bit formulas as the CPU and loaded into a uniform, and only the per-pixel remainder runs on the GPU in f32, so the code comment says results can differ by about 1 at rounding boundaries. Stating the boundary between the bit-identical part and the plus-or-minus-1 part honestly is what builds trust.",
      ),
      t(
        "필터 계획은 작업마다 provider 를 하나만 고릅니다(지원하는 5가지 필드 체인이면 WebGPU, 아니면 전용 Worker). 실패해도 다른 provider 로 다시 실행하지 않고 마지막으로 보인 프레임을 유지하며, 슬라이더를 끄는 동안에는 GPU→CPU 읽기가 없고 값이 멈춘 뒤(정착)나 내보낼 때 확정 결과를 한 번만 읽습니다. 지금 CPU/GPU 속도 비교 수치는 이 카드에 없습니다.",
        "Filter planning picks exactly one provider per job (WebGPU for a supported chain of the five adjustment fields, otherwise the dedicated Worker). On failure it does not rerun on another provider and keeps the last presented frame; while a slider is being dragged there is no GPU-to-CPU readback, and the final result is read back only once, after the value settles or at export. This card has no CPU-versus-GPU speed figures.",
      ),
    ],
    keyPoints: [
      t("표(LUT)는 CPU 가 굽고 GPU 는 조회만: 비트 동일", "CPU bakes the table, GPU only looks up: bit-identical"),
      t("색조·컬러 밸런스는 반올림 경계에서 ±1 가능", "Hue and color balance may differ by 1 at rounding edges"),
      t("필터 계획은 작업마다 provider 하나만 선택", "Filter planning picks one provider per job"),
    ],
    diagram: {
      id: "gpu-filter-lut-bit-identical-diagram",
      kind: "graph",
      title: t("표 기반 경로와 공식 기반 경로", "Table-based and formula-based paths"),
      caption: t("표 기반 보정은 CPU 와 비트 동일, 공식 기반 보정은 ±1 을 허용합니다.", "Table-based adjustments are bit-identical to the CPU; formula-based ones allow plus or minus 1."),
      alt: t(
        "보정 값이 두 갈래로 나뉩니다. 밝기·대비·레벨·커브는 CPU 가 256칸 표로 구워 GPU 에서 조회만 하므로 비트 동일합니다. 색조·컬러 밸런스는 CPU 가 계수를 미리 계산해 uniform 으로 넘기고 GPU 가 f32 행렬 곱을 해서 반올림 경계에서 ±1 차이가 날 수 있습니다.",
        "The adjustment values split in two. Brightness, contrast, levels and curves are baked by the CPU into 256-entry tables that the GPU only looks up, so they are bit-identical. For hue and color balance the CPU precomputes coefficients into a uniform and the GPU does an f32 matrix multiply, which can differ by 1 at rounding boundaries.",
      ),
      nodes: [
        { id: "params", label: t("보정 값", "Adjustment values"), sub: t("밝기·레벨·커브·색조…", "Brightness, levels, hue..."), tone: "local", shape: "pill", at: [0, 1] },
        { id: "lut", label: t("256칸 표 굽기", "Bake 256-entry LUT"), sub: t("CPU · R/G/B 768칸", "CPU, 768 entries"), tone: "local", at: [1, 0] },
        { id: "coef", label: t("계수 미리 계산", "Precompute coefficients"), sub: t("CPU · 64비트 수식", "CPU, 64-bit math"), tone: "local", at: [1, 2] },
        { id: "gpuLut", label: t("표 조회", "Table lookup"), sub: t("dst = lut[src] · 비트 동일", "dst = lut[src], bit-identical"), tone: "good", at: [3, 0] },
        { id: "gpuMat", label: t("행렬 곱", "Matrix multiply"), sub: t("GPU f32 · 반올림 ±1", "GPU f32, +/-1 rounding"), tone: "warn", at: [3, 2] },
        { id: "out", label: t("보정된 픽셀", "Adjusted pixels"), tone: "good", shape: "pill", at: [4, 1] },
      ],
      edges: [
        { from: "params", to: "lut", label: t("밝기·레벨·커브", "tone maps") },
        { from: "params", to: "coef", label: t("색조·밸런스", "hue, balance") },
        { from: "lut", to: "gpuLut", label: t("업로드", "upload") },
        { from: "coef", to: "gpuMat", label: t("uniform", "uniform") },
        { from: "gpuLut", to: "out" },
        { from: "gpuMat", to: "out" },
      ],
    },
    usage: [
      {
        feature: t("조정 레이어 · 밝기/대비·레벨·커브·색조·컬러 밸런스", "Adjustment layers · brightness/contrast, levels, curves, hue, color balance"),
        role: t(
          "다섯 가지 보정을 WGSL 컴퓨트 셰이더로 처리하고, 표 기반 세 가지는 CPU 가 만든 LUT 를 올려 조회만 합니다.",
          "Runs five adjustments as WGSL compute shaders; the three table-based ones upload a CPU-made LUT and only look it up.",
        ),
        paths: [
          `${KERNELS}#STUDIO_GPU_LUT3_ENTRY_COUNT`,
          "apps/web/src/domains/creator/render/studio-gpu-filter-apply.ts",
          "apps/web/src/domains/creator/studio-adjustment-layer-runtime.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("필터 계획(작업마다 provider 1개)", "Filter planning (one provider per job)"),
        role: t(
          "지원하는 체인이면 WebGPU, 아니면 전용 Worker 를 실행 전에 하나만 고르고, 선택된 쪽이 실패해도 다른 쪽으로 재실행하지 않습니다.",
          "Chooses WebGPU for a supported chain or the dedicated Worker otherwise, once before execution, and never reruns elsewhere if the selected one fails.",
        ),
        paths: ["apps/web/src/domains/creator/filter/studio-filter-island-plan.ts"],
        route: "/studio",
      },
      {
        feature: t("품질 게이트(GPU 필터 패리티)", "Quality gate (GPU filter parity)"),
        role: t(
          "GPU 필터가 CPU 와 맞는지 검증하는 스크립트가 저장소에 있고 CI 레인에 연결돼 있습니다(이 카드에서 실행하지는 않았습니다).",
          "A script that checks GPU filters against the CPU exists in the repository and is wired into a CI lane (it was not run for this card).",
        ),
        paths: ["scripts/verify-studio-gpu-filters.mts", ".github/workflows/main-full-qa-studio.yml"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("256칸 LUT 로 구워 조회만 하기", "Bake a 256-entry LUT and only look it up"),
        language: "ts",
        ...commentedCode(
          [
            "// @0@",
            "const brightness = 10;",
            "const contrast = 1.2;",
            "const lut = Uint8ClampedArray.from({ length: 256 }, (_, v) => (v - 128) * contrast + 128 + brightness);",
            "",
            "function applyLut(rgba: Uint8ClampedArray, table: Uint8ClampedArray): void {",
            "  for (let i = 0; i < rgba.length; i += 4) { // @1@",
            "    rgba[i] = table[rgba[i]!]!;",
            "    rgba[i + 1] = table[rgba[i + 1]!]!;",
            "    rgba[i + 2] = table[rgba[i + 2]!]!;",
            "  }",
            "}",
            "",
            "const px = new Uint8ClampedArray([0, 100, 200, 255]);",
            "applyLut(px, lut);",
            "console.log([...px]); // @2@",
          ].join("\n"),
          [
            "밝기/대비/레벨/커브는 '바이트→바이트' 사상이다. 256칸 LUT 로 구우면 GPU 는 정수 조회(dst = lut[src])만 한다.",
            "알파(i+3)는 건드리지 않는다",
            "[0, 104, 224, 255] — CPU 가 만든 표라서 GPU 쪽 결과도 비트 단위로 같다",
          ],
          [
            "Brightness, contrast, levels and curves are byte-to-byte maps. Bake them into a 256-entry LUT and the GPU only does an integer lookup (dst = lut[src]).",
            "the alpha channel (i+3) is left alone",
            "[0, 104, 224, 255] - since the CPU made the table, the GPU result is bit-identical",
          ],
        ),
        explain: t(
          "예시 공식으로 표를 만들었을 뿐 제품의 밝기·대비는 Konva 의 nativeBrighten→nativeContrast 를 단계 사이 양자화까지 포함해 그대로 재현한 표를 굽습니다. 핵심은 '표를 만드는 쪽(CPU)'과 '표를 읽는 쪽(GPU)'을 나눈다는 점입니다.",
          "The table here is built from an example formula; the product bakes a table that reproduces Konva's nativeBrighten then nativeContrast, including the quantization between stages. The key idea is splitting who builds the table (CPU) from who reads it (GPU).",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "W3C · WGSL (WebGPU Shading Language)", url: "https://www.w3.org/TR/WGSL/", kind: "spec" },
      { title: "W3C · WebGPU", url: "https://www.w3.org/TR/webgpu/", kind: "spec" },
      { title: "WebGPU Fundamentals · Compute shaders", url: "https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders.html", kind: "guide", note: t("컴퓨트 셰이더와 워크그룹 입문", "An introduction to compute shaders and workgroups") },
    ],
    chapterIds: ["performance", "brush-render-authority"],
    talk: {
      pitch: t(
        "밝기나 레벨 같은 보정은 입력 256단계마다 출력이 정해지는 표입니다. 그 표를 CPU 가 정확히 구워 GPU 에 올리고 GPU 는 찾아보기만 하니, CPU 와 비트까지 같은 결과가 나옵니다. 표로 만들 수 없는 색조와 컬러 밸런스만 ±1 오차를 허용한다고 솔직하게 말합니다.",
        "Adjustments like brightness and levels are tables that give an output for each of 256 inputs. The CPU bakes the table exactly, the GPU only looks it up, and the result is bit-identical to the CPU. Only hue and color balance, which cannot be tables, allow a plus-or-minus-1 difference, and we say so openly.",
      ),
      analogy: t(
        "계산기를 두드리는 대신 구구단표를 보고 답을 찾는 것과 같습니다. 표가 정확하면 누가 찾아봐도 답이 같습니다.",
        "It is like reading answers off a multiplication table instead of pressing calculator keys: if the table is exact, everyone who looks gets the same answer.",
      ),
      questions: [
        {
          question: t("GPU 결과가 CPU 와 다르면요?", "What if the GPU result differs from the CPU?"),
          answer: t(
            "표 기반(밝기/대비·레벨·커브)은 비트 동일이고 공식 기반(색조·컬러 밸런스)은 반올림 경계에서 ±1 정도라고 커널 주석에 적혀 있습니다. 검증 스크립트는 저장소에 있으나 이 카드에서 실행하지는 않았습니다.",
            "Table-based adjustments (brightness/contrast, levels, curves) are bit-identical, while formula-based ones (hue, color balance) can differ by about 1 at rounding boundaries, per the kernel comment. A verification script exists but was not run for this card.",
          ),
        },
        {
          question: t("GPU 를 못 쓰면 어떻게 되나요?", "What happens without a usable GPU?"),
          answer: t(
            "지원하지 않는 체인이면 필터 계획이 실행 전에 전용 Worker CPU 파이프라인을 고릅니다. 실행하다 실패했다고 다른 쪽으로 다시 돌리지는 않습니다.",
            "For an unsupported chain the filter planner picks the dedicated Worker CPU pipeline before execution. It does not rerun elsewhere because a running job failed.",
          ),
        },
        {
          question: t("왜 텍스처가 아니라 저장 버퍼로 다루나요?", "Why a storage buffer instead of a texture?"),
          answer: t(
            "픽셀을 u32 로 포장한 저장 버퍼로 다뤄 CPU 의 0~255 바이트 공간 수식을 그대로 재현합니다. 텍스처 unorm 변환의 반올림 규칙에 기대지 않으려는 설계입니다.",
            "Pixels are packed into u32 storage buffers so the CPU's 0-255 byte-space formulas are reproduced as they are, rather than relying on a texture's unorm rounding rules.",
          ),
        },
      ],
      pitfall: t(
        "'GPU 가 CPU 와 항상 같다'고 말하지 마세요. 비트 동일은 표 기반 3종뿐입니다. GPU 가 몇 배 빠르다는 수치는 이 카드에서 확인하지 못했습니다.",
        "Do not say the GPU always equals the CPU; bit-identical applies to the three table-based adjustments only. No speed-up factor for the GPU was verified for this card.",
      ),
    },
    technologies: ["WebGPU", "WGSL"],
    facts: [
      { value: "768", label: t("LUT 저장 버퍼 항목 수(R 256 + G 256 + B 256)", "LUT storage-buffer entries (256 each for R, G, B)"), source: KERNELS },
      { value: "16 B", label: t("표 기반 보정의 uniform 크기(픽셀 수만 담음)", "Uniform size of table-based adjustments (just the pixel count)"), source: KERNELS },
    ],
    reviewedAt: "2026-10-07",
  },
];
