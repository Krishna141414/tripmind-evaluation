/* Login / register: live field validation (mirrors the Pydantic rules) + "Use demo account". */
"use strict";
(function () {
  const form = TM.$("form[data-validate]");
  if (!form) return;
  const mode = form.dataset.validate;
  const setErr = (name, msg) => {
    const input = form.elements[name], out = TM.$(`.field-error[data-for="${name}"]`, form);
    if (out) out.textContent = msg || "";
    if (input) { input.classList.toggle("invalid", !!msg); input.classList.toggle("valid", !msg && !!input.value); }
    return !msg;
  };
  const RULES = { len: (v) => v.length >= 8, lower: (v) => /[a-z]/.test(v), upper: (v) => /[A-Z]/.test(v),
                  digit: (v) => /\d/.test(v), symbol: (v) => /[^A-Za-z0-9]/.test(v) };

  function check(name) {
    const v = (form.elements[name] || {}).value || "";
    if (mode === "login") return setErr(name, v.trim() ? "" : "This field is required");
    if (name === "username") {
      if (v.trim().length < 3) return setErr(name, "Must be at least 3 characters");
      if (!/^[A-Za-z0-9_]+$/.test(v.trim())) return setErr(name, "Only letters, numbers and underscore are allowed");
      return setErr(name, "");
    }
    if (name === "password") {
      TM.$$("#pw-rules li").forEach((li) => li.classList.toggle("ok", RULES[li.dataset.rule](v)));
      const miss = Object.keys(RULES).filter((k) => !RULES[k](v));
      if (form.elements.confirm.value) check("confirm");
      return setErr(name, miss.length ? "Password needs: " + miss.join(", ").replace("len", "8+ characters") : "");
    }
    if (name === "confirm") return setErr(name, v && v === form.elements.password.value ? "" : "Passwords do not match");
    return true;
  }

  const names = mode === "login" ? ["username", "password"] : ["username", "password", "confirm"];
  names.forEach((n) => {
    const input = form.elements[n];
    input.addEventListener("input", () => input.dataset.touched && check(n));
    input.addEventListener("blur", () => { input.dataset.touched = "1"; check(n); });
  });
  form.addEventListener("submit", (e) => {
    const ok = names.map(check).every(Boolean);
    if (!ok) { e.preventDefault(); TM.toast("Check the form", "Some fields need attention.", "error"); }
  });

  /** Fill demo / Demo@1234. typed=true types it out (pausable, used by demos); otherwise instant. */
  TM.fillDemo = async function (typed) {
    const u = form.elements.username, p = form.elements.password;
    if (typed) { await TM.typeInto(u, "demo"); await TM.typeInto(p, "Demo@1234"); }
    else { u.value = "demo"; p.value = "Demo@1234"; }
    names.forEach(check);
  };
  const demo = TM.$("#demo-btn");
  if (demo) demo.addEventListener("click", () => TM.fillDemo(false));

  // Login page demo for the control bar: nothing happens until Next / Play.
  if (mode === "login") {
    const clearField = (n) => () => { form.elements[n].value = ""; setErr(n, ""); form.elements[n].classList.remove("valid"); TM.focusEl(null); };
    TM.player.setPageSeq({ title: "Login demo", steps: [
      { title: "Type username", run: async () => { TM.focusEl(form.elements.username); await TM.typeInto(form.elements.username, "demo"); check("username"); }, undo: clearField("username"), focus: () => TM.focusEl(form.elements.username) },
      { title: "Type password", run: async () => { TM.focusEl(form.elements.password); await TM.typeInto(form.elements.password, "Demo@1234"); check("password"); }, undo: clearField("password"), focus: () => TM.focusEl(form.elements.password) },
      { title: "Sign in", run: async () => { TM.focusEl(TM.$("#login-submit")); await TM.player.wait(TM.speed().stagger * 3); form.requestSubmit(); } },
    ] });
  }
})();
