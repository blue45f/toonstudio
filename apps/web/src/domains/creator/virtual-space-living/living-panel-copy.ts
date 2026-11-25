import { useCallback } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const ENGLISH_COPY: Readonly<Record<string, string>> = {
  "가상 스튜디오 2.5D 리빙 엔진 워크벤치": "Virtual studio 2.5D living engine workbench",
  "가상 스튜디오 2.5D 리빙 엔진": "Virtual studio 2.5D living engine",
  "가상 스튜디오 리빙 엔진 기능 탭": "Virtual studio living engine features",
  "버튼으로 고정 1/60초 물리 모델을 계산하는 CPU 예제입니다. 실제 60fps 측정·작품 반영·동료 연결·기기 저장은 수행하지 않으며, 닫으면 설정이 사라집니다.": "This CPU example calculates a fixed 1/60-second physics model on button presses. It does not measure actual 60fps performance, modify artwork, connect peers or save to your device. Settings disappear when closed.",
  "2.5D 스프링 물리·분위기 VFX·아바타·6테마 방 엔진이 준비되었습니다.": "2.5D spring physics, atmosphere VFX, avatars and 6 themed rooms are ready.",
  "2.5D 스프링 캐릭터": "2.5D spring character",
  "시간·날씨·이모트 휠": "Time, weather and emote wheel",
  "아바타·6테마 방·뽀모도로": "Avatar, 6 rooms and Pomodoro",
  "민서 · 선화": "Minseo · line art",
  "도윤 · 채색": "Doyun · coloring",
  "북서": "Northwest", "북": "North", "북동": "Northeast", "서": "West", "정지": "Stop", "동": "East", "남서": "Southwest", "남": "South", "남동": "Southeast",
  "북서쪽": "Northwest", "북쪽": "North", "북동쪽": "Northeast", "서쪽": "West", "동쪽": "East", "남서쪽": "Southwest", "남쪽": "South", "남동쪽": "Southeast",
  "가까운 동료 자동": "Nearest peer automatically",
  "좌측 캔버스": "Left canvas", "상단 창가": "Upper window", "우측 자료함": "Right reference shelf",
  "정면 작업 중": "Facing forward", "포인터 시선 추적": "Tracking pointer",
  "2.5D 스프링 캐릭터 물리 스테이지 프리뷰": "2.5D spring character physics stage preview",
  "관성 속도 · 8방위": "Inertial speed · 8 directions",
  "스쿼시·스트레치 (부피)": "Squash and stretch (volume)",
  "시선각 · 눈꺼풀": "Gaze angle · eyelids", "2차 스프링 변위": "Secondary spring displacement",
  "8방향 관성 이동 패드": "8-direction movement pad",
  "전력 질주": "Sprint", "15프레임 진행": "Advance 15 frames", "초기화": "Reset",
  "감속 마찰을 적용해 캐릭터를 부드럽게 정지했습니다.": "Applied braking friction to stop the character smoothly.",
  "전력 질주(1.55배 가속·잔상 강화)를 켰습니다.": "Sprint enabled (1.55× acceleration and stronger afterimages).",
  "기본 보행 속도로 전환했습니다.": "Switched to normal walking speed.",
  "고정 1/60초 CPU 물리 모델을 15스텝 진행했습니다. 실제 프레임 성능 측정은 아닙니다.": "Advanced the fixed 1/60-second CPU physics model by 15 steps. This is not a measurement of actual frame performance.",
  "스프라이트 좌표·관성·스프링 체인을 초기 상태로 되돌렸습니다.": "Reset sprite position, inertia and spring chains.",
  "포인터·동료 시선 추적 대상": "Pointer and peer gaze target",
  "시간대 4종 광원 색온도 · 그림자 각도 프로파일": "4 time-of-day lighting and shadow profiles",
  "새벽 여명": "Dawn light", "새벽": "Dawn", "한낮 작업광": "Daylight work light", "낮": "Day",
  "노을 골든아워": "Sunset golden hour", "노을": "Sunset", "심야 데스크램프": "Late-night desk lamp", "심야": "Night",
  "창가로 스며드는 차분한 3600K 아침 햇살과 긴 대각선 그림자": "Calm 3600K morning light through the window with long diagonal shadows",
  "색 보정에 안정적인 5600K 주광과 짧은 정오 그림자": "5600K daylight for color work with short midday shadows",
  "따뜻한 2800K 석양 역광과 서쪽으로 길게 뻗는 그림자": "Warm 2800K sunset backlight with long westward shadows",
  "7400K 창밖 달빛과 스탠드 집중광이 교차하는 마감 분위기": "7400K moonlight outside meets a focused desk lamp for late-night work",
  "날씨·감정 멀티레이어 파티클": "Multilayer weather and mood particles",
  "맑은 미풍": "Clear breeze", "창가 빗줄기": "Window rain", "봄 벚꽃 바람": "Spring blossom breeze", "마감 집중 오라": "Deadline focus aura",
  "멀티레이어 날씨 및 감정 파티클 시뮬레이션 뷰": "Multilayer weather and mood particle simulation",
  "발걸음 먼지": "Footstep dust", "커피 스팀": "Coffee steam", "벚꽃 잎": "Cherry blossom petals", "집중 오라 링": "Focus aura ring",
  "배경": "Background", "중경": "Midground", "전경": "Foreground",
  "파티클 물리를 0.25초 진행했습니다.": "Advanced particle physics by 0.25 seconds.", "0.25초 진행": "Advance 0.25 seconds",
  "8섹터 방사형 이모트/액션 휠": "8-sector radial emote and action wheel", "중앙 데드존": "Center dead zone",
  "누적 발동": "Triggered",
  "회 · 각 섹터 클릭 시 연결된 VFX 파티클이 함께 방출되며 개별 쿨다운이 적용됩니다.": " times · Each sector emits its linked VFX particles and has its own cooldown.",
  "응원 박수": "Cheering applause", "커피 한 잔": "Coffee break", "마감 집중": "Deadline focus", "아이디어 번뜩": "Idea spark",
  "손목 스트레칭": "Wrist stretch", "컷 피드백 요청": "Panel feedback request", "작업실 음감": "Studio music", "컷 완성 축하": "Panel completion celebration",
  "응원 박수 이모트 · 12시 북쪽 섹터 (단축키 1)": "Cheering applause emote · 12 o'clock north sector (shortcut 1)",
  "커피 한 잔 휴식 제안 · 1시 반 북동 섹터 (단축키 2)": "Coffee break suggestion · 1:30 northeast sector (shortcut 2)",
  "마감 집중 오라 켜기 · 3시 동쪽 섹터 (단축키 3)": "Deadline focus aura · 3 o'clock east sector (shortcut 3)",
  "아이디어 번뜩 영감 공유 · 4시 반 남동 섹터 (단축키 4)": "Idea spark sharing · 4:30 southeast sector (shortcut 4)",
  "손목 스트레칭 알림 · 6시 남쪽 섹터 (단축키 5)": "Wrist stretch reminder · 6 o'clock south sector (shortcut 5)",
  "컷 구도 피드백 요청 · 7시 반 남서 섹터 (단축키 6)": "Panel feedback request · 7:30 southwest sector (shortcut 6)",
  "작업실 음악 공감 · 9시 서쪽 섹터 (단축키 7)": "Studio music sharing · 9 o'clock west sector (shortcut 7)",
  "컷 마감 완료 축하 · 10시 반 북서 섹터 (단축키 8)": "Panel completion celebration · 10:30 northwest sector (shortcut 8)",
  "12시": "12 o'clock", "1시 반": "1:30", "3시": "3 o'clock", "4시 반": "4:30", "6시": "6 o'clock", "7시 반": "7:30", "9시": "9 o'clock", "10시 반": "10:30",
  "유효하지 않은 이모트 섹터입니다.": "Invalid emote sector.",
  "6종 테마 스튜디오 카탈로그 (사전 베이크 WebP)": "6 themed studios (prebaked WebP)",
  "원목 아틀리에": "Wood atelier", "루프탑 테라스": "Rooftop terrace", "심야 만화카페": "Midnight manga cafe",
  "자료 아카이브 서재": "Reference library", "판타지 길드 홀": "Fantasy guild hall", "원화 코믹 갤러리": "Comic art gallery",
  "따뜻한 자작나무 책상과 채광창이 어우러진 기본 개인 작업실": "A private studio with a warm birch desk and skylight",
  "노을 바람과 벚꽃 잎이 스치는 개방형 야외 드로잉 데크": "An open-air drawing deck with sunset breezes and cherry blossoms",
  "빗소리 들리는 창가 부스와 은은한 스탠드 조명의 야간 마감 공간": "A late-night work booth by a rainy window with a soft desk lamp",
  "화보집과 해부학 서가가 둘러싼 고요한 레퍼런스 연구실": "A quiet reference room lined with art books and anatomy shelves",
  "팀 연재 회의를 위한 원탁과 촛불 샹들리에 합동 스튜디오": "A shared studio with a round meeting table and candle chandelier",
  "완성 원고를 전시하고 독자·동료 피드백을 나누는 쇼케이스 홀": "A showcase hall for finished pages and reader or peer feedback",
  "종이 펜 사각임 (음향 설명 예시)": "Pen on paper (sound description example)", "산들바람 (음향 설명 예시)": "Gentle breeze (sound description example)",
  "창가 빗소리 (음향 설명 예시)": "Window rain (sound description example)", "책장 넘김 (음향 설명 예시)": "Turning pages (sound description example)",
  "벽난로 장작 (음향 설명 예시)": "Firewood crackling (sound description example)", "전시장 정적 (음향 설명 예시)": "Quiet gallery (sound description example)",
  "6슬롯 레이어드 아바타 커스터마이저": "6-slot layered avatar customizer",
  "1. 헤어": "1. Hair", "2. 표정": "2. Expression", "3. 상의": "3. Top", "4. 하의": "4. Bottom",
  "5. 장르 의상 프리셋 (6종)": "5. Genre outfit (6 presets)", "6. 스튜디오 반려동물 (4종)": "6. Studio pet (4 choices)",
  "숏 울프컷": "Short wolf cut", "로우 포니테일": "Low ponytail", "자연 웨이브": "Natural waves", "투블럭 쉼표": "Comma two-block cut", "반묶음 롱": "Long half-up hair",
  "차분한 미소": "Calm smile", "영감 번뜩": "Inspired spark", "커피 휴식": "Coffee rest", "환한 응원": "Bright cheer",
  "린넨 작업 셔츠": "Linen work shirt", "오버핏 니트 가디건": "Oversized knit cardigan", "크롭 워크 재킷": "Cropped work jacket", "모크넥 스웨터": "Mock-neck sweater", "붓주머니 에이프런": "Brush-pocket apron",
  "와이드 코튼 팬츠": "Wide cotton pants", "데님 슬랙스": "Denim slacks", "플리츠 미디 스커트": "Pleated midi skirt", "카고 조거 팬츠": "Cargo joggers", "테일러드 치노": "Tailored chinos",
  "일상 아틀리에": "Everyday atelier", "판타지 마법사": "Fantasy mage", "사이버 잉크러너": "Cyber ink runner", "캠퍼스 로맨스": "Campus romance", "느와르 탐정": "Noir detective", "모던 생활한복": "Modern casual hanbok",
  "일상·드라마": "Everyday drama", "판타지·로판": "Fantasy and romantic fantasy", "SF·액션": "Sci-fi and action", "로맨스·학원": "Romance and school", "스릴러·미스터리": "Thriller and mystery", "동양판타지·무협": "Eastern fantasy and martial arts",
  "삼색 고양이": "Calico cat", "웰시코기": "Welsh corgi", "먹물 부엉이": "Ink owl", "낮잠 시바견": "Napping shiba",
  "합성 작품 주인공 예시 선택": "Choose a synthetic protagonist example", "주인공 해제": "Clear protagonist",
  "불러온 주인공 연결을 해제하고 기본 아바타로 돌아갔습니다.": "Cleared the protagonist example and returned to the default avatar.",
  "별빛 잉크의 연대기": "Chronicles of Starlight Ink", "서연우": "Seo Yeonwoo", "별자리 만년필": "Constellation fountain pen",
  "네온 비 오는 종로 2099": "Neon Rain in Jongno 2099", "강하진": "Kang Hajin", "홀로그램 스케치패드": "Holographic sketchpad",
  "은행잎 떨어진 미술관 앞": "Ginkgo Leaves by the Gallery", "윤다혜": "Yoon Dahye", "크로키 수첩": "Sketch notebook",
  "현재 기본 커스텀 아바타를 사용 중입니다.": "Using the default custom avatar.",
  "그리드 스냅 책상 가구 배치 (12×8)": "Grid-snapped desk furniture (12×8)", "배치할 가구 선택": "Choose furniture to place",
  "액정 타블렛 책상": "Pen-display desk", "인체공학 작업 의자": "Ergonomic work chair", "드립 커피 스테이션": "Drip coffee station", "레퍼런스 자료 책장": "Reference bookshelf",
  "몬스테라 화분": "Monstera pot", "아키텍트 데스크램프": "Architect desk lamp", "반려동물 캣타워": "Pet climbing tower",
  "90° 회전": "Rotate 90°", "제거": "Remove", "가구 점유됨": "Occupied by furniture", "비어 있음": "Empty",
  "등록되지 않은 가구 항목입니다.": "Unknown furniture item.", "이동할 가구를 찾지 못했습니다.": "Could not find furniture to move.", "회전할 가구를 찾지 못했습니다.": "Could not find furniture to rotate.",
  "선택한 책상 가구를 스튜디오 격자에서 제거했습니다.": "Removed the selected furniture from the studio grid.",
  "로컬 뽀모도로 예제 · 네트워크 동기화 없음": "Local Pomodoro example · no network sync",
  "대기 중": "Idle", "팀 스프린트 집중": "Team focus sprint", "짧은 휴식 · 스트레칭": "Short break · stretch", "긴 휴식 · 재충전": "Long break · recharge",
  "25/5 표준 마감": "25/5 standard sprint", "50/10 딥 포커스": "50/10 deep focus", "15/3 러프 퀵": "15/3 quick draft",
  "로컬 뽀모도로를 일시정지했습니다.": "Paused the local Pomodoro timer.", "로컬 뽀모도로 스프린트를 시작했습니다.": "Started the local Pomodoro sprint.",
  "로컬 뽀모도로 타이머를 초기화했습니다.": "Reset the local Pomodoro timer.", "일시정지": "Pause", "스프린트 시작": "Start sprint", "+60초": "+60 seconds", "다음 단계": "Next phase",
  "민서 · 선화 어시 예시": "Minseo · line art assistant example", "도윤 · 채색 담당 예시": "Doyun · colorist example", "하린 · 3D 배경 예시": "Harin · 3D background example",
  "12화 14~22컷 펜선": "Episode 12, panels 14–22 line art", "노을 배경 톤 보정": "Adjust sunset background tones", "서재 책장 라이팅": "Library bookshelf lighting",
};

