// ABOUT: OpenNext configuration for Cloudflare Workers deployment
// ABOUT: Configures adapter and bundling for Cloudflare platform

export default {
  default: {
    override: {
      wrapper: 'cloudflare-node',
    },
  },
};
