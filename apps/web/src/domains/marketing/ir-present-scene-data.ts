interface SceneMeta {
  title: string;
  /** 목차에 함께 보이는 씬의 작은 제목(아티팩트의 .kicker 문구). 없으면 null. */
  kicker: string | null;
  audio: string;
  /** 내레이션을 못 쓸 때의 자동 진행 체류 시간(초). */
  dwell: number;
}

export const SCENE_META: SceneMeta[] = [
  { title: "표지", kicker: null, audio: "n01.mp3", dwell: 18 },
  { title: "예비 창업 도전자 소개", kicker: "예비 창업 도전자 — 만든 사람부터 소개할게요", audio: "n02.mp3", dwell: 27 },
  { title: "문제 — 끊기는 제작 흐름", kicker: "Problem", audio: "n03.mp3", dwell: 25 },
  { title: "솔루션 — 이어지는 파이프라인", kicker: "Pipeline", audio: "n04.mp3", dwell: 19 },
  { title: "제품 수치", kicker: "Proof in Numbers", audio: "n05.mp3", dwell: 22 },
  { title: "역할별 UX", kicker: "Roles", audio: "n06.mp3", dwell: 20 },
  { title: "시장 — 국내 웹툰 산업", kicker: "Market", audio: "n07.mp3", dwell: 22 },
  { title: "시장 — 글로벌 전망", kicker: "Global Market", audio: "n08.mp3", dwell: 23 },
  { title: "외산 독과점 실태", kicker: "Foreign Monopoly", audio: "n09.mp3", dwell: 25 },
  { title: "파편화 지도", kicker: "Fragmentation Map", audio: "n10.mp3", dwell: 20 },
  { title: "전환 비용", kicker: "Switching Cost", audio: "n11.mp3", dwell: 27 },
  { title: "공정 커버리지 비교", kicker: "Coverage", audio: "n12.mp3", dwell: 20 },
  { title: "크레코와 비교", kicker: "Versus", audio: "n13.mp3", dwell: 24 },
  { title: "차별화", kicker: "Differentiation", audio: "n14.mp3", dwell: 18 },
  { title: "규모별 커버", kicker: "Scale", audio: "n15.mp3", dwell: 22 },
  { title: "제품 심층 ① 무대와 엔진", kicker: "Product Deep Dive · 1/2", audio: "n16.mp3", dwell: 25 },
  { title: "제품 심층 ② 3D와 협업", kicker: "Product Deep Dive · 2/2", audio: "n17.mp3", dwell: 22 },
  { title: "홍보영상 — 제품 투어", kicker: "Product Tour Film", audio: "n18.mp3", dwell: 19 },
  { title: "기술 구조", kicker: "Technology", audio: "n19.mp3", dwell: 24 },
  { title: "Responsible AI", kicker: "Responsible AI", audio: "n20.mp3", dwell: 21 },
  { title: "비즈니스 모델", kicker: "Business Model", audio: "n21.mp3", dwell: 24 },
  { title: "검증 로드맵", kicker: "Roadmap", audio: "n22.mp3", dwell: 38 },
  { title: "팀 · Ask", kicker: "Team & Ask", audio: "n23.mp3", dwell: 22 },
  { title: "마무리", kicker: null, audio: "n24.mp3", dwell: 32 },
];

export const TOTAL = SCENE_META.length;

