// Copyright (C) Microsoft Corporation.  All rights reserved.

import { LogLevel } from '@vscode/debugadapter/lib/logger';
import { DebugProtocol } from '@vscode/debugprotocol';
import { StatMessageModel } from './stats/stats-provider';

// protocol version history
// 1 - initial version
// 2 - add targetModuleUuid to protocol event
// 3 - add array of plugins and target module ids to incoming protocol event
// 4 - mc can require a passcode to connect
// 5 - debugger can take mc script profiler captures
// 6 - breakpoints as request, MC can reject
// 7 - New serialization tech (use Cereal)

export enum ProtocolVersion {
    _Unknown = 0,
    Initial = 1,
    SupportTargetModuleUuid = 2,
    SupportTargetSelection = 3,
    SupportPasscode = 4,
    SupportProfilerCaptures = 5,
    SupportBreakpointsAsRequest = 6,
    SupportCerealSerialization = 7,
}

export const DEBUGGER_PROTOCOL_VERSION = ProtocolVersion.SupportCerealSerialization;

// -------------------------------------------------------------------------
// Interfaces for event message payloads (received from the debugee)
// -------------------------------------------------------------------------
export const IncomingEventType = {
    stopped: 'StoppedEvent',
    thread: 'ThreadEvent',
    print: 'PrintEvent',
    notification: 'NotificationEvent',
    protocol: 'ProtocolEvent',
    stat2: 'StatEvent2',
    schema: 'SchemaEvent',
    profilerCapture: 'ProfilerCapture',
} as const;

export interface PluginDetails {
    name: string;
    module_uuid: string;
}

export interface ProtocolCapabilities {
    type: typeof IncomingEventType.protocol;
    version: number;
    plugins: PluginDetails[];
    require_passcode?: boolean;
}

export interface ProfilerCapture {
    type: typeof IncomingEventType.profilerCapture;
    capture_base_path: string;
    capture_data: string;
}

export interface StoppedEventMessage {
    type: typeof IncomingEventType.stopped;
    reason: string;
    thread: number;
}

export interface ThreadEventMessage {
    type: typeof IncomingEventType.thread;
    reason: string;
    thread: number;
}

export interface PrintEventMessage {
    type: typeof IncomingEventType.print;
    message: string;
    logLevel: LogLevel;
}

export interface NotificationEventMessage {
    type: typeof IncomingEventType.notification;
    message: string;
    logLevel: LogLevel;
}

export type IncomingDebuggeeMessage =
    | PluginDetails
    | ProtocolCapabilities
    | ProfilerCapture
    | StoppedEventMessage
    | ThreadEventMessage
    | PrintEventMessage
    | NotificationEventMessage;



// -------------------------------------------------------------------------
// Interfaces for outbound message payloads (sent to the debugee)
// -------------------------------------------------------------------------
export const OutgoingEventType = {
    protocol: 'protocol',
    minecraftCommand: 'minecraftCommand',
    startProfiler: 'startProfiler',
    stopProfiler: 'stopProfiler',
    stopOnException: 'stopOnException',
    resume: 'resume',
    request: 'request',
    breakpoints: 'breakpoints',
} as const;

export interface ProtocolResponse {
    type: typeof OutgoingEventType.protocol;
    version: number;
    target_module_uuid?: string;
    passcode?: string;
}

export interface MinecraftCommandLegacyMessage {
    type: typeof OutgoingEventType.minecraftCommand;
    command: string;
    dimension_type: string;
}

export interface MinecraftCommandMessage {
    type: typeof OutgoingEventType.minecraftCommand;
    command: { command: string; dimension_type: string };
}

export interface StartProfilerMessage {
    type: typeof OutgoingEventType.startProfiler;
    profiler: { target_module_uuid?: string };
}

export interface StopProfilerMessage {
    type: typeof OutgoingEventType.stopProfiler;
    profiler: { captures_path: string; target_module_uuid?: string };
}

export interface StopOnExceptionMessage {
    type: typeof OutgoingEventType.stopOnException;
    stopOnException: boolean;
}

export interface ResumeMessage {
    type: typeof OutgoingEventType.resume;
}

export interface RequestMessage {
    type: typeof OutgoingEventType.request;
    request: { request_seq: number; command: string; args: unknown };
}

export interface BreakpointsMessage {
    type: typeof OutgoingEventType.breakpoints;
    breakpoints: { path: string; breakpoints: DebugProtocol.SourceBreakpoint[] | undefined };
}

export type OutgoingDebuggeeMessage =
    | ProtocolResponse
    | MinecraftCommandLegacyMessage
    | MinecraftCommandMessage
    | StartProfilerMessage
    | StopProfilerMessage
    | StopOnExceptionMessage
    | ResumeMessage
    | RequestMessage
    | BreakpointsMessage;



// Re-export for callers that need these alongside event types
export type { StatMessageModel };

// -------------------------------------------------------------------------
// Registry that maps event type name strings to handler callbacks
// -------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DebuggeeEventHandler = (event: any) => void;

export class DebuggeeEventRegistry {
    private readonly _handlers = new Map<string, DebuggeeEventHandler>();

    public register(eventType: string, handler: DebuggeeEventHandler): void {
        this._handlers.set(eventType, handler);
    }

    public dispatch(eventMessage: { type: string }): boolean {
        const handler = this._handlers.get(eventMessage.type);
        if (handler) {
            handler(eventMessage);
            return true;
        }
        return false;
    }
}
