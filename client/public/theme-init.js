// Apply the saved theme before first paint to avoid a flash. External file so the CSP needs no inline script.
// Grafit (dark) is the default; "light" and "system" (follow the OS) only when the user chose them.
(function () {
  var dark = true;
  try {
    var t = localStorage.getItem("kvita-theme");
    if (t === "light") dark = false;
    else if (t === "system") dark = matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (e) {}
  if (dark) document.documentElement.classList.add("dark");
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0c0c0d" : "#eeece7");
})();
