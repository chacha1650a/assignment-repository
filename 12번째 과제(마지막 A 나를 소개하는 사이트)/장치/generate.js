#!/usr/bin/env node
// 계속 새로 쓰는 장치 — 리추얼·출석·제출 기록 파일을 넣으면
// (1) 사이트 「숫자」 칸 값과 (2) 능력별 문단 후보를 다시 만든다.
// 후보는 파일로만 나오고, 사람이 승인한 것만 사이트 본문에 들어간다.
// 같은 입력이면 항상 같은 출력(결정적)이 나오도록, AI 호출이나
// 시각(Date.now 등)에 의존하는 값은 출력에 넣지 않는다.

const fs = require("fs");
const path = require("path");

const ABILITY_KEYWORDS = {
  "자기조절력": ["침착", "재명령", "막힐 뻔", "당황하지", "다시 접근", "재정리"],
  "대인관계력": ["동료", "함께 고민", "감사", "팀원", "디스코드", "대화"],
  "자기동기력": ["스스로", "하고 싶어서", "행복", "포기하지 않", "내 속도", "직접 구현"],
};

function readJSON(inputDir, name) {
  const p = path.join(inputDir, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function buildNumbers(inputDir) {
  const attendance = readJSON(inputDir, "attendance.json") || readJSON(inputDir, "attendance.sample.json");
  const ritualSummary = readJSON(inputDir, "ritual_summary.json") || readJSON(inputDir, "ritual_summary.sample.json");
  const submissions = readJSON(inputDir, "submissions.json") || readJSON(inputDir, "submissions.sample.json") || [];

  const numbers = {};

  if (attendance) {
    const rate = attendance.enrolledDays > 0
      ? round1((attendance.presentDays / attendance.enrolledDays) * 100)
      : 0;
    numbers.attendance = {
      trainingDays: attendance.trainingDays,
      presentDays: attendance.presentDays,
      absentDays: attendance.absentDays,
      ratePercent: rate,
      source: attendance.source || "내 출석 기록",
    };
  }

  if (ritualSummary) {
    numbers.ritual = {
      morningCount: ritualSummary.morningCount,
      closingCount: ritualSummary.closingCount,
      totalCount: ritualSummary.totalCount,
      source: ritualSummary.source || "리추얼 기록",
    };
  }

  const completed = submissions.filter(
    (s) => s.status === "최종 확인 완료"
  ).length;
  numbers.submissions = {
    completed,
    total: 13,
    source: "내 제출 현황",
  };

  return numbers;
}

function buildCandidates(inputDir) {
  const ritual = readJSON(inputDir, "ritual.json") || readJSON(inputDir, "ritual.sample.json") || [];

  const candidates = [];
  for (const entry of ritual) {
    for (const [ability, keywords] of Object.entries(ABILITY_KEYWORDS)) {
      const hit = keywords.find((kw) => entry.text.includes(kw));
      if (hit) {
        candidates.push({
          ability,
          date: entry.date,
          type: entry.type,
          keyword: hit,
          quote: entry.text,
        });
      }
    }
  }

  // 결정적 정렬: 날짜 → 능력 → 키워드 순. Math.random·Date.now 사용하지 않음.
  candidates.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.ability !== b.ability) return a.ability < b.ability ? -1 : 1;
    return a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0;
  });

  return candidates;
}

function renderCandidatesMarkdown(candidates) {
  const lines = [
    "# 능력별 문단 후보 (승인 대기)",
    "",
    "이 파일은 장치가 자동으로 뽑은 후보입니다. 아무 것도 사이트에 자동으로 들어가지 않습니다.",
    "사람이 이 목록에서 고른 문장만 손으로 사이트 「이야기」에 반영합니다.",
    "",
  ];
  const byAbility = {};
  for (const c of candidates) {
    (byAbility[c.ability] = byAbility[c.ability] || []).push(c);
  }
  for (const ability of Object.keys(ABILITY_KEYWORDS)) {
    lines.push(`## ${ability}`);
    lines.push("");
    const list = byAbility[ability] || [];
    if (list.length === 0) {
      lines.push("- (이번 입력에서 후보 없음)");
    } else {
      for (const c of list) {
        lines.push(`- **${c.date} · ${c.type}** (키워드: "${c.keyword}") — ${c.quote}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const inputDir = process.argv[2] || path.join(__dirname, "input");
  const outputDir = process.argv[3] || path.join(__dirname, "output");

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const numbers = buildNumbers(inputDir);
  const candidates = buildCandidates(inputDir);

  fs.writeFileSync(
    path.join(outputDir, "numbers.json"),
    JSON.stringify(numbers, null, 2) + "\n",
    "utf-8"
  );
  fs.writeFileSync(
    path.join(outputDir, "candidates.md"),
    renderCandidatesMarkdown(candidates),
    "utf-8"
  );

  console.log(`읽은 입력 폴더: ${inputDir}`);
  console.log(`숫자 칸 → ${path.join(outputDir, "numbers.json")}`);
  console.log(`문단 후보(${candidates.length}건) → ${path.join(outputDir, "candidates.md")}`);
}

main();
