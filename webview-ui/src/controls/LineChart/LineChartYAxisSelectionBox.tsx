// Copyright (C) Microsoft Corporation.  All rights reserved.

import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import { useCallback, useMemo, useState } from 'react';
import { YAxisType } from '../../StatisticResolver';

type LineChartYAxisSelectionBoxProps = {
    onChange: (selectedResolver: YAxisType) => void;
    defaultValue: YAxisType;
};

export default function LineChartYAxisSelectionBox({ onChange, defaultValue }: LineChartYAxisSelectionBoxProps) {
    // state
    const [selectedResolver, setSelectedResolver] = useState<YAxisType>(defaultValue);

    // memo
    const options = useMemo(() => Object.values(YAxisType), []);

    const _onChange = useCallback((e: Event | React.FormEvent<HTMLElement>): void => {
        const selectedOption = (e.target as HTMLSelectElement).value as YAxisType;

        onChange(selectedOption);
        setSelectedResolver(selectedOption);
    }, []);

    return (
        <div className="dropdown-container">
            <label htmlFor="my-dropdown">Y Axis Style</label>
            <VSCodeDropdown id="my-dropdown" onChange={_onChange}>
                {options.map(option => {
                    return (
                        <VSCodeOption key={option} selected={selectedResolver === option}>
                            {option}
                        </VSCodeOption>
                    );
                })}
            </VSCodeDropdown>
        </div>
    );
}
