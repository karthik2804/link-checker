import * as cheerio from "cheerio";
import { URL } from "url";
import { EventEmitter } from "events";
import { CompletionEvent, LinkCheckerEvent } from "./events.js";

export interface BrokenLink {
  // The URL that was broken.
  url: string;
  // The reason why the link was broken.
  reason: string;
  // The URL of the page where the broken link was found.
  parentUrl?: string;
}

export interface DomainSpecifcConfig {
  // Custom headers to send with each request to this domain. (Default = {})
  headers?: Record<string, string>;
}

interface LinkCheckerResult {
  linksVisited: string[];
  brokenLinks: BrokenLink[];
}

export interface LinkCheckerOptions {
  // URLs that should be ignored by the link checker. Can be a string or a regular expression. (Default = [])
  ignoreLinks?: string[];
  // Custom headers to send with each request. (Default = {})
  headers?: Record<string, string>;
  // Maximum number of concurrent requests to make. (Default = 5)
  concurrency?: number;
  // Timeout in milliseconds for each request. (Default = 3000)
  timeout?: number;
  // Number of times to retry a request if it fails. (Default = 3)
  retries?: number;
  // Delay in milliseconds between retries. (Default = 1000)
  retryDelay?: number;
  // Configuration specific to a domain.
  domainSpecificConfig?: Record<string, DomainSpecifcConfig>;
}

export const defaultConfig = {
  ignoreLinks: [],
  headers: {},
  concurrency: 5,
  timeout: 3000,
  retries: 3,
  retryDelay: 1000,
  domainSpecificConfig: {},
};

// A simple link checker that can be used to check for broken links on a website.
// The link checker is event-based and emits events for various stages of the checking process.
export class LinkChecker {
  private visited = new Set<string>();
  private options: Required<LinkCheckerOptions>;
  private brokenLinks: BrokenLink[] = [];
  private isRunning = false;
  private events: EventEmitter = new EventEmitter();
  private queue: { url: string; parentUrl?: string; isRecursive: boolean }[] =
    [];
  private activePromises = new Set<Promise<void>>();

  constructor(options: LinkCheckerOptions = {}) {
    this.options = {
      ...defaultConfig,
      ...options,
    };
  }

  on(event: LinkCheckerEvent, listener: (...args: any[]) => void) {
    this.events.on(event, listener);
  }

  async run(url: string): Promise<LinkCheckerResult> {
    if (this.isRunning) {
      throw new Error(
        "Link checker is already running. Call stop() first or create a new instance.",
      );
    }

    // Clear state before running the checker
    this.visited.clear();
    this.brokenLinks = [];
    this.queue = [];
    this.activePromises.clear();
    this.isRunning = true;

    this.events.emit("start", url);

    // Add the initial URL to the queue
    this.queue.push({ url, isRecursive: true });
    await this.processQueue();

    // Only emit complete if we weren't stopped
    if (this.isRunning) {
      this.events.emit("complete", {
        linksVisited: Array.from(this.visited),
        brokenLinks: this.brokenLinks,
      } as CompletionEvent);
    }

    this.isRunning = false;
    return {
      linksVisited: Array.from(this.visited),
      brokenLinks: this.brokenLinks,
    };
  }

  stop(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.queue = [];
      this.events.emit("stopped");
    }
  }

  private async processQueue(): Promise<void> {
    while (
      this.isRunning &&
      (this.queue.length > 0 || this.activePromises.size > 0)
    ) {
      while (
        this.isRunning &&
        this.queue.length > 0 &&
        this.activePromises.size < this.options.concurrency
      ) {
        let item = this.queue.shift();
        if (!item) {
          continue;
        }
        let { url, parentUrl, isRecursive } = item;

        if (this.visited.has(url) || this.shouldIgnore(url)) {
          continue;
        }

        this.visited.add(url);

        let promise = this.checkSingleUrl(url, parentUrl, isRecursive).finally(
          () => {
            // Remove this promise from the active set when done
            this.activePromises.delete(promise);
          },
        );

        this.activePromises.add(promise);
      }

      // If we've hit our concurrency limit or the queue is empty but we have active promises,
      // wait for at least one promise to complete before continuing
      if (this.activePromises.size > 0) {
        await Promise.race(Array.from(this.activePromises));
      }
    }
  }

  private async checkSingleUrl(
    url: string,
    parentUrl?: string,
    isRecursive: boolean = true,
  ): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.events.emit("link:start", { url, parentUrl });
      let response = await this.fetchWithRetry(url);
      let statusCode = response.status;

      if (statusCode >= 200 && statusCode < 300) {
        this.events.emit("link:success", { url, statusCode, parentUrl });

        if (isRecursive) {
          let contentType = response.headers.get("content-type") || "";
          // Only recurse into HTML content
          if (contentType.includes("text/html")) {
            let html = await response.text();
            let links = this.extractLinks(html, url);
            let baseOrigin = new URL(url).origin;

            // Add new links to the queue instead of processing them immediately
            for (let link of links) {
              if (!this.visited.has(link) && !this.shouldIgnore(link)) {
                let shouldRecurse = new URL(link).origin === baseOrigin;
                this.queue.push({
                  url: link,
                  parentUrl: url,
                  isRecursive: shouldRecurse,
                });
              }
            }
          }
        }
      } else if (response.redirected) {
        this.events.emit("link:redirect", {
          from: url,
          to: response.url,
          parentUrl,
        });
      } else {
        this.events.emit("link:error", { url, statusCode, parentUrl });
        this.brokenLinks.push({
          url,
          reason: `Status code: ${statusCode}`,
          parentUrl,
        });
      }
    } catch (error: any) {
      this.events.emit("link:error", {
        url,
        error: error.message,
        parentUrl,
      });

      this.brokenLinks.push({
        url,
        reason: `Error: ${error.message}`,
        parentUrl,
      });
    }

    this.events.emit("progress", {
      checked: this.visited.size,
      broken: this.brokenLinks.length,
    });
  }

  private async fetchWithRetry(
    url: string,
    parentUrl?: string,
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.options.retries; i++) {
      try {
        try {
          let domain = new URL(url).hostname;
          // Get domain-specific configuration if available
          let domainConfig = this.options.domainSpecificConfig[domain] || {};
          let headers = {
            ...this.options.headers,
            ...domainConfig.headers,
          };
          let response = await fetch(url, {
            headers: headers,
            signal: AbortSignal.timeout(this.options.timeout),
          });
          return response;
        } catch (error: any) {
          throw error;
        }
      } catch (error: any) {
        lastError = error;
        if (i < this.options.retries - 1) {
          this.events.emit("retry", {
            url,
            attempt: i + 1,
            error: error.message,
            parentUrl,
          });
          await new Promise((resolve) =>
            setTimeout(resolve, this.options.retryDelay),
          );
        }
      }
    }

    throw lastError || new Error("Failed after multiple retries");
  }

  private extractLinks(html: string, baseUrl: string): string[] {
    let $ = cheerio.load(html);
    return $("a")
      .map((_, a) => $(a).attr("href"))
      .get()
      .filter((href) => href && !href.startsWith("#"))
      .map((href) => {
        try {
          let resolvedUrl = new URL(href, baseUrl).href;
          return resolvedUrl.startsWith("http") ? resolvedUrl : null;
        } catch {
          return null;
        }
      })
      .filter((href): href is string => href !== null);
  }

  // Check if a URL should be ignored based on the ignoreLinks option.
  private shouldIgnore(url: string): boolean {
    return (
      this.options.ignoreLinks?.some((ignore) =>
        new RegExp(ignore).test(url),
      ) || false
    );
  }
}
