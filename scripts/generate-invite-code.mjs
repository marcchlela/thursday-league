import { randomBytes } from "node:crypto";

const code = randomBytes(12)
  .toString("base64url")
  .replace(/[-_]/g, character => character === "-" ? "K" : "M")
  .toUpperCase();

console.log(code.match(/.{1,4}/g).join("-"));
