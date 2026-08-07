// Copyright (C) Microsoft Corporation.  All rights reserved.

import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import { YAxisStyle } from '../StatisticResolver';

type YAxisStyleDropdownProps = {
    value: YAxisStyle;
    onChange: (value: YAxisStyle) => void;
};

const Y_AXIS_STYLE_LABELS: Record<YAxisStyle, string> = {
    [YAxisStyle.Linear]: 'Linear',
    [YAxisStyle.SquareRoot]: 'Square Root',
    [YAxisStyle.Pow]: 'Power',
    [YAxisStyle.Logarithmic]: 'Logarithmic',
    [YAxisStyle.SymLog]: 'Symmetric Logarithmic',
    [YAxisStyle.Time]: 'Time',
    [YAxisStyle.UTC]: 'UTC',
};

export default function YAxisStyleDropdown({ value, onChange }: YAxisStyleDropdownProps) {
    return (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span>Y Axis Scale</span>
            <VSCodeDropdown
                value={value}
                onChange={event => {
                    const selectedValue = (event.target as HTMLSelectElement).value as YAxisStyle;
                    if (Object.values(YAxisStyle).includes(selectedValue)) {
                        onChange(selectedValue);
                    }
                }}
            >
                {Object.values(YAxisStyle).map(style => (
                    <VSCodeOption key={style} value={style}>
                        {Y_AXIS_STYLE_LABELS[style]}
                    </VSCodeOption>
                ))}
            </VSCodeDropdown>
        </label>
    );
}
