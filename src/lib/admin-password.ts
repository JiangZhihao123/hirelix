import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashAdminPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export function validAdminHash(hash: string) {
  return /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash);
}

export async function verifyAdminPassword(password: string, hash: string) {
  if (!validAdminHash(hash)) return false;
  const [, salt, expected] = hash.split(":");
  return timingSafeEqual(await derive(password, salt), Buffer.from(expected, "hex"));
}
