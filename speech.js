// =========================================================
// 발음 듣기 (F-13) — Web Speech API 래퍼
// =========================================================
export const speechSupported = "speechSynthesis" in window;

export function speak(text) {
  if (!speechSupported || !text) return;
  try {
    window.speechSynthesis.cancel(); // 이전 발음이 남아있으면 먼저 멈춘다
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
  } catch (e) {
    /* 발음 재생 실패는 조용히 무시 (핵심 학습 흐름을 막지 않는다) */
  }
}
