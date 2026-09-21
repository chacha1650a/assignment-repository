"""
10번째 과제 실험 스크립트 — 지시문 모호성과 할루시네이션의 관계

같은 소스 문서(source_document.md)를 주고 "요약해줘"를 모호한 버전과
구체적인 버전 두 가지 지시문으로 각각 REPEATS회 반복 전송한 뒤,
원문 응답을 raw_responses/ 아래에 JSON으로 저장한다.

사용 전 준비:
  1) ANTHROPIC_API_KEY 환경변수를 본인 터미널에서 미리 설정해 둘 것
     (setx ANTHROPIC_API_KEY "본인_키"  ->  새 터미널에서 실행)
  2) pip install anthropic

실행:
  python run_experiment.py
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import anthropic

MODEL = "claude-sonnet-5"
REPEATS = 12  # 조건별 반복 횟수 (과제 최소 기준: 10회 이상)

BASE_DIR = Path(__file__).resolve().parent.parent
SOURCE_DOC_PATH = BASE_DIR / "원자료" / "source_document.md"
OUTPUT_DIR = BASE_DIR / "원자료" / "raw_responses"

PROMPTS = {
    "vague": "이 문서 요약해줘.\n\n{document}",
    "specific": (
        "아래 문서에 있는 내용만 사용해서 5줄 이내로 요약해줘. "
        "문서에 없는 숫자, 이름, 날짜, 파일명은 절대 새로 만들어 넣지 마. "
        "확실하지 않은 부분이 있으면 추측하지 말고 '문서에 없음'이라고 써.\n\n{document}"
    ),
}


def run_condition(client: anthropic.Anthropic, condition: str, template: str, document: str) -> None:
    for i in range(1, REPEATS + 1):
        out_path = OUTPUT_DIR / f"{condition}_{i:02d}.json"
        if out_path.exists():
            print(f"[skip] {out_path.name} 이미 있음")
            continue

        prompt = template.format(document=document)
        response = client.messages.create(
            model=MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in response.content if block.type == "text")

        record = {
            "condition": condition,
            "index": i,
            "model": MODEL,
            "prompt": prompt,
            "response_text": text,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        }
        out_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[ok] {out_path.name} 저장 ({len(text)}자)")
        time.sleep(1)  # 요청 속도 제한 여유


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit(
            "ANTHROPIC_API_KEY 환경변수가 없습니다. "
            "본인 터미널에서 setx ANTHROPIC_API_KEY 로 설정 후 새 터미널을 열어 다시 실행하세요."
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    document = SOURCE_DOC_PATH.read_text(encoding="utf-8")

    client = anthropic.Anthropic()

    for condition, template in PROMPTS.items():
        print(f"=== 조건: {condition} ({REPEATS}회) ===")
        run_condition(client, condition, template, document)

    print("완료. 원자료/raw_responses/ 폴더를 확인하세요.")


if __name__ == "__main__":
    main()
