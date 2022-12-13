
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { createConnection, Server, Socket } from 'net';
import { DebugSession, InitializedEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread, ThreadEvent, Variable } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { LogOutputEvent, LogLevel } from 'vscode-debugadapter/lib/logger';
import { MessageStreamParser } from './MessageStreamParser';
import { SourceMaps } from './SourceMaps';
import { FileSystemWatcher, window, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface PendingResponse {
	resolve: Function;
	reject: Function;
}

// Module mapping for getting line numbers for a given module
interface ModuleMapping {
	[moduleName: string]: string;
}

// Interface for specific launch arguments.
// See package.json for schema.
interface IAttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	mode: string;
	localRoot: string;
	generatedSourceRoot: string;
	sourceMapRoot: string;
	host: string;
	port: number;
	inputPort: string;
	moduleMapping: ModuleMapping;
}

// The Debug Adapter for 'minecraft-js'
//
export class Session extends DebugSession {
	private static DEBUGGER_PROTOCOL_VERSION = 1;
	private static CONNECTION_RETRY_ATTEMPTS = 5;
	private static CONNECTION_RETRY_WAIT_MS = 2000;

	private _debugeeServer?: Server;		// when listening for incoming connections
	private _connectionSocket?: Socket;
	private _terminated: boolean = false;
	private _threads = new Set<number>();
	private _requests = new Map<number, PendingResponse>();
	private _sourceMaps: SourceMaps = new SourceMaps("");
	private _fileWatcher?: FileSystemWatcher;
	private _activeThreadId: number = 0;	// the one being debugged
	private _localRoot: string = "";
	private _sourceMapRoot?: string;	
	private _generatedSourceRoot?: string;
	private _moduleMapping?: ModuleMapping;

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
		this.closeSession();

		const host = args.host || 'localhost';
		let port = args.port || parseInt(args.inputPort);
		if (isNaN(port)) {
			this.sendErrorResponse(response, 1001, `Failed to attach to Minecraft, invalid port "${args.inputPort}".`);
			return;
		}

		this._localRoot = args.localRoot ? path.normalize(args.localRoot) : "";
		this._sourceMapRoot = args.sourceMapRoot ? path.normalize(args.sourceMapRoot) : undefined;
		this._generatedSourceRoot = args.generatedSourceRoot ? path.normalize(args.generatedSourceRoot) : undefined;
		this._moduleMapping = args.moduleMapping;

		// Listen or connect (default), depending on mode.
		// Attach makes more sense to use connect, but some MC platforms require using listen.
		try {
			if (args.mode === 'listen') {
				await this.listen(port);
			} else {
				await this.connect(host, port);
			}
		}
		catch (e) {
			this.log((e as Error).message, LogLevel.Error);
			this.sendErrorResponse(response, 1004, `Failed to attach debugger to Minecraft.`);
			return;
		}

