import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

function App() {
    const vscode = acquireVsCodeApi();
    const css = { width: '100%' };

    const showDiagnosticPanelButtonClick = () => {
        vscode.postMessage({ type: 'show-diagnostics' });
    };

    return (
        <main>
            <VSCodeButton style={css} onClick={showDiagnosticPanelButtonClick}>
                Show Diagnostics
            </VSCodeButton>
        </main>
    );
}

export default App;
