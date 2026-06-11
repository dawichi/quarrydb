import type { RecentItem } from '@quarrydb/shared/recent-item'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MysqlConnectionProfile } from '../providers/mysql-connection-profile'
import { RecentItemsService } from './recent-items.service'

let storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => {
        storage = new Map()
    },
})

let service: RecentItemsService

beforeEach(() => {
    storage.clear()
    service = new RecentItemsService()
})

function sqliteItem(path: string, openedAt = 123): RecentItem {
    return service.createSqliteItem(path, openedAt)
}

function mysqlProfile(overrides: Partial<MysqlConnectionProfile> = {}): MysqlConnectionProfile {
    return {
        id: 'mysql-profile-1',
        name: 'Analytics',
        host: 'db.internal',
        port: 3306,
        username: 'quarry',
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    }
}

describe('load', () => {
    it('returns an empty array when nothing has been stored', () => {
        expect(service.load()).toEqual([])
    })

    it('falls back to an empty array on corrupt storage', () => {
        localStorage.setItem('quarry_recent_items', '{not json')
        expect(service.load()).toEqual([])
    })

    it('migrates legacy recent files into provider-aware recent items', () => {
        localStorage.setItem(
            'quarry_recent_files',
            JSON.stringify([{ path: '/tmp/demo.db', name: 'demo.db', openedAt: 99 }]),
        )

        expect(service.load()).toEqual([
            {
                id: 'sqlite:/tmp/demo.db',
                providerId: 'sqlite',
                label: 'demo.db',
                subtitle: '/tmp/demo.db',
                openedAt: 99,
                resource: { path: '/tmp/demo.db' },
            },
        ])
        expect(localStorage.getItem('quarry_recent_items')).toContain('sqlite:/tmp/demo.db')
        expect(localStorage.getItem('quarry_recent_files')).toBeNull()
    })
})

describe('add', () => {
    it('adds a recent item and dedupes by item id', () => {
        service.add(sqliteItem('/tmp/a.db', 10))
        service.add(sqliteItem('/tmp/b.db', 20))
        service.add(sqliteItem('/tmp/a.db', 30))

        expect(service.load()).toEqual([sqliteItem('/tmp/a.db', 30), sqliteItem('/tmp/b.db', 20)])
    })

    it('caps the stored list at 8 entries', () => {
        for (let i = 0; i < 10; i++) {
            service.add(sqliteItem(`/tmp/${i}.db`, i))
        }

        expect(service.load()).toHaveLength(8)
        expect(service.load()[0].id).toBe('sqlite:/tmp/9.db')
        expect(service.load().at(-1)?.id).toBe('sqlite:/tmp/2.db')
    })
})

describe('remove', () => {
    it('removes a recent item by id', () => {
        service.add(sqliteItem('/tmp/a.db'))
        service.add(sqliteItem('/tmp/b.db'))

        service.remove('sqlite:/tmp/a.db')

        expect(service.load()).toEqual([sqliteItem('/tmp/b.db')])
    })
})

describe('createMysqlItem', () => {
    it('builds a provider-aware MySQL recent item from connection metadata', () => {
        expect(service.createMysqlItem(mysqlProfile({ defaultDatabase: 'warehouse' }), 456)).toEqual({
            id: 'mysql:mysql-profile-1',
            providerId: 'mysql',
            label: 'Analytics',
            subtitle: 'db.internal:3306',
            openedAt: 456,
            resource: {
                connectionId: 'mysql-profile-1',
                host: 'db.internal',
                port: 3306,
                defaultDatabase: 'warehouse',
            },
        })
    })
})
