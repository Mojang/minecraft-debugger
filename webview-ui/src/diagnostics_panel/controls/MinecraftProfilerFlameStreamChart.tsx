// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import { MultipleStatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { removeAllStyleElements } from '../../util/CSPUtilities';

type ScopeDescriptor = {
    pathKey: string;
    label: string;
    displayPath: string;
    depth: number;
    order: number;
    rawIndent: string;
};

type ScopeSample = {
    time: number;
    low: number;
    mid: number;
    high: number;
};

type ProfilerState = {
    scopesByPath: Record<string, ScopeDescriptor>;
    order: string[];
    historyByPath: Record<string, ScopeSample[]>;
    latestTick: number;
    lastIndentTick: number;
    indentCursor: number;
};

type TimeRange = {
    start: number;
    end: number;
};

type ValueScaleMode = 'normalized' | 'absolute';
type TimeUnit = 'ms' | 'us' | 'ns';
type LaneDisplayMode = 'range-and-midline' | 'midline-only';

type FlameChartPoint = {
    time: number;
    pathKey: string;
    label: string;
    displayPath: string;
    depth: number;
    yLow: number;
    yMid: number;
    yHigh: number;
    depthBand: string;
    laneFill: string;
    midStroke: string;
    laneRelativeRatio: number;
};

type LaneMetric = {
    pathKey: string;
    laneMaxValue: number;
    latestLowValue: number;
    latestMidValue: number;
    latestHighValue: number;
    relativeRatio: number;
    contributionToParentRatio: number;
    childrenBurdenRatio: number;
    dominantChildLabel?: string;
};

type MinecraftProfilerFlameStreamChartProps = {
    title: string;
    statisticDataProvider: MultipleStatisticProvider;
    tickRange?: number;
    defaultWindowTicks?: number;
};

const DEFAULT_TICK_RANGE = 20 * 60;
const DEFAULT_WINDOW_TICKS = 20 * 15;
const ROW_HEIGHT = 72;
const ROW_PADDING = 10;
const MAX_DEPTH_ALL = Number.MAX_SAFE_INTEGER;
const LANE_TICK_MIN_GAP = 12;
const MIN_NORMALIZED_LANE_SPAN = 1;
const DEFAULT_LABEL_PANE_WIDTH = 300;
const MIN_LABEL_PANE_WIDTH = 220;
const MIN_CHART_PANE_WIDTH = 460;

const DEPTH_FILL_PALETTE = [
    'var(--vscode-charts-blue)',
    'var(--vscode-charts-green)',
    'var(--vscode-charts-orange)',
    'var(--vscode-charts-purple)',
    'var(--vscode-charts-red)',
];

// Using a lighter variant of the base color for the midline to ensure visibility
// when the low and high values are close together
const DEPTH_MIDLINE_PALETTE = [
    'color-mix(in srgb, var(--vscode-charts-blue) 50%, white)',
    'color-mix(in srgb, var(--vscode-charts-green) 50%, white)',
    'color-mix(in srgb, var(--vscode-charts-orange) 50%, white)',
    'color-mix(in srgb, var(--vscode-charts-purple) 50%, white)',
    'color-mix(in srgb, var(--vscode-charts-red) 50%, white)',
];

const INITIAL_STATE: ProfilerState = {
    scopesByPath: {},
    order: [],
    historyByPath: {},
    latestTick: 0,
    lastIndentTick: -1,
    indentCursor: 0,
};

function parseIndentDepth(rawIndent: string): number {
    const normalizedIndent = rawIndent.replace(/\t/g, '    ');
    const trimmedIndent = normalizedIndent.trim();

    if (/^-?\d+$/.test(trimmedIndent)) {
        return Math.max(0, Number.parseInt(trimmedIndent, 10));
    }

    return Math.max(0, normalizedIndent.length);
}

function splitLeadingIndent(label: string): { label: string; impliedDepth: number | undefined } {
    const match = label.match(/^(\s+)(.*)$/);
    if (!match) {
        return { label, impliedDepth: undefined };
    }

    return {
        label: match[2],
        impliedDepth: parseIndentDepth(match[1]),
    };
}

function parseMetricValue(rawValue: string | undefined): number | undefined {
    if (rawValue === undefined) {
        return undefined;
    }

    const parsedValue = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsedValue)) {
        return undefined;
    }

    return parsedValue;
}

function createFallbackPathKey(label: string, index: number): string {
    return `${label}#fallback_${index}`;
}

function buildScopeDescriptorsFromIndents(rows: string[][]): ScopeDescriptor[] {
    const descriptors: ScopeDescriptor[] = [];
    const siblingCountsByParent = new Map<string, Map<string, number>>();
    const pathStack: string[] = [];
    const displayPathStack: string[] = [];

    rows.forEach((row, index) => {
        const label = row[0] || `Scope ${index + 1}`;
        const rawIndent = row[1] ?? '';
        const depth = rawIndent.length;

        while (pathStack.length > depth) {
            pathStack.pop();
            displayPathStack.pop();
        }

        const parentPath = depth > 0 ? (pathStack[depth - 1] ?? '') : '';
        const parentDisplayPath = depth > 0 ? (displayPathStack[depth - 1] ?? '') : '';

        let siblingCounts = siblingCountsByParent.get(parentPath);
        if (siblingCounts === undefined) {
            siblingCounts = new Map<string, number>();
            siblingCountsByParent.set(parentPath, siblingCounts);
        }

        const nextCount = (siblingCounts.get(label) ?? 0) + 1;
        siblingCounts.set(label, nextCount);

        const pathSegment = `${label}#${nextCount}`;
        const pathKey = parentPath === '' ? pathSegment : `${parentPath}/${pathSegment}`;
        const displayPath = parentDisplayPath === '' ? label : `${parentDisplayPath} > ${label}`;

        pathStack[depth] = pathKey;
        displayPathStack[depth] = displayPath;

        descriptors.push({
            pathKey,
            label,
            displayPath,
            depth,
            order: index,
            rawIndent,
        });
    });

    return descriptors;
}

