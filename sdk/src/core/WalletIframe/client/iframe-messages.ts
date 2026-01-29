// Message constants (typed string literals, tree-shake friendly)
export const IframeMessage = {
  Connect: 'CONNECT',
  Ready: 'READY',
  HostBooted: 'SERVICE_HOST_BOOTED',
  HostDebugOrigin: 'SERVICE_HOST_DEBUG_ORIGIN',
  HostLog: 'SERVICE_HOST_LOG',
} as const;
