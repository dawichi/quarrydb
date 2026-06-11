import { describe, expect, it } from 'vitest'
import { createMysqlConnectRequest } from './mysql-connect-request'

describe('mysql connect request helpers', () => {
    it('builds a backend-facing request from a saved profile', () => {
        expect(
            createMysqlConnectRequest(
                {
                    id: 'mysql-1',
                    name: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    username: 'quarry',
                    password: 'secret',
                    defaultDatabase: 'warehouse',
                    sslMode: 'required',
                    createdAt: 1,
                    updatedAt: 1,
                },
                'saved_profile',
            ),
        ).toEqual({
            target: {
                connectionId: 'mysql-1',
                connectionName: 'Analytics',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
            username: 'quarry',
            password: 'secret',
            sslMode: 'required',
            source: 'saved_profile',
        })
    })
})
