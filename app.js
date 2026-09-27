import { store } from "./storage.js";
import { showToast } from "./toast.js";
import { ManageScreen } from "./manage.js";
import { SettingsScreen } from "./settings.js";
import { speak, speechSupported } from "./speech.js";

const FILTERS = ["unmemorized", "all", "memorized"];

// =========================================================
// 학습 화면 (카드 뒤집기 · 이전/다음 · 암기 완료 · 필터/섞기)
// =========================================================
class LearnScreen {
  constructor() {
    this.isFlipped = false;
    this.lastAction = null;
    this.suppressClick = false;
    this.shuffledCache = { key: "", order: [] };

    this.cacheDom();
    this.bindEvents();
    store.subscribe(() => this.render());
    this.render();
  }

  cacheDom() {
    this.el = {
      progressText: document.getElementById("progressText"),
      progressFill: document.getElementById("progressFill"),
      tabs: Array.from(document.querySelectorAll(".tab")),
      shuffleToggle: document.getElementById("shuffleToggle"),
      card: document.getElementById("card"),
      wordText: document.getElementById("wordText"),
      meaningText: document.getElementById("meaningText"),
      posText: document.getElementById("posText"),
      exampleText: document.getElementById("exampleText"),
      emptyState: document.getElementById("emptyState"),
      emptyTitle: document.getElementById("emptyTitle"),
      emptySub: document.getElementById("emptySub"),
      emptyActions: document.getElementById("emptyActions"),
      controls: document.getElementById("controls"),
      prevBtn: document.getElementById("prevBtn"),
      memorizeBtn: document.getElementById("memorizeBtn"),
      nextBtn: document.getElementById("nextBtn"),
      speakFrontBtn: document.getElementById("speakFrontBtn"),
      speakBackBtn: document.getElementById("speakBackBtn"),
      cardFront: document.querySelector(".card-front"),
      cardBack: document.querySelector(".card-back"),
    };

    // 발음 API를 지원하지 않는 브라우저에서는 버튼 자체를 숨긴다 (F-13)
    if (!speechSupported) {
      this.el.speakFrontBtn.hidden = true;
      this.el.speakBackBtn.hidden = true;
    }
  }

  // ---------- 큐 계산 (F-09) ----------
  getFilteredWords() {
    const { words, filter } = store.get();
    if (filter === "memorized") return words.filter((w) => w.memorized);
    if (filter === "all") return words.slice();
    return words.filter((w) => !w.memorized);
  }

  getQueue() {
    const base = this.getFilteredWords();
    const { shuffle } = store.get();
    if (!shuffle) return base;

    // 섞기 순서는 세션 동안만 유지 (base 구성이 바뀌면 다시 섞는다)
    const key = base.map((w) => w.id).sort().join(",");
    if (this.shuffledCache.key !== key) {
      const order = base.map((w) => w.id);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      this.shuffledCache = { key, order };
    }
    const byId = new Map(base.map((w) => [w.id, w]));
    return this.shuffledCache.order.map((id) => byId.get(id)).filter(Boolean);
  }

  getCurrentWord() {
    const { words, currentWordId } = store.get();
    return words.find((x) => x.id === currentWordId) || words[0];
  }

  // ---------- 동작: 뒤집기 (F-02, 학습 통계) ----------
  flip() {
    if (this.getQueue().length === 0) return;
    const wasFlipped = this.isFlipped;
    this.isFlipped = !this.isFlipped;
    if (!wasFlipped && this.isFlipped) {
      const w = this.getCurrentWord();
      if (w) store.recordReview(w.id);
    }
    this.render();
    store.save();
  }

  // ---------- 동작: 이전/다음 (F-03, F-11) ----------
  goNext() {
    this.step(1);
  }
  goPrev() {
    this.step(-1);
  }

  step(direction) {
    const queue = this.getQueue();
    if (queue.length === 0) {
      this.isFlipped = false;
      this.render();
      return;
    }
    const idx = queue.findIndex((w) => w.id === store.get().currentWordId);
    let nextIdx;
    let wrapped = false;
    if (idx === -1) {
      nextIdx = 0;
    } else {
      nextIdx = idx + direction;
      if (nextIdx >= queue.length) {
        nextIdx = 0;
        wrapped = direction > 0;
      } else if (nextIdx < 0) {
        nextIdx = queue.length - 1;
      }
    }
    const target = queue[nextIdx];
    store.mutate((s) => {
      s.currentWordId = target.id;
    });
    this.isFlipped = false;
    this.playSlide(direction);
    this.render();
    if (wrapped) showToast("한 바퀴 끝! 처음부터 다시 시작할게요", { duration: 2200 });
    if (store.get().settings.autoSpeak) speak(target.word);
  }

