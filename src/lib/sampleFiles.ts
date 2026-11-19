// scripts/generate-demo.ts が生成する。手で書き換えない（npm run generate:demo）
export const SAMPLE_FILES: readonly string[] = ["mf-sample-2023.csv","mf-sample-2024.csv","mf-sample-2025.csv","mf-sample-2026.csv"];
export const SAMPLE_PERIOD = { from: '2023-01', to: '2026-10' } as const;
