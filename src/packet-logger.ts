// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as fs from 'fs';
import * as path from 'path';

type Channel = 'mc-to-debugger' | 'debugger-to-mc' | 'vscode-to-debugger' | 'debugger-to-vscode';

export class PacketLogger {
    private readonly _streams: Record<Channel, fs.WriteStream>;
    // Wall-clock origin (ms since Unix epoch) paired with a high-resolution
    // hrtime origin so every log entry timestamp has nanosecond precision.
    private readonly _originMs: number;
    private readonly _originHr: bigint;

    constructor(logDirectory: string) {
        fs.mkdirSync(logDirectory, { recursive: true });

        // Sample both clocks as close together as possible so the offset is tight.
        this._originMs = Date.now();
        this._originHr = process.hrtime.bigint();

        const timestamp = new Date(this._originMs)
            .toISOString()
            .replace(/:/g, '-')
            .replace(/\..+/, '');

        const open = (channel: Channel): fs.WriteStream =>
            fs.createWriteStream(path.join(logDirectory, `${channel}-${timestamp}.log`), { flags: 'a' });

        this._streams = {
            'mc-to-debugger': open('mc-to-debugger'),
            'debugger-to-mc': open('debugger-to-mc'),
            'vscode-to-debugger': open('vscode-to-debugger'),
            'debugger-to-vscode': open('debugger-to-vscode'),
        };
    }

    logMcInbound(packet: unknown): void {
        this._write('mc-to-debugger', packet);
    }

    logMcOutbound(packet: unknown): void {
        this._write('debugger-to-mc', packet);
    }

    logVSCodeInbound(packet: unknown): void {
        this._write('vscode-to-debugger', packet);
    }

    logVSCodeOutbound(packet: unknown): void {
        this._write('debugger-to-vscode', packet);
    }

    dispose(): void {
        for (const stream of Object.values(this._streams)) {
            stream.end();
        }
    }

    private _write(channel: Channel, packet: unknown): void {
        // Compute wall-clock time by adding elapsed nanoseconds to the ms origin.
        // Number() is safe here: Number.MAX_SAFE_INTEGER ns ≈ 104 days of session time.
        const elapsedNs = Number(process.hrtime.bigint() - this._originHr);
        const elapsedMs = Math.floor(elapsedNs / 1_000_000);
        const remainderNs = elapsedNs % 1_000_000;
        const wallMs = this._originMs + elapsedMs;

        // Format: 2026-04-13T12:00:00.123456789Z (sub-millisecond digits appended after ms)
        const isoMs = new Date(wallMs).toISOString(); // e.g. "...123Z"
        const isoNs = isoMs.replace(/(\.\d{3})Z$/, `$1${String(remainderNs).padStart(6, '0')}Z`);

        const line = `[${isoNs}] ${JSON.stringify(packet)}\n`;
        this._streams[channel].write(line);
    }
}
