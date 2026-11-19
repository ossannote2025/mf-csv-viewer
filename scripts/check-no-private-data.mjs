// 実データ（CSV・バックアップJSON）が誤ってコミットされていないかを確認する。
// sample/ 配下の架空データ、アプリで配るサンプル（public/sample/mf-sample-*.csv）、設定ファイルだけを許可する。
// public/sample/ の CSV は、ID がすべてサンプルの印（SAMPLE＋数字）で始まることも確かめる。
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOWED_JSON = /^(package(-lock)?\.json|tsconfig(\.[\w-]+)?\.json|\.vscode\/[^/]+\.json)$/;
const files = execSync('git ls-files -z', { encoding: 'utf-8' }).split('\0').filter(Boolean);
const bad = files.filter((f) => {
  if (f.startsWith('sample/')) return false;
  if (/^public\/sample\/mf-sample-[\w-]+\.csv$/.test(f)) return !allSampleIds(f);
  if (/\.csv$/i.test(f)) return true;
  if (/\.json$/i.test(f)) return !ALLOWED_JSON.test(f);
  return false;
});
/** CSV の ID 列（最後の列）がすべて「SAMPLE＋数字」か */
function allSampleIds(file) {
  const lines = readFileSync(file, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  return lines.length > 1 && lines.slice(1).every((l) => /,"SAMPLE\d+"$/.test(l));
}

if (bad.length > 0) {
  console.error('sample/ 以外の CSV / JSON がコミットされています（実データの可能性があります）:');
  for (const f of bad) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: 実データらしきファイルはありません（${files.length}ファイルを確認）`);
