document.querySelectorAll(".strength-toggle").forEach(function (button) {
  var panel = document.getElementById(button.getAttribute("aria-controls"));
  var card = button.closest(".strength-card");

  panel.addEventListener("transitionend", function (event) {
    if (event.propertyName !== "max-height") return;
    if (panel.classList.contains("is-open")) {
      // 펼쳐진 뒤에는 높이 제한을 풀어서, 내용이 바뀌거나 창 크기가 변해도 잘리지 않게 함
      panel.style.maxHeight = "none";
    }
  });

  button.addEventListener("click", function () {
    var expanded = button.getAttribute("aria-expanded") === "true";

    if (expanded) {
      // 접기: 먼저 현재 실제 높이로 고정한 뒤, 다음 프레임에 0으로 줄여 애니메이션 발생
      panel.style.maxHeight = panel.scrollHeight + "px";
      panel.getBoundingClientRect(); // 강제 리플로우
      requestAnimationFrame(function () {
        panel.classList.remove("is-open");
        panel.style.maxHeight = "0px";
      });
    } else {
      // 펼치기: 0에서 실제 콘텐츠 높이까지 애니메이션
      panel.classList.add("is-open");
      panel.style.maxHeight = panel.scrollHeight + "px";
    }

    button.setAttribute("aria-expanded", String(!expanded));
    panel.setAttribute("aria-hidden", String(expanded));
    card.classList.toggle("is-active", !expanded);

    button.querySelector(".toggle-label").textContent = expanded ? "자세히 보기" : "접기";
    button.querySelector(".toggle-icon").textContent = expanded ? "+" : "−";
  });
});

var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 코드 카드 타이핑 애니메이션
(function () {
  var codeEl = document.getElementById("typed-code");
  if (!codeEl) return;

  if (prefersReducedMotion) return; // 이미 정적 문법 강조 상태로 렌더링되어 있으므로 그대로 둠

  var preEl = codeEl.closest(".code-card-body");
  var original = codeEl.innerHTML;
  var plainText = codeEl.textContent;

  codeEl.textContent = "";
  if (preEl) preEl.classList.add("is-typing");

  var i = 0;
  function typeNext() {
    if (i >= plainText.length) {
      // 다 친 뒤에는 원래의 문법 강조(색상) 버전으로 교체
      codeEl.innerHTML = original;
      if (preEl) preEl.classList.remove("is-typing");
      return;
    }
    var ch = plainText[i];
    codeEl.textContent += ch;
    i++;
    // 줄바꿈·공백 뒤에는 살짝 더 빠르게, 일반 문자는 타이핑감 있게
    var delay = ch === "\n" ? 90 : ch === " " ? 8 : 14 + Math.random() * 10;
    setTimeout(typeNext, delay);
  }

  setTimeout(typeNext, 500); // 히어로 등장 애니메이션과 타이밍 맞춤
})();

// 강점 카드 스크롤 등장
(function () {
  var items = document.querySelectorAll(".scroll-reveal");
  if (!items.length) return;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    items.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  items.forEach(function (el) {
    observer.observe(el);
  });
})();
