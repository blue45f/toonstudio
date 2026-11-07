import { ArrowRight, Calendar, Clock, Sparkles, User } from "lucide-react";
import { motion } from "motion/react";

import { resolveAssetUrl } from "@/shared/catalog/catalog-static";
import { cn } from "@/shared/lib/utils";

import { FortuneBirthProfileFields } from "./FortuneBirthProfileFields";
import { TarotSpreadPicker } from "./TarotSpreadPicker";

import type { TarotSpreadId } from "@toonstudio/core/fortune";
import type { Character, FortuneTab } from "./fortune-page-data";

/**
 * 운세 도구별 입력 폼 및 타로 셔플·드로우 인터랙션 뷰 —
 * 오늘의 운세, 별자리, 독서 처방전, 인연 궁합, 사주팔자(성별 토글 group/aria-pressed 포함), 타로.
 * FortunePage에서 표현 계층을 분리한 순수 프레젠테이션 컴포넌트(동작·마크업 변경 없음).
 */
export interface FortuneToolInputFormsProps {
  activeTab: FortuneTab;
  selectedChar: Character;
  birthDate: string;
  birthTime: string;
  gender: string;
  onBirthDateChange: (value: string) => void;
  onBirthTimeChange: (value: string) => void;
  onGenderChange: (value: string) => void;
  hasSavedBirthProfile: boolean;
  onClearBirthProfile: () => void;
  partnerBirthDate: string;
  partnerBirthTime: string;
  onPartnerBirthDateChange: (value: string) => void;
  onPartnerBirthTimeChange: (value: string) => void;
  prescriptionQuery: string;
  onPrescriptionQueryChange: (value: string) => void;
  tarotStep: "idle" | "shuffling" | "spread" | "revealed";
  tarotSpread: TarotSpreadId;
  onTarotSpreadChange: (spread: TarotSpreadId) => void;
  onStartTarotShuffle: () => void;
  onSelectTarotCard: (cardIdx: number) => void;
  onAnalyzeToday: () => void;
  onAnalyzeZodiac: () => void;
  onAnalyzePrescription: (e: React.FormEvent) => void;
  onAnalyzeCompatibility: (e: React.FormEvent) => void;
  onAnalyzeSaju: (e: React.FormEvent) => void;
  onNavigateObservatorySaju: () => void;
  tx: (source: string) => string;
}

