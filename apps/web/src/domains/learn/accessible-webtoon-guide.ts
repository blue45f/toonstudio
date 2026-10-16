/**
 * "접근성 있는 웹툰 만들기" 안내(`/learn/accessibility`)의 정적 데이터.
 *
 * 이 안내는 ToonStudio 화면과 코드에서 직접 확인한 내용만 적는다. 근거가 없는 수치·성능·인증 주장은
 * 쓰지 않고, 아직 편집 화면에 연결되지 않은 기능은 `planned`(준비 중), 브라우저·기기에 따라 달라지는
 * 기능은 `partial`(일부)로 표시한다. 모든 문구는 ko/en 쌍이며 화면 컴포넌트가 활성 로케일로 고른다.
 *
 * 사실 근거(확인일 2026-10-16):
 *  - 기능 찾기 Ctrl+K/⌘K/F1, 단축키 도움말 `?`: StudioCommandSearchHost, studio-page-shortcut-dispatcher
 *  - 기본 단축키 표: STUDIO_MANUAL.md "부록: 기본 단축키" (시험이 같은 표와 대조한다)
 *  - 대사 편집 Ctrl/⌘+Enter·Esc: StudioTextEditOverlay (`aria-keyshortcuts`)
 *  - 받아쓰기: studio-speech-dictation.ts, StudioDictationMicButton.tsx (어떤 화면에도 장착되지 않음)
 *  - 테마·화면 효과: theme-presets.ts, SettingsPage.tsx / Studio 설정: studio-app-settings-*.ts
 *  - 대체 텍스트·읽기 순서: StudioPublicationRightsControls, creator-community-publication-contract,
 *    studio-export-preflight, StudioExportPanel
 *  - 캐릭터 토크 낭독: domains/character-chat
 */

export interface GuideText {
  readonly ko: string;
  readonly en: string;
}

const text = (ko: string, en: string): GuideText => ({ ko, en });

/** 이 안내의 사실을 코드·화면에서 마지막으로 대조한 날짜. */
export const ACCESSIBLE_WEBTOON_GUIDE_VERIFIED_AT = "2026-10-16";

/** 기능의 현재 상태 — 색만이 아니라 아이콘과 글자로도 구분해 보여 준다. */
export type GuideStatus = "available" | "partial" | "planned";

export const GUIDE_STATUS_LABELS: Readonly<Record<GuideStatus, GuideText>> = Object.freeze({
  available: text("지금 쓸 수 있어요", "Available now"),
  partial: text("일부만 · 환경에 따라 달라요", "Partly · depends on your setup"),
  planned: text("준비 중 · 아직 화면에 연결되지 않았어요", "Coming soon · not wired into a screen yet"),
});

export type GuideSectionId = "keyboard" | "dictation" | "display" | "readers" | "listen";

export interface GuidePoint {
  readonly id: string;
  readonly title: GuideText;
  readonly body: GuideText;
}

export interface GuideLink {
  /** 사이트 안의 경로. 하드코딩 링크 무결성 시험이 등록된 라우트인지 대조한다. */
  readonly href: string;
  readonly label: GuideText;
}

export interface GuideSection {
  readonly id: GuideSectionId;
  readonly title: GuideText;
  readonly status: GuideStatus;
  readonly summary: GuideText;
  readonly points: readonly GuidePoint[];
  readonly links: readonly GuideLink[];
}