function clampTimeRange(range: TimeRange, minTime: number, maxTime: number): TimeRange {
    if (maxTime <= minTime) {
        return { start: minTime, end: maxTime };
    }

    const clampedStart = Math.max(minTime, Math.min(range.start, maxTime - 1));
    const clampedEnd = Math.min(maxTime, Math.max(range.end, clampedStart + 1));

    return {
        start: clampedStart,
        end: clampedEnd,
    };
}

type EventTypes = 'low' | 'mid' | 'high' | 'indents';
function resolveEventType(groupName: string): EventTypes | undefined {
    const normalizedGroup = groupName.toLowerCase();
    if (
        normalizedGroup === 'low' ||
        normalizedGroup === 'mid' ||
        normalizedGroup === 'high' ||
        normalizedGroup === 'indents'
    ) {
        return normalizedGroup as EventTypes;
    }
    return undefined;
}

function updateSeriesValue(
    series: ScopeSample[],
    eventTime: number,
    group: Exclude<EventTypes, 'indents'>,
    value: number,
) {
    const latestEntry = series.length > 0 ? series[series.length - 1] : undefined;

    if (latestEntry && latestEntry.time === eventTime) {
        latestEntry[group] = value;
        return;
    }

    const nextEntry: ScopeSample = {
        time: eventTime,
        low: latestEntry?.low ?? 0,
        mid: latestEntry?.mid ?? 0,
        high: latestEntry?.high ?? 0,
    };
    nextEntry[group] = value;
    series.push(nextEntry);
}

function trimHistory(historyByPath: Record<string, ScopeSample[]>, cutoffTick: number): Record<string, ScopeSample[]> {
    let nextHistoryByPath = historyByPath;

    Object.keys(historyByPath).forEach(pathKey => {
        const currentSeries = historyByPath[pathKey];
        const trimmedSeries = currentSeries.filter(sample => sample.time >= cutoffTick);
        if (trimmedSeries.length !== currentSeries.length) {
            if (nextHistoryByPath === historyByPath) {
                nextHistoryByPath = { ...historyByPath };
            }
            nextHistoryByPath[pathKey] = trimmedSeries;
        }
    });

    return nextHistoryByPath;
}

function rebuildDisplayPaths(
    scopesByPath: Record<string, ScopeDescriptor>,
    order: string[],
): Record<string, ScopeDescriptor> {
    const labelStack: string[] = [];
    let nextScopesByPath = scopesByPath;

    order.forEach(pathKey => {
        const currentScope = nextScopesByPath[pathKey];
        if (!currentScope) {
            return;
        }

        const normalizedDepth = Math.max(0, currentScope.depth);
        labelStack.length = normalizedDepth;
        const displayPath = [...labelStack, currentScope.label].join(' > ');
        labelStack[normalizedDepth] = currentScope.label;

        if (currentScope.displayPath !== displayPath) {
            if (nextScopesByPath === scopesByPath) {
                nextScopesByPath = { ...scopesByPath };
            }

            nextScopesByPath[pathKey] = {
                ...currentScope,
                displayPath,
            };
        }
    });

    return nextScopesByPath;
}

function ensureScopePathKey(
    previousState: ProfilerState,
    nextScopesByPath: Record<string, ScopeDescriptor>,
    nextOrder: string[],
    label: string,
    fallbackIndex: number,
): {
    pathKey: string;
    nextScopesByPath: Record<string, ScopeDescriptor>;
    nextOrder: string[];
} {
    const indexedPathKey = nextOrder[fallbackIndex];

    if (indexedPathKey !== undefined) {
        return { pathKey: indexedPathKey, nextScopesByPath, nextOrder };
    }

    const matchedPathKey = nextOrder.find(candidatePathKey => nextScopesByPath[candidatePathKey]?.label === label);
    if (matchedPathKey !== undefined) {
        return { pathKey: matchedPathKey, nextScopesByPath, nextOrder };
    }

    if (nextOrder === previousState.order) {
        nextOrder = [...previousState.order];
    }
    if (nextScopesByPath === previousState.scopesByPath) {
        nextScopesByPath = { ...previousState.scopesByPath };
    }

    const pathKey = createFallbackPathKey(label, fallbackIndex);
    nextOrder.push(pathKey);
    nextScopesByPath[pathKey] = {
        pathKey,
        label,
        displayPath: label,
        depth: 0,
        order: nextOrder.length - 1,
        rawIndent: '',
    };

    return { pathKey, nextScopesByPath, nextOrder };
}

