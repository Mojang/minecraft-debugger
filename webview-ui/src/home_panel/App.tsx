// Copyright (C) Microsoft Corporation.  All rights reserved.

import { VSCodeButton, VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';
import { useCallback } from 'react';

function App() {
    const vscode = acquireVsCodeApi();
    const css = { width: '100%' };

    const showDiagnosticPanelButtonClick = () => {
        vscode.postMessage({ type: 'show-diagnostics' });
    };

    const openDiagnosticFileButtonClick = () => {
        vscode.postMessage({ type: 'open-diagnostics-report' });
    };

    const checkboxChanged = useCallback((e: any) => {
        if (e.currentTarget.checked) {
            vscode.postMessage({ type: 'start-diagnostics-recording' });
        } else {
            vscode.postMessage({ type: 'stop-diagnostics-recording' });
        }
    }, []);

    return (
        <main>
            <VSCodeButton style={css} onClick={showDiagnosticPanelButtonClick}>
                Show Diagnostics
            </VSCodeButton>
            <br />
            <br />
            <VSCodeButton style={css} onClick={openDiagnosticFileButtonClick}>
                Open Diagnostics Report
            </VSCodeButton>
            <br />
            <br />
            <VSCodeCheckbox style={css} onChange={checkboxChanged}>
                Record Diagnostics Report
            </VSCodeCheckbox>
        </main>
    );
}

export default App;