export const GUIDE_SECTIONS: readonly GuideSection[] = Object.freeze([
  {
    id: "keyboard",
    title: text("키보드로 작업하기", "Work from the keyboard"),
    status: "partial",
    summary: text(
      "Studio는 기능을 이름으로 찾는 검색과 단축키를 함께 갖고 있어서, 메뉴를 눈으로 훑지 않고도 원하는 기능에 닿을 수 있어요. 다만 캔버스에 직접 그리는 일은 아직 포인터(마우스·펜·터치) 중심이에요.",
      "Studio pairs a search that finds features by name with keyboard shortcuts, so you can reach a feature without scanning menus. Drawing directly on the canvas is still pointer-first (mouse, pen, touch), though.",
    ),
    points: [
      {
        id: "find",
        title: text("기능·설정을 이름으로 찾기", "Find features and settings by name"),
        body: text(
          "Ctrl+K(맥은 ⌘K) 또는 F1을 누르면 ‘기능·설정 찾기’가 열려요. 이름을 입력하면 목록이 좁혀지고, ↑·↓로 고르고 Enter로 실행하고 Esc로 닫아요. 글자를 입력하는 중에도 Ctrl+K(⌘K)는 쓸 수 있어요. F1은 입력란 안에서는 Studio가 가로채지 않아요.",
          "Press Ctrl+K (⌘K on Mac) or F1 to open Find features and settings. Type a name to narrow the list, pick with ↑ and ↓, run with Enter and close with Esc. Ctrl+K (⌘K) also works while you are typing; inside an input field Studio leaves F1 alone.",
        ),
      },
      {
        id: "shortcuts",
        title: text("단축키 확인하고 바꾸기", "See and change shortcuts"),
        body: text(
          "글자를 입력하는 중이 아닐 때 ?를 누르면 단축키 도움말이 열리고 닫혀요. 단축키는 ‘애플리케이션 설정’의 ‘단축키’ 탭에서 키를 기록하거나 해제하고 충돌을 확인할 수 있어요. 설정은 F1 검색에 ‘애플리케이션 설정’을 입력하면 열려요.",
          "When you are not typing, ? opens and closes the shortcut help. In Application settings, the Shortcuts tab lets you record or clear keys and check for conflicts. Open the settings by searching “Application settings” with F1.",
        ),
      },
      {
        id: "text-editing",
        title: text("대사를 입력하는 동안", "While you edit dialogue"),
        body: text(
          "대사를 입력하는 동안에는 키가 글자 입력에 쓰여서 도구 단축키가 동작하지 않아요. Ctrl/⌘+Enter로 적용하고 Esc로 취소한 뒤 캔버스로 초점을 옮겨 단축키를 쓰세요. 캔버스 위에서 바로 고치는 편집에서는 입력란 바깥으로 초점이 가면 대사가 적용돼요. 한글을 조합하는 중의 Esc·Enter는 조합에 쓰여서 편집이 닫히지 않아요.",
          "While you edit dialogue, keys go into the text, so tool shortcuts do not run. Apply with Ctrl/⌘+Enter, cancel with Esc, then move focus back to the canvas before using shortcuts. In the on-canvas editor, moving focus out of the field applies the text. While you compose Korean text, Esc and Enter belong to the composition and do not close the editor.",
        ),
      },
      {
        id: "profile",
        title: text("마우스·키보드 프로필", "The Mouse and keyboard profile"),
        body: text(
          "‘애플리케이션 설정’의 ‘작업 환경 빠른 맞춤’에서 ‘마우스·키보드’를 고르면 휠 확대, 가운데 버튼 이동, 전체 기능 화면을 빠른 단축키 작업에 맞춰요. 프로필은 직접 정한 단축키와 도구막대를 그대로 보존하고 입력·화면·가이드·접근성 설정만 조정해요.",
          "In Application settings, choosing Mouse and keyboard under Quick setup tunes wheel zoom, middle-button panning and the full-feature screen for fast shortcut work. Profiles keep your own shortcuts and toolbar and adjust only input, display, guide and accessibility settings.",
        ),
      },
    ],
    links: [
      { href: "/studio/manual/shortcuts", label: text("Studio 매뉴얼: 기본 단축키", "Studio manual: default shortcuts") },
      { href: "/studio/manual/lettering", label: text("Studio 매뉴얼: 텍스트와 말풍선", "Studio manual: text and speech bubbles") },
      { href: "/studio/new", label: text("새 작업 시작하기", "Start a new project") },
    ],
  },
  {
    id: "dictation",
    title: text("말로 대사 입력하기", "Dictate dialogue by voice"),
    status: "planned",
    summary: text(
      "브라우저의 음성 인식으로 말풍선 대사를 받아쓰는 부품이 만들어져 있어요. 다만 2026-10-16 기준으로 ‘말로 입력’ 버튼은 아직 편집 화면에 연결되지 않았어요. 아래는 연결되었을 때의 동작과 한계예요.",
      "A part that dictates speech-bubble dialogue with the browser's speech recognition has been built. As of 2026-10-16, though, its Dictate button is not wired into the editor yet. Below is how it behaves once connected, and its limits.",
    ),
    points: [
      {
        id: "how",
        title: text("이렇게 동작해요", "How it works"),
        body: text(
          "한국어(ko-KR)로 듣고, 말하는 도중의 글자는 버튼 아래 미리보기로만 보여 줘요. 확정된 문장만 커서 위치에 들어가고, 이어서 말하면 새로 확정된 부분만 이어 붙어요. 버튼은 ‘말로 입력’에서 ‘듣고 있어요 — 눌러서 중지’로 바뀌고, 완료와 오류는 화면 낭독기에도 알려져요.",
          "It listens in Korean (ko-KR) and shows in-progress words only as a preview below the button. Only finalized sentences are inserted at the cursor, and continuing to speak appends just the newly finalized part. The button changes from “Dictate” to “Listening — press to stop”, and completion and errors are announced to screen readers too.",
        ),
      },
      {
        id: "now",
        title: text("지금 대사를 말로 넣고 싶다면", "If you want to speak dialogue today"),
        body: text(
          "운영체제나 모바일 키보드가 제공하는 음성 입력이 있는지 확인해 보세요. 그 경우 ToonStudio가 아니라 기기가 글자를 만들어 넣어요. ToonStudio는 이 방법을 따로 검증하지 않았어요. 넣은 뒤에는 대사를 직접 읽어 확인하세요.",
          "Check whether your operating system or mobile keyboard offers voice input. In that case your device, not ToonStudio, produces the text, and ToonStudio has not tested this route. Read the dialogue back yourself afterwards.",
        ),
      },
      {
        id: "browser",
        title: text("지원 브라우저", "Supported browsers"),
        body: text(
          "음성 인식을 제공하는 브라우저가 필요해요. 지원하지 않는 브라우저에서는 버튼 대신 ‘Chrome 또는 Edge에서 열면 말로 대사를 입력할 수 있다’고 안내해요. 그 밖의 브라우저가 지원하는지는 확인하지 못했어요.",
          "You need a browser that provides speech recognition. Where it is missing, the button is replaced by a note saying you can dictate in Chrome or Edge. We have not checked whether other browsers support it.",
        ),
      },
      {
        id: "privacy",
        title: text("소리는 어디로 갈까요", "Where does the audio go?"),
        body: text(
          "인식은 브라우저가 해요. 브라우저에 따라 인터넷 연결이 필요하고 소리가 브라우저 제공사의 음성 인식 서비스로 보내질 수 있어요(연결이 없으면 ‘음성 인식 서버에 닿지 못했어요’라고 알려 줘요). ToonStudio가 소리를 서버로 보내거나 저장하지는 않아요.",
          "The browser does the recognition. Depending on the browser it needs an internet connection and may send the audio to its vendor's speech service (without a connection you see “couldn't reach the speech service”). ToonStudio does not send or store the audio.",
        ),
      },
      {
        id: "accuracy",
        title: text("정확도", "Accuracy"),
        body: text(
          "정확도는 마이크·주변 소음·말투·브라우저에 따라 달라서 수치로 약속할 수 없어요. 낯선 이름이나 효과음은 틀릴 수 있으니, 넣은 대사는 꼭 다시 읽어 고치세요.",
          "Accuracy depends on the microphone, background noise, how you speak and the browser, so we cannot promise a figure. Unfamiliar names and sound effects can come out wrong, so always read the inserted dialogue back and fix it.",
        ),
      },
    ],
    links: [
      { href: "/studio/environment", label: text("사용 환경 안내 (마이크 권한·기능 진단)", "Environment guide (microphone permission, feature check)") },
      { href: "/studio/manual/lettering", label: text("Studio 매뉴얼: 텍스트와 말풍선", "Studio manual: text and speech bubbles") },
    ],
  },
  {
    id: "display",
    title: text("보기 편한 화면 고르기", "Choose a comfortable display"),
    status: "partial",
    summary: text(
      "고대비 테마, 움직임 줄이기, 큰 조작 영역은 서로 다른 곳에서 바꿔요. 이 설정들은 도구·패널·메뉴 같은 화면에만 적용되고, 원고의 색은 바꾸지 않아요.",
      "High contrast, reduced motion and larger controls are changed in different places. These settings apply to the interface (tools, panels, menus) and never change the colors in your manuscript.",
    ),
    points: [
      {
        id: "contrast",
        title: text("고대비 테마", "High-contrast theme"),
        body: text(
          "설정의 ‘화면·음성’ 탭 → ‘디자인 테마’에서 ‘고대비’(명확한 경계와 또렷한 글자)를 고를 수 있어요. ‘시스템’ 테마를 고르면 운영체제의 고대비 설정을 먼저 따라가요. 사이트와 Studio의 테마는 따로 고를 수 있고, Studio는 기본으로 사이트 테마를 그대로 따라가요.",
          "Under Settings → Display & voice → Design theme you can pick High contrast (distinct boundaries, clear text). The System theme follows your operating system's contrast setting first. The site and Studio themes can be chosen separately, and Studio inherits the site theme by default.",
        ),
      },
      {
        id: "motion",
        title: text("움직임 줄이기", "Reduce motion"),
        body: text(
          "Studio의 ‘애플리케이션 설정’ → ‘기타’ 탭 → ‘동작 줄이기’를 켜면 패널과 미리보기의 움직임을 줄이고 짧은 전환으로 바꿔요. 여러 화면은 운영체제의 ‘동작 줄이기’ 설정도 따라요(설정의 ‘환경 진단’에 ‘OS 움직임 감소’ 상태가 나와요). 사이트 설정의 ‘화면 효과’를 ‘차분하게’로 두면 화려한 연출을 줄일 수 있어요. 이 항목은 Studio에는 적용되지 않아요.",
          "In Studio, Application settings → Other tab → Reduce motion turns panel and preview movement down to short transitions. Many screens also follow your operating system's reduce-motion setting (the settings' environment check shows an “OS reduced motion” state). Setting the site's Appearance to Calm tones down vivid effects, but that option does not apply to Studio.",
        ),
      },
      {
        id: "targets",
        title: text("큰 조작 영역", "Larger controls"),
        body: text(
          "‘애플리케이션 설정’의 ‘작업 환경 빠른 맞춤’에서 ‘터치 우선’을 고르면 ‘큰 조작 영역과 멀티터치 탐색을 우선’하도록 설정이 바뀌어요. 모바일의 주요 터치 대상은 최소 44 CSS px을 기준으로 한다고 접근성 안내에 밝혀 두었고, 공용 버튼은 터치 기기(거친 포인터)에서 높이가 44px로 커져요. 다만 버튼 크기만 따로 키우는 설정은 확인하지 못했어요. 브라우저의 확대 기능을 함께 써 보세요. 화면이 좁아지면 배치가 바뀔 수 있어요.",
          "In Application settings, choosing Touch first under Quick setup favors larger control areas and multi-touch navigation. The accessibility statement says primary touch targets on mobile use a 44 CSS px baseline, and the shared buttons grow to 44 px tall on touch devices (coarse pointers). We did not find a setting that enlarges buttons alone, so try your browser's zoom as well; the layout can change as the screen gets narrower.",
        ),
      },
      {
        id: "focus-profile",
        title: text("집중·접근성 프로필", "The Focus and accessibility profile"),
        body: text(
          "‘집중·접근성’ 프로필은 움직임을 줄이고 핵심 도구와 명확한 안내만 남겨 시각적 부담을 낮춰요. 도구 설명은 사용 예시까지 보여 주는 쪽으로, ‘동작 줄이기’는 켜는 쪽으로 바뀌어요. 적용한 뒤에도 각 항목은 ‘세부 설정’에서 따로 되돌릴 수 있어요.",
          "The Focus and accessibility profile lowers visual load by reducing motion and keeping essential tools and clear guidance. It switches tool hints to the version with usage examples and turns Reduce motion on. After applying it you can still change each item individually under the detailed settings.",
        ),
      },
    ],
    links: [
      { href: "/settings", label: text("설정 열기 (화면·음성 탭)", "Open settings (Display & voice tab)") },
      { href: "/accessibility", label: text("접근성 안내", "Accessibility statement") },
    ],
  },
  {
    id: "readers",
    title: text("독자를 위한 대체 텍스트와 읽기 순서", "Alt text and reading order for readers"),
    status: "partial",
    summary: text(
      "게시한 페이지는 이미지라서, 화면을 볼 수 없는 독자에게는 작가가 적은 대체 텍스트가 이야기의 길잡이가 돼요. 읽기 순서는 이미지 안에서 말풍선을 놓는 방식으로 정해져요.",
      "Published pages are images, so for readers who cannot see the screen the alt text you write is the guide to the story. Reading order is set by how you place speech bubbles inside the images.",
    ),
    points: [
      {
        id: "alt-where",
        title: text("작품 대체 텍스트는 어디에 적나요", "Where do I write the alt text?"),
        body: text(
          "Studio의 게시 단계에 ‘작품 대체 텍스트’ 칸이 있어요(최대 1,000자). 이미지를 볼 수 없는 독자도 핵심 장면을 이해할 수 있게 설명하는 칸이에요. 작품 단위로 한 개를 적으면, 독자 화면은 여러 쪽일 때 각 페이지 이미지에 이 글 뒤로 ‘n/전체 페이지’를 붙여 읽어 줘요. 비워 두면 입력해 달라는 경고가 뜨고, 독자 화면은 작품 제목(여러 쪽이면 쪽수도)으로 대신해요. 페이지마다 따로 적는 칸은 확인하지 못했어요.",
          "The publishing step in Studio has a Work alt text field (up to 1,000 characters) meant to let readers who cannot see the images understand the key scenes. You write one text per work, and for multi-page works the reader view reads it for every page image followed by “n/total pages”. Leaving it empty raises a warning, and the reader view falls back to the title (plus the page number for multi-page works). We did not find a per-page field.",
        ),
      },
      {
        id: "alt-write",
        title: text("대체 텍스트 쓰는 법", "How to write it"),
        body: text(
          "누가 어디서 무엇을 하는지, 장면이 바뀌는 순서대로 적어요. 말풍선 속 대사는 그림 안의 글자라서 화면 낭독기가 읽지 못해요. 이야기에 꼭 필요한 대사는 대체 텍스트에 옮겨 적어요. 장식일 뿐인 요소는 빼고, 표정이나 분위기처럼 이야기를 이해하는 데 필요한 것만 남겨요. 1,000자 안에서 작품의 흐름을 요약한다고 생각하면 돼요.",
          "Say who does what and where, in the order the scenes change. Dialogue inside speech bubbles is text drawn in the picture, so screen readers cannot read it; copy the lines the story needs into the alt text. Leave out purely decorative details and keep what helps follow the story, like expressions and mood. Think of it as a summary of the work's flow within 1,000 characters.",
        ),
      },
      {
        id: "order",
        title: text("읽기 순서 정하기", "Setting the reading order"),
        body: text(
          "세로 스크롤 웹툰은 위에서 아래로, 같은 높이에서는 왼쪽에서 오른쪽으로 읽는 흐름을 출발점으로 삼아요. 질문과 대답이 같은 높이에 놓여 순서가 모호하면 화살표를 더하기 전에 높이·간격·구도를 먼저 조정해요. 화면 낭독기로 읽는 독자에게는 대체 텍스트에 적은 순서가 곧 읽는 순서예요.",
          "For vertical-scroll webtoons, start from top-to-bottom and, at the same height, left-to-right. If a question and its answer sit at the same height and the order is unclear, adjust height, spacing and composition before adding arrows. For readers using a screen reader, the order you write in the alt text is the reading order.",
        ),
      },
      {
        id: "preflight",
        title: text("내보내기 사전 점검의 확인 칸", "The export preflight checks"),
        body: text(
          "프로젝트의 내보내기 사전 점검에는 ‘대체 텍스트 범위’와 ‘읽기 순서 완료’를 표시하는 칸이 있어요. ‘웹툰 플랫폼’과 ‘전자책’은 읽기 순서를 확인하지 않으면 오류로, ‘SNS’와 ‘전자책’은 대체 텍스트가 모든 핵심 이미지에 없으면 경고로 알려 줘요. 이 칸들은 작가가 직접 확인하고 표시하는 칸이에요. ToonStudio가 이미지를 보고 판정하지 않아요.",
          "The project's export preflight has fields for Alt text coverage and Reading order complete. For Webtoon platform and E-book, an unconfirmed reading order is an error; for Social and E-book, missing alt text on essential images is a warning. You check and mark these fields yourself; ToonStudio does not look at the images and judge them.",
        ),
      },
      {
        id: "contrast",
        title: text("글자 크기와 대비는 원고에서 확인해요", "Check text size and contrast in the manuscript"),
        body: text(
          "고대비 테마는 화면(UI)에만 적용되어 원고 색은 바꾸지 않아요. 대사와 배경의 밝기 차이는 원고에서 직접 확인해요. 흑백 미리보기로 명도 관계를 보는 방법은 레슨에서 다뤄요. 내보내기 사전 점검에는 ‘가장 작은 글자’ 칸이 있고, 기준 값은 내보내기 대상마다 달라요.",
          "The high-contrast theme only affects the interface, not your manuscript colors, so check the brightness difference between dialogue and background in the manuscript itself. A lesson covers checking value relationships with a grayscale preview. The export preflight has a Smallest text field, and its reference value differs per export destination.",
        ),
      },
    ],
    links: [
      { href: "/studio/publish", label: text("게시 화면 (작품 대체 텍스트)", "Publishing (work alt text)") },
      { href: "/studio/manual/export", label: text("Studio 매뉴얼: 이미지 내보내기와 게시 준비", "Studio manual: exporting images and preparing to publish") },
      { href: "/learn/lessons/lettering", label: text("레슨: 말풍선과 대사로 읽는 길 만들기", "Lesson: building a reading path with speech bubbles") },
      { href: "/learn/lessons/character-silhouette", label: text("레슨: 작게 보여도 읽히는 캐릭터와 명도", "Lesson: characters and values that read at small sizes") },
    ],
  },
  {
    id: "listen",
    title: text("소리로 듣기: 캐릭터 토크 낭독", "Listening: Character Talk read-aloud"),
    status: "partial",
    summary: text(
      "캐릭터 토크(파일럿)에서는 캐릭터의 답변을 기기의 브라우저 내장 음성으로 들을 수 있어요. 외부 TTS 서비스, 음성 복제, 서버에 음성 저장은 쓰지 않아요.",
      "In Character Talk (pilot) you can listen to a character's reply in your device's built-in browser voice. No external TTS service, voice cloning or server-side audio storage is used.",
    ),
    points: [
      {
        id: "buttons",
        title: text("듣기와 정지", "Listen and Stop"),
        body: text(
          "캐릭터 답변마다 ‘듣기’ 버튼이 있고, 누르면 같은 자리의 버튼이 ‘정지’로 바뀌어요. 읽는 동안 Esc로도 멈추고, 화면을 떠나거나 다른 캐릭터를 고르면 소리가 끊겨요. 시작·종료·오류는 화면 낭독기에도 알려져요. 긴 답변은 문장 단위로 끊어 읽어요.",
          "Each character reply has a Listen button that turns into Stop in the same spot. Esc also stops it, and leaving the screen or switching character cuts the sound. Start, finish and errors are announced to screen readers too. Long replies are read sentence by sentence.",
        ),
      },
      {
        id: "auto",
        title: text("자동 낭독과 온라인 음성은 기본 꺼짐", "Auto-read and online voices are off by default"),
        body: text(
          "‘음성 낭독 설정’에서 자동 낭독을 켜면 새 답변부터 자동으로 읽어요. 화면 낭독기를 함께 쓰면 두 소리가 겹칠 수 있어요. ‘온라인 음성도 허용’을 켜기 전에는 이 기기 안에서 합성하는 한국어 음성만 써요. 브라우저가 ‘원격’으로 표시한 음성은 읽을 문장을 외부 서버로 보낼 수 있어요. 두 설정 모두 이 기기에만 저장돼요.",
          "Turning on auto-read in Read-aloud settings reads new replies automatically; if you also use a screen reader the two voices can overlap. Until you turn on Allow online voices, only Korean voices synthesized on this device are used. Voices your browser marks as remote may send the text to an outside server. Both settings are stored on this device only.",
        ),
      },
      {
        id: "unsupported",
        title: text("읽지 못할 때", "When it cannot read"),
        body: text(
          "브라우저가 음성 합성을 지원하지 않으면 듣기 버튼이 숨겨지고 안내가 나와요. 기기에 한국어 음성이 없으면 읽지 않고 이유와 다음 행동을 알려 줘요. ‘사용 환경 안내’에서 내 브라우저의 음성 합성 지원 여부를 확인할 수 있어요.",
          "If the browser does not support speech synthesis, the Listen buttons are hidden and a note explains why. If the device has no Korean voice, nothing is read and you are told why and what to do. The Environment guide shows whether your browser supports speech synthesis.",
        ),
      },
      {
        id: "author",
        title: text("작가는 캐릭터의 목소리를 정할 수 있어요", "Authors can set a character's voice"),
        body: text(
          "캐릭터 챗 관리에서 읽는 음성, 음색 힌트, 말하는 속도(0.80~1.25배), 목소리 높낮이(0.85~1.15배)를 정하고 미리 들을 수 있어요. 값은 알아듣기 어려운 극단을 막으려고 범위를 제한해요. 팬의 기기에 같은 음성이 없으면 음색 힌트에 맞는 다른 한국어 음성으로 읽어요. 음성 파일은 만들지도 저장하지도 않아요.",
          "In character chat management authors can choose the voice, a tone hint, speed (0.80–1.25×) and pitch (0.85–1.15×) and preview them. Ranges are limited to avoid unintelligible extremes. If a fan's device lacks the same voice, a Korean voice matching the tone hint is used. No audio file is created or stored.",
        ),
      },
    ],
    links: [
      { href: "/character-chat", label: text("캐릭터 토크 열기", "Open Character Talk") },
      { href: "/character-chat/manage", label: text("캐릭터 챗 관리 (작가용)", "Character chat management (for authors)") },
      { href: "/studio/environment", label: text("사용 환경 안내", "Environment guide") },
    ],
  },
]);

