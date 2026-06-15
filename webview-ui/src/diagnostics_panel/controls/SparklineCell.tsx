// Copyright (C) Microsoft Corporation.  All rights reserved.

type SparklineCellProps = {
    values: number[];
    width?: number;
    height?: number;
    formatValue?: (value: number) => string;
    displayedMin?: number;
    displayedMax?: number;
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

    const points = values
        .map((v, i) => {
            const x = (i / (values.length - 1)) * width;
            const y = height - ((v - min) / range) * (height - 4) - 2;
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
                {values.length >= 2 && (
                    <polyline
                        points={points}
                        fill="none"
                        stroke="var(--vscode-charts-blue)"
                        strokeWidth="1.5"
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
