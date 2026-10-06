/**
 * 웹툰 제작 공정별 도구 카탈로그 — 단계 데이터 분리 파일.
 * 수록 원칙은 `webtoon-process-toolchain.ts` 머리말이 정본이며, 이 파일은
 * 파일 크기 래칫 준수를 위해 단계 묶음만 분리한 것이다.
 */

import type { ProcessToolchainStage } from "./webtoon-process-toolchain";

export const TOOLCHAIN_STAGES_ART: readonly ProcessToolchainStage[] = [
  {
    id: "background",
    title: { ko: "배경·3D", en: "Backgrounds & 3D" },
    summary: {
      ko: "공간의 투시와 카메라 기준을 잡아 배경 작화의 토대를 만드는 단계입니다.",
      en: "The stage that sets spatial perspective and camera references as the foundation for background art.",
    },
    tools: [
      {
        name: { ko: "SketchUp", en: "SketchUp" },
        role: {
          ko: "3D 공간 모델링으로 배경 구도를 잡고 카메라 앵글을 뽑는 도구",
          en: "3D spatial modeling for background layouts and camera angles",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Blender", en: "Blender" },
        role: {
          ko: "무료 3D 모델링·렌더링 도구로 배경 모델과 소품을 만드는 도구",
          en: "Free 3D modeling and rendering for background models and props",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "3D 데생 인형과 배경 소재를 컷 안에 배치해 구도를 잡는 기능",
          en: "3D drawing figures and background assets placed directly inside panels",
        },
        kind: "external",
      },
      {
        name: { ko: "CLIP STUDIO ASSETS", en: "CLIP STUDIO ASSETS" },
        role: {
          ko: "브러시·3D·배경 소재를 사고파는 Clip Studio 공식 소재 스토어",
          en: "Official Clip Studio marketplace for brushes, 3D, and background assets",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "3D Warehouse", en: "3D Warehouse" },
        role: {
          ko: "사용자들이 올린 3D 모델을 SketchUp 안에서 바로 불러오는 라이브러리",
          en: "Library of user-shared 3D models loaded directly inside SketchUp",
        },
        kind: "external",
      },
      {
        name: { ko: "에이콘3D (ACON3D)", en: "ACON3D" },
        role: {
          ko: "웹툰 배경용 3D 모델을 사고파는 국내 소재 마켓플레이스",
          en: "Korean marketplace for 3D background models used in webtoons",
        },
        kind: "external",
      },
      {
        name: { ko: "APOC 에셋", en: "APOC Asset" },
        role: {
          ko: "각도를 바꿔 쓸 수 있는 3D와 바로 쓰는 2D 소재를 사고파는 에셋 스토어",
          en: "Asset store for ready-to-use 2D assets and angle-adjustable 3D assets",
        },
        kind: "external",
      },
      {
        name: { ko: "에이블러 (ABLUR)", en: "ABLUR (Abler)" },
        role: {
          ko: "3D 장면을 배치·조명하고 선을 추출해 웹툰 배경으로 뽑는 배경 전용 스튜디오",
          en: "Background-only studio that stages, lights, and extracts lines from 3D scenes",
        },
        kind: "external",
      },
      {
        name: { ko: "DesignDoll", en: "DesignDoll" },
        role: {
          ko: "체형과 포즈를 자유롭게 바꾸는 3D 데생 인형",
          en: "3D drawing figure with freely adjustable body types and poses",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "JustSketchMe", en: "JustSketchMe" },
        role: {
          ko: "웹에서 바로 포즈를 잡는 3D 캐릭터 포징·레퍼런스 도구",
          en: "Web-based 3D character posing and drawing reference tool",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Magic Poser", en: "Magic Poser" },
        role: {
          ko: "포즈 프리셋과 스튜디오 조명을 갖춘 3D 인체 포징 앱",
          en: "3D figure posing app with pose presets and studio lighting",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Easy Pose", en: "Easy Pose" },
        role: {
          ko: "만화풍 체형을 포함한 3D 포즈 제작 앱",
          en: "3D pose-making app including comic-style body types",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "POSEMANIACS", en: "POSEMANIACS" },
        role: {
          ko: "360도로 돌려 보는 무료 3D 포즈 레퍼런스 사이트",
          en: "Free 3D pose reference site with 360-degree rotation",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Shaper (네이버웹툰)", en: "Shaper (WEBTOON)" },
        role: {
          ko: "스케치를 3D 캐릭터 모델로 바꿔 포즈를 자유롭게 잡는 네이버웹툰의 AI 도구",
          en: "WEBTOON's AI tool that turns sketches into posable 3D character models",
        },
        kind: "external",
      },
      {
        name: { ko: "Constella (네이버웹툰)", en: "Constella (WEBTOON)" },
        role: {
          ko: "3D 모델의 포즈를 작가 그림체의 2D로 바꿔 주는 네이버웹툰의 AI 도구",
          en: "WEBTOON's AI tool that converts 3D model poses into the artist's 2D style",
        },
        kind: "external",
      },
      {
        name: { ko: "PIXEL (픽셀)", en: "PIXEL" },
        role: {
          ko: "웹툰 소재를 사고파는 마켓으로 공동구매 할인도 여는 국내 소재 스토어",
          en: "Korean material store for buying and selling webtoon assets, with group-buy discounts",
        },
        kind: "external",
      },
      {
        name: { ko: "크티 (CTEE)", en: "CTEE" },
        role: {
          ko: "공동구매(크라우드펀딩) 방식을 내세운 웹툰 소재 마켓",
          en: "Webtoon material market built around group buying (crowdfunding)",
        },
        kind: "external",
      },
      {
        name: { ko: "캐릭터 셰이퍼", en: "Character Shaper" },
        role: {
          ko: "3D 캐릭터의 체형과 포즈를 빚는 셰이퍼",
          en: "Shaper for sculpting 3D character bodies and poses",
        },
        kind: "builtin",
        href: "/studio/assets/characters/new",
      },
      {
        name: { ko: "배경 3D 스튜디오", en: "Background 3D Studio" },
        role: {
          ko: "3D 배경 씬을 편집하고 조명·분위기를 잡는 워크스페이스",
          en: "Workspace for editing 3D background scenes, lighting, and mood",
        },
        kind: "builtin",
        href: "/studio/bg3d",
      },
      {
        name: { ko: "포즈 스튜디오", en: "Pose Studio" },
        role: {
          ko: "데생 인형으로 포즈를 잡고 프리셋을 쓰는 포저",
          en: "Poser for setting poses on a drawing figure with presets",
        },
        kind: "builtin",
        href: "/studio/poser",
      },
      {
        name: { ko: "2D→3D 리프트", en: "Lift3D" },
        role: {
          ko: "2D 이미지를 깊이와 메시로 들어올려 3D로 바꾸는 작업대",
          en: "Turns 2D images into 3D meshes with depth",
        },
        kind: "builtin",
        href: "/studio/lift3d",
      },
      {
        name: { ko: "캐릭터 변환", en: "Character Conversion" },
        role: {
          ko: "캐릭터를 다른 형태로 바꾸는 변환 전용 화면",
          en: "Dedicated screen for converting characters",
        },
        kind: "builtin",
        href: "/studio/character-convert",
      },
      {
        name: { ko: "공간 제작", en: "Immersive Creation" },
        role: {
          ko: "몰입형 3D 공간을 만드는 제작 허브",
          en: "Creation hub for immersive 3D spaces",
        },
        kind: "builtin",
        href: "/studio/immersive",
      },
      {
        name: { ko: "3D·질감 소재 탐색", en: "3D & Texture Materials" },
        role: {
          ko: "Poly Haven·AmbientCG 같은 3D 에셋과 질감 소재 탐색",
          en: "Browse 3D assets and texture materials from sources like Poly Haven and AmbientCG",
        },
        kind: "builtin",
        href: "/research/3d-assets",
      },
      {
        name: { ko: "마켓", en: "Market" },
        role: {
          ko: "제작 소재와 에셋을 탐색·거래하는 마켓",
          en: "Marketplace for browsing and trading production assets",
        },
        kind: "builtin",
        href: "/market",
      },
    ],
  },
  {
    id: "line",
    title: { ko: "선화·드로잉", en: "Line art & drawing" },
    summary: {
      ko: "스케치에서 검수한 포즈·표정을 최종 선으로 정리하는 단계입니다.",
      en: "The stage where reviewed poses and expressions from the sketch become final lines.",
    },
    tools: [
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "펜·브러시와 컷선 도구로 선화를 완성하는 프로 표준 도구",
          en: "The professional standard for inking with pens, brushes, and frame tools",
        },
        kind: "external",
      },
      {
        name: { ko: "Adobe Photoshop", en: "Adobe Photoshop" },
        role: {
          ko: "브러시와 레이어 기반으로 작화와 편집을 함께 다루는 도구",
          en: "Brush- and layer-based drawing and editing",
        },
        kind: "external",
      },
      {
        name: { ko: "Procreate", en: "Procreate" },
        role: {
          ko: "iPad 전용으로 빠른 브러시 반응과 직관적인 제스처가 강점인 드로잉 앱",
          en: "iPad-only drawing app known for responsive brushes and gestures",
        },
        kind: "external",
        pricing: "paid",
      },
      {
        name: { ko: "ibis Paint", en: "ibis Paint" },
        role: {
          ko: "모바일 중심의 만화·일러스트 드로잉 앱으로 소재와 스크린톤을 제공",
          en: "Mobile-first manga and illustration app with materials and screentones",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "MediBang Paint", en: "MediBang Paint" },
        role: {
          ko: "만화 원고 프리셋과 클라우드 동기화를 갖춘 무료로 시작하는 페인팅 앱",
          en: "Painting app with manga presets and cloud sync, free to start",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Krita", en: "Krita" },
        role: {
          ko: "무료 오픈소스 디지털 페인팅 프로그램",
          en: "Free and open-source digital painting program",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "PaintTool SAI", en: "PaintTool SAI" },
        role: {
          ko: "가볍고 선이 매끄러워 선화에 강점이 있는 페인팅 소프트웨어",
          en: "Lightweight painting software prized for smooth line art",
        },
        kind: "external",
        pricing: "paid",
      },
      {
        name: { ko: "PureRef", en: "PureRef" },
        role: {
          ko: "참고 이미지를 한 화면에 모아 띄워 두는 레퍼런스 뷰어",
          en: "Reference viewer that keeps inspiration images floating in one board",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "에이블러 (ABLUR)", en: "ABLUR (Abler)" },
        role: {
          ko: "3D 모델에서 선화(Line Art)를 추출하는 기능",
          en: "Extracts line art from 3D models",
        },
        kind: "external",
      },
      {
        name: { ko: "FireAlpaca", en: "FireAlpaca" },
        role: {
          ko: "패널 템플릿과 스냅 룰러를 갖춘 무료 만화 페인팅 도구",
          en: "Free comic painting tool with panel templates and snap rulers",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "그림나비", en: "그림나비" },
        role: {
          ko: "스케치·선화 단계만 따로 맡는 모듈형 제작 서비스",
          en: "Modular production service covering just the sketch and line art stages",
        },
        kind: "external",
      },
      {
        name: { ko: "컷툰 에디터", en: "Cuttoon Editor" },
        role: {
          ko: "컷·페이지·애니메이션을 편집하는 실제 작화 편집기 본체 (실시간 공동 편집 포함)",
          en: "The main drawing editor for panels, pages, and animation, with real-time co-editing",
        },
        kind: "builtin",
        href: "/studio/canvas",
      },
      {
        name: { ko: "사진에서 선 추출", en: "On-Device Line Extraction" },
        role: {
          ko: "참조 사진을 밑그림용 흑백 선화로 바꾸는 기기 내 ONNX 기능 (에디터 안)",
          en: "On-device ONNX feature turning reference photos into line art (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "브러시 랩", en: "Brush Lab" },
        role: {
          ko: "브러시를 만들고 설정을 실험하는 실험실",
          en: "Lab for creating brushes and testing their settings",
        },
        kind: "builtin",
        href: "/studio/assets/brushes/new",
      },
    ],
  },
  {
    id: "color",
    title: { ko: "채색·밑색", en: "Coloring" },
    summary: {
      ko: "캐릭터 팔레트와 장면 광원을 기준으로 밑색부터 최종 채색까지 채우는 단계입니다.",
      en: "The stage that fills flats through final color, guided by character palettes and scene lighting.",
    },
    tools: [
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "밑색 채우기와 톤·그림자 보조 기능으로 채색을 진행하는 도구",
          en: "Flat fills plus tone and shading assists for coloring",
        },
        kind: "external",
      },
      {
        name: { ko: "Adobe Photoshop", en: "Adobe Photoshop" },
        role: {
          ko: "색 조정과 그라데이션으로 장면 톤을 맞추는 후반 채색 도구",
          en: "Color grading and gradients for unifying scene tone",
        },
        kind: "external",
      },
      {
        name: { ko: "Procreate", en: "Procreate" },
        role: {
          ko: "ColorDrop 채우기와 색 조화 도구로 채색을 돕는 iPad 드로잉 앱",
          en: "iPad drawing app with ColorDrop fills and color harmony tools",
        },
        kind: "external",
        pricing: "paid",
      },
      {
        name: { ko: "ibis Paint", en: "ibis Paint" },
        role: {
          ko: "브러시와 소재가 풍부한 모바일 채색 앱",
          en: "Mobile coloring app with a large brush and material library",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "MediBang Paint", en: "MediBang Paint" },
        role: {
          ko: "톤과 채우기 도구로 만화 채색을 진행하는 페인팅 앱",
          en: "Painting app with tones and fill tools for comic coloring",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Krita", en: "Krita" },
        role: {
          ko: "채색 마스크와 브러시 엔진이 강한 무료 페인팅 프로그램",
          en: "Free painting program with colorize masks and a deep brush engine",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "PaintTool SAI", en: "PaintTool SAI" },
        role: {
          ko: "색 번짐과 혼합이 자연스러운 채색용 페인팅 소프트웨어",
          en: "Painting software with natural color blending for coloring",
        },
        kind: "external",
        pricing: "paid",
      },
      {
        name: { ko: "Coolors", en: "Coolors" },
        role: {
          ko: "색상 팔레트를 빠르게 만들고 탐색하는 도구",
          en: "Fast color palette generator and explorer",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "AI Painter (네이버웹툰)", en: "AI Painter (WEBTOON)" },
        role: {
          ko: "선화에 색을 자동으로 입혀 주는 네이버웹툰의 자동 채색 도구",
          en: "WEBTOON's automatic coloring tool that paints color onto line art",
        },
        kind: "external",
      },
      {
        name: { ko: "style2paints", en: "style2paints" },
        role: {
          ko: "힌트 색을 찍으면 채색하고 레이어가 나뉜 PSD로 내보내는 오픈소스 자동 채색 도구",
          en: "Open-source auto-coloring tool that paints from color hints and exports layered PSDs",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Petalica Paint", en: "Petalica Paint" },
        role: {
          ko: "브라우저에서 선화를 자동으로 채색하는 도구",
          en: "Browser tool that auto-colors line art",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "그림나비", en: "그림나비" },
        role: {
          ko: "채색·효과 단계를 따로 맡는 모듈형 제작 서비스",
          en: "Modular production service covering the coloring and effects stages",
        },
        kind: "external",
      },
      {
        name: { ko: "기기에서 채색", en: "On-Device Colorize" },
        role: {
          ko: "서버 없이 이 기기에서 바로 자동 채색하는 ONNX 기능 (에디터 안, 오프라인 가능)",
          en: "ONNX auto-coloring that runs on this device, even offline (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "AI 채색 패널", en: "AI Colorize Panel" },
        role: {
          ko: "내 API 키로 서버 AI 채색을 쓰는 대체 경로 (에디터 안)",
          en: "Server AI coloring using your own API key (inside the editor)",
        },
        kind: "builtin",
      },
    ],
  },
  {
    id: "post",
    title: { ko: "보정·후보정", en: "Finishing & post" },
    summary: {
      ko: "조명·효과와 화면 완성도를 다듬는 단계입니다.",
      en: "The stage that polishes lighting, effects, and overall frame finish.",
    },
    tools: [
      {
        name: { ko: "Adobe Photoshop", en: "Adobe Photoshop" },
        role: {
          ko: "색보정·합성·후보정의 대표 도구",
          en: "The go-to tool for color correction, compositing, and finishing",
        },
        kind: "external",
      },
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "집중선·효과선과 스크린톤으로 화면 효과를 더하는 도구",
          en: "Focus lines, effect lines, and screentones for impact",
        },
        kind: "external",
      },
      {
        name: { ko: "Topaz", en: "Topaz" },
        role: {
          ko: "AI 업스케일로 이미지 해상도를 높이는 화질 개선 도구",
          en: "AI upscaling tool that raises image resolution and quality",
        },
        kind: "external",
      },
      {
        name: { ko: "그림나비", en: "그림나비" },
        role: {
          ko: "효과·후처리 단계를 따로 맡는 모듈형 제작 서비스",
          en: "Modular production service covering the effects and finishing stages",
        },
        kind: "external",
      },
      {
        name: { ko: "지니어스 Geeni Canvas 애니툰", en: "Geenius Geeni Canvas AnimeToon" },
        role: {
          ko: "보관된 웹툰의 장면을 바탕으로 애니메이션을 자동 생성하는 웹툰 영상화",
          en: "Webtoon-to-video feature that automatically generates animation from the scenes of a saved webtoon",
        },
        kind: "external",
      },
      {
        name: { ko: "AI 업스케일", en: "On-Device AI Upscale" },
        role: {
          ko: "선택 이미지를 기기에서 4배로 확대하는 ONNX 기능 (에디터 안)",
          en: "On-device ONNX upscaling that enlarges images 4x (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "빠른 배경 제거", en: "Quick Background Removal" },
        role: {
          ko: "인물과 사물의 배경을 기기에서 지우는 ONNX 기능 (에디터 안)",
          en: "On-device ONNX background removal for people and objects (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "오디오 에셋", en: "Audio Assets" },
        role: {
          ko: "BGM과 오디오 에셋을 관리하는 라이브러리",
          en: "Library for managing BGM and audio assets",
        },
        kind: "builtin",
        href: "/studio/assets/audio",
      },
    ],
  },
  {
    id: "lettering",
    title: { ko: "식자·편집", en: "Lettering" },
    summary: {
      ko: "대사와 효과음을 말풍선에 넣고 독서 흐름에 맞게 배치하는 단계입니다.",
      en: "The stage that sets dialogue and sound effects into balloons along the reading flow.",
    },
    tools: [
      {
        name: { ko: "Clip Studio Paint", en: "Clip Studio Paint" },
        role: {
          ko: "말풍선과 대사 식자를 한 도구에서 처리하는 기능",
          en: "Balloons and dialogue lettering handled in one tool",
        },
        kind: "external",
      },
      {
        name: { ko: "Adobe Photoshop", en: "Adobe Photoshop" },
        role: {
          ko: "전통적으로 대사 식자와 레터링에 쓰여 온 도구",
          en: "Long used for dialogue lettering and typesetting",
        },
        kind: "external",
      },
      {
        name: { ko: "Google Fonts", en: "Google Fonts" },
        role: {
          ko: "무료 오픈소스 폰트를 받아 쓸 수 있는 폰트 라이브러리",
          en: "Library of free open-source fonts for lettering",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "산돌구름", en: "Sandoll Cloud" },
        role: {
          ko: "폰트 구독과 AI 폰트 찾기·추천을 제공하는 산돌의 폰트 플랫폼",
          en: "Sandoll's font platform with font subscriptions and AI font matching and recommendations",
        },
        kind: "external",
        pricing: "subscription",
      },
      {
        name: { ko: "툰잉 AI Losy", en: "툰잉 AI Losy" },
        role: {
          ko: "번역과 함께 식자까지 자동으로 배치하는 현지화 서비스",
          en: "Localization service that also auto-places lettering together with translation",
        },
        kind: "external",
      },
      {
        name: { ko: "말풍선·식자 도구", en: "Balloon & Lettering Tools" },
        role: {
          ko: "말풍선 모양·꼬리와 효과음 식자, 사용자 폰트를 다루는 도구군 (에디터 안)",
          en: "Balloon shapes, tails, SFX lettering, and custom fonts (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "대사 일괄 관리", en: "Dialogue Batch Manager" },
        role: {
          ko: "문서 전체 대사를 목록으로 모아 한 번에 편집하는 패널 (에디터 안)",
          en: "Panel listing every line in a document for batch editing (inside the editor)",
        },
        kind: "builtin",
      },
    ],
  },
];
