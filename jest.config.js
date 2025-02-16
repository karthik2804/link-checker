/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true, // Enable ESM support for TypeScript files
        tsconfig: "tsconfig.json", // Optionally specify a custom tsconfig if needed
      },
    ],
  },
  testMatch: ["**/tests/**/*.test.ts"], // Match test files
  extensionsToTreatAsEsm: [".ts", ".tsx"], // Ensure .ts and .tsx are treated as ESM
};
