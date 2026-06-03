// Encrypted local credential vault. Stores client mapping-system logins
// (name / url / id / password) in vault.enc, encrypted with a master password.
// AES-256-GCM + scrypt. The file is git-ignored and never leaves this machine.
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import fs from "node:fs";

const FILE = "vault.enc";

export function vaultExists() {
  return fs.existsSync(FILE);
}

function keyFrom(masterPw, salt) {
  return scryptSync(masterPw, salt, 32);
}

export function saveVault(masterPw, data) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = keyFrom(masterPw, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = {
    v: 1,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: enc.toString("hex"),
  };
  fs.writeFileSync(FILE, JSON.stringify(out), { mode: 0o600 });
}

// Throws if the master password is wrong (GCM auth tag mismatch).
export function loadVault(masterPw) {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const key = keyFrom(masterPw, Buffer.from(raw.salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(raw.iv, "hex"));
  decipher.setAuthTag(Buffer.from(raw.tag, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(raw.data, "hex")), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}

export function emptyVault() {
  return { clients: [] };
}

// Forgot-password reset: delete the vault so a fresh master password can be set.
// Stored client logins are lost (must be re-entered).
export function deleteVault() {
  try { fs.unlinkSync(FILE); return true; } catch { return false; }
}