/** 키 표기 한 줄. `combos`의 각 항목은 대체 표기 하나이고(예: Ctrl+K 또는 ⌘K) 로케일별 표기를 갖는다. */
export interface GuideShortcut {
  readonly id: string;
  readonly action: GuideText;
  readonly combos: readonly GuideText[];
  /**
   * STUDIO_MANUAL.md "부록: 기본 단축키" 표의 '동작' 열 문구. 있으면 시험이 그 줄의 키가 `combos`
   * 안에 모두 있는지 대조한다(키 이름이 매뉴얼과 어긋나지 않게 하는 장치).
   */
  readonly manualAction?: string;
}

/** 로케일과 상관없이 같은 키 표기(예: "Ctrl+K")를 만든다. 다르면 두 번째 인자로 영어 표기를 준다. */
const key = (ko: string, en: string = ko): GuideText => ({ ko, en });

export const GUIDE_SHORTCUTS: readonly GuideShortcut[] = Object.freeze([
  { id: "find", action: text("기능·설정 찾기", "Find features and settings"), combos: [key("Ctrl+K"), key("⌘K"), key("F1")], manualAction: "명령·속성 통합 검색" },
  { id: "help", action: text("단축키 도움말 열기·닫기", "Open or close shortcut help"), combos: [key("?")], manualAction: "단축키 도움말" },
  { id: "brush-eraser", action: text("브러시 / 지우개", "Brush / Eraser"), combos: [key("B"), key("E")], manualAction: "브러시 / 지우개" },
  { id: "brush-size", action: text("브러시 크기 줄이기 / 늘리기", "Smaller / larger brush"), combos: [key("["), key("]")], manualAction: "브러시 크기 줄이기 / 늘리기" },
  { id: "select", action: text("객체 선택", "Select object"), combos: [key("V")], manualAction: "객체 선택" },
  { id: "fill", action: text("채우기", "Fill"), combos: [key("G")], manualAction: "채우기" },
  { id: "text", action: text("텍스트", "Text"), combos: [key("T")], manualAction: "텍스트" },
  { id: "undo", action: text("실행 취소", "Undo"), combos: [key("Ctrl/⌘+Z")], manualAction: "실행 취소" },
  { id: "redo", action: text("다시 실행", "Redo"), combos: [key("Ctrl/⌘+Shift+Z")], manualAction: "다시 실행" },
  { id: "pan", action: text("캔버스 화면 이동", "Pan the canvas"), combos: [key("Space+드래그", "Space+drag")], manualAction: "캔버스 화면 이동" },
  { id: "fit", action: text("화면에 맞추기", "Fit to screen"), combos: [key("Ctrl/⌘+0")], manualAction: "화면에 맞추기" },
  { id: "text-apply", action: text("대사 편집 적용", "Apply dialogue edit"), combos: [key("Ctrl/⌘+Enter")] },
  { id: "text-cancel", action: text("대사 편집 취소", "Cancel dialogue edit"), combos: [key("Esc")] },
]);

