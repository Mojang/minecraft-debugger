// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';
import { StatisticOptions, TrackedStat, YAxisStyle, YAxisType, createStatResolver } from '../../StatisticResolver';
import { createYAxisDomainResolver } from './LineChartYAxisResolvers';
import * as Plot from '@observablehq/plot';
import { StatisticProvider, StatisticUpdatedMessage } from '../../StatisticProvider';
import { removeAllStyleElements } from '../../../util/CSPUtilities';

// Set to true to generate fake data with sine wave pattern for testing without a data source
const GenerateTestData = false;

type LineChartProps = {
    title: string;
    yLabel: string;
    xLabel: string;
    statisticOptions: StatisticOptions;
    statisticDataProvider: StatisticProvider;
    yAxisStyle?: YAxisStyle;
};

type PlotResult = ((SVGSVGElement | HTMLElement) & Plot.Plot) | undefined;

function formatYAxisTick(d: d3.NumberValue): string {
    const n = d.valueOf();
    if (n === 0) {
        return '0';
    }
    const abs = Math.abs(n);
    if (abs >= 1000) {
        return `${Math.round(n)}`;
    }
    if (abs >= 1) {
        return `${parseFloat(n.toPrecision(4))}`;
    }
    return `${parseFloat(n.toPrecision(3))}`;
}

function formatRelativeTime(latestTime: number, tick: number): string {
    const diff = latestTime - tick;
    if (diff < 20) {
        return 'now';
    }
    return `${Math.floor(diff / 20)}s ago`;
}

const SharedTipDisplayOptions = {
    fillOpacity: 0.5,
    fill: 'black',
    stroke: 'white',
    style: {
        color: '#ffffff',
        background: '#333333',
    },
};

function createInitialChartData(pointCount = 40): TrackedStat[] {
    if(!GenerateTestData) {
        return [];
    }
    const seed: TrackedStat[] = [];
    for (let i = 0; i < pointCount; i++) {
        const time = i + 1;
        const value = 35 + Math.sin(i / 4) * 10 + i * 0.2;
        seed.push({
            time,
            value,
            absoluteValue: value,
            category: 'sample',
        });
    }
    return seed;
}

//chart component
export function LineChart({
    title,
    yLabel,
    xLabel,
    statisticOptions,
    statisticDataProvider,
    yAxisStyle,
}: LineChartProps): JSX.Element {
    // state
    const [data, setData] = useState<TrackedStat[]>(() => createInitialChartData());

    // refs
    const containerRef = useRef<HTMLDivElement>(null);

    const statResolver = createStatResolver(statisticOptions);
    const yAxisResolver = createYAxisDomainResolver(statisticOptions);

    //draws chart
    useEffect(() => {
        const eventHandler = (event: StatisticUpdatedMessage): void => {
            /* TODO: Handle if these change? Maybe when changing plugins?
            // Clear data if our chart has changed
            if (statisticId !== _statisticId) {
                // Fill with zero'd array with length _maxDataPoints
                //setData(new Array(_maxDataPoints).fill({ value: 0, time: Date.now() }));
                setData([]);
            } else if (groupId !== _groupId) {
                // setData(new Array(_maxDataPoints).fill({ value: 0, time: Date.now() }));
                setData([]);
            }

            _setStatisticId(statisticId);
            _setGroupId(groupId);
            */

            // Update data with new data point
            setData((prevState: TrackedStat[]) => {
                const nextState = statResolver(event, prevState);

                return nextState;
            });
        };

        statisticDataProvider.registerWindowListener(window);
        statisticDataProvider.addSubscriber(eventHandler);

        const yDomain = yAxisResolver.resolve(data);
        const latestTime = data.length !== 0 ? data[data.length - 1].time : 0;

        const generateLineChart = (enableFilledChart: boolean): PlotResult => {
            return Plot.plot({
                className: 'line-chart',
                title: title,
                marginLeft: 50, // Y Axis labels were getting cut off
                x: {
                    //domain: [0, _maxDataPoints - 1],
                    grid: true,
                    tickFormat: function (d: d3.NumberValue, _i: number) {
                        const tickDifference = latestTime - d.valueOf();
                        if (tickDifference < 20) {
                            return 'now';
                        }
                        // Assume 20 ticks per second
                        return Math.floor(tickDifference / 20) + 's';
                    },
                    label: xLabel,
                },
                y: {
                    grid: true,
                    type: yAxisStyle,
                    domain: yDomain,
                    label: yLabel,
                    tickFormat: formatYAxisTick,
                },
                marks: [
                    // TODO: Clean up with factory?
                    enableFilledChart
                        ? Plot.areaY(data, {
                            x: 'time',
                            y: d => Math.max(yDomain[0], d.value),
                            fillOpacity: 0.3,
                            y1: yDomain[0],
                        })
                        : undefined,
                    Plot.lineY(data, { x: 'time', y: 'value' }),
                    enableFilledChart ? Plot.ruleY([0]) : undefined,
                    Plot.tip(
                        data,
                        Plot.pointerX({
                            x: 'time',
                            y: 'value',
                            title: (d: TrackedStat) =>
                                `${xLabel}: ${formatRelativeTime(latestTime, d.time)}\n${yLabel}: ${formatYAxisTick(d.value)}`,
                            ...SharedTipDisplayOptions,
                        })
                    ),
                ],
            });
        };

        const generateDifferenceChart = (): PlotResult => {
            return Plot.plot({
                className: 'difference-chart',
                title: title,
                marginLeft: 50, // Y Axis labels were getting cut off
                x: {
                    grid: true,
                    tickFormat: function (d: d3.NumberValue) {
                        const tickDifference = latestTime - d.valueOf();
                        if (tickDifference < 20) {
                            return 'now';
                        }
                        return Math.floor(tickDifference / 20) + 's';
                    },
                    label: xLabel,
                },
                y: {
                    grid: true,
                    type: 'linear',
                    domain: yDomain,
                    label: yLabel,
                    tickFormat: formatYAxisTick,
                },
                marks: [
                    Plot.differenceY(data, { x: 'time', y: 'value' }),
                    Plot.tip(
                        data,
                        Plot.pointerX({
                            x: 'time',
                            y: 'value',
                            title: (d: TrackedStat) =>
                                `${xLabel}: ${formatRelativeTime(latestTime, d.time)}\n${yLabel}: ${formatYAxisTick(d.value)}`,
                            ...SharedTipDisplayOptions,
                        })
                    ),
                ],
            });
        };

        let plot: PlotResult = undefined;

        switch (statisticOptions.yAxisType) {
            case YAxisType.Absolute:
                plot = generateLineChart(true);
                break;
            case YAxisType.Mirrored:
                plot = generateDifferenceChart();
                break;
            case YAxisType.Centered:
                plot = generateLineChart(false);
                break;
        }

        if (plot !== undefined && containerRef.current) {
            removeAllStyleElements(plot);

            containerRef.current.append(plot);
        }

        // Remove old listener
        return () => {
            statisticDataProvider.removeSubscriber(eventHandler);
            statisticDataProvider.unregisterWindowListener(window);

            if (plot !== undefined) {
                plot.remove();
            }
        };
    }, [data, statisticDataProvider]);

    return <div className="my-test-plot" ref={containerRef} />;
}