interface CopyPattern {
  readonly pattern: RegExp;
  readonly keys: readonly string[];
  readonly ko: string;
  readonly en: string;
}

// 엔진의 기존 한국어 계약은 유지하고, 화면에서만 고정 번역 키와 매개변수로 나눈다.
const COPY_PATTERNS: readonly CopyPattern[] = [
  { pattern: /^현재 상태: (.+)$/u, keys: ["label"], ko: "현재 상태: {label}", en: "Current state: {label}" },
  { pattern: /^(.+) 방향으로 15프레임 관성 이동 및 2차 스프링 시뮬레이션을 실행했습니다\.$/u, keys: ["label"], ko: "{label} 방향으로 15프레임 관성 이동 및 2차 스프링 시뮬레이션을 실행했습니다.", en: "Simulated 15 frames of inertial movement and spring motion toward {label}." },
  { pattern: /^시선 추적 목표를 '(.+)'로 전환했습니다\.$/u, keys: ["label"], ko: "시선 추적 목표를 '{label}'로 전환했습니다.", en: "Gaze target changed to '{label}'." },
  { pattern: /^(.+) 바라보는 중$/u, keys: ["label"], ko: "{label} 바라보는 중", en: "Looking at {label}" },
  { pattern: /^(.+) 파티클 버스트를 방출했습니다\.$/u, keys: ["label"], ko: "{label} 파티클 버스트를 방출했습니다.", en: "Emitted a {label} particle burst." },
  { pattern: /^테마 스튜디오 '(.+)'로 전환하고 권장 광원·날씨를 맞췄습니다\.$/u, keys: ["label"], ko: "테마 스튜디오 '{label}'로 전환하고 권장 광원·날씨를 맞췄습니다.", en: "Switched to '{label}' with its suggested lighting and weather." },
  { pattern: /^(.+) 선택됨 · (.+)$/u, keys: ["label", "message"], ko: "{label} 선택됨 · {message}", en: "Selected {label} · {message}" },
  { pattern: /^(.+)\((\d+)×(\d+)\)가 방 격자 경계를 벗어납니다\.$/u, keys: ["label", "width", "height"], ko: "{label}({width}×{height})가 방 격자 경계를 벗어납니다.", en: "{label} ({width}×{height}) extends beyond the room grid." },
  { pattern: /^기존 배치 가구\((\d+)개\)와 겹쳐 배치할 수 없습니다\.$/u, keys: ["count"], ko: "기존 배치 가구({count}개)와 겹쳐 배치할 수 없습니다.", en: "Cannot place furniture: it overlaps {count} existing items." },
  { pattern: /^(.+) \((\d+), (\d+)\) 배치 가능$/u, keys: ["label", "col", "row"], ko: "{label} ({col}, {row}) 배치 가능", en: "{label} can be placed at ({col}, {row})" },
  { pattern: /^로컬 뽀모도로를 (\d+)초 진행했습니다\.$/u, keys: ["seconds"], ko: "로컬 뽀모도로를 {seconds}초 진행했습니다.", en: "Advanced the local Pomodoro timer by {seconds} seconds." },
  { pattern: /^(.+)\((\d+)K\) 광원 프로파일을 적용했습니다\.$/u, keys: ["label", "temperature"], ko: "{label}({temperature}K) 광원 프로파일을 적용했습니다.", en: "Applied the {label} ({temperature}K) lighting profile." },
  { pattern: /^날씨·감정 파티클 프리셋을 '(.+)'로 변경했습니다\.$/u, keys: ["label"], ko: "날씨·감정 파티클 프리셋을 '{label}'로 변경했습니다.", en: "Weather and mood particles changed to '{label}'." },
  { pattern: /^(.+) 쿨다운 진행 중 \(([\d.]+)초 남음\)$/u, keys: ["label", "seconds"], ko: "{label} 쿨다운 진행 중 ({seconds}초 남음)", en: "{label} cooldown ({seconds} seconds remaining)" },
  { pattern: /^(.+) \((.+)\) 이모트를 발동했습니다\.$/u, keys: ["label", "clock"], ko: "{label} ({clock}) 이모트를 발동했습니다.", en: "Triggered {label} ({clock})." },
  { pattern: /^로컬 뽀모도로 프리셋을 '(.+)'로 변경했습니다\.$/u, keys: ["label"], ko: "로컬 뽀모도로 프리셋을 '{label}'로 변경했습니다.", en: "Local Pomodoro preset changed to '{label}'." },
  { pattern: /^합성 작품 '(.+)'의 (.+) 구성을 예시로 선택했습니다\. 실제 작품은 읽지 않습니다\.$/u, keys: ["work", "character"], ko: "합성 작품 '{work}'의 {character} 구성을 예시로 선택했습니다. 실제 작품은 읽지 않습니다.", en: "Selected {character} from the synthetic work '{work}' as an example. No actual artwork is read." },
  { pattern: /^예시 선택: (.+) \((.+) · (.+)\)$/u, keys: ["character", "work", "prop"], ko: "예시 선택: {character} ({work} · {prop})", en: "Selected example: {character} ({work} · {prop})" },
  { pattern: /^(\d+)회차 스프린트 완료! 팀 긴 휴식\((\d+)분\)으로 전환합니다\.$/u, keys: ["count", "minutes"], ko: "{count}회차 스프린트 완료! 팀 긴 휴식({minutes}분)으로 전환합니다.", en: "Sprint {count} complete! Switching to a {minutes}-minute team long break." },
  { pattern: /^(\d+)회차 스프린트 완료! 팀 짧은 휴식\((\d+)분\)을 시작합니다\.$/u, keys: ["count", "minutes"], ko: "{count}회차 스프린트 완료! 팀 짧은 휴식({minutes}분)을 시작합니다.", en: "Sprint {count} complete! Starting a {minutes}-minute team short break." },
  { pattern: /^휴식 종료! 다음 팀 스프린트\((\d+)분\)에 돌입합니다\.$/u, keys: ["minutes"], ko: "휴식 종료! 다음 팀 스프린트({minutes}분)에 돌입합니다.", en: "Break over! Starting the next {minutes}-minute team sprint." },
  { pattern: /^(.+) 가상 스튜디오 배경$/u, keys: ["label"], ko: "{label} 가상 스튜디오 배경", en: "{label} virtual studio background" },
  { pattern: /^(.+) 스튜디오 테마 썸네일$/u, keys: ["label"], ko: "{label} 스튜디오 테마 썸네일", en: "{label} studio theme thumbnail" },
  { pattern: /^헤어 ([\d.]+) \/ 망토 ([\d.]+) px$/u, keys: ["hair", "cape"], ko: "헤어 {hair} / 망토 {cape} px", en: "Hair {hair} / cape {cape} px" },
  { pattern: /^(\d+)K · 그림자 (-?[\d.]+)° \(([\d.]+)px\) · ([\d.]+) lx$/u, keys: ["temperature", "angle", "length", "lux"], ko: "{temperature}K · 그림자 {angle}° ({length}px) · {lux} lx", en: "{temperature}K · shadow {angle}° ({length}px) · {lux} lx" },
  { pattern: /^총 (\d+)개$/u, keys: ["count"], ko: "총 {count}개", en: "Total {count}" },
  { pattern: /^([\d.]+)° → 섹터 #(\d+) \((.+)\)$/u, keys: ["angle", "index", "label"], ko: "{angle}° → 섹터 #{index} ({label})", en: "{angle}° → sector #{index} ({label})" },
  { pattern: /^대기 ([\d.]+)s$/u, keys: ["seconds"], ko: "대기 {seconds}s", en: "Wait {seconds}s" },
  { pattern: /^누적 발동 (\d+)회 · 각 섹터 클릭 시 연결된 VFX 파티클이 함께 방출되며 개별 쿨다운이 적용됩니다\.$/u, keys: ["count"], ko: "누적 발동 {count}회 · 각 섹터 클릭 시 연결된 VFX 파티클이 함께 방출되며 개별 쿨다운이 적용됩니다.", en: "Triggered {count} times · Each sector emits its linked VFX particles and has its own cooldown." },
  { pattern: /^정원 (\d+)명 · (.+)$/u, keys: ["count", "sound"], ko: "정원 {count}명 · {sound}", en: "Capacity {count} · {sound}" },
  { pattern: /^(\d+)인$/u, keys: ["count"], ko: "{count}인", en: "{count} people" },
  { pattern: /^활성 레이어 (\d+)층$/u, keys: ["count"], ko: "활성 레이어 {count}층", en: "Active layers: {count}" },
  { pattern: /^배치 (\d+)개$/u, keys: ["count"], ko: "배치 {count}개", en: "Placed: {count}" },
  { pattern: /^책상 격자 (\d+)열 (\d+)행 (.+)$/u, keys: ["col", "row", "state"], ko: "책상 격자 {col}열 {row}행 {state}", en: "Desk grid column {col}, row {row}: {state}" },
  { pattern: /^완료 (\d+)회 · 동기화 rev\.(\d+)$/u, keys: ["count", "revision"], ko: "완료 {count}회 · 동기화 rev.{revision}", en: "Completed {count} · sync rev.{revision}" },
  { pattern: /^합성 동료 예시 \((\d+)명 · 실제 연결 0명\)$/u, keys: ["count"], ko: "합성 동료 예시 ({count}명 · 실제 연결 0명)", en: "Synthetic peer examples ({count} · 0 actual connections)" },
];

export function useLivingPanelCopy(): (source: string) => string {
  const bt = useBilingual("StudioVirtualSpaceLivingPanel");
  return useCallback(function copy(source: string): string {
    if (Object.hasOwn(ENGLISH_COPY, source)) return bt(source, ENGLISH_COPY[source] ?? source);
    for (const entry of COPY_PATTERNS) {
      const match = entry.pattern.exec(source);
      if (!match) continue;
      const parameters: Record<string, string> = {};
      entry.keys.forEach((key, index) => {
        parameters[key] = match[index + 1] ?? "";
      });
      return bt(entry.ko, entry.en).replace(/\{(\w+)\}/gu, (_placeholder, key: string) => copy(parameters[key] ?? ""));
    }
    return source;
  }, [bt]);
}
