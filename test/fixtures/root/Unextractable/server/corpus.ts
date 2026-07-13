const serviceName = process.env.FOEDUS_TEST_SERVICE ?? 'unextractable';

// The reference is deliberately not a literal. Static extraction must skip it
// rather than evaluating process.env or guessing a partial manifest.
export const corpusManifest = {
  service: serviceName,
  corpusApi: 1,
  auth: 'none',
  data: [],
  panels: [],
};
