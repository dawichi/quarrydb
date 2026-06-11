export interface MysqlConnectionProfile {
    id: string
    name: string
    host: string
    port: number
    username: string
    defaultDatabase?: string
    color?: string
    sslMode?: 'disabled' | 'preferred' | 'required'
    createdAt: number
    updatedAt: number
}

export interface MysqlConnectionProfileDraft {
    name: string
    host: string
    port: number
    username: string
    defaultDatabase?: string
    color?: string
    sslMode?: 'disabled' | 'preferred' | 'required'
}
