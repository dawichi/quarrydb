export interface RedisConnectionTarget {
    connectionId: string
    connectionName: string
    host: string
    port: number
    database: number
    username?: string
    tls: boolean
}
