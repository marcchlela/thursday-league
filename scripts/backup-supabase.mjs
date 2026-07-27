import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  throw new Error(
    "Set SUPABASE_DB_URL to the Supabase session-pooler or direct connection string before running this command."
  );
}

let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch {
  throw new Error("SUPABASE_DB_URL is not a valid PostgreSQL connection URL.");
}
if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
  throw new Error("SUPABASE_DB_URL must use the postgres:// or postgresql:// protocol.");
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.resolve(root, "backups", "supabase");
const target = path.resolve(backupRoot, timestamp);
if (!target.startsWith(`${backupRoot}${path.sep}`)) {
  throw new Error("Refusing to write outside backups/supabase.");
}
mkdirSync(target, { recursive: true });

const supabaseCli = path.join(
  root,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js"
);

function runDump(file, extraArguments) {
  const output = path.join(target, file);
  const result = spawnSync(
    process.execPath,
    [
      supabaseCli,
      "db",
      "dump",
      "--db-url",
      databaseUrl,
      "-f",
      output,
      ...extraArguments
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" }
    }
  );
  if (result.status !== 0) {
    writeFileSync(
      path.join(target, "INCOMPLETE.txt"),
      `${result.stderr || result.stdout || "Supabase CLI backup failed."}\n`,
      "utf8"
    );
    throw new Error(
      `Backup failed while creating ${file}. The incomplete directory was kept for diagnosis.`
    );
  }
}

runDump("roles.sql", ["--role-only"]);
runDump("schema.sql", []);
runDump("data.sql", [
  "--use-copy",
  "--data-only",
  "-x",
  "storage.buckets_vectors",
  "-x",
  "storage.vector_indexes"
]);

function gitValue(...arguments_) {
  const result = spawnSync("git", arguments_, {
    cwd: root,
    encoding: "utf8"
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

const files = ["roles.sql", "schema.sql", "data.sql"].map(file => {
  const contents = readFileSync(path.join(target, file));
  return {
    file,
    bytes: statSync(path.join(target, file)).size,
    sha256: createHash("sha256").update(contents).digest("hex")
  };
});

const manifest = {
  format_version: 1,
  created_at: new Date().toISOString(),
  database_host: parsedUrl.hostname,
  git_commit: gitValue("rev-parse", "HEAD"),
  git_branch: gitValue("branch", "--show-current"),
  files,
  coverage: {
    database: "Supabase-filtered logical roles, public schema, and table data.",
    storage_objects:
      "Not included. Supabase database backups contain Storage metadata, not uploaded object bytes."
  },
  restore_policy:
    "Verify hashes and restore into a disposable local or new Supabase project before any production recovery."
};
writeFileSync(
  path.join(target, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(`Backup completed: ${path.relative(root, target)}`);
console.log("Copy this ignored directory to encrypted off-device storage.");
console.log(`Verify it with: npm run db:backup:verify -- "${target}"`);
