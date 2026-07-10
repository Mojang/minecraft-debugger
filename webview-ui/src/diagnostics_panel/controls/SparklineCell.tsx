// Copyright (C) Microsoft Corporation.  All rights reserved.

type SparklineCellProps = {
    values: number[];
    width?: number;
    height?: number;
    formatValue?: (value: number) => string;
    displayedMin?: number;
    displayedMax?: number;
    showYAxisTicks?: boolean;
    yAxisTickCount?: number;
    yAxisLabelFormatter?: (value: number) => string;
    lineStrokeWidth?: number;
};

function formatSparklineLabelValue(value: number, formatValue?: (value: number) => string): string {
    return formatValue ? formatValue(value) : value.toFixed(1);
}

function calculateMedian(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }

    // For median, we need to sort the values and find the middle one (or average of two middle ones)
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }

    // Calculate the mean by summing all values and dividing by the count
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    // Calculate the variance by averaging the squared differences from the mean
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    // Finally, take the square root of the variance to get the standard deviation
    return Math.sqrt(variance);
}

// A simple sparkline component that renders
// a basic line chart of the provided values along with min and max labels.
// Implemented using a dynamic SVG polyline.
export function SparklineCell({
    values,
    width = 120,
    height = 32,
    formatValue,
    displayedMin,
    displayedMax,
    showYAxisTicks = false,
    yAxisTickCount = 4,
    yAxisLabelFormatter,
    lineStrokeWidth = 1.5,
}: SparklineCellProps): JSX.Element {
    if (values.length === 0) {
        return <svg width={width} height={height} style={{ display: 'block' }} />;
    }

    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const median = calculateMedian(values);
    const stddev = calculateStandardDeviation(values);

    const max = displayedMax ?? rawMax;
    const min = displayedMin ?? rawMin;
    const range = max - min || 1;
    const yAxisWidth = showYAxisTicks ? 50 : 0;
    const chartLeft = yAxisWidth;
    const chartRight = width;
    const topPadding = showYAxisTicks ? 6 : 2;
    const bottomPadding = showYAxisTicks ? 6 : 2;
    const chartTop = topPadding;
    const chartBottom = height - bottomPadding;
    const chartWidth = Math.max(1, chartRight - chartLeft);
    const chartHeight = Math.max(1, chartBottom - chartTop);
    const horizontalDivisor = Math.max(1, values.length - 1);
    const normalizedTickCount = Math.max(2, yAxisTickCount);

    const points = values
        .map((v, i) => {
            const x = chartLeft + (i / horizontalDivisor) * chartWidth;
            const y = chartBottom - ((v - min) / range) * chartHeight;
            return `${x},${y}`;
        })
        .join(' ');

    const maxLabel = formatSparklineLabelValue(rawMax, formatValue);
    const minLabel = formatSparklineLabelValue(rawMin, formatValue);
    const medianLabel = formatSparklineLabelValue(median, formatValue);
    const stddevLabel = formatSparklineLabelValue(stddev, formatValue);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width={width} height={height} style={{ display: 'block' }}>
                {showYAxisTicks &&
                    Array.from({ length: normalizedTickCount }).map((_, index) => {
                        const ratio = index / (normalizedTickCount - 1);
                        const tickValue = max - ratio * range;
                        const tickY = chartTop + ratio * chartHeight;
                        const tickLabel = formatSparklineLabelValue(tickValue, yAxisLabelFormatter || formatValue);

                        return (
                            <g key={`sparkline-y-tick-${index}`}>
                                <line
                                    x1={chartLeft}
                                    y1={tickY}
                                    x2={chartRight}
                                    y2={tickY}
                                    stroke="var(--vscode-editorGroup-border)"
                                    strokeWidth="1"
                                    opacity="0.35"
                                />
                                <text
                                    x={chartLeft - 4}
                                    y={tickY + 3}
                                    textAnchor="end"
                                    fontSize="9"
                                    fill="var(--vscode-descriptionForeground)"
                                >
                                    {tickLabel}
                                </text>
                            </g>
                        );
                    })}
                {values.length >= 2 && (
                    <polyline
                        points={points}
                        fill="none"
                        stroke="var(--vscode-charts-blue)"
                        strokeWidth={lineStrokeWidth}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                )}
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.2 }}>
                <span style={{ fontSize: '10px', color: 'var(--vscode-foreground)', whiteSpace: 'nowrap' }}>
                    Max {maxLabel}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', whiteSpace: 'nowrap' }}>
                    Min {minLabel}
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.2 }}>
                <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', whiteSpace: 'nowrap' }}>
                    Median {medianLabel}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', whiteSpace: 'nowrap' }}>
                    Std Dev {stddevLabel}
                </span>
            </div>
        </div>
    );
}
