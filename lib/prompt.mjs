import readline from "node:readline";

export function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(query, (a) => { rl.close(); res(a.trim()); }));
}

// Prompt that masks typed characters with '*' (for passwords).
export function askSecret(query) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (s) => {
      if (s.includes(query)) rl.output.write(query);
      else if (s === "\r\n" || s === "\n") rl.output.write(s);
      else rl.output.write("*");
    };
    rl.question(query, (a) => { rl.close(); process.stdout.write("\n"); res(a); });
  });
}
