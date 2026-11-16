// Apply the saved theme before first paint (no flash). Grafit (dark) is the default, like in the app.
(function () {
  try {
    if (localStorage.getItem("kvito-web-theme") === "light") document.documentElement.classList.remove("dark");
  } catch (e) {}
})();
