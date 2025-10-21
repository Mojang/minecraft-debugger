import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { DebugProtocol } from '@vscode/debugprotocol';
import { Breakpoints } from './breakpoints';
import { SourceMaps } from './source-maps';
import { IDebuggeeMessageSender } from './debuggee-message-sender';

// Mock dependencies
vi.mock('./source-maps');
vi.mock('./debug-message-sender');

describe('Breakpoints', () => {
    let breakpoints: Breakpoints;
    let mockSourceMaps: SourceMaps;
    let mockMessageSender: IDebuggeeMessageSender;

    beforeEach(() => {
        mockSourceMaps = {
            getGeneratedRemoteRelativePath: vi.fn(),
            getGeneratedPositionFor: vi.fn(),
            clearCache: vi.fn(),
        } as any;

        mockMessageSender = {
            sendDebugeeRequestAsync: vi.fn(),
            sendDebuggeeMessage: vi.fn(),
        } as any;

        breakpoints = new Breakpoints(mockSourceMaps, mockMessageSender);
    });

    describe('constructor', () => {
        it('should initialize with source maps and message sender', () => {
            expect(breakpoints).toBeDefined();
        });
    });

    describe('handleSetBreakpointsRequest', () => {
        const mockResponse: DebugProtocol.SetBreakpointsResponse = {
            seq: 1,
            type: 'response',
            request_seq: 1,
            command: 'setBreakpoints',
            success: true,
            body: {
                breakpoints: [],
            },
        };

        const mockArgs: DebugProtocol.SetBreakpointsArguments = {
            source: { path: '/test/main.ts' },
            breakpoints: [
                { line: 10, column: 0 },
                { line: 20, column: 0 },
            ],
        };

        beforeEach(() => {
            (mockSourceMaps.getGeneratedRemoteRelativePath as Mock).mockResolvedValue('main.js');
            (mockSourceMaps.getGeneratedPositionFor as Mock).mockImplementation(({ line }) =>
                Promise.resolve({ line, column: 0 })
            );
            (mockMessageSender.sendDebugeeRequestAsync as Mock).mockResolvedValue({
                breakpoints: [{ verified: true }, { verified: true }],
            });
        });

        it('should handle undefined breakpoints', async () => {
            const undefinedArgs = { ...mockArgs, breakpoints: undefined };

            (mockMessageSender.sendDebugeeRequestAsync as Mock).mockResolvedValue({
                breakpoints: [],
            });

            const result = await breakpoints.handleSetBreakpointsRequest('/test/main.ts', mockResponse, undefinedArgs);

            expect(result.breakpoints).toHaveLength(0);
        });

        it('should merge breakpoints from multiple sources with same generated path', async () => {
            // First call with primary source
            await breakpoints.handleSetBreakpointsRequest('/test/main.ts', mockResponse, mockArgs);

            // Second call with different source but same generated path
            const secondArgs = {
                source: { path: '/test/other.ts' },
                breakpoints: [{ line: 30, column: 0 }],
            };

            (mockMessageSender.sendDebugeeRequestAsync as Mock).mockResolvedValue({
                breakpoints: [{ verified: true }, { verified: true }, { verified: false }],
            });

            const result = await breakpoints.handleSetBreakpointsRequest('/test/other.ts', mockResponse, secondArgs);

            expect(result.breakpoints).toHaveLength(1); // Only returns breakpoints for the primary source
        });

        it('should sort merged breakpoints by line number', async () => {
            const unorderedArgs = {
                ...mockArgs,
                breakpoints: [
                    { line: 30, column: 0 },
                    { line: 10, column: 0 },
                    { line: 20, column: 0 },
                ],
            };

            (mockMessageSender.sendDebugeeRequestAsync as Mock).mockResolvedValue({
                breakpoints: [{ verified: true }, { verified: true }, { verified: true }],
            });

            await breakpoints.handleSetBreakpointsRequest('/test/main.ts', mockResponse, unorderedArgs);

            const requestCall = (mockMessageSender.sendDebugeeRequestAsync as Mock).mock.calls[0];
            const sentBreakpoints = requestCall[1].breakpoints;

            expect(sentBreakpoints).toEqual([10, 20, 30]);
        });

        it('should throw error for invalid breakpoints status response', async () => {
            (mockMessageSender.sendDebugeeRequestAsync as Mock).mockResolvedValue({
                invalid: 'response',
            });

            await expect(
                breakpoints.handleSetBreakpointsRequest('/test/main.ts', mockResponse, mockArgs)
            ).rejects.toThrow('Invalid breakpoints status format from debuggee');
        });

        it('should throw error for breakpoint count mismatch', async () => {
            (mockMessageSender.sendDebugeeRequestAsync as Mock).mockResolvedValue({
                breakpoints: [{ verified: true }], // Only 1 breakpoint, but we sent 2
            });

            await expect(
                breakpoints.handleSetBreakpointsRequest('/test/main.ts', mockResponse, mockArgs)
            ).rejects.toThrow('Breakpoint count mismatch between generated and received breakpoints');
        });

        it('should handle unverified breakpoints with message', async () => {
            (mockMessageSender.sendDebugeeRequestAsync as Mock).mockResolvedValue({
                breakpoints: [{ verified: false }, { verified: true }],
            });

            const result = await breakpoints.handleSetBreakpointsRequest('/test/main.ts', mockResponse, mockArgs);

            expect(result.breakpoints[0].verified).toBe(false);
            expect(result.breakpoints[0].message).toBe('Breakpoint could not be set, source unknown to MC.');
            expect(result.breakpoints[1].verified).toBe(true);
            expect(result.breakpoints[1].message).toBeUndefined();
        });

        it('should remove source from map when no breakpoints are set', async () => {
            // First set some breakpoints
            await breakpoints.handleSetBreakpointsRequest('/test/main.ts', mockResponse, mockArgs);

            // Then clear all breakpoints
            const clearArgs = { ...mockArgs, breakpoints: [] };
            (mockMessageSender.sendDebugeeRequestAsync as Mock).mockResolvedValue({
                breakpoints: [],
            });

            await breakpoints.handleSetBreakpointsRequest('/test/main.ts', mockResponse, clearArgs);

            // Verify the source was removed from internal map by setting breakpoints again
            // and checking that no merge occurs
            const newArgs = { ...mockArgs, breakpoints: [{ line: 15, column: 0 }] };
            (mockMessageSender.sendDebugeeRequestAsync as Mock).mockResolvedValue({
                breakpoints: [{ verified: true }],
            });

            const result = await breakpoints.handleSetBreakpointsRequest('/test/other.ts', mockResponse, newArgs);
            expect(result.breakpoints).toHaveLength(1);
        });
    });
});
