import { StatisticPrefab } from './StatisticPrefab';

export function generateRowsFromStatsPrefabs(statsPrefabs: StatisticPrefab[][]): JSX.Element {
    return (
        <div>
            {statsPrefabs.map((statPrefabRow: StatisticPrefab[]) => (
                <div style={{ flexDirection: 'row', display: 'flex' }}>
                    {statPrefabRow.map(statPrefab => statPrefab.reactNode)}
                </div>
            ))}
        </div>
    );
}