		// tell VSCode that attach has been received
		this.sendResponse(response);
	}

	protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request) {
		response.body = {
			breakpoints: []
		};

		if (!args.source.path) {
			this.sendResponse(response);
			return;
		}

		let originalLocalAbsolutePath = path.normalize(args.source.path);

		const originalBreakpoints = args.breakpoints || [];
		const generatedBreakpoints : DebugProtocol.SourceBreakpoint[] = [];
		let generatedRemoteLocalPath = undefined;

		try {
			// first get generated remote file path, will throw if fails
			generatedRemoteLocalPath = await this._sourceMaps.getGeneratedRemoteRelativePath(originalLocalAbsolutePath);

			// for all breakpoint positions set on the source file, get generated/mapped positions
			if (originalBreakpoints.length) {
				for (let originalBreakpoint of originalBreakpoints) {
					const generatedPosition = await this._sourceMaps.getGeneratedPositionFor({
						source: originalLocalAbsolutePath,
						column: originalBreakpoint.column || 0,
						line: originalBreakpoint.line
					});
					generatedBreakpoints.push({
						line: generatedPosition.line || 0,
						column: 0
					});
				}
			}
		}
		catch (e) {
			this.log((e as Error).message, LogLevel.Error);
			this.sendErrorResponse(response, 1002, `Failed to resolve breakpoint for ${originalLocalAbsolutePath}.`);
			return;
		}

		const envelope = {
			type: 'breakpoints',
			breakpoints: {
				path: generatedRemoteLocalPath,
				breakpoints: generatedBreakpoints.length ? generatedBreakpoints : undefined
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
			const mappedFilename = this._moduleMapping?.[filename] ?? filename;
			try {
				const originalLocation = await this._sourceMaps.getOriginalPositionFor({
					source: mappedFilename,
					line: line || 0,
					column: column || 0
				});
				const source = new Source(path.basename(originalLocation.source), originalLocation.source);
				stackFrames.push(new StackFrame(id, name, source, originalLocation.line, originalLocation.column));
			}
			catch (e) {
				stackFrames.push(new StackFrame(id, name));
			}
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
		// closeSession triggers the 'close' event on the socket which will call terminateSession
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
		this.showNotification(`Listening for debugger connections on port [${port}].`, LogLevel.Log);
	}

	// connect to Minecraft (Minecraft (debugee) is server, VSCode is client)
	private async connect(host: string, port: number) {
		let socket: Socket | undefined = undefined;

		// try connecting for 5 seconds
		for (let attempt = 0; attempt < Session.CONNECTION_RETRY_ATTEMPTS; attempt++) {
			this.log(`Connecting to host [${host}] on port [${port}], attempt [${attempt+1}].`, LogLevel.Log);
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
				await new Promise(resolve => setTimeout(resolve, Session.CONNECTION_RETRY_WAIT_MS));
			}
		}

		if (!socket) {
			this.terminateSession("failed to connect debugger");
			throw new Error(`Failed to connect to host [${host}] on port [${port}].`);
		}

		this.onDebugeeConnected(socket);
	}

	private onDebugeeConnected(socket: Socket) {
		this._connectionSocket = socket;

		// create socket stream parser and setup event handlers
		let socketStreamParser = new MessageStreamParser();
		socketStreamParser.on('message', (envelope: any) => {
			this.receiveDebugeeMessage(envelope);
		});

		// set socket event handlers
		socket.on('error', (e) => {
			this.terminateSession(e.toString());
		});
		socket.on('close', () => {
			this.terminateSession('socket closed');
		});

		// connect socket to stream parser
		socket.pipe(socketStreamParser as any);

		//
		// Now wait for the debugee protocol event which will call onConnectionComplete if accepted.
		//
	}

	private onConnectionComplete() {
		// success
		this.showNotification("Success! Debugger is now connected.", LogLevel.Log);

		// init source maps
		this._sourceMaps = new SourceMaps(this._localRoot, this._sourceMapRoot, this._generatedSourceRoot);

		// watch for source map changes
		this.createSourceMapFileWatcher(this._sourceMapRoot);
		
		// Now that a connection is established, and capabilities have been delivered, send this event to
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

		if (this._fileWatcher) {
			this._fileWatcher.dispose();
			this._fileWatcher = undefined;
		}
	}

	// close and terminate session (could be from debugee request)
	// send terminated event to VSCode to release DA
	private terminateSession(reason: string) {
		this.closeServer();
		this.closeSession();

		if (!this._terminated) {
			this._terminated = true;
			this.sendEvent(new TerminatedEvent());

			this.showNotification(`Session terminated, ${reason}.`, LogLevel.Log);
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

		envelope.version = Session.DEBUGGER_PROTOCOL_VERSION;

		let json = JSON.stringify(envelope);
		let jsonBuffer = Buffer.from(json);
		// length prefix is 8 hex followed by newline = 012345678\n
		// not efficient, but protocol is then human readable.
		// json = 1 line json + new line
		let messageLength = jsonBuffer.byteLength + 1;
		let length = '00000000' + messageLength.toString(16) + '\n';
		length = length.substring(length.length - 9);
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
			this.trackThreadChanges(eventMessage.reason, eventMessage.thread);
			this.sendEvent(new StoppedEvent(eventMessage.reason, eventMessage.thread))
		}
		else if (eventMessage.type === 'ThreadEvent') {
			this.trackThreadChanges(eventMessage.reason, eventMessage.thread);
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

	// the final client event before connection is complete
	private handleProtocolEvent(protocolCapabilities: any) {
		//
		// handle protocol capabilities here...
		// can fail connection on errors
		//

		this.checkSourceFilePaths();

		// success
		this.onConnectionComplete();
	}

	// check that source and map properties in launch.json are set correctly
	private checkSourceFilePaths() {
		if (this._sourceMapRoot) {
			const foundMaps = this.doFilesWithExtExistAt(this._sourceMapRoot, [ ".map" ]);
			if (!foundMaps) {
				this.showNotification("Failed to find source maps, check that launch.json 'sourceMapRoot' contains .map files.", LogLevel.Warn);
			}
			const foundJS = this.doFilesWithExtExistAt(this._sourceMapRoot, [ ".js" ]);
			if (!foundJS) {
				const foundGeneratedJS = this.doFilesWithExtExistAt(this._generatedSourceRoot, [ ".js" ]);
				if (!foundGeneratedJS) {
					this.showNotification("Failed to find generated .js files. Check that launch.json 'sourceMapRoot' or alternately 'generatedSourceRoot' cointain .js files.", LogLevel.Warn);
				}
			}
		}
		else if (this._localRoot) {
			const foundJS = this.doFilesWithExtExistAt(this._localRoot, [ ".js" ]);
			if (!foundJS) {
				this.showNotification("Failed to find .js files. Check that launch.json 'localRoot' cointains .js files.", LogLevel.Warn);
			}
		}
	}

	private doFilesWithExtExistAt(filePath?: string, extensions?: string[]) {
		if (!filePath || !extensions) {
			return false;
		}
		let foundFiles = false;
		try {
			let fileNames = fs.readdirSync(filePath);
			for (let fn of fileNames) {
				return extensions.includes(path.extname(fn));
			}
		}
		catch (e) {
		}
		return foundFiles;
	}

	private trackThreadChanges(reason: string, threadId: number) {
		if (reason == 'exited') {
			this._threads.delete(threadId);
		}
		else {
			this._threads.add(threadId);
		}
	}

	private createSourceMapFileWatcher(sourceMapRoot?: string) {
		if (this._fileWatcher) {
			this._fileWatcher.dispose();
			this._fileWatcher = undefined
		}
		if (sourceMapRoot) {
			this._fileWatcher = workspace.createFileSystemWatcher('**/*.{map}', false, false, false);
			this._fileWatcher.onDidChange(uri => { this._sourceMaps.reset() });
			this._fileWatcher.onDidCreate(uri => { this._sourceMaps.reset() });
			this._fileWatcher.onDidDelete(uri => { this._sourceMaps.reset() });
		}
	}

	// ------------------------------------------------------------------------

	private log(message: string, logLevel: LogLevel) {
		this.sendEvent(new LogOutputEvent(message + '\n', logLevel));
	}

	private showNotification(message: string, logLevel: LogLevel) {
		if (logLevel === LogLevel.Log) {
			window.showInformationMessage(message);
		}
		else if (logLevel === LogLevel.Warn) {
			window.showWarningMessage(message);
		}
		else if (logLevel === LogLevel.Error) {
			window.showErrorMessage(message);
		}
	}
}
