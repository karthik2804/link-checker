import { BrokenLink } from "./linkChecker.js";

export type LinkCheckerEvent =
  | "start"
  | "complete"
  | "progress"
  | "retry"
  | "link:start"
  | "link:success"
  | "link:error"
  | "link:redirect"
  | "stopped";

export interface LinkSuccessEvent {
  url: string;
  statusCode: number;
  parentUrl?: string;
}

export interface LinkErrorEvent {
  url: string;
  statusCode?: number;
  error?: string;
  parentUrl?: string;
}

export interface LinkStartEvent {
  url: string;
  parentUrl?: string;
}

export interface LinkRedirectEvent {
  from: string;
  to: string;
  parentUrl?: string;
}

export interface ProgressEvent {
  checked: number;
  broken: number;
}

export interface CompletionEvent {
  linksVisited: string[];
  brokenLinks: BrokenLink[];
}

export interface RetryEvent {
  url: string;
  attempt: number;
  error: string;
  parentUrl?: string;
}
