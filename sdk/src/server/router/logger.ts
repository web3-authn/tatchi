import type { Logger, NormalizedLogger } from '../core/logger';
import { coerceLogger } from '../core/logger';

export type RouterLogger = Logger;
export type NormalizedRouterLogger = NormalizedLogger;
export const coerceRouterLogger = coerceLogger;
/** @deprecated use `coerceRouterLogger` */
export const normalizeRouterLogger = coerceRouterLogger;
