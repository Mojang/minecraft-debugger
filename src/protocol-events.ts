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
// 7 - support for debugger requests, MC can reject or respond with args
// 8 - New serialization tech (use Cereal)

export enum ProtocolVersion {
    _Unknown = 0,
    Initial = 1,
    SupportTargetModuleUuid = 2,
    SupportTargetSelection = 3,
    SupportPasscode = 4,
    SupportProfilerCaptures = 5,
    SupportBreakpointsAsRequest = 6,
    SupportDebuggerRequests = 7,
    SupportCerealSerialization = 8,
}

export const DEBUGGER_PROTOCOL_VERSION = ProtocolVersion.SupportCerealSerialization;

// -------------------------------------------------------------------------
// Interfaces for event message payloads (received from the debugee)
// -------------------------------------------------------------------------
export enum IncomingEventType {
    Stopped = 'StoppedEvent',
    Thread = 'ThreadEvent',
    Print = 'PrintEvent',
    Notification = 'NotificationEvent',
    Protocol = 'ProtocolEvent',
    Stat2 = 'StatEvent2',
    Schema = 'SchemaEvent',
    ProfilerCapture = 'ProfilerCapture',
    DebuggeeResponse = 'debuggee-response',
}

export interface PluginDetails {
    name: string;
    module_uuid: string;
}

export interface ProtocolCapabilities {
    type: IncomingEventType.Protocol;
    version: number;
    plugins: PluginDetails[];
    require_passcode?: boolean;
}

export interface ProfilerCapture {
    type: IncomingEventType.ProfilerCapture;
    capture_base_path: string;
    capture_data: string;
}

export interface StoppedEventMessage {
    type: IncomingEventType.Stopped;
    reason: string;
    thread: number;
}

export interface ThreadEventMessage {
    type: IncomingEventType.Thread;
    reason: string;
    thread: number;
}

export interface PrintEventMessage {
    type: IncomingEventType.Print;
    message: string;
    logLevel: LogLevel;
}

export interface NotificationEventMessage {
    type: IncomingEventType.Notification;
    message: string;
    logLevel: LogLevel;
}

export interface DebuggeeResponseEnvelope {
    type: IncomingEventType.DebuggeeResponse;
    request_seq: number;
    args?: unknown;
    success?: boolean;
    response_message?: string;
}

export type StatEventMessage = StatMessageModel & {
    type: IncomingEventType.Stat2;
};

export type IncomingDebuggeeMessage =
    | ProtocolCapabilities
    | ProfilerCapture
    | StoppedEventMessage
    | ThreadEventMessage
    | PrintEventMessage
    | NotificationEventMessage
    | StatEventMessage
    | DebuggeeResponseEnvelope;


// -------------------------------------------------------------------------
// Interfaces for outbound message payloads (sent to the debugee)
// -------------------------------------------------------------------------
export enum OutgoingEventType {
    Protocol = 'protocol',
    MinecraftCommand = 'minecraftCommand',
    StartProfiler = 'startProfiler',
    StopProfiler = 'stopProfiler',
    StopOnException = 'stopOnException',
    Resume = 'resume',
    Request = 'request',
    Breakpoints = 'breakpoints',
    DebuggerRequest = 'debugger-request'
}

export interface ProtocolResponse {
    type: OutgoingEventType.Protocol;
    version: number;
    target_module_uuid?: string;
    passcode?: string;
}

export interface MinecraftCommandLegacyMessage {
    type: OutgoingEventType.MinecraftCommand;
    command: string;
    dimension_type: string;
}

export interface MinecraftCommandMessage {
    type: OutgoingEventType.MinecraftCommand;
    command: string; 
    dimension_type: string;
}

export interface StartProfilerMessage {
    type: OutgoingEventType.StartProfiler;
    target_module_uuid?: string;
}

export interface StopProfilerMessage {
    type: OutgoingEventType.StopProfiler;
    captures_path: string; 
    target_module_uuid?: string;
}

export interface StopOnExceptionMessage {
    type: OutgoingEventType.StopOnException;
    stopOnException: boolean;
}

export interface ResumeMessage {
    type: OutgoingEventType.Resume;
}

export interface RequestMessage {
    type: OutgoingEventType.Request;
    request_seq: number;
    command: string;
    args: unknown;
}

export interface BreakpointsMessage {
    type: OutgoingEventType.Breakpoints;
    path: string; 
    breakpoints: DebugProtocol.SourceBreakpoint[] | undefined;
}

export interface DebuggerRequestEnvelope {
    type: OutgoingEventType.DebuggerRequest;
    request_seq: number;
    request: string;
    args?: unknown;
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
    | BreakpointsMessage
    | DebuggerRequestEnvelope;



// -------------------------------------------------------------------------
// Registry that maps event type name strings to handler callbacks
// -------------------------------------------------------------------------

type DebuggeeEventHandler<T extends IncomingEventType> = (
    event: Extract<IncomingDebuggeeMessage, { type: T }>,
) => void;

export class DebuggeeEventRegistry {
    private readonly _handlers = new Map<IncomingEventType, (event: IncomingDebuggeeMessage) => void>();

    public register<T extends IncomingEventType>(eventType: T, handler: DebuggeeEventHandler<T>): void {
        this._handlers.set(eventType, event => {
            handler(event as Extract<IncomingDebuggeeMessage, { type: T }>);
        });
    }

    public dispatch(eventMessage: IncomingDebuggeeMessage): boolean {
        const handler = this._handlers.get(eventMessage.type);
        if (handler) {
            handler(eventMessage);
            return true;
        }
        return false;
    }
}
