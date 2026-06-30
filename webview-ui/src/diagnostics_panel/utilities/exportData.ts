// Copyright (C) Microsoft Corporation.  All rights reserved.

import { DiagnosticsExportFormat } from '../exporters/TableCsvExporter';
import { vscode } from './vscode';

export type ExportDataRequestMessage = {
    type: 'export-data';
    format: DiagnosticsExportFormat;
    mimeType: string;
    suggestedFileName: string;
    content: string;
};

export function sendExportDataRequest(message: Omit<ExportDataRequestMessage, 'type'>): void {
    vscode.postMessage({
        type: 'export-data',
        ...message,
    });
}