function applyEvent(previousState: ProfilerState, event: StatisticUpdatedMessage, tickRange: number): ProfilerState {
    if (event.children_string_values.length === 0 && event.values.length === 0) {
        return previousState;
    }

    const group = resolveEventType(event.group);
    if (group === undefined) {
        return previousState;
    }

    const nextLatestTick = Math.max(previousState.latestTick, event.time);

    let nextScopesByPath = previousState.scopesByPath;
    let nextOrder = previousState.order;
    let nextHistoryByPath = previousState.historyByPath;
    let nextLastIndentTick = previousState.lastIndentTick;
    let nextIndentCursor = previousState.indentCursor;
    let didChange = false;

    if (group === 'indents') {
        if (event.children_string_values.length > 0) {
            const nextDescriptors = buildScopeDescriptorsFromIndents(event.children_string_values);
            nextScopesByPath = { ...previousState.scopesByPath };
            nextOrder = [];
            nextDescriptors.forEach((descriptor, index) => {
                nextScopesByPath[descriptor.pathKey] = { ...descriptor, order: index };
                nextOrder.push(descriptor.pathKey);
            });
            nextLastIndentTick = event.time;
            nextIndentCursor = nextDescriptors.length;
            didChange = true;
        } else {
            const rawIndentValue = event.values.length > 0 ? String(event.values[event.values.length - 1]) : '';
            const label = event.name || event.id;

            if (event.time !== nextLastIndentTick) {
                nextLastIndentTick = event.time;
                nextIndentCursor = 0;
            }

            const ensuredScope = ensureScopePathKey(
                previousState,
                nextScopesByPath,
                nextOrder,
                label,
                nextIndentCursor,
            );

            const scopeDescriptor = ensuredScope.nextScopesByPath[ensuredScope.pathKey];
            nextScopesByPath = ensuredScope.nextScopesByPath;
            nextOrder = ensuredScope.nextOrder;
            nextIndentCursor += 1;

            if (scopeDescriptor !== undefined) {
                const parsedDepth = parseIndentDepth(rawIndentValue);
                if (scopeDescriptor.depth !== parsedDepth || scopeDescriptor.rawIndent !== rawIndentValue) {
                    if (nextScopesByPath === previousState.scopesByPath) {
                        nextScopesByPath = { ...previousState.scopesByPath };
                    }

                    nextScopesByPath[ensuredScope.pathKey] = {
                        ...scopeDescriptor,
                        depth: parsedDepth,
                        rawIndent: rawIndentValue,
                    };
                    didChange = true;
                }
            }
        }
    } else if (event.children_string_values.length > 0) {
        event.children_string_values.forEach((row, index) => {
            const labelWithIndent = row[0] || `Scope ${index + 1}`;
            const parsedLabel = splitLeadingIndent(labelWithIndent);
            const label = parsedLabel.label;
            const value = parseMetricValue(row[1]);
            if (value === undefined) {
                return;
            }

            const ensuredScope = ensureScopePathKey(previousState, nextScopesByPath, nextOrder, label, index);
            const pathKey = ensuredScope.pathKey;
            nextScopesByPath = ensuredScope.nextScopesByPath;
            nextOrder = ensuredScope.nextOrder;

            const scopeDescriptor = nextScopesByPath[pathKey];
            if (scopeDescriptor !== undefined && scopeDescriptor.label !== label) {
                if (nextScopesByPath === previousState.scopesByPath) {
                    nextScopesByPath = { ...previousState.scopesByPath };
                }

                nextScopesByPath[pathKey] = {
                    ...scopeDescriptor,
                    label,
                };
            }

            if (parsedLabel.impliedDepth !== undefined) {
                const currentScopeDescriptor = nextScopesByPath[pathKey];
                if (currentScopeDescriptor !== undefined && currentScopeDescriptor.depth !== parsedLabel.impliedDepth) {
                    if (nextScopesByPath === previousState.scopesByPath) {
                        nextScopesByPath = { ...previousState.scopesByPath };
                    }

                    nextScopesByPath[pathKey] = {
                        ...currentScopeDescriptor,
                        depth: parsedLabel.impliedDepth,
                    };
                }
            }

            if (nextHistoryByPath === previousState.historyByPath) {
                nextHistoryByPath = { ...previousState.historyByPath };
            }

            const currentSeries = nextHistoryByPath[pathKey] ?? [];
            const nextSeries = [...currentSeries];
            updateSeriesValue(nextSeries, event.time, group, value);

            if (
                nextSeries.length >= 2 &&
                nextSeries[nextSeries.length - 1].time < nextSeries[nextSeries.length - 2].time
            ) {
                nextSeries.sort((left, right) => left.time - right.time);
            }

            nextHistoryByPath[pathKey] = nextSeries;
            didChange = true;
        });
    } else {
        const parsedLabel = splitLeadingIndent(event.name || event.id);
        const label = parsedLabel.label;
        const ensuredScope = ensureScopePathKey(previousState, nextScopesByPath, nextOrder, label, nextOrder.length);
        const pathKey = ensuredScope.pathKey;
        nextScopesByPath = ensuredScope.nextScopesByPath;
        nextOrder = ensuredScope.nextOrder;

        if (nextHistoryByPath === previousState.historyByPath) {
            nextHistoryByPath = { ...previousState.historyByPath };
        }

        const currentSeries = nextHistoryByPath[pathKey] ?? [];
        const nextSeries = [...currentSeries];

        event.values.forEach((rawValue, valueIndex) => {
            const value = Number(rawValue);
            if (!Number.isFinite(value)) {
                return;
            }

            const tickOffset = event.values.length - valueIndex - 1;
            const eventTime = event.time - tickOffset;
            updateSeriesValue(nextSeries, eventTime, group, value);
        });

        if (parsedLabel.impliedDepth !== undefined) {
            const scopeDescriptor = nextScopesByPath[pathKey];
            if (scopeDescriptor !== undefined && scopeDescriptor.depth !== parsedLabel.impliedDepth) {
                if (nextScopesByPath === previousState.scopesByPath) {
                    nextScopesByPath = { ...previousState.scopesByPath };
                }

                nextScopesByPath[pathKey] = {
                    ...scopeDescriptor,
                    depth: parsedLabel.impliedDepth,
                };
            }
        }

        if (nextSeries.length >= 2 && nextSeries[nextSeries.length - 1].time < nextSeries[nextSeries.length - 2].time) {
            nextSeries.sort((left, right) => left.time - right.time);
        }

        nextHistoryByPath[pathKey] = nextSeries;
        didChange = true;
    }

    const cutoffTick = nextLatestTick - tickRange;
    const trimmedHistory = trimHistory(nextHistoryByPath, cutoffTick);
    const scopesWithDisplayPaths = rebuildDisplayPaths(nextScopesByPath, nextOrder);

    if (
        !didChange &&
        trimmedHistory === previousState.historyByPath &&
        scopesWithDisplayPaths === previousState.scopesByPath &&
        nextLatestTick === previousState.latestTick &&
        nextLastIndentTick === previousState.lastIndentTick &&
        nextIndentCursor === previousState.indentCursor
    ) {
        return previousState;
    }

    return {
        scopesByPath: scopesWithDisplayPaths,
        order: nextOrder,
        historyByPath: trimmedHistory,
        latestTick: nextLatestTick,
        lastIndentTick: nextLastIndentTick,
        indentCursor: nextIndentCursor,
    };
}

