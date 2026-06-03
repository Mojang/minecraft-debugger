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
        </div>
    );
}
