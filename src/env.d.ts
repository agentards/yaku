/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare const __BUILD__: string;
declare module 'virtual:files' { const files: Record<string, { t: string; b: boolean; d: string }>; export default files; }
