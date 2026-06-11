import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MysqlConnectionProfilesService } from './mysql-connection-profiles.service'

let storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => {
        storage = new Map()
    },
})

const randomUUID = vi.fn(() => 'mysql-profile-1')
vi.stubGlobal('crypto', {
    randomUUID,
})

describe('MysqlConnectionProfilesService', () => {
    let service: MysqlConnectionProfilesService

    beforeEach(() => {
        storage.clear()
        randomUUID.mockClear()
        randomUUID.mockReturnValue('mysql-profile-1')
        service = new MysqlConnectionProfilesService()
    })

    it('returns an empty array when nothing has been stored', () => {
        expect(service.load()).toEqual([])
    })

    it('falls back to an empty array on corrupt storage', () => {
        localStorage.setItem('quarry_mysql_connection_profiles', '{not json')

        expect(service.load()).toEqual([])
    })

    it('creates a stored profile from a draft', () => {
        expect(
            service.create(
                {
                    name: 'Analytics',
                    host: 'db.internal',
                    port: 3306,
                    username: 'quarry',
                    defaultDatabase: 'warehouse',
                    color: '#0ea5e9',
                    sslMode: 'required',
                },
                1234,
            ),
        ).toEqual({
            id: 'mysql-profile-1',
            name: 'Analytics',
            host: 'db.internal',
            port: 3306,
            username: 'quarry',
            defaultDatabase: 'warehouse',
            color: '#0ea5e9',
            sslMode: 'required',
            createdAt: 1234,
            updatedAt: 1234,
        })
    })

    it('upserts profiles by id and keeps the newest copy first', () => {
        service.upsert({
            id: 'a',
            name: 'Main',
            host: 'localhost',
            port: 3306,
            username: 'root',
            createdAt: 1,
            updatedAt: 1,
        })
        service.upsert({
            id: 'b',
            name: 'Replica',
            host: 'replica.internal',
            port: 3307,
            username: 'reader',
            createdAt: 2,
            updatedAt: 2,
        })
        service.upsert({
            id: 'a',
            name: 'Main Updated',
            host: 'localhost',
            port: 3306,
            username: 'root',
            createdAt: 1,
            updatedAt: 3,
        })

        expect(service.load()).toEqual([
            {
                id: 'a',
                name: 'Main Updated',
                host: 'localhost',
                port: 3306,
                username: 'root',
                createdAt: 1,
                updatedAt: 3,
            },
            {
                id: 'b',
                name: 'Replica',
                host: 'replica.internal',
                port: 3307,
                username: 'reader',
                createdAt: 2,
                updatedAt: 2,
            },
        ])
    })

    it('finds a profile by id', () => {
        service.upsert({
            id: 'a',
            name: 'Main',
            host: 'localhost',
            port: 3306,
            username: 'root',
            createdAt: 1,
            updatedAt: 1,
        })

        expect(service.find('a')?.name).toBe('Main')
        expect(service.find('missing')).toBeNull()
    })

    it('removes a profile by id', () => {
        service.upsert({
            id: 'a',
            name: 'Main',
            host: 'localhost',
            port: 3306,
            username: 'root',
            createdAt: 1,
            updatedAt: 1,
        })
        service.upsert({
            id: 'b',
            name: 'Replica',
            host: 'replica.internal',
            port: 3307,
            username: 'reader',
            createdAt: 2,
            updatedAt: 2,
        })

        service.remove('a')

        expect(service.load()).toEqual([
            {
                id: 'b',
                name: 'Replica',
                host: 'replica.internal',
                port: 3307,
                username: 'reader',
                createdAt: 2,
                updatedAt: 2,
            },
        ])
    })
})
