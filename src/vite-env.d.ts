/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
declare const __APP_VERSION__: string;

declare module 'virtual:third-party-licenses' {
  export const appLicense: string;
  export const libraries: { name: string; version: string; license: string; text: string }[];
}
