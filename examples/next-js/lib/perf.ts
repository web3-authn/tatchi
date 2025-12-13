type PerfState = {
  inited?: boolean;
  marks?: Set<string>;
  measures?: Set<string>;
};

function getPerfState(): PerfState {
  const g = globalThis as any;
  if (!g.__w3aPerfState) g.__w3aPerfState = {};
  return g.__w3aPerfState as PerfState;
}

function hasPerformance(): boolean {
  return typeof performance !== 'undefined' && typeof performance.mark === 'function';
}

export function markOnce(name: string): void {
  if (!hasPerformance()) return;
  const state = getPerfState();
  if (!state.marks) state.marks = new Set();
  if (state.marks.has(name)) return;
  state.marks.add(name);
  performance.mark(name);
}

export function measureOnce(name: string, startMark: string, endMark: string): void {
  if (!hasPerformance() || typeof performance.measure !== 'function') return;
  const state = getPerfState();
  if (!state.measures) state.measures = new Set();
  if (state.measures.has(name)) return;

  try {
    performance.measure(name, startMark, endMark);
    state.measures.add(name);
    const entries = performance.getEntriesByName(name, 'measure');
    const last = entries[entries.length - 1] as PerformanceMeasure | undefined;
    if (last) {
      console.log('[perf][measure]', name, Math.round(last.startTime), Math.round(last.duration));
    }
  } catch {
    // Ignore missing marks or unsupported browsers.
  }
}

export function initW3APerfObservers(): void {
  if (typeof window === 'undefined') return;
  const state = getPerfState();
  if (state.inited) return;
  state.inited = true;

  if (typeof PerformanceObserver !== 'function') return;

  try {
    const paintObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType !== 'paint') continue;
        console.log('[perf][paint]', entry.name, Math.round(entry.startTime));
      }
    });
    paintObserver.observe({ type: 'paint', buffered: true } as any);
  } catch {}

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (!last) return;
      console.log('[perf][lcp]', Math.round(last.startTime));
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true } as any);
  } catch {}

  try {
    const resourceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType !== 'resource') continue;
        const res = entry as PerformanceResourceTiming;
        if (res.initiatorType !== 'script') continue;
        if (!res.name.includes('/_next/static/chunks/')) continue;
        console.log('[perf][resource][script]', Math.round(res.startTime), Math.round(res.duration), res.name);
      }
    });
    resourceObserver.observe({ type: 'resource', buffered: true } as any);
  } catch {}
}
