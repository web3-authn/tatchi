import { Page, TestInfo, type ConsoleMessage } from '@playwright/test';

const INDENT_UNIT = '  ';

export type LogCategory = 'setup' | 'flow' | 'intercept' | 'console' | 'test' | 'harness';

export interface LogFormatOptions {
  step?: string | number;
  indent?: number;
  scope?: string;
}

export function formatLog(
  category: LogCategory,
  message: string,
  options: LogFormatOptions = {}
): string {
  const { step, indent = 0, scope } = options;
  const parts: string[] = [`[${category}`];

  if (scope) {
    parts.push(`:${scope}`);
  }

  if (typeof step !== 'undefined') {
    parts.push(` - step ${step}`);
  }

  parts.push(']');

  const header = parts.join('');
  const padding = indent > 0 ? INDENT_UNIT.repeat(indent) : '';
  return `${header} ${padding}${message}`;
}

export function printLog(
  category: LogCategory,
  message: string,
  options: LogFormatOptions = {}
): void {
  console.log(formatLog(category, message, options));
}

// Grouped header like:
// [setup]
export function printGroupHeader(category: LogCategory): void {
  console.log(`[${category}]`);
}

// Indented step line like:
//   [step 1] message
export function printStepLine(
  step: string | number,
  message: string,
  indent = 1,
  category: LogCategory = 'setup'
): void {
  const pad = INDENT_UNIT.repeat(Math.max(0, indent));
  const label = `${category}: ${step}`;
  console.log(`${pad}[${label}] ${message}`);
}

export function createConsoleCapture(
  page: Page,
  testInfo: TestInfo,
  options: { verboseEnvVar?: string } = {}
) {
  const verboseFlag = options.verboseEnvVar ?? 'VERBOSE_TEST_LOGS';
  const verbose = process.env[verboseFlag] === '1' || process.env[verboseFlag] === 'true';

  const messages: string[] = [];
  let started = false;

  const handleConsole = (msg: ConsoleMessage) => {
    const type = msg.type();
    const entry = formatLog('console', msg.text(), {
      scope: type,
    });
    messages.push(entry);
    if (verbose || type === 'error' || type === 'warning') {
      console.log(entry);
    }
  };

  const handlePageError = (error: Error) => {
    const entry = formatLog('console', error.message, {
      scope: 'pageerror',
    });
    messages.push(entry);
    if (verbose) {
      console.log(entry);
    }
  };

  const start = () => {
    if (started) return;
    started = true;
    page.on('console', handleConsole as any);
    page.on('pageerror', handlePageError);
  };

  const stop = () => {
    if (!started) return;
    page.off('console', handleConsole as any);
    page.off('pageerror', handlePageError);
    started = false;
  };

  const flush = () => {
    if (!messages.length) {
      return;
    }
    console.log('');
    console.log(formatLog('console', `Captured browser output for "${testInfo.title}"`, {
      scope: testInfo.project?.name,
    }));
    for (const entry of messages) {
      console.log(formatLog('console', entry.replace(/^\[console[^\]]*\]\s*/, ''), {
        indent: 1,
      }));
    }
  };

  return {
    messages,
    start,
    stop,
    flush,
  };
}
