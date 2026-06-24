// fixture: makeTokenProvider の既定は passthrough。
export function makeTokenProvider(mode, cernereBaseUrl) {
  if (mode === 'cernere-project-token') {
    return new CernereProjectTokenProvider(cernereBaseUrl);
  }
  return new PassthroughTokenProvider();
}
