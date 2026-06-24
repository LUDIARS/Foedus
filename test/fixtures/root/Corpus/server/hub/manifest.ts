// fixture: Corpus normalize の corpusApi 既定 (= supportedCorpusApi) を 1 にする。
export function normalizeManifest(raw) {
  return {
    service: raw.service,
    corpusApi: typeof raw.corpusApi === 'number' ? raw.corpusApi : 1,
    auth: typeof raw.auth === 'string' ? raw.auth : 'none',
  };
}
