import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const suppliedPath = process.argv[2];
if (!suppliedPath) {
  throw new Error(
    'Provide a backup directory: npm run db:backup:verify -- "backups/supabase/TIMESTAMP"'
  );
}

const target = path.resolve(process.cwd(), suppliedPath);
const manifestPath = path.join(target, "manifest.json");
if (!existsSync(manifestPath)) throw new Error("manifest.json was not found.");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.format_version !== 1 || !Array.isArray(manifest.files)) {
  throw new Error("Unsupported or invalid backup manifest.");
}

for (const expected of manifest.files) {
  if (
    typeof expected.file !== "string" ||
    expected.file !== path.basename(expected.file)
  ) {
    throw new Error("The backup manifest contains an unsafe file path.");
  }
  const filePath = path.join(target, expected.file);
  if (!existsSync(filePath)) throw new Error(`${expected.file} is missing.`);
  const contents = readFileSync(filePath);
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (actualHash !== expected.sha256) {
    throw new Error(`${expected.file} failed SHA-256 verification.`);
  }
  if (statSync(filePath).size !== expected.bytes) {
    throw new Error(`${expected.file} has an unexpected size.`);
  }
}

console.log(
  `Backup verified: ${manifest.files.length} files match their recorded SHA-256 hashes.`
);
