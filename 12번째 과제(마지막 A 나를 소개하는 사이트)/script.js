(function () {
  // 스크롤 시 섹션이 서서히 드러나는 효과
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

  // 스크롤 위치에 따라 사이드바 내비게이션에서 현재 섹션 표시
  var navLinks = document.querySelectorAll("[data-nav]");
  var sections = Array.prototype.map.call(navLinks, function (link) {
    return document.getElementById(link.getAttribute("data-nav"));
  });

  function setActiveNav(id) {
    navLinks.forEach(function (link) {
      if (link.getAttribute("data-nav") === id) {
        link.setAttribute("data-active", "true");
      } else {
        link.removeAttribute("data-active");
      }
    });
  }

  if ("IntersectionObserver" in window && sections.length) {
    var navObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActiveNav(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach(function (el) {
      if (el) navObserver.observe(el);
    });
  }
})();
