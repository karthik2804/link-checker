# Broken Link Checker

`@karthikganeshram/link-checker` is a Node.js module and CLI tool for detecting broken links on a website. It scans web pages recursively, following links and reporting any broken URLs.

## Features

- Detects broken links on a website
- Recursively checks all pages within the same domain
- Supports custom request headers and domain-specific configurations
- Handles redirects and retries failed requests
- Configurable concurrency and timeouts
- Emits events for progress tracking

## Installation

You can install `@karthikganeshram/link-checker` as a project dependency:

```sh
npm install @karthikganeshram/link-checker
```

## Usage

### CLI

```sh
npx link-checker --help
Options:
      --version  Show version number                                   [boolean]
      --baseUrl  The base URL to check links from            [string] [required]
  -C, --config-file   Path to the config file                           [string]
      --help     Show help                                             [boolean]

```

The config file is expected to be a JSON file that follows the following interface

```ts
interface LinkCheckerOptions {
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

interface DomainSpecifcConfig {
  // Custom headers to send with each request to this domain. (Default = {})
  headers?: Record<string, string>;
}
```

### API Usage

#### Importing the module

```typescript
import { LinkChecker } from "@karthikganeshram/link-checker";

const checker = new LinkChecker({
  ignoreLinks: ["example.com/ignore"],
  concurrency: 10,
  timeout: 5000,
});

checker.on("link:success", ({ url }) => {
  console.log(`Valid link: ${url}`);
});

checker.on("link:error", ({ url, reason }) => {
  console.log(`Broken link: ${url} - ${reason}`);
});

checker.run("https://example.com").then((result) => {
  console.log(
    `Checked ${result.linksChecked.length} links, found ${result.brokenLinks.length} broken links.`,
  );
});
```

#### Events

The link checker uses an event-driven system to provide real-time feedback on the scanning process. Users can listen for events and execute custom logic accordingly.

| Event           | Description                                  |
| --------------- | -------------------------------------------- |
| `start`         | Emitted when the scan starts                 |
| `complete`      | Emitted when the scan completes              |
| `stopped`       | Emitted when the scan is stopped manually    |
| `link:start`    | Emitted when a link is being checked         |
| `link:success`  | Emitted when a link is valid                 |
| `link:redirect` | Emitted when a link redirects                |
| `link:error`    | Emitted when a link is broken                |
| `progress`      | Emitted after each check with current status |

##### Event Data

| Event           | Data Fields                             |
| --------------- | --------------------------------------- |
| `link:success`  | `{ url, statusCode, parentUrl }`        |
| `link:error`    | `{ url, statusCode, error, parentUrl }` |
| `link:start`    | `{ url, parentUrl }`                    |
| `link:redirect` | `{ from, to, parentUrl }`               |
| `progress`      | `{ checked, broken }`                   |
| `retry`         | `{ url, attempt, error, parentUrl }`    |
| `complete`      | `{ linksVisited, brokenLinks }`         |
