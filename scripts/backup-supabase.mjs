import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
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

class DumpError extends Error {
  constructor(file, diagnostics) {
    super(`Backup command failed while creating ${file}.`);
    this.name = "DumpError";
    this.diagnostics = diagnostics;
  }
}

function redactDiagnostics(value) {
  let result = String(value || "");
  result = result.split(databaseUrl).join("postgresql://[redacted]");
  let decodedPassword = "";
  try {
    decodedPassword = decodeURIComponent(parsedUrl.password || "");
  } catch {
    decodedPassword = "";
  }
  const passwordValues = new Set([parsedUrl.password, decodedPassword]);
  for (const password of passwordValues) {
    if (password) result = result.split(password).join("[redacted]");
  }
  result = result.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").trim();
  const maximumLength = 12_000;
  return result.length > maximumLength
    ? `[Earlier CLI output truncated]\n${result.slice(-maximumLength)}`
    : result;
}

function runDump(file, extraArguments) {
  const output = path.join(target, file);
  if (!existsSync(supabaseCli)) {
    throw new DumpError(
      file,
      `Supabase CLI was not found at ${supabaseCli}. Run npm ci before the backup.`
    );
  }

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
  if (result.status !== 0 || result.error) {
    rmSync(output, { force: true });
    const diagnostics = [
      `Dump: ${file}`,
      `Exit code: ${result.status ?? "process did not start"}`,
      result.error ? `Process error: ${result.error.message}` : "",
      result.stdout ? `stdout:\n${result.stdout}` : "",
      result.stderr ? `stderr:\n${result.stderr}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    throw new DumpError(
      file,
      redactDiagnostics(
        diagnostics || "The Supabase CLI returned no diagnostic output."
      )
    );
  }
}

const backupWarnings = [];
let rolesIncluded = true;
try {
  runDump("roles.sql", ["--role-only"]);
} catch (error) {
  if (!(error instanceof DumpError)) throw error;
  rolesIncluded = false;
  const warningSummary =
    "Managed database roles were not included. A new Supabase project already provides anon, authenticated, service_role, and other managed roles.";
  const warning = [
    warningSummary,
    error.diagnostics
  ].join("\n\n");
  backupWarnings.push(warningSummary);
  writeFileSync(path.join(target, "roles-not-included.txt"), `${warning}\n`, "utf8");
  console.warn(`::warning::${warning.replace(/\r?\n/g, " ")}`);
}

function runRequiredDump(file, extraArguments) {
  try {
    runDump(file, extraArguments);
  } catch (error) {
    if (!(error instanceof DumpError)) throw error;
    writeFileSync(
      path.join(target, "INCOMPLETE.txt"),
      `${error.diagnostics}\n`,
      "utf8"
    );
    console.error(error.diagnostics);
    throw new Error(
      `Backup failed while creating ${file}. Redacted diagnostics were printed and saved.`
    );
  }
}

runRequiredDump("schema.sql", []);
runRequiredDump("data.sql", [
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

const backupFiles = [
  ...(rolesIncluded ? ["roles.sql"] : ["roles-not-included.txt"]),
  "schema.sql",
  "data.sql"
];
const files = backupFiles.map(file => {
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
  warnings: backupWarnings,
  coverage: {
    database: rolesIncluded
      ? "Supabase-filtered logical roles, public schema, and table data."
      : "Public schema and table data. Managed roles were not included; see roles-not-included.txt.",
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
