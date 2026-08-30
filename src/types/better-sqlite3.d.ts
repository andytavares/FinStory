/**
 * The ciphers fork ships types at index.d.ts but does not expose them through
 * package.json "exports", so TypeScript cannot resolve them under the npm alias
 * (ADR 0001). Point the module name at the shipped declarations rather than
 * hand-writing a shim that would drift from the real API.
 */
declare module 'better-sqlite3' {
  export * from 'better-sqlite3-multiple-ciphers/index';
  export { default } from 'better-sqlite3-multiple-ciphers/index';
}
