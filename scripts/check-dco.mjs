import { execFileSync } from "node:child_process";

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  process.stderr.write(
    "Usage: node scripts/check-dco.mjs <base-sha> <head-sha>\n",
  );
  process.exit(2);
}

const format = "%H%x1f%P%x1f%B%x1e";
const output = execFileSync(
  "git",
  ["log", "--no-merges", `--format=${format}`, `${base}..${head}`],
  {
    encoding: "utf8",
  },
);
const unsigned = output
  .split("\x1e")
  .filter(Boolean)
  .map((entry) => {
    const [sha = "", , body = ""] = entry.split("\x1f");
    return {
      sha: sha.trim(),
      signed: /^Signed-off-by:\s+.+\s+<[^>]+>\s*$/im.test(body),
    };
  })
  .filter((commit) => !commit.signed);

if (unsigned.length > 0) {
  process.stderr.write(
    `DCO sign-off missing from: ${unsigned.map((commit) => commit.sha).join(", ")}\n`,
  );
  process.exit(1);
}
process.stdout.write("All pull-request commits contain a DCO sign-off.\n");
