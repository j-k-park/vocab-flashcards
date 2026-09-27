import { store, uid } from "./storage.js";
import { showToast } from "./toast.js";

const WORD_MAX = 50;
const MEANING_MAX = 100;
const EXAMPLE_MAX = 200;
const BULK_MAX_LINES = 200;

function normalize(word) {
  return word.trim().toLowerCase();
}

// =========================================================
// 단어 관리 화면 (F-06, F-10)
// =========================================================
export class ManageScreen {
  constructor() {
    this.editingId = null;
    this.bulkPreviewData = null;

    this.cacheDom();
    this.bindEvents();
    store.subscribe(() => this.render());
    this.render();
  }

  cacheDom() {
    this.el = {
      count: document.getElementById("manageCount"),
      addForm: document.getElementById("addForm"),
      inputWord: document.getElementById("inputWord"),
      inputMeaning: document.getElementById("inputMeaning"),
      inputPos: document.getElementById("inputPos"),
      inputExample: document.getElementById("inputExample"),
      dupWarning: document.getElementById("dupWarning"),
      addBtn: document.getElementById("addWordBtn"),
      cancelEditBtn: document.getElementById("cancelEditBtn"),
      bulkToggleBtn: document.getElementById("bulkToggleBtn"),
      bulkSection: document.getElementById("bulkSection"),
      bulkTextarea: document.getElementById("bulkTextarea"),
      bulkPreviewBtn: document.getElementById("bulkPreviewBtn"),
      bulkAddBtn: document.getElementById("bulkAddBtn"),
      bulkPreviewList: document.getElementById("bulkPreviewList"),
      searchInput: document.getElementById("searchInput"),
      wordList: document.getElementById("wordList"),
    };
  }

  // ---------- 단일 추가/수정 폼 ----------
  updateFormValidity() {
    const word = this.el.inputWord.value.trim();
    const meaning = this.el.inputMeaning.value.trim();
    const valid =
      word.length > 0 &&
      word.length <= WORD_MAX &&
      meaning.length > 0 &&
      meaning.length <= MEANING_MAX;

    const dup =
      word.length > 0 &&
      store
        .get()
        .words.some((w) => normalize(w.word) === normalize(word) && w.id !== this.editingId);

    this.el.dupWarning.hidden = !dup;
    this.el.addBtn.disabled = !valid || dup;
  }

  submitForm() {
    const word = this.el.inputWord.value.trim();
    const meaning = this.el.inputMeaning.value.trim();
    const pos = this.el.inputPos.value.trim();
    const example = this.el.inputExample.value.trim();

    if (!word || !meaning) return;
    if (word.length > WORD_MAX || meaning.length > MEANING_MAX) return;
    if (example.length > EXAMPLE_MAX) return;

    const dup = store
      .get()
      .words.some((w) => normalize(w.word) === normalize(word) && w.id !== this.editingId);
    if (dup) return;

    if (this.editingId) {
      const editingId = this.editingId;
      store.mutate((s) => {
        const w = s.words.find((x) => x.id === editingId);
        if (w) {
          w.word = word;
          w.meaning = meaning;
          w.partOfSpeech = pos || undefined;
          w.example = example || undefined;
        }
      });
      this.exitEdit();
    } else {
      store.mutate((s) => {
        s.words.push({
          id: uid(),
          word,
          meaning,
          partOfSpeech: pos || undefined,
          example: example || undefined,
          memorized: false,
          memorizedAt: undefined,
          reviewCount: 0,
          createdAt: new Date().toISOString(),
        });
        if (!s.currentWordId && s.words.length > 0) s.currentWordId = s.words[0].id;
      });
      this.clearForm();
    }
  }

  clearForm() {
    this.el.inputWord.value = "";
    this.el.inputMeaning.value = "";
    this.el.inputPos.value = "";
    this.el.inputExample.value = "";
    this.updateFormValidity();
  }