/**
 * 받아쓰기 안내문 — `message`는 앱이 실제로 보여 주는 한국어 문장 그대로이고(시험이 소스와 대조한다),
 * `meaning`·`action`만 로케일에 맞춰 풀어 쓴다.
 */
export interface GuideDictationMessage {
  readonly id: string;
  readonly message: string;
  readonly meaning: GuideText;
  readonly action: GuideText;
}

export const GUIDE_DICTATION_MESSAGES: readonly GuideDictationMessage[] = Object.freeze([
  {
    id: "unsupported",
    message: "이 브라우저는 음성 받아쓰기를 지원하지 않아요.",
    meaning: text("브라우저가 음성 인식을 제공하지 않아요.", "The browser does not provide speech recognition."),
    action: text("Chrome 또는 Edge에서 열거나, 키보드로 입력하거나 다른 기기에서 받아쓴 글을 붙여넣어요.", "Open in Chrome or Edge, type with the keyboard, or paste text dictated on another device."),
  },
  {
    id: "not-allowed",
    message: "마이크 권한이 필요해요.",
    meaning: text("브라우저가 마이크 사용을 막고 있어요.", "The browser is blocking microphone access."),
    action: text("주소창의 마이크 아이콘에서 허용한 뒤 다시 눌러요.", "Allow it from the microphone icon in the address bar, then press the button again."),
  },
  {
    id: "audio-capture",
    message: "마이크를 찾지 못했어요.",
    meaning: text("사용할 수 있는 마이크가 없어요.", "No usable microphone was found."),
    action: text("마이크 연결을 확인한 뒤 다시 눌러요.", "Check the microphone connection, then press the button again."),
  },
  {
    id: "no-speech",
    message: "음성이 들리지 않았어요.",
    meaning: text("말소리가 감지되지 않았어요.", "No speech was detected."),
    action: text("마이크 가까이에서 다시 말해요.", "Speak again closer to the microphone."),
  },
  {
    id: "network",
    message: "음성 인식 서버에 닿지 못했어요.",
    meaning: text("브라우저의 음성 인식 서비스에 연결하지 못했어요.", "The browser could not reach its speech recognition service."),
    action: text("인터넷 연결을 확인한 뒤 다시 눌러요.", "Check your internet connection, then press the button again."),
  },
  {
    id: "language-not-supported",
    message: "이 브라우저는 한국어 음성 인식을 지원하지 않아요.",
    meaning: text("브라우저가 한국어 인식을 지원하지 않아요.", "The browser does not support Korean recognition."),
    action: text("한국어 인식을 지원하는 브라우저에서 다시 시도해요.", "Try a browser that supports Korean recognition."),
  },
]);

