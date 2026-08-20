import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const LOG_DIR = path.join(process.cwd(), ".agent-logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function stripAnsi(str) {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function getDiagnosticLines(rawOutput) {
  const clean = stripAnsi(rawOutput);
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  const pattern = /(?:FAIL|failed|error|AssertionError|SyntaxError|test failed|ERR_|not ok)/i;
  let matching = lines.filter((l) => pattern.test(l));

  if (matching.length === 0) {
    matching = lines.slice(-3);
  } else {
    matching = matching.slice(0, 3);
  }

  return matching.map((l) => {
    const trimmed = l.trim();
    return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
  });
}

const stages = [
  { id: "syntax", name: "Syntax", script: "check:syntax" },
  { id: "tests", name: "Tests", script: "test" },
  { id: "database", name: "Database", script: "check:db" },
];

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

console.log("Agent validation");

let overallFailed = false;
let exitCode = 0;

for (const stage of stages) {
  const startTime = performance.now();
  const res = spawnSync(npmCmd, ["run", stage.script], {
    encoding: "utf8",
    shell: true,
    maxBuffer: 50 * 1024 * 1024,
  });

  const duration = ((performance.now() - startTime) / 1000).toFixed(1);
  const output = (res.stdout || "") + (res.stderr || "");
  const logPath = path.join(LOG_DIR, `${stage.id}.log`);
  fs.writeFileSync(logPath, output, "utf8");

  if (res.error || res.status !== 0) {
    overallFailed = true;
    exitCode = res.status !== null && res.status !== undefined ? res.status : 1;
    console.log(`${stage.name.padEnd(11)}FAIL (${duration}s)`);

    if (res.error) {
      console.log(`  Error spawning ${npmCmd}: ${res.error.message}`);
    } else {
      const diagLines = getDiagnosticLines(output);
      for (const line of diagLines) {
        console.log(`  ${line}`);
      }
    }
    console.log(`  Log: .agent-logs/${stage.id}.log`);
    break;
  } else {
    console.log(`${stage.name.padEnd(11)}PASS (${duration}s)`);
  }
}

if (overallFailed) {
  console.log("Result     FAIL");
  process.exit(exitCode);
} else {
  console.log("Result     PASS");
  process.exit(0);
}
