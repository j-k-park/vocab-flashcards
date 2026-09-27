import { DEFAULT_WORDS } from "./words.js";

// =========================================================
// 저장소 상수 & 유틸
// =========================================================
export const STORAGE_KEY = "vocab-flashcards:v1";
export const BACKUP_KEY = "vocab-flashcards:backup";

export function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

export function createDefaultState() {
  const now = new Date().toISOString();
  const words = DEFAULT_WORDS.map((w) => ({
    id: uid(),
    word: w.word,
    meaning: w.meaning,
    partOfSpeech: w.partOfSpeech,
    example: w.example,
    memorized: false,
    memorizedAt: undefined,
    reviewCount: 0,
    createdAt: now,
  }));
  return {
    version: 1,
    words,
    currentWordId: words[0] ? words[0].id : "",
    filter: "unmemorized",
    shuffle: false,
    stats: { daily: {}, streak: 0 },
    settings: { autoSpeak: false },
  };
}

export function isValidState(data) {
  return (
    data &&
    data.version === 1 &&
    Array.isArray(data.words) &&
    typeof data.currentWordId !== "undefined"
  );
}

// 저장/불러오기 양쪽에서 공유 — 빠진 필드를 안전한 기본값으로 채운다
function normalizeState(data) {
  if (!Array.isArray(data.words)) data.words = [];
  data.words = data.words.map((w) => ({
    id: typeof w.id === "string" && w.id ? w.id : uid(),
    word: String(w.word || "").trim(),
    meaning: String(w.meaning || "").trim(),
    partOfSpeech: w.partOfSpeech || undefined,
    example: w.example || undefined,
    memorized: !!w.memorized,
    memorizedAt: w.memorizedAt || undefined,
    reviewCount: typeof w.reviewCount === "number" ? w.reviewCount : 0,
    createdAt: w.createdAt || new Date().toISOString(),
  }));
  if (!data.words.some((w) => w.id === data.currentWordId)) {
    data.currentWordId = data.words[0] ? data.words[0].id : "";
  }
  if (!data.filter) data.filter = "unmemorized";
  if (typeof data.shuffle !== "boolean") data.shuffle = false;
  if (!data.stats) data.stats = { daily: {}, streak: 0 };
  if (!data.stats.daily) data.stats.daily = {};
  if (typeof data.stats.streak !== "number") data.stats.streak = 0;
  if (!data.settings) data.settings = { autoSpeak: false };
  if (typeof data.settings.autoSpeak !== "boolean") data.settings.autoSpeak = false;
  return data;
}

// 불러오기(F-14) 전용 — 필수 항목이 빠진 파일은 거부한다
export function validateImportShape(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.words)) {
    return { ok: false, reason: "단어장 파일 형식이 아니에요." };
  }
  const bad = data.words.some(
    (w) => !w || typeof w.word !== "string" || !w.word.trim() || typeof w.meaning !== "string" || !w.meaning.trim()
  );
  if (bad) {
    return { ok: false, reason: "일부 단어에 영단어 또는 뜻이 없어요." };
  }
  return { ok: true, normalized: normalizeState(JSON.parse(JSON.stringify(data))) };
}

export function todayKey(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function recomputeStreak(daily) {
  let streak = 0;
  const cursor = new Date();
  // 오늘부터 거꾸로, 기록이 끊기는 날 직전까지 센다 (로컬 날짜 기준)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const key = todayKey(cursor);
    if (daily[key] && daily[key] > 0) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// =========================================================
// Store — 상태 보관 · 저장 · 다른 탭 동기화
// =========================================================
class Store {
  constructor() {
    this.listeners = [];
    this.storageUnavailable = false;
    this.notice = null; // 시작 시 1회성 안내 (예: 복구 실패)
    this.checkStorage();
    this.state = this.loadOrInit();
    window.addEventListener("storage", (e) => this.handleStorageEvent(e));
  }

  checkStorage() {
    try {
      const testKey = "__vocab_flashcards_probe__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
    } catch (e) {
      this.storageUnavailable = true;
    }
  }

  loadOrInit() {
    if (this.storageUnavailable) {
      this.notice = { message: "이 창에서는 학습 기록이 저장되지 않아요." };
      return createDefaultState();
    }

    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      this.storageUnavailable = true;
      this.notice = { message: "이 창에서는 학습 기록이 저장되지 않아요." };
      return createDefaultState();
    }

    if (raw === null) return createDefaultState();

    try {
      const data = JSON.parse(raw);
      if (!isValidState(data)) throw new Error("invalid state shape");
      return normalizeState(data);
    } catch (e) {
      try {
        window.localStorage.setItem(BACKUP_KEY, raw);
      } catch (e2) {
        /* 백업도 실패하면 조용히 넘어간다 */
      }
      this.notice = {
        message: "이전 저장 데이터를 불러오지 못해 백업해두었어요. 기본 세트로 시작합니다.",
        autoHideMs: 5000,
      };
      return createDefaultState();
    }
  }

  save() {
    if (this.storageUnavailable) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      this.storageUnavailable = true;
      this.notify("storage-unavailable");
    }
  }

  handleStorageEvent(e) {
    if (e.key !== STORAGE_KEY || e.newValue === null) return;
    try {
      const data = JSON.parse(e.newValue);
      if (!isValidState(data)) return;
      this.state = normalizeState(data);
      this.notify("external");
    } catch (err) {
      /* 형식이 깨진 이벤트 값은 무시 */
    }
  }

  get() {
    return this.state;
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  notify(reason) {
    this.listeners.forEach((fn) => fn(reason));
  }

  // 상태를 변경(mutator)한 뒤 저장 + 구독자에게 알림
  mutate(mutator) {
    mutator(this.state);
    this.notify("mutate");
    this.save();
  }

  // 불러오기(F-14) — 검증을 통과한 전체 상태로 교체
  replaceAll(newState) {
    this.state = newState;
    this.notify("replace");
    this.save();
  }

  // 설정 화면의 전체 초기화 — 기본 단어 세트로 되돌린다
  resetToDefault() {
    this.state = createDefaultState();
    this.notify("replace");
    this.save();
  }

  // 뒤집을 때(F-02·통계 갱신)마다 호출 — reviewCount, 오늘 학습량, streak 갱신
  recordReview(wordId) {
    const w = this.state.words.find((x) => x.id === wordId);
    if (!w) return;
    w.reviewCount += 1;
    const key = todayKey();
    this.state.stats.daily[key] = (this.state.stats.daily[key] || 0) + 1;
    this.state.stats.streak = recomputeStreak(this.state.stats.daily);
  }
}

export const store = new Store();
