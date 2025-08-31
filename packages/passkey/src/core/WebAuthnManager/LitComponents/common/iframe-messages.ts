// Shared message types and helpers for iframe host/child communication

import { TransactionInputWasm } from "@/core/types";
import type { TransactionInput } from "@/core/types/actions";
import type { TooltipGeometry, TooltipPosition } from "../IframeButtonWithTooltipConfirmer/iframe-geometry";
import { TooltipTreeStyles } from "../TooltipTxTree";

// =============================================================
// == Common subset shared by both button and modal channels ===
// =============================================================

export type IframeSharedMessageType =
  | 'READY'
  | 'ETX_DEFINED'
  | 'SET_TX_DATA'
  | 'SET_LOADING'
  | 'REQUEST_UI_DIGEST'
  | 'UI_INTENT_DIGEST'
  | 'CONFIRM'
  | 'IFRAME_ERROR'
  | 'IFRAME_UNHANDLED_REJECTION';

// Base message envelope for strongly-typed type/payload pairs
export interface IframeBaseMessage<TType extends string, TPayloads extends Record<TType, unknown>> {
  type: TType;
  payload?: TPayloads[TType];
}

export type IframeMessage = IframeModalMessage | IframeButtonMessage;

// ===========================
// == Iframe Modal Messages ==
// ===========================

export interface IframeModalMessage extends IframeBaseMessage<IframeModalMessageType, IframeModalMessagePayloads> {}

export type IframeModalMessageType =
  | IframeSharedMessageType
  | 'SET_INIT'
  | 'CANCEL'
  | 'CLOSE_MODAL';

export interface IframeModalMessagePayloads {
  READY: undefined;
  ETX_DEFINED: undefined;
  SET_INIT: { targetOrigin: string };
  SET_TX_DATA: { nearAccountId: string; txSigningRequests: TransactionInputWasm[]; theme?: Record<string, string> };
  SET_LOADING: boolean;
  REQUEST_UI_DIGEST: undefined;
  UI_INTENT_DIGEST: { ok: boolean; digest?: string; error?: string };
  CONFIRM: undefined;
  CANCEL: undefined;
  CLOSE_MODAL: { confirmed: boolean };
  IFRAME_ERROR: string;
  IFRAME_UNHANDLED_REJECTION: string;
}

// ============================
// == Iframe Button Messages ==
// ============================

export interface IframeInitData {
  size: { width: string; height: string };
  tooltip: { width: string; height: string; position: string; offset: string };
  buttonPosition: { x: number; y: number };
  backgroundColor: string;
  tagName: string;
  targetOrigin?: string;
}

export interface IframeButtonMessage extends IframeBaseMessage<IframeButtonMessageType, IframeButtonMessagePayloads> {}

export type IframeButtonMessageType =
  | IframeSharedMessageType
  | 'HS1_INIT'
  | 'HS2_POSITIONED'
  | 'HS3_GEOMETRY_REQUEST'
  | 'HS5_GEOMETRY_RESULT'
  | 'SET_STYLE'
  | 'TOOLTIP_STATE'
  | 'BUTTON_HOVER';

export interface IframeButtonMessagePayloads {
  READY: undefined;
  ETX_DEFINED: undefined;
  HS1_INIT: IframeInitData;
  HS2_POSITIONED: { x: number; y: number };
  HS3_GEOMETRY_REQUEST: undefined;
  HS5_GEOMETRY_RESULT: TooltipGeometry;
  SET_TX_DATA: { nearAccountId: string; txSigningRequests: TransactionInput[] };
  SET_LOADING: boolean;
  SET_STYLE: {
    buttonStyle: Record<string, string | number>;
    buttonHoverStyle: Record<string, string | number>;
    tooltipPosition: TooltipPosition;
    tooltipTreeStyles?: TooltipTreeStyles;
  };
  CONFIRM: undefined;
  TOOLTIP_STATE: TooltipGeometry;
  BUTTON_HOVER: { hovering: boolean };
  REQUEST_UI_DIGEST: undefined;
  UI_INTENT_DIGEST: { ok: boolean; digest?: string; error?: string };
  IFRAME_ERROR: string;
  IFRAME_UNHANDLED_REJECTION: string;
}

// === Post Message Helpers ===

// Overloads to support both modal and button channels
export function postToParent<T extends IframeModalMessageType>(
  type: T,
  payload?: IframeModalMessagePayloads[T],
  target?: string
): void;

export function postToParent<T extends IframeButtonMessageType>(
  type: T,
  payload?: IframeButtonMessagePayloads[T],
  target?: string
): void;

export function postToParent(type: string, payload?: unknown, target: string = '*') {
  try { window.parent.postMessage({ type, payload }, target); } catch {}
}

export function postError(kind: 'IFRAME_ERROR' | 'IFRAME_UNHANDLED_REJECTION', message: string, target: string = '*') {
  postToParent(kind, message, target);
}