  // ---------- 동작: 암기 완료 / 다시 외우기 (F-04, F-12) ----------
  toggleMemorize() {
    const w = this.getCurrentWord();
    if (!w) return;

    if (!w.memorized) {
      this.lastAction = {
        wordId: w.id,
        prevMemorized: false,
        prevMemorizedAt: w.memorizedAt,
        prevCurrentWordId: store.get().currentWordId,
        prevFlipped: this.isFlipped,
      };
      store.mutate((s) => {
        const target = s.words.find((x) => x.id === w.id);
        target.memorized = true;
        target.memorizedAt = new Date().toISOString();
      });
      this.flashMemorizeButton();
      showToast("암기 완료로 표시했어요", {
        duration: 3000,
        onUndo: () => this.undoLastAction(),
      });
      this.goNext();
    } else {
      store.mutate((s) => {
        const target = s.words.find((x) => x.id === w.id);
        target.memorized = false;
        target.memorizedAt = undefined;
      });
    }
  }

  undoLastAction() {
    if (!this.lastAction) return;
    const { wordId, prevMemorized, prevMemorizedAt, prevCurrentWordId, prevFlipped } =
      this.lastAction;
    store.mutate((s) => {
      const w = s.words.find((x) => x.id === wordId);
      if (w) {
        w.memorized = prevMemorized;
        w.memorizedAt = prevMemorizedAt;
      }
      s.currentWordId = prevCurrentWordId;
    });
    this.isFlipped = prevFlipped;
    this.lastAction = null;
    this.render();
  }

  resetAllProgress() {
    const ok = window.confirm("모든 단어의 암기 기록을 초기화할까요?");
    if (!ok) return;
    this.lastAction = null;
    store.mutate((s) => {
      s.words.forEach((w) => {
        w.memorized = false;
        w.memorizedAt = undefined;
      });
      s.currentWordId = s.words[0] ? s.words[0].id : "";
    });
    this.isFlipped = false;
    this.render();
  }

  // ---------- 필터 / 섞기 (F-09) ----------
  setFilter(filter) {
    if (!FILTERS.includes(filter) || filter === store.get().filter) return;
    store.mutate((s) => {
      s.filter = filter;
    });
    this.isFlipped = false;
    const queue = this.getQueue();
    if (queue.length > 0) {
      store.mutate((s) => {
        s.currentWordId = queue[0].id;
      });
    }
    this.render();
  }

  toggleShuffle() {
    store.mutate((s) => {
      s.shuffle = !s.shuffle;
    });
  }

