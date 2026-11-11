/**
 * カテゴリ（大項目）の色。金額の順位ではなくカテゴリ名に固定で紐づける。
 * 「内訳」「カテゴリ」タブなど、グラフはすべてこのマップを使う。
 * ダークモードでは同じ色相のまま白を18%混ぜて少し明るくする。
 */
export const CATEGORY_COLORS: Readonly<Record<string, string>> = {
  食費: '#3E6A9E',
  住宅: '#B9785A',
  '教養・教育': '#3F8C83',
  特別な支出: '#C2A05A',
  '現金・カード': '#7A6A9C',
  '趣味・娯楽': '#6E8F5E',
  '衣服・美容': '#A8697A',
  日用品: '#5A8FAE',
  保険: '#8C7A5C',
  通信費: '#5E7D8C',
  '健康・医療': '#7FA88E',
  交通費: '#8E8AB0',
  自動車: '#A89474',
  '水道・光熱費': '#DE8A2A',
  '税・社会保障': '#544C7A',
  交際費: '#B35C9B',
  // 「その他」と同じ灰色系だが、並んでも区別できるよう濃くする
  未分類: '#6E6D68',
  その他: '#A3A29C',
};

/** 定義にないカテゴリの色（「その他」と同じ） */
export const DEFAULT_CATEGORY_COLOR = '#A3A29C';

type RGB = [number, number, number];

function toRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

function toHex(c: RGB): string {
  return `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** 白（ratio>0）または黒（ratio<0）を |ratio| の割合で混ぜる */
export function mix(hex: string, ratio: number): string {
  const c = toRgb(hex);
  const target = ratio >= 0 ? 255 : 0;
  const r = Math.abs(ratio);
  return toHex(c.map((v) => v + (target - v) * r) as RGB);
}

/** 大項目の色。dark=true でダークモード用（白を18%混ぜる） */
export function categoryColor(name: string, dark = false): string {
  const base = CATEGORY_COLORS[name] ?? DEFAULT_CATEGORY_COLOR;
  return dark ? mix(base, 0.18) : base;
}

/**
 * 中項目の色：親の大項目の色を明るさ違いで使う。
 * index は中項目ごとに固定した番号（全期間の金額順など）。8段階を繰り返す。
 */
const SHADE_STEPS = [0, 0.35, -0.25, 0.55, -0.4, 0.2, -0.12, 0.45];

export function shadeColor(parentColor: string, index: number): string {
  const step = SHADE_STEPS[((index % SHADE_STEPS.length) + SHADE_STEPS.length) % SHADE_STEPS.length];
  return step === 0 ? parentColor : mix(parentColor, step);
}

/** 名前を、全期間の金額の多い順に並べたときの番号にする（中項目の明るさを固定するため） */
export function rankIndex(totals: { name: string; amount: number }[]): Map<string, number> {
  const sorted = [...totals].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ja'));
  return new Map(sorted.map((c, i) => [c.name, i]));
}