function formatTickDifference(tick: number, latestTick: number): string {
    const tickDifference = latestTick - tick;
    if (tickDifference < 20) {
        return 'now';
    }

    return `${Math.floor(tickDifference / 20)}s`;
}

function ceilToThreeDecimalPlaces(value: number): number {
    return Math.ceil(value * 1000) / 1000;
}

function clampRatio(value: number): number {
    return Math.max(0, Math.min(value, 1));
}

function getParentPath(pathKey: string): string | undefined {
    const lastSeparatorIndex = pathKey.lastIndexOf('/');
    if (lastSeparatorIndex === -1) {
        return undefined;
    }

    return pathKey.substring(0, lastSeparatorIndex);
}

function formatTimingValue(value: number, unit: TimeUnit): string {
    if (!Number.isFinite(value)) {
        return unit === 'ns' ? '0 ns' : `0.000 ${unit}`;
    }

    if (unit === 'ms') {
        return `${ceilToThreeDecimalPlaces(value / 1_000_000).toFixed(3)} ms`;
    }

    if (unit === 'us') {
        return `${ceilToThreeDecimalPlaces(value / 1_000).toFixed(3)} us`;
    }

    return `${value} ns`;
}

function getDepthPaletteColor(depth: number, palette: readonly string[]): string {
    return palette[Math.abs(depth) % palette.length];
}

function enforceOrderedTickPositions(
    lowY: number,
    midY: number,
    highY: number,
    laneBottomY: number,
    laneTopY: number,
): { low: number; mid: number; high: number } {
    const clampedLow = Math.max(laneBottomY, Math.min(lowY, laneTopY));
    const clampedMid = Math.max(laneBottomY, Math.min(midY, laneTopY));
    const clampedHigh = Math.max(laneBottomY, Math.min(highY, laneTopY));

    let low = clampedLow;
    let mid = Math.max(clampedMid, low + LANE_TICK_MIN_GAP);
    let high = Math.max(clampedHigh, mid + LANE_TICK_MIN_GAP);

    if (high > laneTopY) {
        const overflow = high - laneTopY;
        high -= overflow;
        mid -= overflow;
        low -= overflow;
    }

    if (low < laneBottomY) {
        const underflow = laneBottomY - low;
        low += underflow;
        mid += underflow;
        high += underflow;
    }

    return {
        low,
        mid,
        high,
    };
}

