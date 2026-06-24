// fixture: Aedilis の corpusManifest (純リテラル)。 corpusApi:2 / declarative panel /
// auth cernere-project-token / cernereProjectKey 'aedilis' (managed_projects 未seed)。

interface CorpusServiceManifest {
  service: string;
  displayName: string;
  version: string;
  corpusApi: number;
  health: string;
  auth: string;
  cernereProjectKey?: string;
  data: { id: string; path: string; scope: 'local' | 'multi' }[];
  panels: { id: string; kind: string; title: string }[];
}

export const corpusManifest: CorpusServiceManifest = {
  service: 'aedilis',
  displayName: 'Aedilis 施設予約',
  version: '0.2.0',
  corpusApi: 2,
  health: '/api/health',
  auth: 'cernere-project-token',
  cernereProjectKey: 'aedilis',
  data: [
    { id: 'facilities', path: '/api/facilities', scope: 'local' },
    { id: 'reservations', path: '/api/reservations', scope: 'local' },
  ],
  panels: [{ id: 'reservations', kind: 'declarative', title: '施設予約' }],
};
