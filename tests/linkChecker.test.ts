import { LinkChecker } from "../src/linkChecker";
import { enableFetchMocks } from "jest-fetch-mock";

enableFetchMocks();

describe("LinkChecker", () => {
  let linkChecker: LinkChecker;

  beforeEach(() => {
    linkChecker = new LinkChecker({
      concurrency: 2, // Set concurrency for testing
      retries: 1, // For fast testing, reduce retries
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

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

  it("should emit events correctly during the run", async () => {
    fetchMock.mockResponseOnce(
      '<html><a href="http://valid-link.com">Link</a></html>',
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
    fetchMock.mockResponseOnce("", { status: 200 });

    let url = "http://example.com";

    let runPromise = linkChecker.run(url);

    let linkCheckStart = new Promise<void>((resolve) => {
      linkChecker.on("link:start", (linkData) => {
        expect(linkData).toHaveProperty("url");
        resolve();
      });
    });

    let linkSuccess = new Promise<void>((resolve) => {
      linkChecker.on("link:success", (successData) => {
        expect(successData).toHaveProperty("url");
        expect(successData).toHaveProperty("statusCode");
        resolve();
      });
    });

    let complete = new Promise<void>((resolve) => {
      linkChecker.on("complete", (completeResult) => {
        expect(completeResult).toHaveProperty("linksVisited");
        expect(completeResult.linksVisited.length).toBe(2);
        expect(completeResult).toHaveProperty("brokenLinks");
        expect(completeResult.brokenLinks.length).toBe(0);
        resolve();
      });
    });

    await runPromise;
    // await events in the correct order
    await linkCheckStart;
    await linkSuccess;
    await complete;
  });

  it("should respect concurrency limits", async () => {
    // Use mockResponse for repeated calls
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

    // Check active promises *during* the run.
    let concurrencyCheck = false;
    linkChecker.on("link:start", () => {
      concurrencyCheck =
        linkChecker["activePromises"].size <=
        linkChecker["options"].concurrency;
    });

    await runPromise;
    expect(concurrencyCheck).toBe(true);
  });

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

  it("should add only valid links to the queue", async () => {
    fetchMock.mockResponseOnce(
      '<html><a href="http://valid-link.com">Valid</a><a href="mailto://invalid-link">Invalid</a></html>',
      { status: 200, headers: { "Content-Type": "text/html" } },
    );

    let url = "http://example.com";

    let runPromise = linkChecker.run(url);

    await runPromise;

    expect(linkChecker["visited"].has("http://valid-link.com/")).toBe(true);
    expect(linkChecker["visited"].has("mailto://invalid-link/")).toBe(false);
  });

  it("should handle URLs to ignore", async () => {
    let ignoreLinks = ["http://ignore.com"];
    fetchMock.mockResponseOnce(
      '<html><a href="http://ignore.com">Ignored Link</a><a href="http://valid.com">Valid</a></html>',
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
});
