// =========================================================
// 공용 토스트 — 학습 화면·관리 화면이 함께 사용
// =========================================================
let hideTimer = null;

export function showToast(message, opts = {}) {
  const toastEl = document.getElementById("toast");
  const msgEl = document.getElementById("toastMsg");
  const undoBtn = document.getElementById("toastUndo");
  if (!toastEl || !msgEl || !undoBtn) return;

  clearTimeout(hideTimer);
  msgEl.textContent = message;

  if (opts.onUndo) {
    undoBtn.hidden = false;
    undoBtn.onclick = () => {
      opts.onUndo();
      hideToast();
    };
  } else {
    undoBtn.hidden = true;
    undoBtn.onclick = null;
  }

  toastEl.classList.add("show");
  hideTimer = setTimeout(hideToast, opts.duration || 2000);
}

export function hideToast() {
  const toastEl = document.getElementById("toast");
  const undoBtn = document.getElementById("toastUndo");
  if (toastEl) toastEl.classList.remove("show");
  if (undoBtn) undoBtn.onclick = null;
}
