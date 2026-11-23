// Kvito documentation page: highlights the current chapter in the table of contents and enlarges screenshots.
// No dependencies; site.js handles the theme and the mobile menu.
(function () {
  // ---- Table of contents: mark the chapter that is on screen ----
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc a[href^='#']"));
  var byId = {};
  links.forEach(function (a) {
    byId[a.getAttribute("href").slice(1)] = a;
  });
  var targets = Object.keys(byId)
    .map(function (id) {
      return document.getElementById(id);
    })
    .filter(Boolean);

  function setActive(id) {
    links.forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("href") === "#" + id);
    });
    // Keep the active entry visible inside a long, scrollable table of contents.
    var active = byId[id];
    var toc = document.querySelector(".toc");
    if (active && toc && toc.scrollHeight > toc.clientHeight) {
      var top = active.offsetTop - toc.clientHeight / 2;
      toc.scrollTop = Math.max(0, top);
    }
  }

  // The current chapter is the last heading that has scrolled past the reading line under the header.
  var current = null;
  var ticking = false;
  function update() {
    ticking = false;
    var line = 160; // html scroll-padding-top is 96px
    var id = targets.length ? targets[0].id : null;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].getBoundingClientRect().top <= line) id = targets[i].id;
      else break;
    }
    if (id !== current) {
      current = id;
      setActive(id);
    }
  }
  if (targets.length) {
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", update);
    update();
  }

  // Mobile table of contents: close after choosing a chapter.
  var mobileToc = document.querySelector(".toc-mobile");
  if (mobileToc) {
    mobileToc.addEventListener("click", function (e) {
      if (e.target.closest("a")) mobileToc.removeAttribute("open");
    });
  }

  // ---- Lightbox: a screenshot opens at full size ----
  var dialog = document.getElementById("lightbox");
  if (!dialog || typeof dialog.showModal !== "function") return;
  var big = dialog.querySelector("img");

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".shot button");
    if (!btn) return;
    // Two images per screenshot (dark and light theme); take the one that is shown.
    var imgs = btn.querySelectorAll("img");
    var shown = null;
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].offsetParent !== null) shown = imgs[i];
    }
    if (!shown) return;
    big.src = shown.currentSrc || shown.src;
    big.alt = shown.alt;
    big.style.maxWidth = shown.naturalWidth ? shown.naturalWidth + "px" : "";
    dialog.showModal();
  });

  dialog.addEventListener("click", function (e) {
    // Click on the backdrop or the close button.
    if (e.target === dialog || e.target.closest(".lightbox-close")) dialog.close();
  });
  dialog.addEventListener("close", function () {
    big.removeAttribute("src");
  });
})();