export interface GuideChecklistItem {
  readonly id: string;
  readonly label: GuideText;
  /** 해당 작업을 하는 곳이나 더 읽을 곳(선택). */
  readonly link?: GuideLink;
}

export const GUIDE_CHECKLIST: readonly GuideChecklistItem[] = Object.freeze([
  {
    id: "reading-order",
    label: text("말풍선을 위→아래, 같은 높이는 왼쪽→오른쪽으로 소리 내어 읽어 보며 순서를 확인했어요.", "I read the bubbles aloud top-to-bottom and, at the same height, left-to-right, and the order holds."),
    link: { href: "/learn/lessons/lettering", label: text("레슨: 말풍선과 대사", "Lesson: speech bubbles and dialogue") },
  },
  {
    id: "small-screen",
    label: text("휴대전화 크기로 줄여 대사와 표정이 구분되는지 확인했어요.", "I shrank it to phone size and dialogue and expressions are still distinguishable."),
    link: { href: "/learn/lessons/publish-check", label: text("레슨: 게시용 파일 검수", "Lesson: checking files for publishing") },
  },
  {
    id: "value-contrast",
    label: text("흑백 미리보기로 대사와 배경의 밝기 차이를 확인했어요.", "I checked the brightness difference between dialogue and background in a grayscale preview."),
    link: { href: "/learn/lessons/character-silhouette", label: text("레슨: 명도와 실루엣", "Lesson: value and silhouette") },
  },
  {
    id: "no-color-only",
    label: text("색만으로 뜻을 전하지 않고 글자나 모양으로도 함께 보여 줬어요.", "I did not rely on color alone; meaning is also carried by text or shape."),
  },
  {
    id: "motion",
    label: text("깜빡이거나 빠르게 바뀌는 효과가 있다면 줄이거나 멈출 방법을 두었어요.", "If there are flashing or fast-changing effects, I reduced them or provided a way to stop them."),
  },
  {
    id: "alt-text",
    label: text("작품 대체 텍스트를 장면 순서대로 적고, 꼭 필요한 대사를 옮겨 적었어요.", "I wrote the work alt text in scene order and copied in the dialogue the story needs."),
    link: { href: "/studio/publish", label: text("게시 화면", "Publishing") },
  },
  {
    id: "preflight",
    label: text("내보내기 사전 점검에서 ‘읽기 순서 완료’와 ‘대체 텍스트 범위’를 직접 확인하고 표시했어요.", "In the export preflight I checked and marked Reading order complete and Alt text coverage myself."),
    link: { href: "/studio/manual/export", label: text("Studio 매뉴얼: 내보내기", "Studio manual: export") },
  },
]);