function minecraftProfilerFlameStreamChart({
    title,
    statisticDataProvider,
    tickRange = DEFAULT_TICK_RANGE,
    defaultWindowTicks = DEFAULT_WINDOW_TICKS,
}: MinecraftProfilerFlameStreamChartProps): JSX.Element {
    const [state, setState] = useState<ProfilerState>(INITIAL_STATE);
    const [maxVisibleDepth, setMaxVisibleDepth] = useState<number>(MAX_DEPTH_ALL);
    const [followLatest, setFollowLatest] = useState<boolean>(true);
    const [selectedRange, setSelectedRange] = useState<TimeRange | undefined>(undefined);
    const [chartWidth, setChartWidth] = useState<number>(900);
    const [valueScaleMode, setValueScaleMode] = useState<ValueScaleMode>('normalized');
    const [timeUnit, setTimeUnit] = useState<TimeUnit>('us');
    const [laneDisplayMode, setLaneDisplayMode] = useState<LaneDisplayMode>('midline-only');
    const [labelPaneWidth, setLabelPaneWidth] = useState<number>(DEFAULT_LABEL_PANE_WIDTH);

    const chartHostRef = useRef<HTMLDivElement>(null);
    const plotContainerRef = useRef<HTMLDivElement>(null);
    const chartPaneRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const eventHandler = (event: StatisticUpdatedMessage): void => {
            setState(previousState => applyEvent(previousState, event, tickRange));
        };

        statisticDataProvider.registerWindowListener(window);
        statisticDataProvider.addSubscriber(eventHandler);

        return () => {
            statisticDataProvider.removeSubscriber(eventHandler);
            statisticDataProvider.unregisterWindowListener(window);
        };
    }, [statisticDataProvider, tickRange]);

    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        const chartWidthTarget = chartPaneRef.current ?? chartHostRef.current;
        if (chartWidthTarget === null) {
            return;
        }

        const observer = new ResizeObserver(entries => {
            const nextWidth = Math.floor(entries[0].contentRect.width);
            if (nextWidth > 0) {
                setChartWidth(nextWidth);
            }
        });

        observer.observe(chartWidthTarget);

        return () => {
            observer.disconnect();
        };
    }, []);

    const allScopesInOrder = useMemo(() => {
        return state.order
            .map(pathKey => state.scopesByPath[pathKey])
            .filter((scope): scope is ScopeDescriptor => scope !== undefined)
            .sort((left, right) => left.order - right.order);
    }, [state.order, state.scopesByPath]);

    const maxDepth = useMemo(() => {
        return allScopesInOrder.reduce((currentMax, scope) => Math.max(currentMax, scope.depth), 0);
    }, [allScopesInOrder]);

    const effectiveDepthLimit = useMemo(() => {
        if (maxVisibleDepth === MAX_DEPTH_ALL) {
            return maxDepth;
        }

        return Math.min(maxVisibleDepth, maxDepth);
    }, [maxDepth, maxVisibleDepth]);

    const visibleScopes = useMemo(() => {
        return allScopesInOrder.filter(scope => scope.depth <= effectiveDepthLimit);
    }, [allScopesInOrder, effectiveDepthLimit]);

    const timeDomain = useMemo(() => {
        let minTime = Number.POSITIVE_INFINITY;
        let maxTime = Number.NEGATIVE_INFINITY;

        visibleScopes.forEach(scope => {
            const series = state.historyByPath[scope.pathKey] ?? [];
            series.forEach(sample => {
                minTime = Math.min(minTime, sample.time);
                maxTime = Math.max(maxTime, sample.time);
            });
        });

        if (!Number.isFinite(minTime) || !Number.isFinite(maxTime)) {
            return undefined;
        }

        return {
            min: minTime,
            max: maxTime,
        };
    }, [state.historyByPath, visibleScopes]);

    useEffect(() => {
        if (timeDomain === undefined) {
            setSelectedRange(undefined);
            return;
        }

        const defaultRange: TimeRange = {
            start: Math.max(timeDomain.min, timeDomain.max - defaultWindowTicks),
            end: timeDomain.max,
        };

        setSelectedRange(previousRange => {
            if (previousRange === undefined || followLatest) {
                return defaultRange;
            }

            return clampTimeRange(previousRange, timeDomain.min, timeDomain.max);
        });
    }, [defaultWindowTicks, followLatest, timeDomain]);

    const plotModel = useMemo(() => {
        if (selectedRange === undefined || timeDomain === undefined || visibleScopes.length === 0) {
            return undefined;
        }

        const resolvedRange = clampTimeRange(selectedRange, timeDomain.min, timeDomain.max);

        const filteredSeriesByPath: Record<string, ScopeSample[]> = {};
        const laneMinByPath: Record<string, number> = {};
        const laneMaxByPath: Record<string, number> = {};
        const laneNormalizedSpanByPath: Record<string, number> = {};
        const latestValuesByPath: Record<string, { low: number; mid: number; high: number }> = {};
        const laneLabelByPath: Record<string, string> = {};
        const useMidlineOnlyNormalization = laneDisplayMode === 'midline-only' && valueScaleMode === 'normalized';
        let globalLaneMaxValue = 0;

        visibleScopes.forEach(scope => {
            const series = (state.historyByPath[scope.pathKey] ?? []).filter(
                sample => sample.time >= resolvedRange.start && sample.time <= resolvedRange.end,
            );
            filteredSeriesByPath[scope.pathKey] = series;
            laneLabelByPath[scope.pathKey] = scope.label;

            let laneMin = Number.POSITIVE_INFINITY;
            let laneMax = Number.NEGATIVE_INFINITY;
            series.forEach(sample => {
                if (useMidlineOnlyNormalization) {
                    laneMin = Math.min(laneMin, sample.mid);
                    laneMax = Math.max(laneMax, sample.mid);
                } else {
                    const sampleLow = Math.min(sample.low, sample.mid, sample.high);
                    const sampleHigh = Math.max(sample.low, sample.mid, sample.high);
                    laneMin = Math.min(laneMin, sampleLow);
                    laneMax = Math.max(laneMax, sampleHigh);
                }
            });

            const resolvedLaneMin = Number.isFinite(laneMin) ? laneMin : 0;
            const resolvedLaneMax = Number.isFinite(laneMax) ? laneMax : 0;

            const boundedLaneMax = resolvedLaneMax > 0 ? resolvedLaneMax : 1;
            const laneSpan = Math.max(resolvedLaneMax - resolvedLaneMin, MIN_NORMALIZED_LANE_SPAN);
            laneMinByPath[scope.pathKey] = resolvedLaneMin;
            laneMaxByPath[scope.pathKey] = boundedLaneMax;
            laneNormalizedSpanByPath[scope.pathKey] = laneSpan;
            globalLaneMaxValue = Math.max(globalLaneMaxValue, boundedLaneMax);

            const latestSample = series.length > 0 ? series[series.length - 1] : undefined;
            const latestLow = latestSample ? Math.min(latestSample.low, latestSample.mid, latestSample.high) : 0;
            const latestHigh = latestSample ? Math.max(latestSample.low, latestSample.mid, latestSample.high) : 0;
            const latestMid = latestSample ? Math.min(latestHigh, Math.max(latestLow, latestSample.mid)) : 0;

            latestValuesByPath[scope.pathKey] = {
                low: latestLow,
                mid: latestMid,
                high: latestHigh,
            };
        });

        const normalizedMaxValue = globalLaneMaxValue > 0 ? globalLaneMaxValue : 1;
        const isAbsoluteScale = valueScaleMode === 'absolute';
        const yAxisTimingBands = laneDisplayMode === 'midline-only' ? 'M' : 'L/M/H';
        const rowUsableHeight = ROW_HEIGHT - ROW_PADDING * 2;
        const rowCount = visibleScopes.length;
        const rowsHeight = rowCount * ROW_HEIGHT;
        const childLatestMidSumByParent: Record<string, number> = {};
        const topChildByParent: Record<string, { label: string; mid: number }> = {};

        visibleScopes.forEach(scope => {
            const parentPath = getParentPath(scope.pathKey);
            if (parentPath === undefined) {
                return;
            }

            const childLatestMid = latestValuesByPath[scope.pathKey]?.mid ?? 0;
            childLatestMidSumByParent[parentPath] = (childLatestMidSumByParent[parentPath] ?? 0) + childLatestMid;

            const currentTopChild = topChildByParent[parentPath];
            if (currentTopChild === undefined || childLatestMid > currentTopChild.mid) {
                topChildByParent[parentPath] = {
                    label: laneLabelByPath[scope.pathKey] ?? scope.label,
                    mid: childLatestMid,
                };
            }
        });

        const laneMetricsByPath: Record<string, LaneMetric> = {};
        visibleScopes.forEach(scope => {
            const parentPath = getParentPath(scope.pathKey);
            const latestValues = latestValuesByPath[scope.pathKey] ?? { low: 0, mid: 0, high: 0 };
            const parentLatestMid = parentPath ? (latestValuesByPath[parentPath]?.mid ?? 0) : 0;
            const relativeRatio = clampRatio((laneMaxByPath[scope.pathKey] ?? 1) / normalizedMaxValue);

            laneMetricsByPath[scope.pathKey] = {
                pathKey: scope.pathKey,
                laneMaxValue: laneMaxByPath[scope.pathKey] ?? 0,
                latestLowValue: latestValues.low,
                latestMidValue: latestValues.mid,
                latestHighValue: latestValues.high,
                relativeRatio,
                contributionToParentRatio: parentLatestMid > 0 ? clampRatio(latestValues.mid / parentLatestMid) : 0,
                childrenBurdenRatio:
                    latestValues.mid > 0
                        ? clampRatio((childLatestMidSumByParent[scope.pathKey] ?? 0) / latestValues.mid)
                        : 0,
                dominantChildLabel: topChildByParent[scope.pathKey]?.label,
            };
        });

        const points: FlameChartPoint[] = [];
        const rowTicks: { y: number; label: string }[] = [];
        visibleScopes.forEach((scope, rowIndex) => {
            const series = filteredSeriesByPath[scope.pathKey] ?? [];
            const rowLowerEdge = (rowCount - rowIndex - 1) * ROW_HEIGHT;
            const rowBase = rowLowerEdge + ROW_PADDING;
            const laneScaleMin = isAbsoluteScale ? 0 : (laneMinByPath[scope.pathKey] ?? 0);
            const laneScaleSpan = isAbsoluteScale
                ? normalizedMaxValue
                : (laneNormalizedSpanByPath[scope.pathKey] ?? MIN_NORMALIZED_LANE_SPAN);
            const valueScale = rowUsableHeight / laneScaleSpan;
            const laneBottom = rowBase;
            const laneTop = rowBase + rowUsableHeight;
            const laneFill = getDepthPaletteColor(scope.depth, DEPTH_FILL_PALETTE);
            const midStroke = getDepthPaletteColor(scope.depth, DEPTH_MIDLINE_PALETTE);
            const latestSample = series.length > 0 ? series[series.length - 1] : undefined;

            const latestLow = latestSample ? Math.min(latestSample.low, latestSample.mid, latestSample.high) : 0;
            const latestHigh = latestSample ? Math.max(latestSample.low, latestSample.mid, latestSample.high) : 0;
            const latestMid = latestSample ? Math.min(latestHigh, Math.max(latestLow, latestSample.mid)) : 0;

            // Pin L/M/H label anchors to stable lane positions so text doesn't jump as values move.
            const pinnedLowY = laneBottom + LANE_TICK_MIN_GAP;
            const pinnedMidY = rowBase + rowUsableHeight / 2;
            const pinnedHighY = laneTop - LANE_TICK_MIN_GAP;
            const orderedTickPositions = enforceOrderedTickPositions(
                pinnedLowY,
                pinnedMidY,
                pinnedHighY,
                laneBottom,
                laneTop,
            );

            if (laneDisplayMode === 'range-and-midline') {
                rowTicks.push({ y: orderedTickPositions.low, label: `L ${formatTimingValue(latestLow, timeUnit)}` });
                rowTicks.push({ y: orderedTickPositions.high, label: `H ${formatTimingValue(latestHigh, timeUnit)}` });
            }
            rowTicks.push({ y: orderedTickPositions.mid, label: `M ${formatTimingValue(latestMid, timeUnit)}` });

            const laneRelativeRatio = laneMetricsByPath[scope.pathKey]?.relativeRatio ?? 0;

            series.forEach(sample => {
                const sortedLow = Math.min(sample.low, sample.mid, sample.high);
                const sortedHigh = Math.max(sample.low, sample.mid, sample.high);
                const sortedMid = Math.min(sortedHigh, Math.max(sortedLow, sample.mid));

                points.push({
                    time: sample.time,
                    pathKey: scope.pathKey,
                    label: scope.label,
                    displayPath: scope.displayPath,
                    depth: scope.depth,
                    yLow: rowBase + (sortedLow - laneScaleMin) * valueScale,
                    yMid: rowBase + (sortedMid - laneScaleMin) * valueScale,
                    yHigh: rowBase + (sortedHigh - laneScaleMin) * valueScale,
                    depthBand: `Depth ${scope.depth}`,
                    laneFill,
                    midStroke,
                    laneRelativeRatio,
                });
            });
        });

        return {
            points,
            rowsHeight,
            range: resolvedRange,
            rowGuides: Array.from({ length: rowCount + 1 }, (_, index) => index * ROW_HEIGHT),
            rowTicks,
            yAxisLabel: isAbsoluteScale
                ? `Lane timings (absolute global scale, ${yAxisTimingBands}, ${timeUnit})`
                : `Lane timings (normalized per lane, ${yAxisTimingBands}, ${timeUnit})`,
            yAxisWidth: Math.min(
                220,
                Math.max(
                    96,
                    rowTicks.reduce((maxWidth, tick) => Math.max(maxWidth, tick.label.length * 7 + 16), 96),
                ),
            ),
        };
    }, [selectedRange, state.historyByPath, timeDomain, timeUnit, valueScaleMode, laneDisplayMode, visibleScopes]);

    useEffect(() => {
        const plotContainer = plotContainerRef.current;
        if (plotContainer === null) {
            return;
        }

        if (plotModel === undefined || plotModel.points.length === 0) {
            plotContainer.innerHTML = '';
            return;
        }

        const rowTickLabelByY = new Map<number, string[]>();
        plotModel.rowTicks.forEach(tick => {
            const key = Math.round(tick.y * 1000) / 1000;
            const existingLabels = rowTickLabelByY.get(key) ?? [];
            if (existingLabels.indexOf(tick.label) === -1) {
                existingLabels.push(tick.label);
                rowTickLabelByY.set(key, existingLabels);
            }
        });

        const plot = Plot.plot({
            className: 'minecraft-profiler-flame-stream-chart',
            width: Math.max(600, chartWidth),
            height: Math.max(220, plotModel.rowsHeight + 48),
            marginTop: 8,
            marginBottom: 40,
            marginLeft: plotModel.yAxisWidth,
            marginRight: 12,
            x: {
                label: 'Time',
                domain: [plotModel.range.start, plotModel.range.end],
                grid: true,
                tickFormat: (tickValue: number) => formatTickDifference(tickValue, state.latestTick),
            },
            y: {
                axis: 'left',
                domain: [0, plotModel.rowsHeight],
                ticks: plotModel.rowTicks.map(tick => tick.y),
                tickSize: 0,
                label: plotModel.yAxisLabel,
                tickFormat: (tickValue: number) => {
                    const key = Math.round(Number(tickValue) * 1000) / 1000;
                    return (rowTickLabelByY.get(key) ?? []).join(' ');
                },
            },
            marks: [
                Plot.ruleY(plotModel.rowGuides, {
                    y: guide => guide,
                    stroke: 'var(--vscode-editorGroup-border)',
                    strokeOpacity: 0.35,
                }),
                ...(laneDisplayMode === 'range-and-midline'
                    ? [
                          Plot.areaY(plotModel.points, {
                              x: 'time',
                              y: 'yHigh',
                              y1: 'yLow',
                              z: 'pathKey',
                              fill: (point: FlameChartPoint) => point.laneFill,
                              fillOpacity: (point: FlameChartPoint) => 0.1 + Math.sqrt(point.laneRelativeRatio) * 0.5,
                          }),
                      ]
                    : []),
                Plot.lineY(plotModel.points, {
                    x: 'time',
                    y: 'yMid',
                    z: 'pathKey',
                    stroke: 'var(--vscode-editor-background)',
                    strokeOpacity: 1,
                    strokeWidth: 3,
                }),
                Plot.lineY(plotModel.points, {
                    x: 'time',
                    y: 'yMid',
                    z: 'pathKey',
                    stroke: (point: FlameChartPoint) => point.midStroke,
                    strokeOpacity: (point: FlameChartPoint) => 0.5 + point.laneRelativeRatio * 0.5,
                    strokeWidth: 3,
                }),
            ],
        });

        removeAllStyleElements(plot);
        plotContainer.replaceChildren(plot);

        return () => {
            plot.remove();
        };
    }, [chartWidth, laneDisplayMode, plotModel, state.latestTick]);

    const onDepthSliderChanged = useCallback((event: React.FormEvent<HTMLInputElement>) => {
        const depthValue = Number.parseInt(event.currentTarget.value, 10);
        setMaxVisibleDepth(Number.isFinite(depthValue) ? depthValue : MAX_DEPTH_ALL);
    }, []);

    const onRangeStartChanged = useCallback(
        (event: React.FormEvent<HTMLInputElement>) => {
            if (timeDomain === undefined) {
                return;
            }

            const startValue = Number.parseInt(event.currentTarget.value, 10);
            if (!Number.isFinite(startValue)) {
                return;
            }

            setFollowLatest(false);
            setSelectedRange(previousRange => {
                const baseline = previousRange ?? { start: timeDomain.min, end: timeDomain.max };
                return clampTimeRange({ start: startValue, end: baseline.end }, timeDomain.min, timeDomain.max);
            });
        },
        [timeDomain],
    );

    const onRangeEndChanged = useCallback(
        (event: React.FormEvent<HTMLInputElement>) => {
            if (timeDomain === undefined) {
                return;
            }

            const endValue = Number.parseInt(event.currentTarget.value, 10);
            if (!Number.isFinite(endValue)) {
                return;
            }

            setFollowLatest(false);
            setSelectedRange(previousRange => {
                const baseline = previousRange ?? { start: timeDomain.min, end: timeDomain.max };
                return clampTimeRange({ start: baseline.start, end: endValue }, timeDomain.min, timeDomain.max);
            });
        },
        [timeDomain],
    );

    const onFollowLatestClicked = useCallback(() => {
        setFollowLatest(true);
    }, []);

    const onShowAllDepthsClicked = useCallback(() => {
        setMaxVisibleDepth(MAX_DEPTH_ALL);
    }, []);

    const onShowRootDepthClicked = useCallback(() => {
        setMaxVisibleDepth(0);
    }, []);

    const onNormalizedScaleClicked = useCallback(() => {
        setValueScaleMode('normalized');
    }, []);

    const onAbsoluteScaleClicked = useCallback(() => {
        setValueScaleMode('absolute');
    }, []);

    const onTimeUnitChanged = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const nextUnit = event.currentTarget.value;
        if (nextUnit === 'ms' || nextUnit === 'us' || nextUnit === 'ns') {
            setTimeUnit(nextUnit);
        }
    }, []);

    const onLaneDisplayModeChanged = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const nextMode = event.currentTarget.value;
        if (nextMode === 'range-and-midline' || nextMode === 'midline-only') {
            setLaneDisplayMode(nextMode);
        }
    }, []);

    const onLabelPaneResizePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const hostElement = chartHostRef.current;
            if (hostElement === null) {
                return;
            }

            event.preventDefault();

            const surfaceRect = hostElement.getBoundingClientRect();
            const startX = event.clientX;
            const startWidth = labelPaneWidth;
            const maxLabelPaneWidth = Math.max(MIN_LABEL_PANE_WIDTH, surfaceRect.width - MIN_CHART_PANE_WIDTH);

            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';

            const onPointerMove = (moveEvent: PointerEvent): void => {
                const deltaX = moveEvent.clientX - startX;
                const nextWidth = Math.max(
                    MIN_LABEL_PANE_WIDTH,
                    Math.min(startWidth + deltaX, Math.floor(maxLabelPaneWidth)),
                );
                setLabelPaneWidth(nextWidth);
            };

            const onPointerUp = (): void => {
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                window.removeEventListener('pointermove', onPointerMove);
            };

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp, { once: true });
        },
        [labelPaneWidth],
    );

    const surfaceColumns = useMemo(() => {
        return `${Math.round(labelPaneWidth)}px 8px minmax(0, 1fr)`;
    }, [labelPaneWidth]);

    return (
        <div className="minecraft-profiler-flame-stream-root">
            <h2>{title}</h2>
            <div className="minecraft-profiler-flame-stream-toolbar">
                <div className="minecraft-profiler-flame-stream-toolbar-group">
                    <label htmlFor="flame-stream-range-start">Time Window</label>
                    <div className="minecraft-profiler-flame-stream-range-row">
                        <input
                            id="flame-stream-range-start"
                            type="range"
                            disabled={timeDomain === undefined}
                            min={timeDomain?.min ?? 0}
                            max={timeDomain?.max ?? 1}
                            value={selectedRange?.start ?? timeDomain?.min ?? 0}
                            onInput={onRangeStartChanged}
                        />
                        <input
                            id="flame-stream-range-end"
                            type="range"
                            disabled={timeDomain === undefined}
                            min={timeDomain?.min ?? 0}
                            max={timeDomain?.max ?? 1}
                            value={selectedRange?.end ?? timeDomain?.max ?? 1}
                            onInput={onRangeEndChanged}
                        />
                        <VSCodeButton onClick={onFollowLatestClicked}>Follow Latest</VSCodeButton>
                    </div>
                    <span className="minecraft-profiler-flame-stream-toolbar-caption">
                        {selectedRange === undefined
                            ? 'Waiting for profiler scope data'
                            : `Ticks ${selectedRange.start} - ${selectedRange.end}${followLatest ? ' (auto)' : ''}`}
                    </span>
                </div>

                <div className="minecraft-profiler-flame-stream-toolbar-group">
                    <label htmlFor="flame-stream-depth">Visible Depth</label>
                    <div className="minecraft-profiler-flame-stream-range-row">
                        <input
                            id="flame-stream-depth"
                            type="range"
                            min={0}
                            max={Math.max(maxDepth, 0)}
                            value={Math.min(effectiveDepthLimit, Math.max(maxDepth, 0))}
                            onInput={onDepthSliderChanged}
                        />
                        <VSCodeButton onClick={onShowAllDepthsClicked}>All</VSCodeButton>
                        <VSCodeButton onClick={onShowRootDepthClicked}>Root</VSCodeButton>
                    </div>
                    <span className="minecraft-profiler-flame-stream-toolbar-caption">
                        {`Depth 0 - ${effectiveDepthLimit} of ${maxDepth}`}
                    </span>
                </div>

                <div className="minecraft-profiler-flame-stream-toolbar-group minecraft-profiler-flame-stream-toolbar-group-scale">
                    <label>Scale Mode</label>
                    <div className="minecraft-profiler-flame-stream-range-row">
                        <VSCodeButton disabled={valueScaleMode === 'normalized'} onClick={onNormalizedScaleClicked}>
                            Normalized
                        </VSCodeButton>
                        <VSCodeButton disabled={valueScaleMode === 'absolute'} onClick={onAbsoluteScaleClicked}>
                            Absolute
                        </VSCodeButton>
                    </div>
                    <span className="minecraft-profiler-flame-stream-toolbar-caption">
                        {valueScaleMode === 'normalized'
                            ? 'Each lane scales to its visible min-max window.'
                            : 'All lanes share one global vertical scale.'}
                    </span>
                </div>

                <div className="minecraft-profiler-flame-stream-toolbar-group minecraft-profiler-flame-stream-toolbar-group-unit">
                    <label htmlFor="flame-stream-time-unit">Time Unit</label>
                    <div className="minecraft-profiler-flame-stream-range-row">
                        <select
                            id="flame-stream-time-unit"
                            className="minecraft-profiler-flame-stream-select"
                            value={timeUnit}
                            onChange={onTimeUnitChanged}
                        >
                            <option value="ms">Milliseconds</option>
                            <option value="us">Microseconds</option>
                            <option value="ns">Nanoseconds</option>
                        </select>
                    </div>
                </div>

                <div className="minecraft-profiler-flame-stream-toolbar-group minecraft-profiler-flame-stream-toolbar-group-lane-display">
                    <label htmlFor="flame-stream-lane-display-mode">Lane Display</label>
                    <div className="minecraft-profiler-flame-stream-range-row">
                        <select
                            id="flame-stream-lane-display-mode"
                            className="minecraft-profiler-flame-stream-select"
                            value={laneDisplayMode}
                            onChange={onLaneDisplayModeChanged}
                        >
                            <option value="range-and-midline">Midline and High/Low Range</option>
                            <option value="midline-only">Midline Only</option>
                        </select>
                    </div>
                </div>
            </div>

            <div
                className="minecraft-profiler-flame-stream-surface"
                ref={chartHostRef}
                style={{ gridTemplateColumns: surfaceColumns }}
            >
                <div className="minecraft-profiler-flame-stream-label-pane">
                    {visibleScopes.map(scope => (
                        <div
                            key={scope.pathKey}
                            className="minecraft-profiler-flame-stream-label-row"
                            style={{
                                paddingLeft: `${scope.depth * 16 + 8}px`,
                                height: `${ROW_HEIGHT}px`,
                            }}
                            title={scope.displayPath}
                        >
                            <span className="minecraft-profiler-flame-stream-label-text">{scope.label}</span>
                        </div>
                    ))}
                </div>
                <div
                    className="minecraft-profiler-flame-stream-pane-resizer"
                    role="separator"
                    aria-label="Resize scope names panel"
                    aria-orientation="vertical"
                    onPointerDown={onLabelPaneResizePointerDown}
                    title="Drag to resize scope names"
                />
                <div className="minecraft-profiler-flame-stream-chart-pane" ref={chartPaneRef}>
                    <div ref={plotContainerRef} />
                </div>
            </div>

            {visibleScopes.length === 0 && (
                <div className="minecraft-profiler-flame-stream-empty">
                    Waiting for profiler scopes from the selected client.
                </div>
            )}
        </div>
    );
}

export default minecraftProfilerFlameStreamChart;
