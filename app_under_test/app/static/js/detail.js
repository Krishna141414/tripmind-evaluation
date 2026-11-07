/* Conversation detail: answer with expandable citation chips + tidy source cards (no raw text dumps). */
"use strict";
(function () {
  const data = JSON.parse(TM.$("#detail-data").textContent), grid = TM.$("#detail-sources");
  TM.renderAnswer(TM.$("#detail-answer"), data.answer, data.sources);
  if (grid) data.sources.forEach((s) => { const c = TM.sourceCard(s); c.classList.add("in"); grid.append(c); });
})();