  startEdit(id) {
    const w = store.get().words.find((x) => x.id === id);
    if (!w) return;
    this.editingId = id;
    this.el.inputWord.value = w.word;
    this.el.inputMeaning.value = w.meaning;
    this.el.inputPos.value = w.partOfSpeech || "";
    this.el.inputExample.value = w.example || "";
    this.el.addBtn.textContent = "수정 완료";
    this.el.cancelEditBtn.hidden = false;
    this.updateFormValidity();
    this.el.inputWord.focus();
  }

  exitEdit() {
    this.editingId = null;
    this.el.addBtn.textContent = "추가";
    this.el.cancelEditBtn.hidden = true;
    this.clearForm();
  }

  deleteWord(id) {
    const w = store.get().words.find((x) => x.id === id);
    if (!w) return;
    const ok = window.confirm(`"${w.word}" 단어를 삭제할까요?`);
    if (!ok) return;

    store.mutate((s) => {
      const idx = s.words.findIndex((x) => x.id === id);
      if (idx === -1) return;
      s.words.splice(idx, 1);
      if (s.currentWordId === id) {
        const next = s.words.find((x) => !x.memorized) || s.words[0];
        s.currentWordId = next ? next.id : "";
      }
    });

    if (this.editingId === id) this.exitEdit();
  }

  // ---------- 일괄 추가 (F-10) ----------
  parseBulkLines(text) {
    const rawLines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const limited = rawLines.slice(0, BULK_MAX_LINES);
    const overflow = rawLines.length - limited.length;

    const existing = new Set(store.get().words.map((w) => normalize(w.word)));
    const seenInBatch = new Set();
    const results = [];

    limited.forEach((line) => {
      let parts;
      if (line.includes("\t")) parts = line.split("\t");
      else if (line.includes(",")) parts = line.split(",");
      else parts = [line];

      const word = (parts[0] || "").trim();
      const meaning = (parts[1] || "").trim();

      if (!word || !meaning) {
        results.push({ line, status: "error", reason: "형식 오류 (단어, 뜻 형태가 아니에요)" });
        return;
      }
      if (word.length > WORD_MAX || meaning.length > MEANING_MAX) {
        results.push({ line, status: "error", reason: "글자 수 초과" });
        return;
      }
      const norm = normalize(word);
      if (existing.has(norm) || seenInBatch.has(norm)) {
        results.push({ line, status: "dup", reason: "중복된 단어예요", word, meaning });
        return;
      }
      seenInBatch.add(norm);
      results.push({ line, status: "ok", word, meaning });
    });

    return { results, overflow };
  }

  previewBulk() {
    const text = this.el.bulkTextarea.value;
    const { results, overflow } = this.parseBulkLines(text);
    this.bulkPreviewData = results;

    this.el.bulkPreviewList.textContent = "";
    results.forEach((r) => {
      const li = document.createElement("li");
      li.className = "bulk-item bulk-item-" + r.status;
      const icon = r.status === "ok" ? "✅" : "⚠️";
      const text = r.status === "ok" ? `${icon} ${r.line}` : `${icon} ${r.line} — ${r.reason}`;
      li.textContent = text;
      this.el.bulkPreviewList.appendChild(li);
    });
    if (overflow > 0) {
      const li = document.createElement("li");
      li.className = "bulk-item bulk-item-error";
      li.textContent = `⚠️ 최대 ${BULK_MAX_LINES}줄까지만 처리돼요. ${overflow}줄은 제외했어요.`;
      this.el.bulkPreviewList.appendChild(li);
    }

    const validCount = results.filter((r) => r.status === "ok").length;
    this.el.bulkAddBtn.disabled = validCount === 0;
  }