  // ---------- 카드 전환 애니메이션 ----------
  playSlide(direction) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cls = direction > 0 ? "slide-in-next" : "slide-in-prev";
    this.el.card.classList.remove("slide-in-next", "slide-in-prev");
    void this.el.card.offsetWidth; // 리플로우 강제 → 클래스 재적용 시 전환이 다시 트리거되게
    this.el.card.classList.add(cls);
    setTimeout(() => this.el.card.classList.remove(cls), 260);
  }

  flashMemorizeButton() {
    this.el.memorizeBtn.classList.add("btn-flash");
    setTimeout(() => this.el.memorizeBtn.classList.remove("btn-flash"), 320);
  }

  // ---------- 렌더링 ----------
  render() {
    const state = store.get();
    const total = state.words.length;
    const memorized = state.words.filter((w) => w.memorized).length;

    this.el.progressText.textContent = `암기 ${memorized} / 전체 ${total}`;
    this.el.progressFill.style.width = total > 0 ? `${(memorized / total) * 100}%` : "0%";

    this.el.tabs.forEach((tab) => {
      const active = tab.dataset.filter === state.filter;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    this.el.shuffleToggle.classList.toggle("active", state.shuffle);
    this.el.shuffleToggle.setAttribute("aria-pressed", String(state.shuffle));

    const queue = this.getQueue();

    if (total === 0) {
      this.showEmpty("단어를 추가해 보세요", "학습할 단어가 아직 없어요.", [
        { label: "단어 추가하기", action: () => (location.hash = "#/manage") },
      ]);
      return;
    }

    if (queue.length === 0) {
      if (state.filter === "unmemorized") {
        this.showEmpty("수고했어요! 모두 외웠어요 🎉", `총 ${total}개 단어를 모두 암기했어요.`, [
          { label: "처음부터 다시", action: () => this.resetAllProgress() },
          { label: "단어 추가하기", action: () => (location.hash = "#/manage") },
        ]);
      } else if (state.filter === "memorized") {
        this.showEmpty("아직 외운 단어가 없어요", "카드를 넘기며 암기를 완료해 보세요.", []);
      } else {
        this.showEmpty("단어를 추가해 보세요", "학습할 단어가 아직 없어요.", [
          { label: "단어 추가하기", action: () => (location.hash = "#/manage") },
        ]);
      }
      return;
    }

    this.el.emptyState.hidden = true;
    this.el.card.hidden = false;
    this.el.controls.hidden = false;

    const w = this.getCurrentWord();
    if (!w) return;

    this.el.wordText.textContent = w.word;
    this.el.wordText.classList.toggle("long", w.word.length > 20);
    this.el.meaningText.textContent = w.meaning;

    if (w.partOfSpeech) {
      this.el.posText.textContent = w.partOfSpeech;
      this.el.posText.hidden = false;
    } else {
      this.el.posText.textContent = "";
      this.el.posText.hidden = true;
    }
    if (w.example) {
      this.el.exampleText.textContent = w.example;
      this.el.exampleText.hidden = false;
    } else {
      this.el.exampleText.textContent = "";
      this.el.exampleText.hidden = true;
    }

    this.el.card.classList.toggle("flipped", this.isFlipped);
    this.el.card.setAttribute(
      "aria-label",
      this.isFlipped ? `${w.word}, 뜻: ${w.meaning}` : `${w.word}, 눌러서 뜻 보기`
    );
    // 보이지 않는 면의 텍스트가 접근성 트리에 함께 잡히지 않도록 숨긴다
    this.el.cardFront.setAttribute("aria-hidden", this.isFlipped ? "true" : "false");
    this.el.cardBack.setAttribute("aria-hidden", this.isFlipped ? "false" : "true");

    this.el.memorizeBtn.textContent = w.memorized ? "다시 외우기" : "암기 완료";
    this.el.memorizeBtn.classList.toggle("btn-secondary-outline", w.memorized);
  }

  showEmpty(title, sub, actions) {
    this.el.card.hidden = true;
    this.el.controls.hidden = true;
    this.el.emptyState.hidden = false;
    this.el.emptyTitle.textContent = title;
    this.el.emptySub.textContent = sub;
    this.el.emptyActions.textContent = "";
    actions.forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary";
      btn.textContent = a.label;
      btn.addEventListener("click", a.action);
      this.el.emptyActions.appendChild(btn);
    });
  }

  // ---------- 이벤트 (F-11) ----------
  bindEvents() {
    this.el.card.addEventListener("click", () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      this.flip();
    });

    this.el.tabs.forEach((tab) => {
      tab.addEventListener("click", () => this.setFilter(tab.dataset.filter));
    });
    this.el.shuffleToggle.addEventListener("click", () => this.toggleShuffle());

    this.el.prevBtn.addEventListener("click", () => this.goPrev());
    this.el.memorizeBtn.addEventListener("click", () => this.toggleMemorize());
    this.el.nextBtn.addEventListener("click", () => this.goNext());

    // 발음 버튼 — 카드 뒤집기로 이어지지 않도록 클릭 전파를 막는다 (F-13)
    const speakCurrent = (e) => {
      e.stopPropagation();
      const w = this.getCurrentWord();
      if (w) speak(w.word);
    };
    this.el.speakFrontBtn.addEventListener("click", speakCurrent);
    this.el.speakBackBtn.addEventListener("click", speakCurrent);

    document.addEventListener("keydown", (e) => {
      if (location.hash === "#/manage" || location.hash === "#/settings") return;
      const activeTag = document.activeElement && document.activeElement.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      if (e.key === " " || e.key === "Spacebar") {
        if (activeTag === "BUTTON") return;
        e.preventDefault();
        this.flip();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this.goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.goPrev();
      } else if (e.key === "Enter") {
        if (activeTag === "BUTTON") return;
        e.preventDefault();
        this.toggleMemorize();
      }
    });

    // 스와이프 — 짧은 움직임은 탭(click)에 맡기고, 좌우로 크게 움직이면 이전/다음
    let touchStartX = 0;
    let touchStartY = 0;
    this.el.card.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );
    this.el.card.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // 탭 → click 이벤트가 처리
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          this.suppressClick = true;
          if (dx < 0) this.goNext();
          else this.goPrev();
        }
      },
      { passive: true }
    );
  }
}

