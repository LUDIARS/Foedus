// fixture: aedilis に接続する connector (aedilis は corpus.ts を持つ → H-LINK-04 不発)。
const facilityModule = {
  id: 'facility',
  setup(ctx) {
    const aedilis = new HttpServiceConnector({
      id: 'aedilis',
      title: '施設予約 (Aedilis)',
      scope: 'multi',
      baseUrl: ctx.env('AEDILIS_BASE_URL') ?? '',
    });
    ctx.registerConnector(aedilis);
  },
};
export default facilityModule;
