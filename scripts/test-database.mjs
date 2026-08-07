import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const testsDirectory = path.join(root, "supabase", "tests");
const databaseUrl =
  process.env.SUPABASE_LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const parsedUrl = new URL(databaseUrl);

if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
  throw new Error(
    "Database tests are local-only. SUPABASE_LOCAL_DB_URL must use localhost or 127.0.0.1."
  );
}

const testFiles = readdirSync(testsDirectory)
  .filter(file => file.endsWith(".test.sql"))
  .sort();

if (!testFiles.length) throw new Error("No database test files were found.");

for (const [index, file] of testFiles.entries()) {
  process.stdout.write(`[${index + 1}/${testFiles.length}] ${file} ... `);
  const result = spawnSync(
    "psql",
    [
      "--dbname",
      databaseUrl,
      "--set",
      "ON_ERROR_STOP=1",
      "--no-psqlrc",
      "--file",
      path.join(testsDirectory, file)
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env
    }
  );
  if (result.status !== 0) {
    process.stdout.write("FAILED\n");
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    process.exit(result.status || 1);
  }
  process.stdout.write("passed\n");
}

console.log(`${testFiles.length} database protection scripts passed.`);
