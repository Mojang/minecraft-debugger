import { useEffect, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';
import { ascending } from 'd3-array';
import { StatisticOptions, StatisticResolver, TrackedStat } from '../StatisticResolver';
import { StatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';

type Options = {
    title: string;
    yLabel: string;
    xLabel?: string;
    statisticDataProvider: StatisticProvider;
    statisticResolver: StatisticResolver;
};

export default function MinecraftStatisticStackedBarChart({
    title,
    yLabel,
    xLabel = 'Time',
    statisticDataProvider,
    statisticResolver,
}: Options) {
    // states
    const [data, setData] = useState<TrackedStat[]>([]);

    // refs
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const eventHandler = (event: StatisticUpdatedMessage): void => {
            // Update data with new data point
            setData((prevState: TrackedStat[]): TrackedStat[] => {
                const newData = statisticResolver(event, prevState);
                return newData;
            });
        };

        statisticDataProvider.registerWindowListener(window);
        statisticDataProvider.addSubscriber(eventHandler);

        // Sort the data by subcategory
        const chartData = [...data].sort((a, b) => {
            return ascending(a.category, b.category);
        });

        const latestTime = data.length !== 0 ? data[data.length - 1].time : 0;

        const plot = Plot.plot({
            color: {
                legend: true,
                tickFormat: d => {
                    return d;
                },
            },
            title: title,
            x: {
                label: xLabel,
                tickFormat: function (d: d3.NumberValue, i: number) {
                    const tickDifference = latestTime - d.valueOf();

                    if (tickDifference < 20) {
                        return 'now';
                    }

                    // Assume 20 ticks per second
                    return Math.floor(tickDifference / 20) + 's';
                },
                ticks: 10,
            },
            y: { grid: true, label: yLabel },
            marks: [
                Plot.barY(chartData, {
                    x: 'time',
                    y: 'value',
                    fill: 'category',
                    title: 'category',
                }),
                Plot.ruleY([0]),
            ],
        });

        if (containerRef.current !== null) {
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
    });

    return <div ref={containerRef} />;
}
