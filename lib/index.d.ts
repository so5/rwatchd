import { EventEmitter } from "events";

export interface Hook {
  cmd: string;
  rt?: string;
  output?: string;
  withArgument?: boolean;
}

export interface Request {
  cmd: string;
  delimiter?: string;
  interval?: number;
  argument?: string;
  withoutArgument?: boolean;
  re?: string | RegExp;
  until?: boolean;
  allowEmptyOutput?: boolean;
  numAllowFirstFewEmptyOutput?: number;
  hostInfo: object;
  finishedHook?: Hook;
  finishedLocalHook?: Hook;
  failedHook?: Hook;
  failedLocalHook?: Hook;
  doneHook?: Hook;
  doneLocalHook?: Hook;
  id?: string;
  event?: EventEmitter;
  checkCount?: number;
  rt?: number;
  lastOutput?: string;
}

export function addRequest(request: Request): string;
export function replaceCmd(id: string, cmd: string): boolean;
export function delRequest(id: string): boolean;
export function getRequest(id: string): Request | undefined;
export function clearAll(): Promise<void>;
