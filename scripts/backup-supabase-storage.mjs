import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const buckets = (
  process.env.SUPABASE_STORAGE_BACKUP_BUCKETS || "profile-avatars"
)
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY before backing up Storage."
  );
}
if (!buckets.length) throw new Error("At least one Storage bucket is required.");
for (const bucket of buckets) {
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/i.test(bucket)) {
    throw new Error(`Unsafe Storage bucket name: ${bucket}`);
  }
}

const parsedUrl = new URL(supabaseUrl);
if (
  parsedUrl.protocol !== "https:" &&
  parsedUrl.hostname !== "127.0.0.1" &&
  parsedUrl.hostname !== "localhost"
) {
  throw new Error("Hosted Supabase Storage backups require HTTPS.");
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.resolve(root, "backups", "storage");
const target = path.resolve(backupRoot, timestamp);
if (!target.startsWith(`${backupRoot}${path.sep}`)) {
  throw new Error("Refusing to write outside backups/storage.");
}
mkdirSync(target, { recursive: true });

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const manifestFiles = [];

function safeObjectPath(bucket, objectPath) {
  if (
    !objectPath ||
    objectPath.includes("\\") ||
    objectPath.includes("\0") ||
    objectPath
      .split("/")
      .some(segment => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(
      `Unsafe object path returned by Storage: ${objectPath || "(empty)"}`
    );
  }
  const relativePath = path.posix.join(bucket, objectPath);
  const output = path.resolve(target, ...relativePath.split("/"));
  if (!output.startsWith(`${target}${path.sep}`)) {
    throw new Error(
      "Refusing to write a Storage object outside the backup directory."
    );
  }
  return { output, relativePath };
}

async function listFolder(bucket, prefix = "", visited = new Set()) {
  if (visited.has(prefix)) {
    throw new Error(`Storage folder cycle detected at ${prefix}.`);
  }
  visited.add(prefix);

  const entries = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (error) {
      throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
    }
    entries.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  for (const entry of entries) {
    const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const isFolder = !entry.id && entry.metadata == null;
    if (isFolder) {
      await listFolder(bucket, objectPath, visited);
      continue;
    }

    const { output, relativePath } = safeObjectPath(bucket, objectPath);
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(objectPath);
    if (error || !data) {
      throw new Error(
        `Could not download ${bucket}/${objectPath}: ${
          error?.message || "empty response"
        }`
      );
    }
    const contents = Buffer.from(await data.arrayBuffer());
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, contents);
    manifestFiles.push({
      file: relativePath,
      bytes: contents.length,
      sha256: createHash("sha256").update(contents).digest("hex")
    });
  }
}

try {
  for (const bucket of buckets) await listFolder(bucket);

  const manifest = {
    format_version: 1,
    backup_type: "supabase_storage",
    created_at: new Date().toISOString(),
    supabase_host: parsedUrl.hostname,
    buckets,
    files: manifestFiles.sort((left, right) =>
      left.file.localeCompare(right.file)
    ),
    coverage: {
      storage_objects:
        "Downloaded object bytes from the configured Supabase Storage buckets.",
      database: "Not included. Use npm run db:backup separately."
    }
  };
  writeFileSync(
    path.join(target, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
} catch (error) {
  writeFileSync(
    path.join(target, "INCOMPLETE.txt"),
    `${error instanceof Error ? error.message : String(error)}\n`,
    "utf8"
  );
  throw error;
}

console.log(
  `Storage backup completed: ${path.relative(root, target)} (${manifestFiles.length} objects).`
);
console.log(`Verify it with: npm run storage:backup:verify -- "${target}"`);
