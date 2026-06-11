export interface MysqlConnectionTarget {
    connectionId: string
    connectionName: string
    host: string
    port: number
    defaultDatabase?: string
}
