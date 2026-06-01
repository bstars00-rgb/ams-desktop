// Manage the encrypted credential vault.
//   node src/vault.mjs add        add a client (name/url/id/password)
//   node src/vault.mjs list       list clients (no passwords shown)
//   node src/vault.mjs show       reveal one client's details (after unlock)
//   node src/vault.mjs remove     remove a client
import { vaultExists, loadVault, saveVault, emptyVault } from "../lib/vault.mjs";
import { ask, askSecret } from "../lib/prompt.mjs";

const cmd = process.argv[2] || "list";

async function unlock() {
  if (!vaultExists()) {
    console.log("No vault yet — creating a new one.");
    const p1 = await askSecret("Set a master password: ");
    const p2 = await askSecret("Confirm master password: ");
    if (p1 !== p2 || !p1) { console.error("❌ Passwords do not match."); process.exit(1); }
    saveVault(p1, emptyVault());
    return { pw: p1, data: emptyVault() };
  }
  const pw = await askSecret("Master password: ");
  try {
    return { pw, data: loadVault(pw) };
  } catch {
    console.error("❌ Wrong master password.");
    process.exit(1);
  }
}

const { pw, data } = await unlock();

if (cmd === "add") {
  const name = await ask("Client name (e.g. Trip.com): ");
  const url = await ask("Login URL: ");
  const id = await ask("Login ID / email: ");
  const password = await askSecret("Login password: ");
  if (data.clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    console.error("❌ A client with that name already exists."); process.exit(1);
  }
  data.clients.push({ name, url, id, pw: password });
  saveVault(pw, data);
  console.log(`✅ Added "${name}". Vault now has ${data.clients.length} client(s).`);
} else if (cmd === "remove") {
  const name = await ask("Client name to remove: ");
  const before = data.clients.length;
  data.clients = data.clients.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
  if (data.clients.length === before) { console.error("Not found."); process.exit(1); }
  saveVault(pw, data);
  console.log(`✅ Removed "${name}".`);
} else if (cmd === "show") {
  const name = await ask("Client name: ");
  const c = data.clients.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) { console.error("Not found."); process.exit(1); }
  console.log(`\n${c.name}\n  URL: ${c.url}\n  ID:  ${c.id}\n  PW:  ${c.pw}\n`);
} else {
  if (!data.clients.length) console.log("(vault is empty — add a client: npm run vault add)");
  else { console.log(`\nClients (${data.clients.length}):`); data.clients.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}  —  ${c.url}`)); }
}
