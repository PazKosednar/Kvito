// Apply the saved theme before first paint to avoid a flash. External file so the CSP needs no inline script.
(function () {
  try {
    var t = localStorage.getItem("kvita-theme");
    var dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
