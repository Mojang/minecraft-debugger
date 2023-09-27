import * as vscode from 'vscode';

export class StatTreeItem extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		id: string | undefined
	) {
		super(label, collapsibleState);        
		this.id = id; // provide base a stable id because label can change
	}
}

interface StatData {
	id: string;
	parent_id: string;
	type: string;
	label: string;
	value: string;
}

export class StatsProvider implements vscode.TreeDataProvider<StatTreeItem> {
		
	public static readonly viewId = 'MinecraftStatsTreeDataProvider';

	private _onDidChangeTreeData: vscode.EventEmitter<StatTreeItem | undefined | void> = new vscode.EventEmitter<StatTreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<StatTreeItem | undefined | void> = this._onDidChangeTreeData.event;

	private readonly _rootKey: string = "__root__";
	private _statMap: Map<string, Array<StatData>> = new Map<string, Array<StatData>>();

	// from TreeDataProvider interface
	public getTreeItem(element: StatTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	// from TreeDataProvider interface
	public getChildren(element?: StatTreeItem | undefined): vscode.ProviderResult<StatTreeItem[]> {
		const statTreeItems: StatTreeItem[] = [];
		if (this._statMap) {
			if (element == null) {
				let rootStats = this._statMap.get(this._rootKey);
				if (rootStats) {
					rootStats.forEach((stat: StatData) => {
						const label = this._toStatLabel(stat);
						statTreeItems.push(new StatTreeItem(label, this._collapsibleState(stat), stat.id));
					});
				}
			}
			else {
				let childStats = this._statMap.get(element.id||"");
				if (childStats) {
					childStats.forEach((stat: StatData) => {
						const label = this._toStatLabel(stat);
						statTreeItems.push(new StatTreeItem(label, this._collapsibleState(stat), stat.id));
					});
				}
			}
		}
		return Promise.resolve(statTreeItems);
	}

	public setStats(stats: any) {
		this._statMap.clear();
		stats?.forEach((stat: StatData) => {
			if (!stat.parent_id) {
				if (!this._statMap.has(this._rootKey)) {
					this._statMap.set(this._rootKey, []);
				}
				let rootStats = this._statMap.get(this._rootKey);
				rootStats?.push(stat);
			}
			else {
				if (!this._statMap.has(stat.parent_id)) {
					this._statMap.set(stat.parent_id, []);
				}
				let parentStats = this._statMap.get(stat.parent_id);
				parentStats?.push(stat);
			}
		});
		this._onDidChangeTreeData.fire();
	}

	private _toStatLabel(stat: StatData): string {
		if (stat.type === "memory_size" && stat.value) {
			let intVal = 0;
			if (typeof stat.value === 'string') {
				intVal = parseInt(stat.value, 10);
			}
			return (stat.label || "") + ": " + ((intVal || 0) / 1000).toFixed(2) + "  KB"; // show in KB (todo: add user option to display as MB)
		}
		return (stat.label || "") + (stat.value || "");
	}

	private _collapsibleState(stat: StatData): vscode.TreeItemCollapsibleState {
		return this._statMap.has(stat.id) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
	}
}
