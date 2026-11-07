/* Runs in <head> before paint: apply the saved light/dark theme (no inline script needed under our CSP). */
(function () {
  var t = null;
  try { t = localStorage.getItem("tm-theme"); } catch (e) {}
  if (!t && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) t = "dark";
  document.documentElement.setAttribute("data-theme", t === "dark" ? "dark" : "light");
})();
