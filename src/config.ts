import fs from "fs";
import path from "path";
import { z } from "zod";
import { defaultConfig, LinkCheckerOptions } from "./linkChecker.js";

const linkCheckerOptionsSchema = z.object({
  ignoreLinks: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  concurrency: z.number().int().optional(),
  timeout: z.number().int().optional(),
  retries: z.number().int().optional(),
  retryDelay: z.number().int().optional(),
  rateLimit: z.number().int().optional(),
  domainSpecificConfig: z
    .record(
      z.object({
        headers: z.record(z.string()).optional(),
        rateLimit: z.number().int().optional(),
      }),
    )
    .optional(),
});

export function loadConfig(configPath?: string): LinkCheckerOptions {
  if (!configPath) {
    return defaultConfig;
  }

  let configFilePath = path.resolve(configPath);

  if (!fs.existsSync(configFilePath)) {
    throw new Error(`Config file not found at ${configFilePath}`);
  }

  try {
    const configFile = fs.readFileSync(configFilePath, "utf-8");
    const config: LinkCheckerOptions = JSON.parse(configFile);
    linkCheckerOptionsSchema.parse(config);
    return config;
  } catch (error: any) {
    throw new Error(`Error loading config file: ${error.message}`);
  }
}
