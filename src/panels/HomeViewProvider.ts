import * as vscode from 'vscode';
import { getNonce } from '../utilities/getNonce';
import { getUri } from '../utilities/getUri';

export class HomeViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'minecraft-debugger-home-panel';

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, this._extensionUri);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'show-diagnostics': {
                    vscode.commands.executeCommand('minecraft-debugger.showMinecraftDiagnostics');
                    break;
                }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
        // The JS file from the React build output
        const scriptUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'homePanel.js']);

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Minecraft Home</title>
            </head>
            <body>
                <div id="root"></div>
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
