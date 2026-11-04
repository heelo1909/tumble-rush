import { describe, it, expect } from 'vitest';
import { currentStatus, stages, nextStage, latestLogEntry } from '../../../scripts/progress_view.mjs';
import { isProtected } from '../../../scripts/harness_common.mjs';

const MD = `# PROGRESS
## Current status
- **Next stage:** G1 — Runner
- **Last stage:** H1
## Stages
- [x] H0 — Scaffold + harness
- [ ] H1 — Probe (needs the user)
- [ ] G1 — Runner
## Stage log
### Template
- Date: x
### G9 first
- Smoke: PASS
### Older
- Smoke: PASS
## Decisions
`;

describe('progress_view', () => {
  it('parses status bullets', () => expect(currentStatus(MD)['Next stage']).toBe('G1 — Runner'));
  it('parses stages with done flags', () => {
    expect(stages(MD).map((s) => [s.id, s.done])).toEqual([['H0', true], ['H1', false], ['G1', false]]);
  });
  it('next stage is the first unticked one', () => expect(nextStage(MD).id).toBe('H1'));
  it('latest log entry skips the template and takes the newest', () => {
    expect(latestLogEntry(MD)).toMatch(/^### G9 first/);
  });
  it('returns null when there are no entries', () => {
    expect(latestLogEntry('## Stage log\n### Template\n- x\n')).toBeNull();
  });
});

describe('isProtected', () => {
  it.each(['.claude/settings.json', '.claude/hooks/a.mjs', 'scripts/smoke.mjs', 'playwright.config.js', 'scripts/harness_common.mjs'])('protects %s', (p) => {
    expect(isProtected(p)).toBe(true);
  });
  it.each(['src/main.js', 'scripts/other.mjs', 'smoke_checks/h0_x.mjs', 'PROGRESS.md'])('allows %s', (p) => {
    expect(isProtected(p)).toBe(false);
  });
});
