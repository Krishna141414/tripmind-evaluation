/* Dashboard: static on load (real numbers, charts drawn without animation).
   Count-up tiles and chart animations run only as control-bar steps. */
"use strict";
(function () {
  const P = TM.player, data = JSON.parse(TM.$("#chart-data").textContent);
  const tiles = TM.$$("[data-count]");
  let charts = [];
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function draw() {
    if (!window.Chart) return;
    charts.forEach((c) => c.destroy());
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.color = css("--muted");
    charts = [
      new Chart(TM.$("#status-chart"), {
        type: "doughnut",
        data: { labels: ["Answered", "Not in documents", "Blocked"],
                datasets: [{ data: data.status, backgroundColor: ["#16A34A", "#F59E0B", "#DC2626"], borderWidth: 0 }] },
        options: { animation: false, cutout: "68%", maintainAspectRatio: false,
                   plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8 } } } },
      }),
      new Chart(TM.$("#latency-chart"), {
        type: "bar",
        data: { labels: data.latency.map((d) => (d.q.length > 18 ? d.q.slice(0, 18) + "…" : d.q)),
                datasets: [{ label: "seconds", data: data.latency.map((d) => Math.max(d.s, 0.05)), borderRadius: 6, maxBarThickness: 28,
                             backgroundColor: data.latency.map((d) => (d.status === "answered" ? "#2563EB" : d.status === "blocked" ? "#DC2626" : "#F59E0B")) }] },
        options: { animation: false, maintainAspectRatio: false, plugins: { legend: { display: false },
                   tooltip: { callbacks: { title: (i) => data.latency[i[0].dataIndex].q, label: (i) => " " + data.latency[i.dataIndex].s + " s" } } },
                   scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
                             y: { beginAtZero: true, grid: { color: css("--border") } } } },
      }),
    ];
  }

  async function countUp() { await Promise.all(tiles.map(TM.countUp)); }
  async function animate(i) {
    const c = charts[i];
    if (!c) return;
    const ms = TM.speed().chart;
    c.options.animation = { duration: ms, easing: "easeOutCubic" };
    c.reset(); c.update();
    await P.wait(ms);
    c.options.animation = false; c.update("none");            // final state (also when skipped)
  }
  // Pause freezes a running chart animation; Play continues it
  document.addEventListener("tm:pause", () => charts.forEach((c) => c.stop()));
  document.addEventListener("tm:resume", () => charts.forEach((c) => c.options.animation && c.update()));
  document.addEventListener("tm:theme", draw);
  draw();

  TM.dashboard = { countUp, animate };
  const card = (sel) => () => TM.focusEl(TM.$(sel));
  P.setPageSeq({ title: "Dashboard demo", steps: [
    { title: "Count up the stats", run: async () => { card("#stats")(); await countUp(); }, focus: card("#stats") },
    { title: "Answer outcomes chart", run: async () => { card("#chart-card")(); await animate(0); }, focus: card("#chart-card") },
    { title: "Response-time chart", run: async () => { card("#latency-card")(); await animate(1); }, focus: card("#latency-card") },
    { title: "Recent conversations", run: async () => { card("#recent-card")(); }, focus: card("#recent-card"), undo: () => TM.focusEl(null) },
  ] });
})();
