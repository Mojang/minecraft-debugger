// Copyright (C) Microsoft Corporation.  All rights reserved.

import { EventEmitter } from 'stream';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { HomeViewProvider } from './home-view-provider';

const mocks = vi.hoisted(() => ({
    readdir: vi.fn<(path: string, callback: (error: NodeJS.ErrnoException | null, files: string[]) => void) => void>(),
    unlink: vi.fn<(path: string, callback: (error: NodeJS.ErrnoException | null) => void) => void>(),
    createWatcher: vi.fn<() => vscode.FileSystemWatcher>(),
    stat: vi.fn<(path: string) => Promise<{ isDirectory: () => boolean }>>(),
    openExternal: vi.fn<(uri: vscode.Uri) => Promise<boolean>>(),
    showErrorMessage: vi.fn(),
}));

vi.mock('fs', () => ({
    readdir: mocks.readdir,
    unlink: mocks.unlink,
    promises: { stat: mocks.stat },
}));

vi.mock('vscode', () => ({
    Disposable: class {
        constructor(private readonly callback: () => void) {}
        dispose() {
            this.callback();
        }
    },
    RelativePattern: class {
        constructor(readonly base: string, readonly pattern: string) {}
    },
    Uri: {
        file: (fsPath: string) => ({ fsPath }),
    },
    workspace: {
        createFileSystemWatcher: mocks.createWatcher,
    },
    env: { openExternal: mocks.openExternal },
    window: { showErrorMessage: mocks.showErrorMessage },
}));

vi.mock('../utilities/getUri', () => ({
    getUri: () => 'test-resource',
}));

function createEvent<T>() {
    const listeners = new Set<(value: T) => void>();
    const event = vi.fn<vscode.Event<T>>((listener, thisArgs, disposables) => {
        const callback = (value: T) => listener.call(thisArgs, value);
        listeners.add(callback);
        const disposable = new vscode.Disposable(() => listeners.delete(callback));
        disposables?.push(disposable);
        return disposable;
    });
    return {
        event,
        fire: (value: T) => listeners.forEach(listener => listener(value)),
        clear: () => listeners.clear(),
    };
}

function createWatcher() {
    const created = createEvent<vscode.Uri>();
    const deleted = createEvent<vscode.Uri>();
    const changed = createEvent<vscode.Uri>();
    const watcher = {
        ignoreCreateEvents: false,
        ignoreChangeEvents: true,
        ignoreDeleteEvents: false,
        onDidCreate: created.event,
        onDidDelete: deleted.event,
        onDidChange: changed.event,
        dispose: vi.fn(() => {
            created.clear();
            deleted.clear();
            changed.clear();
        }),
    } satisfies vscode.FileSystemWatcher;
    return { watcher, created, deleted };
}

function createView() {
    let visible = true;
    const received = createEvent<unknown>();
    const visibility = createEvent<void>();
    const disposed = createEvent<void>();
    const postMessage = vi.fn(() => Promise.resolve(true));
    const view = {
        get visible() { return visible; },
        viewType: HomeViewProvider.viewType,
        show: vi.fn(),
        onDidChangeVisibility: visibility.event,
        onDidDispose: disposed.event,
        webview: {
            html: '',
            options: {},
            cspSource: 'test',
            postMessage,
            asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
            onDidReceiveMessage: received.event,
        },
    } satisfies vscode.WebviewView;
    return {
        view,
        received,
        disposed,
        postMessage,
        setVisible(value: boolean) {
            visible = value;
            visibility.fire();
        },
    };
}

