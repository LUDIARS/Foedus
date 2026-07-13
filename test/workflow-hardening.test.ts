import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ciWorkflow = fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url));
const scheduledReview = fileURLToPath(
  new URL('../.github/workflows/scheduled-review.yml', import.meta.url),
);

const immutableReference = /@[0-9a-f]{40}(?:\s|$)/;

async function readWorkflows(): Promise<[string, string]> {
  const [ci, scheduled] = await Promise.all([
    readFile(ciWorkflow, 'utf8'),
    readFile(scheduledReview, 'utf8'),
  ]);
  return [ci, scheduled];
}

describe('workflow hardening', () => {
  it('pins every action and reusable workflow to an immutable commit', async () => {
    const workflows = await readWorkflows();
    const references = workflows.flatMap((workflow) =>
      [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map((match) => match[1]),
    );

    expect(references).toHaveLength(11);
    expect(references.every((reference) => immutableReference.test(reference ?? ''))).toBe(true);
    expect(references).toContain(
      'LUDIARS/AIFormat/.github/workflows/harness-checks.yml@b67d1063dbc857ab619b01ba35f7b979b07691ba',
    );
  });

  it('does not persist checkout credentials and preserves scanned input revisions', async () => {
    const [ci, scheduled] = await readWorkflows();

    expect(ci).toContain('persist-credentials: false');
    expect(scheduled.match(/persist-credentials: false/g)).toHaveLength(6);
    expect(scheduled).toContain('if: always()');
    expect(scheduled).toContain('artifacts/scan-inputs.json');
    expect(scheduled).toContain('git -C "$repo_path" rev-parse HEAD');
  });
});
