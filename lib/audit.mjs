// Local append-only audit log (one JSON object per line). Never leaves this PC.
import fs from "node:fs";

const FILE = "audit.log";

export function audit(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  fs.appendFileSync(FILE, line);
}
