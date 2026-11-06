import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

loadRootEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run Drizzle Kit");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});

function moduleDirectory(): string {
  const moduleUrl = import.meta.url;
  if (typeof moduleUrl === "string" && moduleUrl.startsWith("file:")) {
    return fileURLToPath(new URL(".", moduleUrl));
  }

  return process.cwd();
}

function loadRootEnv(): void {
  if (process.env.DATABASE_URL) {
    return;
  }

  const envPath = resolve(moduleDirectory(), "../../.env");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
