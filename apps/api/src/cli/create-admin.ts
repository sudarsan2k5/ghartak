import { loadEnv } from "@ghartak/config";
import { adminLoginRequestSchema } from "@ghartak/contracts";
import { closeDatabase, openDatabase } from "@ghartak/database";
import { z } from "zod";
import { createAdministrator } from "../modules/admin/auth/accounts.js";
import { HttpError } from "../http/errors.js";

const administratorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  password: adminLoginRequestSchema.shape.password,
});

async function main(): Promise<void> {
  const env = loadEnv();
  const password = await readPassword();
  const parsed = administratorSchema.safeParse({
    name: process.env["ADMIN_NAME"],
    email: process.env["ADMIN_EMAIL"],
    phone: process.env["ADMIN_PHONE"],
    password,
  });
  if (!parsed.success) {
    process.stderr.write(`${formatIssues(parsed.error.issues)}\n`);
    process.exitCode = 1;
    return;
  }
  const db = openDatabase(env.DATABASE_URL);
  try {
    const admin = await createAdministrator(db, parsed.data);
    process.stdout.write(`Created administrator ${admin.email}\n`);
  } catch (error) {
    if (error instanceof HttpError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await closeDatabase();
  }
}

function formatIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .map((issue) => {
      const path = issue.path.map((part) => String(part)).join(".") || "input";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env["ADMIN_PASSWORD"];
  if (fromEnv) {
    return fromEnv;
  }
  if (!process.stdin.isTTY) {
    throw new Error("Set ADMIN_PASSWORD in the environment when stdin is not a terminal");
  }
  process.stderr.write("Password: ");
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\n" || character === "\r") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u0003") {
          process.stdin.setRawMode(false);
          reject(new Error("Administrator creation was cancelled"));
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    process.stdin.on("data", onData);
    process.stdin.once("error", reject);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Administrator could not be created";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
