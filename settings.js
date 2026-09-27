import { store, validateImportShape } from "./storage.js";
import { showToast } from "./toast.js";

function todayFileDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// =========================================================
// 설정 화면 — 발음 자동재생 토글, 내보내기/불러오기, 전체 초기화 (F-14)
// =========================================================
export class SettingsScreen {
  constructor() {
    this.cacheDom();
    this.bindEvents();
    store.subscribe(() => this.render());
    this.render();
  }

  cacheDom() {
    this.el = {
      autoSpeakToggle: document.getElementById("autoSpeakToggle"),
      exportBtn: document.getElementById("exportBtn"),
      importBtn: document.getElementById("importBtn"),
      importInput: document.getElementById("importInput"),
      importMsg: document.getElementById("importMsg"),
      resetBtn: document.getElementById("resetAllBtn"),
      wordCount: document.getElementById("settingsWordCount"),
    };
  }

  render() {
    const state = store.get();
    this.el.autoSpeakToggle.checked = !!state.settings.autoSpeak;
    this.el.wordCount.textContent = `현재 단어 ${state.words.length}개 저장되어 있어요.`;
  }

  // ---------- 내보내기 ----------
  exportData() {
    const state = store.get();
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vocab-backup-${todayFileDate()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("단어장을 파일로 내보냈어요", { duration: 2000 });
  }

  // ---------- 불러오기 ----------
  handleFileSelected(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.importFromText(String(reader.result || ""));
      this.el.importInput.value = ""; // 같은 파일을 다시 선택해도 change가 발생하도록
    };
    reader.onerror = () => {
      this.showImportMessage("파일을 읽지 못했어요.", true);
      this.el.importInput.value = "";
    };
    reader.readAsText(file);
  }

  importFromText(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      this.showImportMessage("올바른 JSON 파일이 아니에요. 기존 단어장은 그대로예요.", true);
      return;
    }

    const result = validateImportShape(data);
    if (!result.ok) {
      this.showImportMessage(`${result.reason} 기존 단어장은 그대로예요.`, true);
      return;
    }

    const ok = window.confirm(
      `단어 ${result.normalized.words.length}개로 현재 단어장을 덮어쓸까요? 지금 학습 기록은 사라져요.`
    );
    if (!ok) return;

    store.replaceAll(result.normalized);
    this.showImportMessage("단어장을 불러왔어요.", false);
    showToast("단어장을 불러왔어요", { duration: 2000 });
  }

  showImportMessage(message, isError) {
    this.el.importMsg.textContent = message;
    this.el.importMsg.hidden = false;
    this.el.importMsg.classList.toggle("import-msg-error", isError);
  }

  // ---------- 전체 초기화 (확인 창 2번) ----------
  resetAll() {
    const first = window.confirm("정말 초기화할까요? 모든 단어와 학습 기록이 사라져요.");
    if (!first) return;
    const second = window.confirm("한 번 더 확인할게요. 되돌릴 수 없어요. 계속할까요?");
    if (!second) return;
    store.resetToDefault();
    showToast("기본 단어 세트로 초기화했어요", { duration: 2000 });
  }

  bindEvents() {
    this.el.autoSpeakToggle.addEventListener("change", () => {
      store.mutate((s) => {
        s.settings.autoSpeak = this.el.autoSpeakToggle.checked;
      });
    });
    this.el.exportBtn.addEventListener("click", () => this.exportData());
    this.el.importBtn.addEventListener("click", () => this.el.importInput.click());
    this.el.importInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      this.handleFileSelected(file);
    });
    this.el.resetBtn.addEventListener("click", () => this.resetAll());
  }
}
