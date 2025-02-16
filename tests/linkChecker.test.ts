import { LinkChecker } from "../src/linkChecker";
import { enableFetchMocks } from "jest-fetch-mock";

enableFetchMocks();

describe("LinkChecker", () => {
  let linkChecker: LinkChecker;

  beforeEach(() => {
    linkChecker = new LinkChecker({
      concurrency: 2, // Set concurrency for testing
      retries: 1, // Reduce retries for fast testing
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic Link Checking", () => {
    it("should detect broken links correctly", async () => {
      fetchMock.mockResponseOnce(
        '<html><a href="http://broken-link.com">Broken</a></html>',
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
      fetchMock.mockResponseOnce("", { status: 404 });

      let url = "http://example.com";
      let result = await linkChecker.run(url);

      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0].url).toBe("http://broken-link.com/");
      expect(result.brokenLinks[0].reason).toContain("Status code: 404");
    });

    it("should avoid checking the same URL multiple times", async () => {
      fetchMock.mockResponseOnce(
        `<html><a href="http://example.com">Link</a><a href="http://example.com">Link</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      let url = "http://example.com";
      await linkChecker.run(url);

      expect(linkChecker["visited"].size).toBe(1); // Should only visit the link once
    });

    it("should correctly resolve relative links", async () => {
      fetchMock.mockResponseOnce(
        `<html><a href="/relative">Relative Link</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      fetchMock.mockResponseOnce("", { status: 200 });

      let url = "http://example.com";
      await linkChecker.run(url);

      expect(linkChecker["visited"].has("http://example.com/relative")).toBe(
        true,
      );
    });

    it("should add only valid links to the queue", async () => {
      fetchMock.mockResponseOnce(
        '<html><a href="http://valid-link.com">Valid</a><a href="mailto://invalid-link">Invalid</a></html>',
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      let url = "http://example.com";
      await linkChecker.run(url);

      expect(linkChecker["visited"].has("http://valid-link.com/")).toBe(true);
      expect(linkChecker["visited"].has("mailto://invalid-link/")).toBe(false);
    });
  });

  describe("Nested and Cyclic Links", () => {
    it("should correctly traverse multiple nested pages", async () => {
      fetchMock.mockResponseOnce(
        `<html><a href="http://example.com/page1/">Page 1</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      fetchMock.mockResponseOnce(
        `<html><a href="http://example.com/page2/">Page 2</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      fetchMock.mockResponseOnce("", { status: 200 });

      let url = "http://example.com";
      let result = await linkChecker.run(url);

      expect(result.linksVisited.length).toBe(3);
      expect(linkChecker["visited"].has("http://example.com/page1")).toBe(true);
      expect(linkChecker["visited"].has("http://example.com/page2")).toBe(true);
    });

    it("should handle cyclic links without infinite loops", async () => {
      fetchMock.mockResponseOnce(
        `<html><a href="http://example.com/cycle">Cycle</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      fetchMock.mockResponseOnce(
        `<html><a href="http://example.com">Back</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      let url = "http://example.com/";
      let result = await linkChecker.run(url);

      expect(result.linksVisited.length).toBe(2);
      expect(linkChecker["visited"].size).toBe(2);
    });

    it("should detect broken links in deeply nested pages", async () => {
      fetchMock.mockResponseOnce(
        `<html><a href="http://example.com/level1">Level 1</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      fetchMock.mockResponseOnce(
        `<html><a href="http://example.com/level2">Level 2</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      fetchMock.mockResponseOnce(
        `<html><a href="http://broken-link.com">Broken Link</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      fetchMock.mockResponseOnce("", { status: 404 });

      let url = "http://example.com";
      let result = await linkChecker.run(url);

      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0].url).toBe("http://broken-link.com/");
    });
  });

  describe("Performance & Limits", () => {
    it("should respect concurrency limits", async () => {
      fetchMock.mockResponse(
        `<html>
          <a href="http://valid-link.com">Link</a>
          <a href="http://valid-link.com/1">Link</a>
          <a href="http://valid-link.com/2">Link</a>
          <a href="http://valid-link.com/3">Link</a>
          <a href="http://valid-link.com/4">Link</a>
        </html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      let url = "http://example.com";
      let runPromise = linkChecker.run(url);

      let concurrencyCheck = false;
      linkChecker.on("link:start", () => {
        concurrencyCheck =
          linkChecker["activePromises"].size <=
          linkChecker["options"].concurrency;
      });

      await runPromise;
      expect(concurrencyCheck).toBe(true);
    });

    it("should handle large pages with multiple links", async () => {
      let links = Array.from(
        { length: 100 },
        (_, i) => `<a href="http://example.com/page${i}">Page ${i}</a>`,
      ).join("");

      fetchMock.mockResponseOnce(`<html>${links}</html>`, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });

      for (let i = 0; i < 100; i++) {
        fetchMock.mockResponseOnce("", { status: 200 });
      }

      let url = "http://example.com";
      let result = await linkChecker.run(url);

      expect(result.linksVisited.length).toBe(101);
    });

    it("should handle HTTP 403 Forbidden responses correctly", async () => {
      fetchMock.mockResponseOnce("", { status: 403 });

      let url = "http://example.com";
      let result = await linkChecker.run(url);

      expect(result.brokenLinks.length).toBe(1);
      expect(result.brokenLinks[0].url).toBe("http://example.com/");
      expect(result.brokenLinks[0].reason).toContain("Status code: 403");
    });
  });

  describe("Error Handling", () => {
    it("should handle retries on network failure", async () => {
      let errorMessage = "Network error";
      fetchMock.mockRejectOnce(new Error(errorMessage));

      let url = "http://example.com";

      try {
        await linkChecker.run(url);
      } catch (error: any) {
        expect(error.message).toContain("Failed after multiple retries");
        expect(fetchMock).toHaveBeenCalledTimes(2);
      }
    });
  });

  describe("Customizing requests", () => {
    it("should handle URLs to ignore", async () => {
      let ignoreLinks = ["http://ignore.com"];
      fetchMock.mockResponseOnce(
        `<html><a href="http://ignore.com">Ignored</a><a href="http://valid.com">Valid</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      linkChecker = new LinkChecker({
        ignoreLinks,
        concurrency: 2,
      });

      let url = "http://example.com";
      await linkChecker.run(url);

      expect(linkChecker["visited"].has("http://ignore.com/")).toBe(false);
      expect(linkChecker["visited"].has("http://valid.com/")).toBe(true);
    });

    it("custom headers", async () => {
      linkChecker = new LinkChecker({
        headers: { "User-Agent": "CustomAgent/1.0" },
        concurrency: 2,
      });

      fetchMock.mockResponseOnce(
        `<html><a href="http://example.com/page">Page</a></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );

      let url = "http://example.com";
      await linkChecker.run(url);

      const requestHeaders = fetchMock.mock.calls[0][1]?.headers;
      let headers = new Headers(requestHeaders);
      expect(headers.get("User-Agent")).toBe("CustomAgent/1.0");
    });
  });
});
