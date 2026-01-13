/**
 * Harmon Store - SQLite persistence layer
 */
export interface Database {
}
export declare function createStore(dbPath: string): Database;
export declare function migrate(db: Database): void;
//# sourceMappingURL=index.d.ts.map