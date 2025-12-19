import type { Logger, NormalizedLogger } from '../core/logger';
import { normalizeLogger } from '../core/logger';

export type RouterLogger = Logger;
export type NormalizedRouterLogger = NormalizedLogger;
export const normalizeRouterLogger = normalizeLogger;
