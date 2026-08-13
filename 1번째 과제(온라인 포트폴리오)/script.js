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

// 코드 카드 타이핑 애니메이션 — 원래의 문법 강조 구조(span)는 그대로 두고
// 그 안의 글자만 하나씩 채워 넣어서, 타이핑되는 순간부터 색이 바로 보이게 함
(function () {
  var codeEl = document.getElementById("typed-code");
  if (!codeEl) return;

  if (prefersReducedMotion) return; // 이미 정적 문법 강조 상태로 렌더링되어 있으므로 그대로 둠

  var preEl = codeEl.closest(".code-card-body");

  // 원본 구조를 감춰진 곳에 보관해두고, 같은 구조(빈 텍스트)를 실제 자리에 다시 만듦
  var sourceRoot = document.createElement("div");
  sourceRoot.innerHTML = codeEl.innerHTML;

  var queue = [];
  function buildSkeleton(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var liveText = document.createTextNode("");
      parent.appendChild(liveText);
      for (var idx = 0; idx < text.length; idx++) {
        (function (ch) {
          queue.push(function () {
            liveText.textContent += ch;
            return ch;
          });
        })(text[idx]);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      var liveEl = document.createElement(node.tagName);
      for (var a = 0; a < node.attributes.length; a++) {
        liveEl.setAttribute(node.attributes[a].name, node.attributes[a].value);
      }
      parent.appendChild(liveEl);
      Array.prototype.forEach.call(node.childNodes, function (child) {
        buildSkeleton(child, liveEl);
      });
    }
  }

  codeEl.innerHTML = "";
  Array.prototype.forEach.call(sourceRoot.childNodes, function (child) {
    buildSkeleton(child, codeEl);
  });

  if (preEl) preEl.classList.add("is-typing");

  var i = 0;
  function typeNext() {
    if (i >= queue.length) {
      if (preEl) preEl.classList.remove("is-typing");
      return;
    }
    // "타다닥" 느낌을 위해 한 번에 2~4글자씩 묶어서 빠르게 찍음
    var chunkSize = 2 + Math.floor(Math.random() * 3);
    var lastCh = "";
    for (var n = 0; n < chunkSize && i < queue.length; n++) {
      lastCh = queue[i]();
      i++;
      if (lastCh === "\n") break; // 줄이 바뀌는 지점에서 묶음을 끊어서 다음 줄은 다시 처음부터 타다닥
    }
    if (i >= queue.length) {
      if (preEl) preEl.classList.remove("is-typing");
      return;
    }
    var delay = lastCh === "\n" ? 55 : 12 + Math.random() * 10;
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
