// Copyright (C) Microsoft Corporation.  All rights reserved.

export type CsvCellValue = string | number;

export type CsvExportRow = Record<string, CsvCellValue>;

export type DiagnosticsExportFormat = 'csv';

export interface CsvExporter {
    readonly format: 'csv';
    readonly fileExtension: string;
    readonly mimeType: string;
    exportRows<THeader extends string>(headers: readonly THeader[], rows: Array<Record<THeader, CsvCellValue>>): string;
}

function escapeCsvValue(value: string | number): string {
    const serialized = String(value);

    if (!/[",\n\r]/.test(serialized)) {
        return serialized;
    }

    return `"${serialized.replace(/"/g, '""')}"`;
}

function toCsvRow(values: readonly (string | number)[]): string {
    return values.map(escapeCsvValue).join(',');
}

export class TableCsvExporter implements CsvExporter {
    public readonly format = 'csv' as const;

    public readonly fileExtension = 'csv';

    public readonly mimeType = 'text/csv';

    public exportRows<THeader extends string>(
        headers: readonly THeader[],
        rows: Array<Record<THeader, CsvCellValue>>,
    ): string {
        const csvLines: string[] = [toCsvRow(headers)];

        rows.forEach(row => {
            const values = headers.map(header => row[header] ?? '');
            csvLines.push(toCsvRow(values));
        });

        return csvLines.join('\n');
    }
}
