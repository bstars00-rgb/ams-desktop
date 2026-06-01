// Quick crypto round-trip test (run in a temp cwd; cleans up vault.enc).
import { saveVault, loadVault, emptyVault } from "./lib/vault.mjs";
import fs from "node:fs";

const pw = "master-pass-123";
const data = emptyVault();
data.clients.push({ name: "Trip.com", url: "https://connect.trip.com/login", id: "u@x.com", pw: "secret!" });
saveVault(pw, data);

const back = loadVault(pw);
console.log("decrypted clients:", back.clients.map((c) => c.name).join(", "));
console.log("password preserved:", back.clients[0].pw === "secret!");

let wrongRejected = false;
try { loadVault("wrong-pass"); } catch { wrongRejected = true; }
console.log("wrong password rejected:", wrongRejected);

const raw = fs.readFileSync("vault.enc", "utf8");
console.log("on disk has plaintext password?", raw.includes("secret!") ? "YES (BAD)" : "no (good)");

fs.unlinkSync("vault.enc");
console.log("cleanup done.");
