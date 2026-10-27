---
name: p2p-qa-run
description: Runs the P2P QA agent — the explorer, then the adversary, then the judge — and shows the report. Use when the user asks to run the QA agent, test the P2P API on its own, run the challenge, or check the business rules end to end against a running API.
paths: "qa-run/**, .cursor/agents/p2p-*.md, CHALLENGE.md, docs/API.md"
---

# P2P QA agent run

Orchestrates the three challenge subagents in order. **Fix nothing, write no tests, file no bugs** — only run agents and show results; humans handle follow-ups.

Default base URL: `http://localhost:8000` (override if the user gives another).

## Steps

1. **Health** — `curl -sS -o /dev/null -w "%{http_code}" {baseURL}/health` (or full GET). If not **200**, tell the user to run **`npm start`** in the project root and **stop**.

2. **Clean run output** — Empty **`qa-run/`** (delete contents; keep the directory). It holds **this run only**.

3. **Reset seed** — `curl -X POST {baseURL}/admin/reset` (log status; continue if 200).

4. **Explorer** — Invoke the **`p2p-explorer`** subagent with the base URL. Wait until it finishes (`qa-run/steps.jsonl` populated).

5. **Adversary** — Invoke the **`p2p-adversary`** subagent with the base URL. Wait until it finishes (`qa-run/attack-plan.md` and `qa-run/attacks.jsonl`).

6. **Judge** — Invoke the **`p2p-judge`** subagent with the base URL. Wait until **`qa-run/report.json`** exists and parses.

7. **Show results**:
   - Happy path **PASS** or **FAIL**
   - **Rule table** from the judge (rule | status | one line of evidence)
   - Path to **`qa-run/report.json`**

## Guardrails

- Subagents use **curl only** for HTTP; outputs live under **`qa-run/`** only.
- Do not read **`src/`** during the run.
- Do not modify **`tests/`**, **`src/`**, or **`docs/`** as part of this skill.
