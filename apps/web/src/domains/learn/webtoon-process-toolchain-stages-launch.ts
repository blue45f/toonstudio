/**
 * 웹툰 제작 공정별 도구 카탈로그 — 단계 데이터 분리 파일.
 * 수록 원칙은 `webtoon-process-toolchain.ts` 머리말이 정본이며, 이 파일은
 * 파일 크기 래칫 준수를 위해 단계 묶음만 분리한 것이다.
 */

import type { ProcessToolchainStage } from "./webtoon-process-toolchain";

export const TOOLCHAIN_STAGES_LAUNCH: readonly ProcessToolchainStage[] = [
  {
    id: "ai",
    title: { ko: "AI 제작 보조", en: "AI assistance" },
    summary: {
      ko: "반복 작업과 초안 생성을 보조하는 AI 도구들이 들어오는 단계입니다.",
      en: "The stage where AI tools assist with repetitive work and first drafts.",
    },
    tools: [
      {
        name: { ko: "GenToon", en: "GenToon" },
        role: {
          ko: "대본을 넣으면 캐릭터 일관성을 유지하며 컷을 구성하는 AI 제작 플랫폼",
          en: "AI production platform that composes panels from a script while keeping characters consistent",
        },
        kind: "external",
      },
      {
        name: { ko: "투닝 (Tooning)", en: "Tooning" },
        role: {
          ko: "문장을 입력하면 상황에 맞는 포즈·표정·컷을 추천하는 AI 보조 도구",
          en: "AI assistant that suggests poses, expressions, and panels from a sentence",
        },
        kind: "external",
      },
      {
        name: { ko: "투닝 플러스 (Tooning Plus)", en: "Tooning Plus" },
        role: {
          ko: "AI 시나리오(스토리즈)·3D 연출(3D 스튜디오)·협업 편집(에디터)을 하나로 묶은 투닝의 통합 제작 서비스",
          en: "Tooning's integrated suite combining AI story writing (Stories), 3D staging (3D Studio), and collaborative editing (Editor)",
        },
        kind: "external",
      },
      {
        name: { ko: "CREAM", en: "CREAM" },
        role: {
          ko: "스튜디오 고유의 화풍과 캐릭터를 학습시킨 전용 AI 파트너를 구축하는 솔루션",
          en: "Solution that trains a studio-private AI partner on its own style and characters",
        },
        kind: "external",
      },
      {
        name: { ko: "OpenArt", en: "OpenArt" },
        role: {
          ko: "100종이 넘는 AI 모델을 한곳에서 골라 쓰는 이미지 생성·편집 플랫폼",
          en: "Image generation and editing platform aggregating 100+ AI models",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "대시툰 스튜디오", en: "Dashtoon Studio" },
        role: {
          ko: "스토리보드를 올리면 캐릭터 라이브러리와 AI로 만화를 완성하는 제작 플랫폼",
          en: "Creation platform that turns storyboards into comics with a character library and AI",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "투툰 (TooToon)", en: "TooToon" },
        role: {
          ko: "아이디어를 넣으면 시나리오부터 풀컬러 아트워크까지 만드는 올인원 AI 웹툰 플랫폼 (오노마에이아이)",
          en: "All-in-one AI webtoon platform that goes from an idea to scenario and full-color artwork (Onoma AI)",
        },
        kind: "external",
      },
      {
        name: { ko: "위툰 (WeToon)", en: "WeToon" },
        role: {
          ko: "줄거리를 넣으면 시나리오·캐릭터·컷을 단계별로 생성하는 AI 웹툰 제작 서비스",
          en: "AI webtoon service that generates scenario, characters, and panels step by step from a plot",
        },
        kind: "external",
      },
      {
        name: { ko: "LlamaGen.ai", en: "LlamaGen.ai" },
        role: {
          ko: "스토리를 넣으면 캐릭터 일관성을 유지하며 멀티 패널 코믹을 생성하는 AI 도구",
          en: "AI tool that turns a story into multi-panel comics with consistent characters",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "PixAI", en: "PixAI" },
        role: {
          ko: "애니메이션풍 캐릭터 생성과 LoRA에 특화된 AI 아트 플랫폼",
          en: "Anime-focused AI art platform for character generation and LoRAs",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "ComicAI", en: "ComicAI" },
        role: {
          ko: "스토리에서 캐릭터를 뽑아 패널을 생성하는 AI 만화 제작 도구",
          en: "AI comic tool that extracts characters from a story and generates panels",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "Stable Diffusion", en: "Stable Diffusion" },
        role: {
          ko: "로컬 실행이 가능한 오픈 이미지 생성 모델과 그 생태계 (ControlNet 등)",
          en: "Open image generation model ecosystem, runnable locally with ControlNet controls",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "ComfyUI", en: "ComfyUI" },
        role: {
          ko: "노드 그래프로 이미지 생성 과정을 조립하는 무료 워크플로 도구",
          en: "Free node-graph workflow tool for assembling image generation pipelines",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Midjourney", en: "Midjourney" },
        role: {
          ko: "캐릭터·스타일 참조로 그림체를 유지하는 이미지 생성 서비스",
          en: "Image generation service with character and style references",
        },
        kind: "external",
        pricing: "subscription",
      },
      {
        name: { ko: "NovelAI", en: "NovelAI" },
        role: {
          ko: "AI 스토리텔링과 애니메풍 이미지 생성을 함께 제공하는 구독 서비스",
          en: "Subscription service combining AI storytelling with anime-style image generation",
        },
        kind: "external",
        pricing: "subscription",
      },
      {
        name: { ko: "Adobe Firefly", en: "Adobe Firefly" },
        role: {
          ko: "Photoshop 안에서 생성형 채우기로 합성·확장을 돕는 Adobe의 AI",
          en: "Adobe's generative AI for fill, compositing, and expansion inside Photoshop",
        },
        kind: "external",
      },
      {
        name: { ko: "리얼드로우", en: "리얼드로우" },
        role: {
          ko: "작가 본인의 화풍을 학습해 드로잉을 보조하는 AI 도구",
          en: "AI drawing assistant trained on the artist's own style",
        },
        kind: "external",
      },
      {
        name: { ko: "AI 코믹 디렉터", en: "AI Comic Director" },
        role: {
          ko: "시나리오 비트를 장면 후보 이미지로 만들어 검토·적용하는 AI 연출",
          en: "AI directing that turns scenario beats into scene candidates to review and apply",
        },
        kind: "builtin",
      },
      {
        name: { ko: "생성형 제작", en: "Generative Creation" },
        role: {
          ko: "이미지와 비디오를 생성하는 전용 제작 화면",
          en: "Dedicated screen for generating images and video",
        },
        kind: "builtin",
        href: "/studio/generate",
      },
      {
        name: { ko: "개인 AI 런타임", en: "Personal AI Runtime" },
        role: {
          ko: "개인 ONNX·외부 런타임으로 추론을 돌리는 작업공간",
          en: "Workspace for running personal ONNX and external runtime inference",
        },
        kind: "builtin",
        href: "/studio/ai-lab",
      },
      {
        name: { ko: "AI 설정", en: "AI Settings" },
        role: {
          ko: "내 API 키를 등록해 AI 기능을 켜는 통합 설정",
          en: "Unified settings where you register your API keys to enable AI features",
        },
        kind: "builtin",
        href: "/studio/ai-settings",
      },
    ],
  },
  {
    id: "localization",
    title: { ko: "번역·현지화", en: "Translation & localization" },
    summary: {
      ko: "해외 연재를 위해 대사를 번역하고 언어별로 다시 식자하는 단계입니다.",
      en: "The stage that translates dialogue and re-letters each language edition for overseas serialization.",
    },
    tools: [
      {
        name: { ko: "레터웍스 (letr.ai)", en: "LETR WORKS (letr.ai)" },
        role: {
          ko: "이미지 속 대사를 인식·추출하고 다국어 번역·식자를 자동화하는 현지화 도구",
          en: "Localization tool that extracts dialogue from images and automates multilingual translation and lettering",
        },
        kind: "external",
      },
      {
        name: { ko: "KAISTORY", en: "KAISTORY" },
        role: {
          ko: "같은 원고 데이터에서 언어별 판본을 편집하는 다국어 편집",
          en: "Multilingual editions edited from the same source data",
        },
        kind: "external",
      },
      {
        name: { ko: "DeepL", en: "DeepL" },
        role: {
          ko: "문서 번역과 API를 제공하는 AI 기계번역 서비스",
          en: "AI machine translation service with document translation and an API",
        },
        kind: "external",
        pricing: "freemium",
      },
      {
        name: { ko: "네이버 파파고", en: "NAVER Papago" },
        role: {
          ko: "텍스트·이미지 번역을 제공하는 네이버의 무료 AI 번역 서비스",
          en: "Naver's free AI translator for text and images",
        },
        kind: "external",
        pricing: "free",
      },
      {
        name: { ko: "Tesseract", en: "Tesseract" },
        role: {
          ko: "완성 이미지에서 대사 텍스트를 뽑는 오픈소스 OCR 엔진",
          en: "Open-source OCR engine that extracts dialogue text from finished images",
        },
        kind: "external",
      },
      {
        name: { ko: "툰잉 AI Losy", en: "툰잉 AI Losy" },
        role: {
          ko: "번역·식자·효과음을 한 흐름으로 처리하는 End-to-End 현지화 서비스",
          en: "End-to-end localization service handling translation, lettering, and SFX in one flow",
        },
        kind: "external",
      },
      {
        name: { ko: "대사 번역", en: "Dialogue Translation" },
        role: {
          ko: "말풍선 대사를 내 API 키로 일괄 번역하고 원문과 나란히 검토하는 패널 (에디터 안)",
          en: "Batch-translates balloon dialogue with your API key, reviewed side by side (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "번역 메모리", en: "Translation Memory" },
        role: {
          ko: "번역 쌍과 용어집을 저장해 재사용하는 패널 (에디터 안)",
          en: "Stores translation pairs and glossaries for reuse (inside the editor)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "현지화 QA", en: "Localization QA" },
        role: {
          ko: "문체와 말풍선 넘침을 검사해 현지화 품질 점수를 매기는 기능 (에디터 안)",
          en: "Checks style and balloon overflow to score localization quality (inside the editor)",
        },
        kind: "builtin",
      },
    ],
  },
  {
    id: "distribution",
    title: { ko: "연재·배포", en: "Serialization & distribution" },
    summary: {
      ko: "완성 회차를 플랫폼 규격에 맞춰 납품하고 공개를 관리하는 단계입니다.",
      en: "The stage that packages finished episodes to platform specs and manages release.",
    },
    tools: [
      {
        name: { ko: "KAISTORY", en: "KAISTORY" },
        role: {
          ko: "제작 데이터에서 배포까지 이어지는 통합 플랫폼의 배포 흐름",
          en: "Distribution flow of the integrated platform, from production data to release",
        },
        kind: "external",
      },
      {
        name: { ko: "네이버웹툰", en: "Naver Webtoon" },
        role: {
          ko: "도전만화부터 정식 연재까지 이어지는 국내 대표 연재 플랫폼",
          en: "Korea's leading serialization platform, from amateur uploads to official series",
        },
        kind: "external",
      },
      {
        name: { ko: "카카오웹툰·카카오페이지", en: "Kakao Webtoon & KakaoPage" },
        role: {
          ko: "카카오의 웹툰·웹소설 연재 플랫폼",
          en: "Kakao's webtoon and web novel serialization platforms",
        },
        kind: "external",
      },
      {
        name: { ko: "WEBTOON Canvas", en: "WEBTOON Canvas" },
        role: {
          ko: "누구나 올릴 수 있는 글로벌 자가 연재 플랫폼",
          en: "Global self-publishing platform open to any creator",
        },
        kind: "external",
      },
      {
        name: { ko: "Tapas", en: "Tapas" },
        role: {
          ko: "인디 창작자 중심의 글로벌 연재 플랫폼",
          en: "Global serialization platform centered on indie creators",
        },
        kind: "external",
      },
      {
        name: { ko: "포스타입", en: "Postype" },
        role: {
          ko: "누구나 글을 연재·판매할 수 있는 개방형 플랫폼으로 멤버십·후원을 함께 제공",
          en: "Open platform where anyone can serialize and sell posts, with memberships and patronage",
        },
        kind: "external",
      },
      {
        name: { ko: "MANGA Plus Creators", en: "MANGA Plus Creators" },
        role: {
          ko: "해외 작가 투고를 받아 월간 어워드를 거쳐 정식 연재로 잇는 슈에이샤의 플랫폼",
          en: "Shueisha's platform taking overseas submissions through monthly awards toward official serialization",
        },
        kind: "external",
      },
      {
        name: { ko: "투닝 플러스 툰비", en: "투닝 플러스 툰비" },
        role: {
          ko: "제작한 웹툰을 공유·업로드하는 투닝 플러스의 오픈 플랫폼",
          en: "Tooning Plus's open platform for sharing and uploading produced webtoons",
        },
        kind: "external",
      },
      {
        name: { ko: "대시툰 (Dashtoon)", en: "Dashtoon" },
        role: {
          ko: "전용 리더로 작품을 퍼블리싱하고 수익을 나누는 배포 플랫폼",
          en: "Publishing platform with a dedicated reader and revenue sharing",
        },
        kind: "external",
      },
      {
        name: { ko: "작품 게시", en: "Studio Publishing" },
        role: {
          ko: "게시 패키지와 사전 점검으로 작품 발행을 진행하는 화면",
          en: "Publishes titles with release packages and preflight checks",
        },
        kind: "builtin",
        href: "/studio/publish",
      },
      {
        name: { ko: "게시 센터", en: "Publish Center" },
        role: {
          ko: "발행 패키지를 만드는 통합 게시 센터",
          en: "Unified publish center for building release packages",
        },
        kind: "builtin",
        href: "/publish",
      },
      {
        name: { ko: "연재 예약 발행", en: "Scheduled Publishing" },
        role: {
          ko: "공개 시각을 예약하고 예약 캘린더로 관리하는 기능 (게시 화면 안)",
          en: "Schedules releases and manages them on a calendar (inside the publish screen)",
        },
        kind: "builtin",
      },
      {
        name: { ko: "모션 웹툰", en: "Motion Webtoon" },
        role: {
          ko: "움직이는 모션 웹툰을 제작하는 화면",
          en: "Screen for creating motion webtoons",
        },
        kind: "builtin",
        href: "/studio/motion-webtoon",
      },
    ],
  },
  {
    id: "promotion",
    title: { ko: "홍보·마케팅", en: "Promotion & marketing" },
    summary: {
      ko: "연재 소식을 알리고 독자 반응을 다음 회차에 잇는 단계입니다.",
      en: "The stage that spreads release news and carries reader response into the next episode.",
    },
    tools: [
      {
        name: { ko: "X", en: "X" },
        role: {
          ko: "연재 소식과 대표 컷을 전하는 단문 SNS 채널",
          en: "Short-form social channel for release news and key panels",
        },
        kind: "external",
      },
      {
        name: { ko: "Instagram", en: "Instagram" },
        role: {
          ko: "이미지 중심으로 작품과 작가를 알리는 SNS 채널",
          en: "Image-first social channel for promoting titles and creators",
        },
        kind: "external",
      },
      {
        name: { ko: "YouTube", en: "YouTube" },
        role: {
          ko: "숏폼과 영상으로 작품을 알리는 영상 채널",
          en: "Video channel for shorts and trailers that promote titles",
        },
        kind: "external",
      },
      {
        name: { ko: "Buffer", en: "Buffer" },
        role: {
          ko: "여러 SNS 채널의 게시를 한곳에서 예약·관리하는 도구",
          en: "Schedules and manages posts across multiple social channels",
        },
        kind: "external",
      },
      {
        name: { ko: "Later", en: "Later" },
        role: {
          ko: "인스타그램 그리드 미리보기를 갖춘 SNS 예약 게시 도구",
          en: "Social scheduling tool with an Instagram grid preview",
        },
        kind: "external",
      },
      {
        name: { ko: "Linktree", en: "Linktree" },
        role: {
          ko: "연재처·SNS·굿즈 링크를 한 페이지로 모으는 링크 허브",
          en: "Link hub gathering serialization, social, and merch links on one page",
        },
        kind: "external",
      },
      {
        name: { ko: "Canva", en: "Canva" },
        role: {
          ko: "템플릿으로 홍보 이미지와 SNS 소재를 빠르게 만드는 디자인 도구",
          en: "Template-based design tool for promo images and social assets",
        },
        kind: "external",
      },
      {
        name: { ko: "브런치 (Brunch)", en: "Brunch" },
        role: {
          ko: "작가의 글과 작품 소식을 쌓아 독자와 만나는 카카오의 플랫폼",
          en: "Kakao's platform where writers publish essays and title news",
        },
        kind: "external",
      },
      {
        name: { ko: "스티비 (Stibee)", en: "Stibee" },
        role: {
          ko: "구독자 관리와 발송 통계를 갖춘 국내 뉴스레터 서비스",
          en: "Korean newsletter service with subscriber management and send analytics",
        },
        kind: "external",
      },
      {
        name: { ko: "Substack", en: "Substack" },
        role: {
          ko: "구독자 목록과 발송을 한곳에서 처리하는 글로벌 뉴스레터 도구",
          en: "Global newsletter tool handling lists, sending, and analytics",
        },
        kind: "external",
      },
      {
        name: { ko: "Mailchimp", en: "Mailchimp" },
        role: {
          ko: "캠페인 발송과 구독자 관리를 제공하는 이메일 마케팅 도구",
          en: "Email marketing tool for campaign sending and list management",
        },
        kind: "external",
      },
      {
        name: { ko: "텀블벅 (Tumblbug)", en: "Tumblbug" },
        role: {
          ko: "웹툰 단행본과 굿즈를 올리는 국내 크라우드펀딩 플랫폼",
          en: "Korean crowdfunding platform for webtoon books and merch",
        },
        kind: "external",
      },
      {
        name: { ko: "Helix Shorts", en: "Helix Shorts" },
        role: {
          ko: "웹툰 회차를 AI로 40초 숏폼 영상으로 바꿔 주는 카카오의 도구",
          en: "Kakao's tool that turns webtoon episodes into 40-second AI short-form videos",
        },
        kind: "external",
      },
      {
        name: { ko: "Vrew", en: "Vrew" },
        role: {
          ko: "텍스트 기반으로 영상을 편집하고 자막을 자동으로 다는 무빙툰·홍보 영상 도구",
          en: "Text-based video editing with automatic captions for motion toons and promo videos",
        },
        kind: "external",
        pricing: "subscription",
      },
      {
        name: { ko: "홍보 게시판", en: "Promotion Board" },
        role: {
          ko: "신작과 연재 소식을 알리는 작품 홍보 게시판",
          en: "Board for promoting new titles and serialization news",
        },
        kind: "builtin",
        href: "/community/promote",
      },
      {
        name: { ko: "작품 홍보 페이지", en: "Work Promo Page" },
        role: {
          ko: "쇼케이스 안에 작품을 알리는 홍보 화면",
          en: "Promo screen presenting titles inside the showcase",
        },
        kind: "builtin",
        href: "/showcase/promo",
      },
      {
        name: { ko: "뉴스레터", en: "Newsletter" },
        role: {
          ko: "작가 뉴스레터를 쓰고 구독자에게 보내는 도구",
          en: "Writes and sends author newsletters to subscribers",
        },
        kind: "builtin",
        href: "/newsletter",
      },
      {
        name: { ko: "컷츠 스튜디오", en: "Cuts Studio" },
        role: {
          ko: "회차를 홍보용 숏폼 클립으로 만드는 스튜디오",
          en: "Studio that turns episodes into promotional short-form clips",
        },
        kind: "builtin",
        href: "/cuts/studio",
      },
      {
        name: { ko: "창작자 애널리틱스", en: "Creator Analytics" },
        role: {
          ko: "작품 성과 지표를 보는 창작자 대시보드",
          en: "Creator dashboard for title performance metrics",
        },
        kind: "builtin",
        href: "/studio/analytics",
      },
      {
        name: { ko: "작가 성장·IP 확장", en: "Creator Growth & IP" },
        role: {
          ko: "작가 성장과 IP 확장을 다루는 화면",
          en: "Screen for creator growth and IP expansion",
        },
        kind: "builtin",
        href: "/studio/growth",
      },
      {
        name: { ko: "AI 캐릭터 챗 관리", en: "AI Character Chat Manager" },
        role: {
          ko: "작품 캐릭터 챗을 운영·관리하는 자리",
          en: "Manages the title's AI character chat for readers",
        },
        kind: "builtin",
        href: "/character-chat/manage",
      },
    ],
  },
];
