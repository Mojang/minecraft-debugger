// vitest.d.ts - workaround for needed DOM types in vitest
declare interface Worker {}
declare interface WebSocket {}

declare namespace WebAssembly {
    interface Module {}
}
