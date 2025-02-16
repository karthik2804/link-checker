#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { events } from "./index.js";
import { LinkChecker } from "./linkChecker.js";
import { loadConfig } from "./config.js";

interface CliArguments {
  baseUrl: string;
  configFile?: string;
}

function processCliArgs(): CliArguments {
  const argv = yargs(hideBin(process.argv))
    .option("baseUrl", {
      type: "string",
      description: "The base URL to check links from",
      demandOption: true,
    })
    .option("config-file", {
      alias: "C",
      type: "string",
      description: "Path to config file",
    })
    .help().argv as unknown as CliArguments;

  return {
    baseUrl: argv.baseUrl,
    configFile: argv.configFile,
  };
}

function setupEventHandlers(checker: LinkChecker) {
  checker.on("start", () => console.log("Checking links..."));
  checker.on("link:success", ({ url, statusCode }) => {
    console.log(`✅ ${url} (Status: ${statusCode})`);
  });

  checker.on("link:error", ({ url, statusCode, error }) => {
    const reason = statusCode ? `Status: ${statusCode}` : `Error: ${error}`;
    console.log(`❌ ${url} (${reason})`);
  });
  checker.on(
    "complete",
    ({ linksVisited, brokenLinks }: events.CompletionEvent) => {
      console.log(`\nCompleted checking ${linksVisited.length} links...`);
      if (brokenLinks.length > 0) {
        console.log(`${brokenLinks.length} Broken links found:`);
        brokenLinks.forEach((link) => {
          console.log(`- ${link.url} (${link.reason})`);
          if (link.parentUrl) {
            console.log(`  Found on page: ${link.parentUrl}`);
          }
        });
      } else {
        console.log("No broken links found.");
      }
    },
  );
}

async function main() {
  let cliArgs = processCliArgs();

  try {
    new URL(cliArgs.baseUrl);
  } catch (error: any) {
    throw new Error(`Invalid base URL: ${error.message}`);
  }

  let config = loadConfig(cliArgs.configFile);
  if (cliArgs.configFile) {
    console.log(`Using config file: ${cliArgs.configFile}`);
  }
  let checker = new LinkChecker(config);
  setupEventHandlers(checker);

  let { linksVisited, brokenLinks } = await checker.run(cliArgs.baseUrl);
  console.log(`\nCompleted checking ${linksVisited.length} links...`);
  if (brokenLinks.length > 0) {
    console.log(`${brokenLinks.length} Broken links found:`);
    brokenLinks.forEach((link) => {
      console.log(`- ${link.url} (${link.reason})`);
      if (link.parentUrl) {
        console.log(`  Found on page: ${link.parentUrl}`);
      }
    });
  } else {
    console.log("No broken links found.");
  }

  if (brokenLinks.length > 0) {
    process.exit(1);
  }
}

main().catch((error: any) => {
  console.error(error.message);
  process.exit(1);
});
