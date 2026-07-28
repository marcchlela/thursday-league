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

const seenFiles = new Set();
for (const expected of manifest.files) {
  if (
    typeof expected.file !== "string" ||
    !expected.file ||
    path.isAbsolute(expected.file) ||
    expected.file.includes("\0") ||
    expected.file.split(/[\\/]/).some(segment => segment === "..") ||
    !Number.isSafeInteger(expected.bytes) ||
    expected.bytes < 0 ||
    typeof expected.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(expected.sha256)
  ) {
    throw new Error("The backup manifest contains an invalid file record.");
  }
  if (seenFiles.has(expected.file)) {
    throw new Error(
      `The backup manifest contains duplicate file ${expected.file}.`
    );
  }
  seenFiles.add(expected.file);

  const filePath = path.resolve(target, expected.file);
  if (!filePath.startsWith(`${target}${path.sep}`)) {
    throw new Error("The backup manifest contains an unsafe file path.");
  }
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