describe('HomeViewProvider capture watching', () => {
    const capturesPath = path.resolve('captures');
    const otherPath = path.resolve('other-captures');
    let provider: HomeViewProvider;
    let emitter: EventEmitter;
    let ui: ReturnType<typeof createView>;
    let watchers: ReturnType<typeof createWatcher>[];

    function setCapturesPath(capturesBasePath: string) {
        ui.received.fire({ type: 'refresh-captures', capturesBasePath });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        watchers = [];
        mocks.createWatcher.mockImplementation(() => {
            const watcher = createWatcher();
            watchers.push(watcher);
            return watcher.watcher;
        });
        mocks.readdir.mockImplementation((_path, callback) => {
            callback(null, ['initial.cpuprofile', 'notes.txt']);
        });
        mocks.stat.mockResolvedValue({ isDirectory: () => true });
        mocks.openExternal.mockResolvedValue(true);
        emitter = new EventEmitter();
        provider = new HomeViewProvider(vscode.Uri.file(path.resolve('extension')), emitter);
        ui = createView();
        provider.resolveWebviewView(ui.view);
    });

    afterEach(() => {
        provider.dispose();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('opening the captures folder', () => {
        async function openFolder(capturesBasePath: unknown) {
            const [handler] = ui.received.event.mock.calls[0];
            await handler({ type: 'open-captures-folder', capturesBasePath });
        }

        it('reports an inaccessible or missing folder', async () => {
            mocks.stat.mockRejectedValue(new Error('Directory is unavailable'));
            await openFolder(capturesPath);

            expect(mocks.openExternal).not.toHaveBeenCalled();
            expect(mocks.showErrorMessage).toHaveBeenCalledWith(
                'Unable to open the captures folder: Directory is unavailable',
            );
        });

        it('rejects a captures path that points to a file', async () => {
            mocks.stat.mockResolvedValue({ isDirectory: () => false });
            await openFolder(capturesPath);

            expect(mocks.openExternal).not.toHaveBeenCalled();
            expect(mocks.showErrorMessage).toHaveBeenCalledWith(
                'Unable to open the captures folder: The captures path is not a folder.',
            );
        });

        it('reports when the system file explorer cannot be opened', async () => {
            mocks.openExternal.mockResolvedValue(false);
            await openFolder(capturesPath);

            expect(mocks.showErrorMessage).toHaveBeenCalledWith(
                'Unable to open the captures folder: The system file explorer could not be opened.',
            );
        });

        it('reports errors opening the system file explorer', async () => {
            mocks.openExternal.mockRejectedValue(new Error('Access denied'));
            await openFolder(capturesPath);

            expect(mocks.showErrorMessage).toHaveBeenCalledWith('Unable to open the captures folder: Access denied');
        });
    });

    it('does not watch or read an unset captures path', () => {
        setCapturesPath('');

        expect(mocks.createWatcher).not.toHaveBeenCalled();
        expect(mocks.readdir).not.toHaveBeenCalled();
    });

    it('watches only profile additions and deletions and immediately lists existing captures', () => {
        setCapturesPath(capturesPath);

        expect(mocks.createWatcher).toHaveBeenCalledWith(
            expect.objectContaining({ base: capturesPath, pattern: '*.cpuprofile' }),
            false,
            true,
            false,
        );
        expect(ui.postMessage).toHaveBeenLastCalledWith({
            type: 'capture-files-refreshed',
            allCaptureFileNames: ['initial.cpuprofile'],
            newCaptureFileName: undefined,
        });
    });

    it.each(['created', 'deleted'] as const)('refreshes after a profile is %s externally', event => {
        setCapturesPath(capturesPath);
        const files = event === 'created' ? ['initial.cpuprofile', 'external.cpuprofile'] : [];
        mocks.readdir.mockImplementation((_path, callback) => callback(null, files));

        watchers[0][event].fire(vscode.Uri.file(path.join(capturesPath, 'external.cpuprofile')));
        vi.advanceTimersByTime(999);
        expect(mocks.readdir).toHaveBeenCalledOnce();
        vi.advanceTimersByTime(1);

        expect(ui.postMessage).toHaveBeenLastCalledWith({
            type: 'capture-files-refreshed',
            allCaptureFileNames: files,
            newCaptureFileName: undefined,
        });
    });

    it('debounces bursts of create and delete events', () => {
        setCapturesPath(capturesPath);
        const uri = vscode.Uri.file(path.join(capturesPath, 'capture.cpuprofile'));
        watchers[0].created.fire(uri);
        vi.advanceTimersByTime(50);
        watchers[0].deleted.fire(uri);
        vi.advanceTimersByTime(999);
        expect(mocks.readdir).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1);
        expect(mocks.readdir).toHaveBeenCalledTimes(2);
    });

    it('replaces the watcher and discards reads from the old captures path', () => {
        mocks.readdir.mockImplementation(() => undefined);
        setCapturesPath(capturesPath);
        setCapturesPath(otherPath);

        expect(watchers[0].watcher.dispose).toHaveBeenCalledOnce();
        expect(watchers).toHaveLength(2);
        expect(mocks.readdir).toHaveBeenLastCalledWith(otherPath, expect.any(Function));

        mocks.readdir.mock.calls[1][1](null, ['current.cpuprofile']);
        mocks.readdir.mock.calls[0][1](null, ['stale.cpuprofile']);
        expect(ui.postMessage).toHaveBeenCalledOnce();
        expect(ui.postMessage).toHaveBeenLastCalledWith({
            type: 'capture-files-refreshed',
            allCaptureFileNames: ['current.cpuprofile'],
            newCaptureFileName: undefined,
        });
    });

    it('stops watching and cancels pending refreshes when the captures path is cleared', () => {
        setCapturesPath(capturesPath);
        watchers[0].created.fire(vscode.Uri.file(path.join(capturesPath, 'capture.cpuprofile')));
        setCapturesPath('');
        vi.advanceTimersByTime(1000);

        expect(watchers[0].watcher.dispose).toHaveBeenCalledOnce();
        expect(mocks.createWatcher).toHaveBeenCalledOnce();
        expect(mocks.readdir).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops watching while hidden and refreshes changes made while hidden on reopening', () => {
        setCapturesPath(capturesPath);
        watchers[0].created.fire(vscode.Uri.file(path.join(capturesPath, 'capture.cpuprofile')));
        ui.setVisible(false);
        vi.advanceTimersByTime(1000);

        expect(watchers[0].watcher.dispose).toHaveBeenCalledOnce();
        expect(mocks.readdir).toHaveBeenCalledOnce();

        mocks.readdir.mockImplementation((_path, callback) => callback(null, ['added-while-hidden.cpuprofile']));
        ui.setVisible(true);

        expect(watchers).toHaveLength(2);
        expect(ui.postMessage).toHaveBeenLastCalledWith({
            type: 'capture-files-refreshed',
            allCaptureFileNames: ['added-while-hidden.cpuprofile'],
            newCaptureFileName: undefined,
        });
    });

    it('does not start watching a path restored while the view is hidden until it becomes visible', () => {
        ui.setVisible(false);
        setCapturesPath(capturesPath);
        expect(mocks.createWatcher).not.toHaveBeenCalled();
        expect(mocks.readdir).not.toHaveBeenCalled();

        ui.setVisible(true);
        expect(mocks.createWatcher).toHaveBeenCalledOnce();
        expect(mocks.readdir).toHaveBeenCalledOnce();
    });

    it.each(['view', 'provider'] as const)('cleans up watchers, timers, reads and listeners on %s disposal', target => {
        mocks.readdir.mockImplementation(() => undefined);
        setCapturesPath(capturesPath);
        watchers[0].created.fire(vscode.Uri.file(path.join(capturesPath, 'capture.cpuprofile')));

        if (target === 'view') {
            ui.disposed.fire();
        } else {
            provider.dispose();
        }
        mocks.readdir.mock.calls[0][1](null, ['stale.cpuprofile']);
        vi.advanceTimersByTime(1000);
        setCapturesPath(otherPath);

        expect(watchers[0].watcher.dispose).toHaveBeenCalledOnce();
        expect(emitter.listenerCount('new-profiler-capture')).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        expect(mocks.readdir).toHaveBeenCalledOnce();
        expect(mocks.createWatcher).toHaveBeenCalledOnce();
        expect(ui.postMessage).not.toHaveBeenCalled();
    });

    it('ignores new-capture events for other folders', () => {
        setCapturesPath(capturesPath);
        emitter.emit('new-profiler-capture', otherPath, 'other.cpuprofile');

        expect(mocks.readdir).toHaveBeenCalledOnce();
        expect(ui.postMessage).toHaveBeenCalledOnce();
    });

    it('retains new-capture selection while hidden until the view is shown', () => {
        setCapturesPath(capturesPath);
        ui.setVisible(false);
        emitter.emit('new-profiler-capture', capturesPath, 'new.cpuprofile');
        expect(mocks.readdir).toHaveBeenCalledOnce();

        mocks.readdir.mockImplementation((_path, callback) => callback(null, ['new.cpuprofile']));
        ui.setVisible(true);

        expect(ui.postMessage).toHaveBeenLastCalledWith({
            type: 'capture-files-refreshed',
            allCaptureFileNames: ['new.cpuprofile'],
            newCaptureFileName: 'new.cpuprofile',
        });
    });

    it('reports read failures explicitly so an inaccessible folder does not leave stale captures', () => {
        const error = new Error('Directory is unavailable');
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.readdir.mockImplementation((_path, callback) => callback(error, []));
        setCapturesPath(capturesPath);

        expect(log).toHaveBeenCalledWith('Error reading captures directory:', error);
        expect(ui.postMessage).toHaveBeenLastCalledWith({ type: 'capture-files-refresh-failed' });
    });

    it('still refreshes after a capture is deleted through the UI', () => {
        setCapturesPath(capturesPath);
        mocks.unlink.mockImplementation((_path, callback) => callback(null));
        mocks.readdir.mockImplementation((_path, callback) => callback(null, []));
        ui.received.fire({ type: 'delete-capture-file', capturesBasePath: capturesPath, fileName: 'initial.cpuprofile' });

        expect(mocks.unlink).toHaveBeenCalledWith(path.join(capturesPath, 'initial.cpuprofile'), expect.any(Function));
        expect(ui.postMessage).toHaveBeenLastCalledWith({
            type: 'capture-files-refreshed',
            allCaptureFileNames: [],
            newCaptureFileName: undefined,
        });
    });
});
