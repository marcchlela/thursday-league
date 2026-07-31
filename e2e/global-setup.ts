import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function runSupabase(args: string[], silent = false) {
  const windows = process.platform === "win32";
  const executable = path.resolve(process.cwd(), "node_modules", ".bin", windows ? "supabase.cmd" : "supabase");
  const command = windows ? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe" : executable;
  const commandArgs = windows ? ["/d", "/s", "/c", executable, ...args] : args;
  return execFileSync(command, commandArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SUPABASE_HOME: path.join(process.cwd(), "supabase", ".temp", "cli-home"),
      SUPABASE_TELEMETRY_DISABLED: "true"
    },
    stdio: silent ? "ignore" : "inherit"
  });
}

function localEnvValue(name: string) {
  if (process.env[name]) return process.env[name];
  const contents = readFileSync(path.resolve(process.cwd(), ".env.development.local"), "utf8");
  const line = contents.split(/\r?\n/).find(entry => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

async function waitForSeededAuth() {
  const supabaseUrl = localEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = localEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) throw new Error("Local Supabase environment variables are missing.");

  const deadline = Date.now() + 30_000;
  let lastError = "Auth did not respond.";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: "marcos@127.0.0.1",
          password: "LocalTest123!"
        })
      });
      if (response.ok) return;
      lastError = `${response.status} ${await response.text()}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Local Supabase Auth was not ready: ${lastError}`);
}

export default async function globalSetup() {
  if (process.env.E2E_SKIP_DB_RESET === "1") return;

  try {
    runSupabase(["status"], true);
  } catch {
    runSupabase(["start"]);
  }

  // Every run starts from the deterministic users, games, lineups, fantasy
  // squads, bets, and results in supabase/seed.sql.
  runSupabase(["db", "reset", "--local"]);
  await waitForSeededAuth();
}
