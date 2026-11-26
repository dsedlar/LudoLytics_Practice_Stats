// Copies the pose-model runtime (WebAssembly) out of node_modules into
// public/shotcam/wasm so the app serves it itself instead of relying on a CDN.
// Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "public", "shotcam", "wasm");
mkdirSync(dest, { recursive: true });
cpSync(join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"), dest, { recursive: true });
console.log("Shot Cam: pose runtime copied to public/shotcam/wasm");