  commitBulk() {
    if (!this.bulkPreviewData) return;
    const valid = this.bulkPreviewData.filter((r) => r.status === "ok");
    const skipped = this.bulkPreviewData.length - valid.length;
    if (valid.length === 0) return;

    store.mutate((s) => {
      const now = new Date().toISOString();
      valid.forEach((r) => {
        s.words.push({
          id: uid(),
          word: r.word,
          meaning: r.meaning,
          partOfSpeech: undefined,
          example: undefined,
          memorized: false,
          memorizedAt: undefined,
          reviewCount: 0,
          createdAt: now,
        });
      });
      if (!s.currentWordId && s.words.length > 0) s.currentWordId = s.words[0].id;
    });

    this.el.bulkTextarea.value = "";
    this.el.bulkPreviewList.textContent = "";
    this.el.bulkAddBtn.disabled = true;
    this.bulkPreviewData = null;

    showToast(`${valid.length}개 추가, ${skipped}개 건너뜀`, { duration: 2500 });
  }

  // ---------- 목록 ----------
  renderList() {
    const query = this.el.searchInput.value.trim().toLowerCase();
    const words = store.get().words;
    const filtered = query
      ? words.filter(
          (w) => w.word.toLowerCase().includes(query) || w.meaning.toLowerCase().includes(query)
        )
      : words;

    this.el.wordList.textContent = "";

    if (filtered.length === 0) {
      const li = document.createElement("li");
      li.className = "word-empty";
      li.textContent = query ? "검색 결과가 없어요" : "아직 등록된 단어가 없어요";
      this.el.wordList.appendChild(li);
      return;
    }

    filtered.forEach((w) => {
      const li = document.createElement("li");
      li.className = "word-row";

      const info = document.createElement("div");
      info.className = "word-info";
      const wordSpan = document.createElement("span");
      wordSpan.className = "word-row-word";
      wordSpan.textContent = w.word;
      const meaningSpan = document.createElement("span");
      meaningSpan.className = "word-row-meaning";
      meaningSpan.textContent = w.meaning;
      info.appendChild(wordSpan);
      info.appendChild(meaningSpan);

      const status = document.createElement("span");
      status.className = "word-status " + (w.memorized ? "status-done" : "status-pending");
      status.textContent = w.memorized ? "암기 완료" : "학습 중";

      const actions = document.createElement("div");
      actions.className = "word-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.textContent = "수정";
      editBtn.addEventListener("click", () => this.startEdit(w.id));
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn";
      delBtn.textContent = "삭제";
      delBtn.addEventListener("click", () => this.deleteWord(w.id));
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      li.appendChild(info);
      li.appendChild(status);
      li.appendChild(actions);
      this.el.wordList.appendChild(li);
    });
  }

  render() {
    const words = store.get().words;
    const memorized = words.filter((w) => w.memorized).length;
    this.el.count.textContent = `${memorized} / ${words.length}`;
    this.updateFormValidity();
    this.renderList();
  }

  // ---------- 이벤트 ----------
  bindEvents() {
    ["inputWord", "inputMeaning", "inputPos", "inputExample"].forEach((key) => {
      this.el[key].addEventListener("input", () => this.updateFormValidity());
    });
    // <button type="submit">이므로 클릭은 물론 필드에서 Enter를 눌러도 여기로 들어온다
    this.el.addForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitForm();
    });
    this.el.cancelEditBtn.addEventListener("click", () => this.exitEdit());

    this.el.bulkToggleBtn.addEventListener("click", () => {
      this.el.bulkSection.hidden = !this.el.bulkSection.hidden;
    });
    this.el.bulkTextarea.addEventListener("input", () => {
      this.el.bulkAddBtn.disabled = true;
      this.el.bulkPreviewList.textContent = "";
      this.bulkPreviewData = null;
    });
    this.el.bulkPreviewBtn.addEventListener("click", () => this.previewBulk());
    this.el.bulkAddBtn.addEventListener("click", () => this.commitBulk());

    this.el.searchInput.addEventListener("input", () => this.renderList());
  }
}
