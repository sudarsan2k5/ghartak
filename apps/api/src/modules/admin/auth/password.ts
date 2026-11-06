import { hash, verify } from "@node-rs/argon2";

const memoryCost = 19_456;
const timeCost = 2;
const parallelism = 1;

let dummyHash: Promise<string> | undefined;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { memoryCost, timeCost, parallelism });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

export async function dummyPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-admin-password");
  await verify(await dummyHash, password);
}