// =========================================================
// 라우팅 — 해시로 학습 / 단어 관리 / 설정 화면 전환 (F-06)
// =========================================================
function applyRoute() {
  const hash = location.hash;
  const isManage = hash === "#/manage";
  const isSettings = hash === "#/settings";
  document.getElementById("learnScreen").hidden = isManage || isSettings;
  document.getElementById("manageScreen").hidden = !isManage;
  document.getElementById("settingsScreen").hidden = !isSettings;

  // 단어 관리 화면에 들어오면 바로 타이핑할 수 있도록 첫 입력칸에 포커스
  if (isManage) {
    requestAnimationFrame(() => {
      const input = document.getElementById("inputWord");
      if (input) input.focus();
    });
  }
}

// ---------- 상단 메뉴 드롭다운 ----------
const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");

function closeMenu() {
  menuDropdown.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
}
function openMenu() {
  menuDropdown.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
}

menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (menuDropdown.hidden) openMenu();
  else closeMenu();
});
menuDropdown.querySelectorAll("button[data-route]").forEach((btn) => {
  btn.addEventListener("click", () => {
    location.hash = btn.dataset.route;
    closeMenu();
  });
});
document.addEventListener("click", (e) => {
  if (!menuDropdown.hidden && !menuDropdown.contains(e.target) && e.target !== menuBtn) {
    closeMenu();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !menuDropdown.hidden) closeMenu();
});

document.getElementById("backBtn").addEventListener("click", () => {
  location.hash = "";
});
document.getElementById("quickAddBtn").addEventListener("click", () => {
  location.hash = "#/manage";
});
document.getElementById("settingsBackBtn").addEventListener("click", () => {
  location.hash = "";
});
window.addEventListener("hashchange", () => {
  closeMenu();
  applyRoute();
});
applyRoute();

// ---------- 안내 배너 (저장 불가 · 복구 안내 · PWA 안내) ----------
const bannerEl = document.getElementById("banner");

function showBanner(message, autoHideMs) {
  bannerEl.textContent = message;
  bannerEl.hidden = false;
  if (autoHideMs) {
    setTimeout(() => {
      if (!store.storageUnavailable) bannerEl.hidden = true;
    }, autoHideMs);
  }
}

if (store.notice) {
  showBanner(store.notice.message, store.notice.autoHideMs);
} else if (!store.storageUnavailable) {
  // 첫 방문 시 1회만: 홈 화면 추가 + 백업 권유 (B)
  const PWA_NOTICE_KEY = "vocab-flashcards:pwaNoticeShown";
  let alreadyShown = true;
  try {
    alreadyShown = window.localStorage.getItem(PWA_NOTICE_KEY) === "1";
  } catch (e) {
    alreadyShown = true; // 저장소를 확인할 수 없으면 굳이 매번 띄우지 않는다
  }
  if (!alreadyShown) {
    showBanner(
      "홈 화면에 추가하면 기록이 더 안전하게 남아요. 가끔 내보내기로 백업해 두세요.",
      7000
    );
    try {
      window.localStorage.setItem(PWA_NOTICE_KEY, "1");
    } catch (e) {
      /* 저장 실패해도 무시 — 다음 방문에 다시 보일 뿐 */
    }
  }
}

store.subscribe((reason) => {
  if (reason === "storage-unavailable" || store.storageUnavailable) {
    bannerEl.textContent = "이 창에서는 학습 기록이 저장되지 않아요.";
    bannerEl.hidden = false;
  }
});

// ---------- 서비스 워커 등록 (오프라인 지원, B) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* 서비스 워커 등록 실패해도 앱 자체는 온라인에서 정상 동작 */
    });
  });
}

// ---------- 부트스트랩 ----------
new LearnScreen();
new ManageScreen();
new SettingsScreen();
