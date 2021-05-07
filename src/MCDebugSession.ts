
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { createConnection, Server, Socket } from 'net';
import { DebugSession, InitializedEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread, ThreadEvent, Variable } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { LogOutputEvent, LogLevel } from 'vscode-debugadapter/lib/logger';
import { MCMessageStreamParser } from './MCMessageStreamParser';
import * as path from 'path';

interface PendingResponse {
	resolve: Function;
	reject: Function;
}

// Interface for specific launch arguments.
// See package.json for schema.
interface IAttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	mode: string;
	localRoot: string;
	host: string;
	port: number;
	inputPort: string;
}

// The Debug Adapter for 'minecraft-js'
//
export class MCDebugSession extends DebugSession {
	private static DEBUGGER_PROTOCOL_VERSION = 1;

	private _debugeeServer?: Server;		// when listening for incoming connections
	private _connectionSocket?: Socket;
	private _terminated: boolean = false;
	private _threads = new Set<number>();
	private _requests = new Map<number, PendingResponse>();
	private _localRoot: string = "";
	private _activeThreadId: number = 0;	// the one being debugged

	public constructor() {
		super();

		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);
	}

	// ------------------------------------------------------------------------
	// VSCode to Debug Adapter requests
	// ------------------------------------------------------------------------

	// VSCode extension has been activated due to the 'onDebug' activation request defined in packages.json
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
		response.body = response.body || {};

		// set capabilities
		response.body.supportsConfigurationDoneRequest = true; // so VSCode calls 'configurationDoneRequest'

		// send config response back to VSCode
		this.sendResponse(response);
	}

	// VSCode starts MC exe, then waits for MC to boot and connect back to a listening VSCode
	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments, request?: DebugProtocol.Request) {
		// not implemented
	}

	// VSCode wants to attach to a debugee (MC), create socket connection on specified port
	protected async attachRequest(response: DebugProtocol.AttachResponse, args: IAttachRequestArguments, request?: DebugProtocol.Request) {
		// capture arguments from launch.json
		this._localRoot = path.normalize(args.localRoot);

		this.closeSession();

		const host = args.host || 'localhost';
		let port = args.port || parseInt(args.inputPort);
		if (isNaN(port)) {
			this.sendErrorResponse(response, 1001, `Failed to attach to Minecraft, invalid port "${args.inputPort}".`);
			return;
		}

		// listen or connect (default), depending on mode.
		// attach makes more sense to use connect,
		// but some MC platforms require using listen.
		if (args.mode === 'listen') {
			await this.listen(port);
		} else {
			await this.connect(host, port);
		}

		// tell VSCode that attach is complete
		this.sendResponse(response);
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request): void {
		response.body = {
			breakpoints: []
		};

		if (!args.source.path) {
			this.sendResponse(response);
			return;
		}

		let sourcePath = path.normalize(args.source.path);
		let localRelativePath = path.normalize(path.relative(this._localRoot, sourcePath));

		const envelope = {
			type: 'breakpoints',
			breakpoints: {
				path: localRelativePath,
				breakpoints: args.breakpoints
			}
		};

		this.sendDebuggeeMessage(envelope);

		this.sendResponse(response);
	}

	protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments, request?: DebugProtocol.Request): void {
		// todo: to make this work set the exceptionBreakpointFilters capability at init, then send result to debugee here
		this.sendResponse(response);
	}

	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments, request?: DebugProtocol.Request): void {
		this.sendDebuggeeMessage({
			type: 'resume'
		});

		this.sendResponse(response);
	}

	// VSCode wants current threads (substitute JS contexts)
	protected threadsRequest(response: DebugProtocol.ThreadsResponse, request?: DebugProtocol.Request): void {
		response.body = {
			threads: Array.from(this._threads.keys()).map(thread => new Thread(thread, `thread 0x${thread.toString(16)}`))
		}
		this.sendResponse(response);
	}

	// VSCode requesting stack trace for threads, follows threadsRequest
	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
		const threadId = args.threadId;
		const stacksBody = await this.sendDebugeeRequestAsync(threadId, response, args);

		this._activeThreadId = threadId;

		const stackFrames: StackFrame[] = [];
		for (const { id, name, filename, line, column } of stacksBody) {

			const localPath = path.join(this._localRoot, filename);
			const source = new Source(path.basename(filename), this.convertClientPathToDebugger(localPath));

			stackFrames.push(new StackFrame(id, name, source, line || 0, column || 0));
		}

		const totalFrames = stacksBody.length;

		response.body = {
			stackFrames,
			totalFrames,
		};

		this.sendResponse(response);
	}

	protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
		// get scopes from debugee for this frame, args contains the desired stack frame id
		const scopesResponseBody = await this.sendDebugeeRequestAsync(this._activeThreadId, response, args);

		const scopes: Scope[] = [];
		for (const { name, reference, expensive } of scopesResponseBody) {
			scopes.push(new Scope(name, reference, expensive));
		}

		response.body = {
			scopes
		};

		this.sendResponse(response);
	}

	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request) {
		// get variables at this reference (all vars in scope or vars in object/array)
		const variablesResponseBody = await this.sendDebugeeRequestAsync(this._activeThreadId, response, args);

		const variables: Variable[] = [];
		for (const { name, value, type, variablesReference, indexedVariables } of variablesResponseBody) {
			// if variablesReference is non-zero then it represents an object and will trigger additional variablesRequests when expanded by user
			let variable: DebugProtocol.Variable = new Variable(name, value, variablesReference, indexedVariables);
			variable.type = type; // to show type when hovered

			variables.push(variable);
		}

		response.body = {
			variables
		};

		this.sendResponse(response);
	}

	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
		// evaluate watch variables
		const evaluateVariablesResponseBody = await this.sendDebugeeRequestAsync(this._activeThreadId, response, args);
		response.body = evaluateVariablesResponseBody;
		this.sendResponse(response);
	}

	protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
		response.body = await this.sendDebugeeRequestAsync(args.threadId, response, args);
		this.sendResponse(response);
	}

	protected async pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments, request?: DebugProtocol.Request) {
		response.body = await this.sendDebugeeRequestAsync(args.threadId, response, args);
		this.sendResponse(response);
	}

	protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
		response.body = await this.sendDebugeeRequestAsync(args.threadId, response, args);
		this.sendResponse(response);
	}

	protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request) {
		response.body = await this.sendDebugeeRequestAsync(args.threadId, response, args);
		this.sendResponse(response);
	}

	protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request) {
		response.body = await this.sendDebugeeRequestAsync(args.threadId, response, args);
		this.sendResponse(response);
	}

	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
		this.closeServer();
		this.closeSession();
		this.sendResponse(response);
	}

	// ------------------------------------------------------------------------
	// Session Setup
	// ------------------------------------------------------------------------

	// listen for Minecraft connections (VSCode is the server, Minecraft (debugee) is client)
	private async listen(port: number) {
		this._debugeeServer = new Server(socket => {
			this.closeServer();
			this.onDebugeeConnected(socket);
		});
		this._debugeeServer.listen(port);
	}

	//connect to Minecraft (Minecraft (debugee) is server, VSCode is client)
	private async connect(host: string, port: number) {
		let socket: Socket | undefined = undefined;

		// try connecting for 5 seconds
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				socket = await new Promise<Socket>((resolve, reject) => {
					let client = createConnection({ host: host, port: port });
					client.on('connect', () => {
						client.removeAllListeners();
						resolve(client);
					});

					client.on('close', reject);
					client.on('error', reject);
				});
				break;
			}
			catch (e) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		if (!socket) {
			throw new Error(`Cannot connect to port [${port}].`);
		}

		this.onDebugeeConnected(socket);
	}

	private onDebugeeConnected(socket: Socket) {
		this._connectionSocket = socket;

		// create socket stream parser and setup event handlers
		let socketStreamParser = new MCMessageStreamParser();
		socketStreamParser.on('message', (envelope: any) => {
			this.receiveDebugeeMessage(envelope);
		});

		// set socket event handlers
		socket.on('error', (e) => {
			this.terminateSession(e.toString());
		});
		socket.on('close', () => {
			this.terminateSession('close');
		});

		// connect socket to stream parser
		socket.pipe(socketStreamParser as any);

		// Now that a connection is established, send this event to
		// tell VSCode to ask Minecraft/debugee for config data (breakpoints etc).
		// When config is complete VSCode calls 'configurationDoneRequest' and the DA
		// sends a 'resume' message to the debugee, which had paused following the attach.
		this.sendEvent(new InitializedEvent());
	}

	// stop listening for connections
	private closeServer() {
		if (this._debugeeServer) {
			this._debugeeServer.close();
		}
		this._debugeeServer = undefined;
	}

	// close connection to debugee (MC)
	private closeSession() {
		if (this._connectionSocket) {
			this._connectionSocket.destroy();
		}
		this._connectionSocket = undefined;
	}

	// close and terminate session (could be from debugee request)
	// send terminated event to VSCode to release DA
	private terminateSession(reason: string) {
		this.closeServer();
		this.closeSession();

		if (!this._terminated) {
			this._terminated = true;
			this.sendEvent(new TerminatedEvent());
		}
	}

	// ------------------------------------------------------------------------
	// Debugee message send and receive
	// ------------------------------------------------------------------------

	// Send message of type 'request' and wait for results.
	// When VSCode wants to 'continue', 'stepIn/out' etc, send request to debugee
	// and wait within DA request handler for response.
	private sendDebugeeRequestAsync(thread: number, response: DebugProtocol.Response, args: any): Promise<any> {
		let promise = new Promise((resolve, reject) => {
			let request_seq = response.request_seq;
			this._requests.set(request_seq, {
				resolve,
				reject
			});

			let envelope = {
				type: 'request',
				request: {
					request_seq,
					command: response.command,
					args
				}
			};

			this.sendDebuggeeMessage(envelope);
		});
		return promise;
	}

	private sendDebuggeeMessage(envelope: any) {
		if (!this._connectionSocket) {
			return;
		}

		envelope.version = MCDebugSession.DEBUGGER_PROTOCOL_VERSION;

		let json = JSON.stringify(envelope);
		let jsonBuffer = Buffer.from(json);
		// length prefix is 8 hex followed by newline = 012345678\n
		// not efficient, but protocol is then human readable.
		// json = 1 line json + new line
		let messageLength = jsonBuffer.byteLength + 1;
		let length = '00000000' + messageLength.toString(16) + '\n';
		length = length.substr(length.length - 9);
		let lengthBuffer = Buffer.from(length);
		let newline = Buffer.from('\n');
		let buffer = Buffer.concat([lengthBuffer, jsonBuffer, newline]);

		this._connectionSocket.write(buffer);
	}

	private receiveDebugeeMessage(envelope: any) {
		if (envelope.type === 'event') {
			this.handleDebugeeEvent(envelope.event);
		}
		else if (envelope.type === 'response') {
			this.handleDebugeeResponse(envelope);
		}
	}

	// Debugee (MC) has sent an event.
	private handleDebugeeEvent(eventMessage: any) {
		if (eventMessage.type === 'StoppedEvent') {
			this.trackThreadChanges(eventMessage.thread);
			this.sendEvent(new StoppedEvent(eventMessage.reason, eventMessage.thread))
		}
		else if (eventMessage.type === 'ThreadEvent') {
			this.trackThreadChanges(eventMessage.thread);
			this.sendEvent(new ThreadEvent(eventMessage.reason, eventMessage.thread));
		}
		else if (eventMessage.type === 'PrintEvent') {
			this.sendEvent(new LogOutputEvent(eventMessage.message + '\n', eventMessage.logLevel));
		}
		else if (eventMessage.type === 'ProtocolEvent') {
			this.handleProtocolEvent(eventMessage);
		}
	}

	// Debugee (MC) responses to pending VSCode requests. Promises contained in a map keyed by
	// the sequence number of the request. Fascilitates the 'await sendDebugeeRequestAsync(...)' pattern.
	private handleDebugeeResponse(envelope: any) {
		let request_seq: number = envelope.request_seq;
		let pending = this._requests.get(request_seq);
		if (!pending) {
			return;
		}
		this._requests.delete(request_seq);
		if (envelope.error) {
			pending.reject(new Error(envelope.error));
		}
		else {
			pending.resolve(envelope.body);
		}
	}

	// ------------------------------------------------------------------------

	private handleProtocolEvent(eventMessage: any) {
		let mcVer = eventMessage.version;
		let extVer = MCDebugSession.DEBUGGER_PROTOCOL_VERSION;
		if (mcVer < extVer) {
			// Minecraft protocol is behind the extension
			let errorMessage = `Minecraft's debugger protocol [${mcVer}] is not compatible with this extension's protocol [${extVer}], please update Minecraft.`;
			this.sendEvent(new LogOutputEvent(errorMessage, LogLevel.Error));
		}
		else if (mcVer > extVer) {
			// Extension protocol is behind Minecraft
			let errorMessage = `This extension's protocol [${extVer}] is not compatible with Minecraft's debugger protocol [${mcVer}], please update the extension.`;
			this.sendEvent(new LogOutputEvent(errorMessage, LogLevel.Error));
		}
	}

	private trackThreadChanges(threadId: number) {
		this._threads.add(threadId);
	}
}