/** 알아 둘 한계 — 같은 내용을 접근성 안내(`/accessibility`)의 알려진 지원 범위와 맞춘다. */
export const GUIDE_LIMITS: readonly GuidePoint[] = Object.freeze([
  {
    id: "browser-dependent",
    title: text("브라우저·기기에 따라 달라요", "It depends on browser and device"),
    body: text(
      "받아쓰기의 글자와 낭독의 소리는 브라우저와 운영체제 기능이 만들어요. 지원 범위와 품질은 ToonStudio가 보증할 수 없고 기기마다 달라요.",
      "Dictated text and read-aloud sound come from browser and operating-system features. ToonStudio cannot guarantee their coverage or quality, and they vary by device.",
    ),
  },
  {
    id: "no-figures",
    title: text("정확도 같은 수치는 약속하지 않아요", "No accuracy figures are promised"),
    body: text(
      "인식 정확도, 읽기 속도의 체감, 지원 브라우저 비율처럼 측정하지 않은 수치는 적지 않았어요.",
      "We do not state figures we have not measured, such as recognition accuracy or the share of supported browsers.",
    ),
  },
  {
    id: "pointer-first",
    title: text("캔버스 직접 조작은 포인터 중심이에요", "Direct canvas input is pointer-first"),
    body: text(
      "드로잉과 3D 관절 조작에는 포인터 중심의 조작이 남아 있고, 키보드 대체 경로는 계속 넓히는 중이에요.",
      "Drawing and 3D joint manipulation still include pointer-first operations; keyboard alternatives are still being expanded.",
    ),
  },
  {
    id: "complex-views",
    title: text("복잡한 그래프·3D는 설명을 보강 중이에요", "Complex graphs and 3D are being improved"),
    body: text(
      "동등한 설명을 기능별로 보강하고 있어요. 핵심 상태와 오류는 글자로도 제공해요.",
      "Equivalent descriptions are being added feature by feature. Essential status and errors are also given as text.",
    ),
  },
  {
    id: "self-check",
    title: text("점검 칸은 작가의 확인이에요", "The check fields are your own confirmation"),
    body: text(
      "읽기 순서와 대체 텍스트는 사람이 읽고 판단해야 해요. 점검 칸을 표시했다고 독자가 실제로 잘 읽을 수 있다는 뜻은 아니에요.",
      "Reading order and alt text need a person to read and judge them. Marking a check does not mean readers can actually follow the work.",
    ),
  },
  {
    id: "external-assets",
    title: text("외부 소재의 대체 텍스트는 제작자에 따라 달라요", "Alt text on outside assets varies by creator"),
    body: text(
      "마켓의 이미지·영상은 대체 텍스트의 품질이 제작자가 입력한 정보에 따라 달라질 수 있어요.",
      "For marketplace images and video, alt text quality can depend on what the creator entered.",
    ),
  },
  {
    id: "not-certification",
    title: text("인증이 아니에요", "This is not a certification"),
    body: text(
      "이 안내는 접근성 기준을 참고하지만, ToonStudio나 어떤 작품이 특정 기준을 충족한다고 보증하지 않아요.",
      "This guide draws on accessibility standards but does not guarantee that ToonStudio or any work meets a given standard.",
    ),
  },
]);

