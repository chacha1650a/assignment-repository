(function () {
  var root = document.documentElement;
  var topbar = document.getElementById("topbar");
  var hero = document.getElementById("top");

  // 스크롤 위치에 따라 상단 바를 유리 패널로 바꾸고, 첫 화면을 지나면 배경을 어둡게 덮음
  function onScroll() {
    var y = window.scrollY;
    topbar.classList.toggle("scrolled", y > 40);
    var h = hero.offsetHeight || window.innerHeight;
    var ratio = Math.min(Math.max((y - h * 0.25) / (h * 0.6), 0), 1);
    root.style.setProperty("--scrim", ratio.toFixed(3));
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  // 모바일 메뉴
  var toggle = document.getElementById("menuToggle");
  var nav = document.getElementById("siteNav");
  function setMenu(open) {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
  }
  toggle.addEventListener("click", function () {
    setMenu(!nav.classList.contains("open"));
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setMenu(false);
  });

  // 스크롤 시 섹션이 서서히 드러남
  var revealTargets = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add("is-visible"); });
  }

  // 현재 보고 있는 섹션을 상단 메뉴에 표시
  var navLinks = document.querySelectorAll("[data-nav]");
  function setActiveNav(id) {
    navLinks.forEach(function (link) {
      if (link.getAttribute("data-nav") === id) link.setAttribute("data-active", "true");
      else link.removeAttribute("data-active");
    });
  }
  if ("IntersectionObserver" in window) {
    var navObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActiveNav(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
    );
    navLinks.forEach(function (link) {
      var el = document.getElementById(link.getAttribute("data-nav"));
      if (el) navObserver.observe(el);
    });
    navObserver.observe(hero);
  }
})();
