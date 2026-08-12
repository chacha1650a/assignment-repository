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
