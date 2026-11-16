// Kvito website: theme toggle, closing the mobile menu after a tap, current year. No dependencies.
(function () {
  var root = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');

  function syncMeta() {
    if (meta) meta.setAttribute("content", root.classList.contains("dark") ? "#0c0c0d" : "#eeece7");
  }
  syncMeta();

  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var dark = root.classList.toggle("dark");
      try {
        localStorage.setItem("kvito-web-theme", dark ? "dark" : "light");
      } catch (e) {}
      syncMeta();
    });
  }

  // Close the mobile menu when a link inside it is used.
  var mobile = document.querySelector(".mobile-nav");
  if (mobile) {
    mobile.addEventListener("click", function (e) {
      if (e.target.closest("a")) mobile.removeAttribute("open");
    });
  }

  // Floating header: more solid once the page is scrolled.
  var header = document.getElementById("site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
