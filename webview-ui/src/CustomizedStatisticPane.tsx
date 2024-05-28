import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';
import * as statPrefabs from './StatisticPrefabs';

type Options = {
    name: string;
};

// Note: Not used yet!
export default function CustomizedStatisticPane({ name }: Options) {
    return (
        <VSCodeDropdown>
            {Object.keys(statPrefabs).map(key => {
                return <VSCodeOption>key</VSCodeOption>;
            })}
        </VSCodeDropdown>
    );
}
