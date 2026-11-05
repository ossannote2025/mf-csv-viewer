// 実データ（CSV・バックアップJSON）が誤ってコミットされていないかを確認する。
// sample/ 配下の架空データと、設定ファイルだけを許可する。
import { execSync } from 'node:child_process';

const ALLOWED_JSON = /^(package(-lock)?\.json|tsconfig(\.[\w-]+)?\.json|\.vscode\/[^/]+\.json)$/;
const files = execSync('git ls-files -z', { encoding: 'utf-8' }).split('\0').filter(Boolean);
const bad = files.filter((f) => {
  if (f.startsWith('sample/')) return false;
  if (/\.csv$/i.test(f)) return true;
  if (/\.json$/i.test(f)) return !ALLOWED_JSON.test(f);
  return false;
});
if (bad.length > 0) {
  console.error('sample/ 以外の CSV / JSON がコミットされています（実データの可能性があります）:');
  for (const f of bad) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: 実データらしきファイルはありません（${files.length}ファイルを確認）`);
