/** Regenerate docs/coverage/*.md from the bank and the content tree. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BANK_PATH, REPO_ROOT, parseBank, readContentTree, renderCoverage, validateContent } from "../index.ts";

const bank = parseBank(readFileSync(BANK_PATH));
const tree = readContentTree();
const result = validateContent(bank, tree);
const outDir = path.join(REPO_ROOT, "docs", "coverage");
mkdirSync(outDir, { recursive: true });
for (const [name, md] of renderCoverage(result, tree)) {
  writeFileSync(path.join(outDir, name), md);
}
console.log(`Wrote docs/coverage/ (${result.totals.taught}/${result.totals.questions} questions taught)`);
if (result.errors.length) console.log(`Note: ${result.errors.length} content error(s); run pnpm check:content`);