export function FortuneToolInputForms({
  activeTab,
  selectedChar,
  birthDate,
  birthTime,
  gender,
  onBirthDateChange,
  onBirthTimeChange,
  onGenderChange,
  hasSavedBirthProfile,
  onClearBirthProfile,
  partnerBirthDate,
  partnerBirthTime,
  onPartnerBirthDateChange,
  onPartnerBirthTimeChange,
  prescriptionQuery,
  onPrescriptionQueryChange,
  tarotStep,
  tarotSpread,
  onTarotSpreadChange,
  onStartTarotShuffle,
  onSelectTarotCard,
  onAnalyzeToday,
  onAnalyzeZodiac,
  onAnalyzePrescription,
  onAnalyzeCompatibility,
  onAnalyzeSaju,
  onNavigateObservatorySaju,
  tx,
}: FortuneToolInputFormsProps) {
  return (
    <>
      {/* 입력 폼: 오늘의 운세 */}
      {activeTab === "today" && (
        <div className="space-y-6 text-center max-w-md mx-auto w-full py-4">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-fg">{tx("오늘 하루는 어떨까요?")}</h3>
            <p className="text-xs text-fg-2 leading-relaxed">
              생년월일을 입력하면 {selectedChar.name}가 당신의 사주 오행으로 <strong className="text-fg-2">개인화된</strong> 오늘의 운세를 풀어드려요. 같은 날에는 결과가 바뀌지 않아요.
            </p>
          </div>

          {/* 생년월일 입력 (선택) — 입력 시 사주 기반 개인화 + 저장 고지·삭제 동선 */}
          <FortuneBirthProfileFields
            birthDate={birthDate}
            birthTime={birthTime}
            gender={gender}
            onBirthDateChange={onBirthDateChange}
            onBirthTimeChange={onBirthTimeChange}
            onGenderChange={onGenderChange}
            hasSavedBirthProfile={hasSavedBirthProfile}
            onClearBirthProfile={onClearBirthProfile}
            tx={tx}
          />

          <button
            type="button"
            onClick={onAnalyzeToday}
            className="w-full rounded-lg bg-accent py-3.5 text-xs font-bold text-on-accent hover:bg-accent-2 transition-colors flex items-center justify-center gap-2"
          >
            <span>{birthDate ? tx("내 사주로 오늘의 운세 보기") : tx("오늘의 운세 확인하기")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 입력 폼: 별자리 (생일의 월/일만 사용) */}
      {activeTab === "zodiac" && (
        <div className="space-y-6 text-center max-w-md mx-auto w-full py-4">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-fg">{tx("생일로 보는 별자리 운세")}</h3>
            <p className="text-xs text-fg-2 leading-relaxed">
              생년월일만 입력하면 {selectedChar.name}가 당신의 별자리와 오늘의 별빛 흐름을 풀어드려요. (월·일만 사용)
            </p>
          </div>
          <div className="rounded-xl border border-line/50 bg-card/15 p-4 text-left space-y-2">
            <label htmlFor="zodiac-birth-date" className="flex items-center gap-1.5 text-xs font-semibold text-fg-2">
              <Calendar className="h-3.5 w-3.5 text-fg-3" /> 생년월일
            </label>
            <input
              id="zodiac-birth-date"
              type="date"
              value={birthDate}
              onChange={(e) => onBirthDateChange(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onAnalyzeZodiac}
            disabled={!birthDate}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3.5 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 disabled:opacity-50"
          >
            <span>{selectedChar.name}{tx("에게 별자리 운세 보기")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 입력 폼: 독서 처방전 */}
      {activeTab === "prescription" && (
        <form onSubmit={onAnalyzePrescription} className="space-y-5 max-w-md mx-auto w-full text-left">
          <div className="text-center mb-6">
            <h3 className="text-lg font-bold text-fg">{tx("아라의 가상 서재: AI 독서 처방전")}</h3>
            <p className="text-xs text-fg-3 mt-1">오늘 당신의 지친 마음이나 보고 싶은 분위기를 적어보세요.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="prescription-query" className="text-xs font-semibold text-fg-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-accent-soft" /> 어떤 이야기가 필요한가요?
            </label>
            <textarea
              id="prescription-query"
              required
              rows={4}
              value={prescriptionQuery}
              onChange={(e) => onPrescriptionQueryChange(e.target.value)}
              placeholder={tx("예: 오늘 회사에서 너무 힘든 일이 있어서 완전 시원하고 통쾌한 사이다 웹툰을 읽으며 스트레스 날려버리고 싶어!")}
              className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none resize-none leading-relaxed"
            />
          </div>

          <button
            type="submit"
            className="w-full mt-4 rounded-lg bg-accent py-3.5 text-xs font-bold text-on-accent hover:bg-accent-2 transition-colors flex items-center justify-center gap-2"
          >
            <span>{selectedChar.name}{tx("에게 도서 추천받기")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {/* 입력 폼: 궁합 */}
      {activeTab === "compatibility" && (
        <form onSubmit={onAnalyzeCompatibility} className="space-y-5 max-w-md mx-auto w-full text-left">
          <div className="text-center mb-6">
            <h3 className="text-lg font-bold text-fg">{tx("두 사람의 궁합 분석 정보 입력")}</h3>
            <p className="text-xs text-fg-3 mt-1">상대방과의 궁합을 웹툰 콘티 연출 형태로 보여 드립니다.</p>
          </div>

          {/* 본인 정보 */}
          <div className="border border-line/40 rounded-xl p-4 bg-card/10 space-y-3">
            <span className="text-xs font-bold text-accent uppercase tracking-wider">나의 생년월일시</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="my-birth-date" className="text-[11px] font-semibold text-fg-2">{tx("생년월일")} *</label>
                <input
                  id="my-birth-date"
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => onBirthDateChange(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="my-birth-time" className="text-[11px] font-semibold text-fg-2">{tx("태어난 시간")}</label>
                <input
                  id="my-birth-time"
                  type="time"
                  value={birthTime}
                  onChange={(e) => onBirthTimeChange(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 상대방 정보 */}
          <div className="border border-line/40 rounded-xl p-4 bg-card/10 space-y-3">
            <span className="text-xs font-bold text-accent uppercase tracking-wider">상대방의 생년월일시</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="partner-birth-date" className="text-[11px] font-semibold text-fg-2">{tx("생년월일")} *</label>
                <input
                  id="partner-birth-date"
                  type="date"
                  required
                  value={partnerBirthDate}
                  onChange={(e) => onPartnerBirthDateChange(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="partner-birth-time" className="text-[11px] font-semibold text-fg-2">{tx("태어난 시간")}</label>
                <input
                  id="partner-birth-time"
                  type="time"
                  value={partnerBirthTime}
                  onChange={(e) => onPartnerBirthTimeChange(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-6 rounded-lg bg-accent py-3.5 text-xs font-bold text-on-accent hover:bg-accent-2 transition-colors flex items-center justify-center gap-2"
          >
            <span>{selectedChar.name}{tx("에게 궁합 풀이받기 (웹툰 연출형)")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {/* 입력 폼: 사주 */}
      {activeTab === "saju" && (
        <form onSubmit={onAnalyzeSaju} className="space-y-5 max-w-md mx-auto w-full text-left">
          <div className="text-center mb-6">
            <h3 className="text-lg font-bold text-fg">{tx("사주팔자 분석 정보 입력")}</h3>
            <p className="text-xs text-fg-3 mt-1">정확한 연산을 위해 생년월일시를 입력하세요.</p>
            <p className="text-[11px] leading-relaxed text-fg-3 mt-2">
              {tx("이 화면의 사주는 입력한 날짜를 양력으로 해석해요. 음력 생일이거나 윤달·자시(23:00) 경계로 계산하려면 ")}
              <button
                type="button"
                onClick={onNavigateObservatorySaju}
                className="font-semibold text-accent underline underline-offset-2 hover:text-accent-2"
              >
                {tx("관측소 사주")}
              </button>
              {tx("를 이용해 주세요.")}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="birth-date" className="text-xs font-semibold text-fg-2 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-fg-3" /> 생년월일 (양력 기준)
            </label>
            <input
              id="birth-date"
              type="date"
              required
              value={birthDate}
              onChange={(e) => onBirthDateChange(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="birth-time" className="text-xs font-semibold text-fg-2 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-fg-3" /> {tx("태어난 시간")} (선택사항)
            </label>
            <input
              id="birth-time"
              type="time"
              value={birthTime}
              onChange={(e) => onBirthTimeChange(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div id="fortune-saju-gender-label" className="text-xs font-semibold text-fg-2 flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-fg-3" /> 성별 (선택사항)
            </div>
            <div role="group" aria-labelledby="fortune-saju-gender-label" aria-label={tx("성별 선택")} className="flex gap-2">
              {["none", "male", "female"].map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={gender === g}
                  onClick={() => onGenderChange(g)}
                  className={cn(
                    "min-h-11 flex-1 rounded-lg border py-2 text-xs font-semibold transition-all",
                    gender === g ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-3 hover:text-fg"
                  )}
                >
                  {g === "none" ? "선택 안 함" : g === "male" ? "남성" : "여성"}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-6 rounded-lg bg-accent py-3 text-xs font-bold text-on-accent hover:bg-accent-2 transition-colors flex items-center justify-center gap-2"
          >
            <span>{selectedChar.name}{tx("에게 사주 풀이받기")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {/* 인터랙션: 타로 */}
      {activeTab === "tarot" && (
        <div className="space-y-6 text-center max-w-lg mx-auto w-full">
          {tarotStep === "idle" && (
            <div className="py-10 space-y-4">
              <h3 className="text-lg font-bold text-fg">{tx("오늘의 타로 리딩")}</h3>
              <p className="text-xs text-fg-3 max-w-sm mx-auto leading-relaxed">
                정신을 집중하고 카드를 섞은 뒤, 오늘의 조언을 줄 카드를 직접 뽑아보세요.
              </p>
              {/* 스프레드 선택 — 카드 배치 도식으로 한눈에 */}
              <TarotSpreadPicker value={tarotSpread} onChange={onTarotSpreadChange} />
              <button
                onClick={onStartTarotShuffle}
                className="rounded-lg bg-accent px-6 py-2.5 text-xs font-bold text-on-accent hover:bg-accent-2 transition-colors"
              >
                타로 카드 섞기 시작
              </button>
            </div>
          )}

          {/* 셔플링 애니메이션 */}
          {tarotStep === "shuffling" && (
            <div className="py-16 space-y-6">
              <div className="flex justify-center items-center gap-3">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      x: [0, (i - 1) * 60, 0],
                      y: [0, -10, 0],
                      scale: [1, 1.05, 1],
                      rotate: [0, (i - 1) * 15, 0]
                    }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="w-24 aspect-[2/3] rounded-xl border border-warn/20 bg-cover bg-center shadow-md"
                    style={{ backgroundImage: `url('${resolveAssetUrl("/images/tarot/tarot-back.jpg")}')` }}
                  />
                ))}
              </div>
              <p className="text-xs text-fg-3 animate-pulse">카드를 엄숙히 섞고 있습니다...</p>
            </div>
          )}

          {/* 카드 드로우 선택 단계 */}
          {tarotStep === "spread" && (
            <div className="py-8 space-y-6">
              <h3 className="text-sm font-bold text-fg-2">오늘의 대답을 전해줄 카드를 한 장 터치하세요.</h3>
              <div className="flex justify-center gap-4">
                {[0, 1, 2].map((idx) => (
                  <motion.button
                    key={idx}
                    type="button"
                    aria-label={`${idx + 1}번 카드 뒤집기`}
                    whileHover={{ y: -10, scale: 1.03 }}
                    onClick={() => onSelectTarotCard(idx)}
                    className="w-28 cursor-pointer aspect-[2/3] rounded-xl border border-warn/20 bg-cover bg-center flex items-center justify-center relative overflow-hidden shadow-lg transition-all hover:border-warn focus-visible:border-warn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warn"
                    style={{ backgroundImage: `url('${resolveAssetUrl("/images/tarot/tarot-back.jpg")}')` }}
                  >
                    {/* 카드 뒷면에 호버 시 미세한 골드 이펙트 오버레이 */}
                    <div className="absolute inset-0 bg-black/10 hover:bg-transparent transition-colors" />
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
