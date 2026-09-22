# 계속 새로 쓰는 장치

리추얼 기록·출석 숫자·과제 제출 목록 파일을 넣으면, 사이트 「기록」 칸에 쓸 숫자와 「이야기」에 쓸
능력별(자기조절력·대인관계력·자기동기력) 문단 후보를 다시 만들어 주는 장치입니다.

**후보는 파일로만 나옵니다. 사람이 승인한 문장만 사이트 본문에 들어갑니다.**
AI 호출이나 현재 시각에 기대는 값이 출력에 없어서, 같은 입력이면 항상 같은 결과가 나옵니다(결정적).

## 돌리는 방법 (3단계)

1. ALEPH 대시보드에서 새로 내려받은 기록을 `input/` 폴더 안에 아래 이름으로 넣습니다. (처음 실행할 때는 `input/` 안의 `*.sample.json` 예시 파일이 그대로 쓰입니다.)
   - `ritual.json` — 리추얼 기록 배열. 각 항목은 `{ "date": "YYYY-MM-DD", "type": "아침" | "마무리", "text": "..." }`
   - `ritual_summary.json` — `{ "morningCount": n, "closingCount": n, "totalCount": n, "source": "리추얼 기록" }`
   - `attendance.json` — `{ "trainingDays": n, "enrolledDays": n, "presentDays": n, "absentDays": n, "source": "내 출석 기록" }`
   - `submissions.json` — `[{ "code": "T01", "title": "...", "status": "최종 확인 완료", "submittedAt": "YYYY-MM-DD" }, ...]`
2. Node.js(18 이상)가 설치된 상태에서 이 폴더로 이동해 실행합니다.
   ```bash
   node generate.js
   ```
   입력·출력 폴더를 직접 지정하려면: `node generate.js <입력폴더> <출력폴더>`
3. `output/numbers.json`(숫자 칸)과 `output/candidates.md`(능력별 문단 후보)를 확인합니다. 마음에 드는 후보 문장만 사람이 직접 사이트 `index.html`의 「이야기」·「기록」 절에 옮겨 적습니다. 장치는 사이트 파일을 자동으로 고치지 않습니다.

## 두 번 실행한 결과가 같은지 확인하는 방법

같은 입력 폴더로 서로 다른 출력 폴더에 두 번 실행한 뒤 `diff`로 비교합니다.

```bash
node generate.js ./input ./output_run1
node generate.js ./input ./output_run2
diff -r ./output_run1 ./output_run2
# 아무 차이도 없으면(EXIT CODE 0) 통과입니다.
```

이 저장소에 포함된 `output/`, `output_verify/` 폴더는 위 방법으로 실제 두 번 실행해 비교를 마친 결과입니다(자세한 내용은 `output/두번실행비교.md` 참고).

## 새 폴더에서 그대로 실행되는지 확인한 방법

`generate.js`, `input/`만 새 임시 폴더에 복사한 뒤 그 폴더 안에서 `node generate.js`를 실행해 같은 결과가 나오는 것을 확인했습니다. 외부 패키지 설치(`npm install`)가 필요 없습니다 — Node.js 기본 모듈(`fs`, `path`)만 사용합니다.

## AI 서비스 키가 필요한 경우

이 장치 자체는 규칙 기반(키워드 매칭)으로 동작하며 AI 서비스를 호출하지 않습니다. 이후 버전에서 AI로 후보 문장의 표현을 다듬는 단계를 추가하더라도, 최종 결과는 사람이 승인해 파일로 저장한 문장만 읽어 만들어야 두 번 실행 결과가 같아집니다. AI 서비스 키를 쓰게 되면 코드에 직접 적지 않고 환경 변수(예: `LLM_API_KEY`)로 읽고, 이 README에는 변수 이름만 남깁니다.

## 개인정보

`input/*.sample.json`에는 동료의 실명 대신 "동료 1", "(이름 가림)" 같은 익명 표기만 들어 있습니다. 실제 리추얼 기록을 넣을 때도 다른 사람의 실명·연락처는 지우고 넣습니다.
