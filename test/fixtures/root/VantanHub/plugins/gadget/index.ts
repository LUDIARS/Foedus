// fixture: gadget は corpus.ts を持たない接続先 → H-LINK-04 (discovery 到達性) が発火。
const gadgetModule = {
  id: 'gadget',
  setup(ctx) {
    const gadget = new HttpServiceConnector({
      id: 'gadget',
      title: 'Gadget',
      scope: 'multi',
      baseUrl: ctx.env('GADGET_BASE_URL') ?? '',
    });
    ctx.registerConnector(gadget);
  },
};
export default gadgetModule;
