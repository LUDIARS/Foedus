// fixture: Leak は cernereProjectKey='memoria' (seed 済 → H-LINK-01 不発)、
// corpusApi:1 (H-LINK-07 不発)、 auth:'none' (H-LINK-02 不発)。 schema 側で
// トークン/PII を保持して C-DATA-01/02 を発火させるためのケース。
export const corpusManifest = {
  service: 'leak',
  displayName: 'Leak',
  version: '0.1.0',
  corpusApi: 1,
  health: '/api/health',
  auth: 'none',
  cernereProjectKey: 'memoria',
  data: [],
  panels: [{ id: 'p', kind: 'script', title: 'P', entry: '/p.js' }],
};
