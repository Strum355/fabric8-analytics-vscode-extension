import * as vscode from 'vscode';
import { Titles } from './constants';

export class LLMAnalysisReportPanel {
  public static currentPanel: LLMAnalysisReportPanel | undefined;

  private static readonly viewType = 'llmReport';

  private readonly _panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  private constructor(context: vscode.ExtensionContext, column?: vscode.ViewColumn) {
    this.context = context;
    this._panel = vscode.window.createWebviewPanel(
      LLMAnalysisReportPanel.viewType,
      Titles.LLM_REPORT_TITLE,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
      }
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'fetchModelCard':
            try {
              const response = await fetch(`https://exhort.stage.devshift.net/api/v4/model-cards/${message.modelID}`);
              if (!response.ok) {
                this._panel.webview.postMessage({
                  command: 'modelCardResponse',
                  requestId: message.requestId,
                  success: false,
                  error: `HTTP ${response.status}: ${response.statusText}`
                });
                return;
              }
              const data = await response.json();
              this._panel.webview.postMessage({
                command: 'modelCardResponse',
                requestId: message.requestId,
                success: true,
                data
              });
            } catch (error) {
              this._panel.webview.postMessage({
                command: 'modelCardResponse',
                requestId: message.requestId,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public static createOrShowPanel(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor ?
      vscode.window.activeTextEditor.viewColumn : undefined;

    if (LLMAnalysisReportPanel.currentPanel) {
      if (LLMAnalysisReportPanel.currentPanel._panel.visible) {
        // LLMAnalysisReportPanel.currentPanel.update();
      } else {
        LLMAnalysisReportPanel.currentPanel._panel?.reveal(column);
      }
      // dispose?
      return;
    }

    LLMAnalysisReportPanel.currentPanel = new LLMAnalysisReportPanel(context, column);
  }



  public async updatePanel(modelID: string) {
    const scriptSrc = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'react.js'));

    this._panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <link
              rel="stylesheet"
              href="https://unpkg.com/@patternfly/patternfly@6/patternfly.css"
            />
            <link
              rel="stylesheet"
              href="https://unpkg.com/@patternfly/patternfly@6/patternfly-addons.css"
            />
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root" model-id="${modelID}"></div>
            <script src="${scriptSrc}"></script>
          </body>
        </html>
        `;
  }

  private dispose() {
    LLMAnalysisReportPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}