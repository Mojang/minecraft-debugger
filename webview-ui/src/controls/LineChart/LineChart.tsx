import { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';
import { StatisticOptions, TrackedStat, YAxisType, createStatResolver } from '../../StatisticResolver';
import { createYAxisDomainResolver } from './LineChartYAxisResolvers';
import * as Plot from '@observablehq/plot';
import { StatisticProvider, StatisticUpdatedMessage } from '../../StatisticProvider';

type LineChartProperties = {
    title: string;
    yLabel: string;
    xLabel: string;
    statisticOptions: StatisticOptions;
    statisticDataProvider: StatisticProvider;
};

type PlotResult = ((SVGSVGElement | HTMLElement) & Plot.Plot) | undefined;

//chart component
export function LineChart({ title, yLabel, xLabel, statisticOptions, statisticDataProvider }: LineChartProperties) {
    // state
    const [data, setData] = useState<TrackedStat[]>([]);

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
                title: title,
                marginLeft: 50, // Y Axis labels were getting cut off
                x: {
                    //domain: [0, _maxDataPoints - 1],
                    grid: true,
                    tickFormat: function (d: d3.NumberValue, i: number) {
                        if (i >= data.length) {
                            return '';
                        } else {
                            const tickDifference = latestTime - data[i].time;

                            if (tickDifference < 20) {
                                return 'now';
                            }

                            // Assume 20 ticks per second
                            return Math.floor(tickDifference / 20) + 's';
                        }
                    },
                    label: xLabel,
                },
                y: {
                    grid: true,
                    type: 'linear',
                    domain: yDomain,
                    label: yLabel,
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
                    Plot.crosshairX(data, { x: 'time', y: 'value' }),
                ],
            });
        };

        const generateDifferenceChart = (): PlotResult => {
            return Plot.differenceY(data, {
                x: 'time',
                y: 'value',
                //positiveFill: "red",
                //negativeFill: "blue",
                tip: true,
            }).plot({
                title: title,
                marginLeft: 50, // Y Axis labels were getting cut off
                x: {
                    grid: true,
                    tickFormat: function (d: d3.NumberValue, i: number) {
                        const now = Date.now();
                        if (i >= data.length) {
                            return '';
                        } else {
                            // Generate string for number of seconds between now and data[i].time
                            return Math.floor((latestTime - data[i].time) / 1000) + 's';
                        }
                    },
                    label: xLabel,
                },
                y: {
                    grid: true,
                    type: 'linear',
                    domain: yDomain,
                    label: yLabel,
                },
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
