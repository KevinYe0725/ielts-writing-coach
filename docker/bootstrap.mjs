import { chmod, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const directory = process.env.IWC_SECRET_DIRECTORY ?? "/run/iwc-secrets";
await mkdir(directory, { recursive: true, mode: 0o700 });

async function ensureSecret(fileName, createValue) {
  const path = `${directory}/${fileName}`;
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (existing) return { value: existing, created: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const handle = await open(path, "wx", 0o600).catch((error) => {
    if (error?.code === "EEXIST") return undefined;
    throw error;
  });
  if (handle) {
    const value = createValue();
    await handle.writeFile(`${value}\n`, "utf8");
    await handle.close();
    await chmod(path, 0o600);
    return { value, created: true };
  }
  return { value: (await readFile(path, "utf8")).trim(), created: false };
}

await ensureSecret("auth_secret", () => randomBytes(48).toString("base64url"));
await ensureSecret("encryption_key", () => randomBytes(32).toString("base64"));
const setup = await ensureSecret("setup_token", () =>
  randomBytes(24).toString("base64url"),
);

await writeFile(`${directory}/.ready`, `${new Date().toISOString()}\n`, {
  mode: 0o600,
});
if (setup.created) {
  process.stdout.write(
    `IELTS Writing Coach setup token (shown once): ${setup.value}\n`,
  );
} else {
  process.stdout.write(
    "IELTS Writing Coach secrets already exist; no secrets were changed.\n",
  );
}
