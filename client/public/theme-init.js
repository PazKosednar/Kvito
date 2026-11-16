// Apply the saved theme before first paint to avoid a flash. External file so the CSP needs no inline script.
// Grafit (dark) is the default regardless of the OS setting; Kamen (light) only when the user chose it.
(function () {
  try {
    var light = localStorage.getItem("kvita-theme") === "light";
    if (!light) document.documentElement.classList.add("dark");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", light ? "#eeece7" : "#0c0c0d");
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
