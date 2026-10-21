// Copyright (C) Microsoft Corporation.  All rights reserved.

export function matchesTableSearch(query: string, cells: string[]): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    return cells.some(cell => cell.toLowerCase().includes(normalizedQuery));
}
