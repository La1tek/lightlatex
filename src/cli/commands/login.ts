import readline from "readline";
import { LightLatexClient } from "../client";
import { saveAuth, AuthConfig } from "../config";

export async function login(url: string): Promise<void> {
  const serverUrl = url.replace(/\/+$/, "");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  const email = await ask(rl, "Email: ");
  const password = await ask(rl, "Password: ", true);

  rl.close();

  try {
    const res = await fetch(`${serverUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data: any = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    const auth: AuthConfig = {
      server_url: serverUrl,
      token: data.accessToken,
    };

    saveAuth(auth);
    console.log(`Logged in to ${serverUrl} as ${email}`);
    console.log(`Auth saved to ~/.lightlatex/auth.json`);
  } catch (err: any) {
    console.error(`Login failed: ${err.message}`);
    process.exit(1);
  }
}

function ask(rl: readline.Interface, prompt: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    if (hidden) {
      // For password, we use a simple approach (no echo on most terminals)
      process.stdout.write(prompt);
      const chars: string[] = [];
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on("data", function handler(data: Buffer) {
        const char = data.toString();
        if (char === "\n" || char === "\r" || char === "\u0004") {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener("data", handler);
          process.stdin.pause();
          console.log();
          resolve(chars.join(""));
        } else if (char === "\u0003") {
          // Ctrl+C
          process.exit(1);
        } else if (char === "\u007f") {
          // Backspace
          chars.pop();
        } else {
          chars.push(char);
        }
      });
    } else {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    }
  });
}
