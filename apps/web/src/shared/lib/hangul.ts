/**
 * 한글 검색·조사 공용 유틸 — es-hangul(MIT, toss/es-hangul) 단일 진입점.
 *
 * 배경: 한국어 제품인데 한글 처리가 전무했고, 초성은 명령 팔레트 전용으로
 * 손구현(command-palette-search)돼 있어 대사 검색 등 다른 표면은 쓸 수 없었다.
 * 이 모듈이 초성 추출·초성 질의 판정·텍스트 매칭·조사 선택을 한곳으로 모은다.
 *
 * 번들 규칙: 진입 청크에 넣지 않는다. 이 모듈은 검색 표면(명령 팔레트)과
 * 스튜디오 표면(대사 도구)처럼 지연 로드되는 청크에서만 import 한다.
 * es-hangul 은 함수 단위 import 라 실제 쓰는 getChoseong·josa 분만 포함된다.
 */
import { getChoseong, josa } from "es-hangul";

/** es-hangul `josa` 가 받는 조사 쌍 (라이브러리의 JosaOption 과 같은 유니온). */
export type JosaPair =
  | "이/가"
  | "을/를"
  | "은/는"
  | "으로/로"
  | "와/과"
  | "이나/나"
  | "이란/란"
  | "아/야"
  | "이랑/랑"
  | "이에요/예요"
  | "으로서/로서"
  | "으로써/로써"
  | "으로부터/로부터"
  | "이라/라";

/**
 * 텍스트의 초성열. 한글 음절은 초성 자모로 바꾸고, 영문·숫자·기호·공백은
 * 그대로 보존한다 (기존 손구현 extractChosung 와 같은 계약 — 팔레트 테스트 고정).
 * 예: choseongOf("G펜 (B)") === "Gㅍ (B)", choseongOf("말풍선") === "ㅁㅍㅅ"
 */
export function choseongOf(text: string): string {
  return getChoseong(text, { keepNonHangul: true });
}

/** 질의가 초성 자모(와 공백)만으로 이뤄졌는지 — 빈 질의는 false. */
export function isChoseongQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return /^[ㄱ-ㅎ\s]+$/.test(trimmed);
}

/**
 * 검색 매칭 — (1) 대소문자 무시 부분일치, (2) 초성 질의면 대상 초성열 부분일치
 * (공백 차이는 무시: "ㅇㄴㅎㅅㅇ" 으로 "안녕하세요 반갑습니다" 를 찾는다),
 * (3) 일반 질의는 질의 자체의 초성열로도 매칭한다 (기존 팔레트 동작 유지).
 * 빈 질의는 전체 매칭(true).
 */
export function matchesHangulText(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const target = text.toLowerCase();
  if (target.includes(q)) return true;

  const targetChoseong = choseongOf(target);
  if (isChoseongQuery(q)) {
    if (targetChoseong.includes(q)) return true;
    return targetChoseong.replace(/\s+/g, "").includes(q.replace(/\s+/g, ""));
  }
  const queryChoseong = choseongOf(q);
  return queryChoseong !== q && targetChoseong.includes(queryChoseong);
}

/**
 * 단어에 맞는 조사를 골라 붙인 완성형 — 문구 생성용.
 * 예: withJosa("서식", "을/를") === "서식을", withJosa("굵게", "을/를") === "굵게를"
 */
export function withJosa(word: string, pair: JosaPair): string {
  return josa(word, pair);
}

/** 조사만 고른다. 예: pickJosa("말풍선", "이/가") === "이", pickJosa("사과", "이/가") === "가" */
export function pickJosa(word: string, pair: JosaPair): string {
  return josa.pick(word, pair);
}
