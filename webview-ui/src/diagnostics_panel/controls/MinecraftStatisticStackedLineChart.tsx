// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useEffect, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';
import { StatisticProvider, StatisticUpdatedMessage } from '../StatisticProvider';
import { StatisticResolver, TrackedStat, YAxisStyle } from '../StatisticResolver';
import { removeAllStyleElements } from '../../util/CSPUtilities';
import YAxisStyleDropdown from './YAxisStyleDropdown';

type MinecraftStatisticStackedLineChartProps = {
    title: string;
    yLabel: string;
    xLabel?: string;
    catageoryLabels?: Record<string, string>;
    tickRange?: number; // How many ticks of data to display
    valueScalar?: number;
    targetValue?: number; // Target value for a line on the Y axis
    statisticDataProvider: StatisticProvider;
    statisticResolver: StatisticResolver;
    yAxisStyle?: YAxisStyle;
    showSectionLabels?: boolean;
};

export default function MinecraftStatisticStackedLineChart({
    title,
    yLabel,
    xLabel = 'Time',
    targetValue,
    statisticDataProvider,
    statisticResolver,
    catageoryLabels,
    yAxisStyle,
    showSectionLabels = false,
}: MinecraftStatisticStackedLineChartProps) {
    // states
    const [data, setData] = useState<TrackedStat[]>([]);
    const [selectedYAxisStyle, setSelectedYAxisStyle] = useState<YAxisStyle>(yAxisStyle ?? YAxisStyle.Linear);

    // refs
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const eventHandler = (event: StatisticUpdatedMessage): void => {
            // Update data with new data point
            setData((prevState: TrackedStat[]): TrackedStat[] => {
                const newData = statisticResolver(event, prevState);

                // Sort data we display by what has the lowest overall value in the data
                // set right now
                const totalValuesPerCatageory: { category: string; value: number }[] = [];
                newData.forEach(d => {
                    const currentCategoryIndex = totalValuesPerCatageory.findIndex(c => c.category === d.category);
                    if (currentCategoryIndex !== -1) {
                        totalValuesPerCatageory[currentCategoryIndex].value += d.value;
                    } else {
                        totalValuesPerCatageory.push({ category: d.category!, value: d.value });
                    }
                });
                totalValuesPerCatageory.sort((a, b) => a.value - b.value);

                newData.sort(
                    (a, b) =>
                        totalValuesPerCatageory.findIndex(c => c.category === a.category) -
                        totalValuesPerCatageory.findIndex(c => c.category === b.category)
                );

                return newData;
            });
        };

        statisticDataProvider.registerWindowListener(window);
        statisticDataProvider.addSubscriber(eventHandler);

        const latestTime = data.length !== 0 ? data[data.length - 1].time : 0;
        const latestData = data.filter(d => d.time === latestTime);
        let sectionStart = 0;
        const sectionLabels = latestData.map(stat => {
            const sectionHeight = Math.max(0, stat.value);
            const label = catageoryLabels?.[stat.category ?? ''] ?? stat.category ?? '';
            const result = {
                category: stat.category,
                label,
                time: stat.time,
                y: sectionStart + sectionHeight / 2,
            };
            sectionStart += sectionHeight;
            return result;
        });

        const plot = Plot.plot({
            className: 'minecraft-statistic-stacked-line-chart',
            color: {
                legend: true,
                type: 'ordinal',
                scheme: 'Observable10',
                tickFormat: d => {
                    const label = catageoryLabels !== undefined ? catageoryLabels[d] : undefined;
                    if (label !== undefined) {
                        return label;
                    } else {
                        return d;
                    }
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
            },
            y: { grid: true, label: yLabel, type: selectedYAxisStyle },
            marks: [
                Plot.areaY(data, {
                    x: 'time',
                    y: 'value',
                    fill: 'category',
                    title: d => `category: ${d.category}\nvalue: ${parseFloat(d.value.toFixed(3))}`,
                    tip: {
                        fontSize: 12,
                    },
                }),
                showSectionLabels
                    ? Plot.text(sectionLabels, {
                          x: 'time',
                          y: 'y',
                          text: 'label',
                          fill: 'category',
                          textAnchor: 'end',
                          dx: -6,
                          fontSize: 11,
                          stroke: 'var(--vscode-editor-background)',
                          strokeWidth: 3,
                          paintOrder: 'stroke',
                      })
                    : undefined,
                Plot.ruleY([0]),
                targetValue ? Plot.ruleY([targetValue]) : undefined,
            ],
        });

        // Remove all style elements
        removeAllStyleElements(plot);

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
    }, [data, selectedYAxisStyle, statisticDataProvider]);

    return (
        <div>
            <YAxisStyleDropdown value={selectedYAxisStyle} onChange={setSelectedYAxisStyle} />
            <div ref={containerRef} />
        </div>
    );
}