export interface GuideReference {
  readonly id: string;
  /** 외부 문서 주소 — 표준·공식 문서의 안정적인 주소만 쓴다. */
  readonly href: string;
  readonly label: GuideText;
  readonly note: GuideText;
}

export const GUIDE_REFERENCES: readonly GuideReference[] = Object.freeze([
  {
    id: "wai-images",
    href: "https://www.w3.org/WAI/tutorials/images/",
    label: text("W3C WAI: 이미지 튜토리얼", "W3C WAI: Images tutorial"),
    note: text("대체 텍스트를 언제 어떻게 쓰는지에 대한 설명", "When and how to write alternative text"),
  },
  {
    id: "wcag22",
    href: "https://www.w3.org/TR/WCAG22/",
    label: text("WCAG 2.2", "WCAG 2.2"),
    note: text("비텍스트 콘텐츠, 의미 있는 순서, 색 사용, 대비, 동작 같은 성공 기준", "Success criteria such as non-text content, meaningful sequence, use of color, contrast and motion"),
  },
  {
    id: "mdn-recognition",
    href: "https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition",
    label: text("MDN: SpeechRecognition", "MDN: SpeechRecognition"),
    note: text("받아쓰기가 쓰는 브라우저 음성 인식 API와 브라우저별 지원", "The browser speech recognition API behind dictation and its browser support"),
  },
  {
    id: "mdn-synthesis",
    href: "https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis",
    label: text("MDN: SpeechSynthesis", "MDN: SpeechSynthesis"),
    note: text("낭독이 쓰는 브라우저 음성 합성 API", "The browser speech synthesis API behind read-aloud"),
  },
]);
