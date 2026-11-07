/* History: instant client-side filter on top of the server-side search. */
"use strict";
(function () {
  const input = TM.$("#history-q"), rows = TM.$$("#history-table tbody tr"), count = TM.$("#history-count");
  if (!input) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    rows.forEach((r) => { const hit = !q || r.dataset.text.includes(q); r.hidden = !hit; shown += hit; });
    count.textContent = shown + " shown";
  });
})();
