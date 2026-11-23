import { describe, expect, it } from 'vitest'
import {
  archFieldNames, changedValues, displayValue, emptyValue, fieldFromError, missingRequired, relationalIds, searchableFields,
  textSearchDomain, toApiValue,
  type FieldInfo, type ResolvedView,
} from '../app/utils/engine'

const f = (type: FieldInfo['type'], extra: Partial<FieldInfo> = {}): FieldInfo => ({ type, string: type, required: false, readonly: false, ...extra })

const view: ResolvedView = {
  xmlId: null, model: 'res.users', type: 'list',
  arch: { tag: 'list', children: [
    { tag: 'field', attrs: { name: 'name' } },
    { tag: 'group', children: [{ tag: 'field', attrs: { name: 'login' } }, { tag: 'field', attrs: { name: 'company_id' } }] },
    { tag: 'field', attrs: { name: 'name' } },
  ] },
  fields: { name: f('char'), login: f('char'), company_id: f('many2one', { comodel: 'res.company' }) },
}

describe('arch helpers', () => {
  it('lists field names once, in document order', () => {
    expect(archFieldNames(view.arch)).toEqual(['name', 'login', 'company_id'])
  })
  it('searches char fields with an OR domain', () => {
    expect(searchableFields(view)).toEqual(['name', 'login'])
    expect(textSearchDomain(['name', 'login'], ' ann ')).toEqual(['|', ['name', 'ilike', 'ann'], ['login', 'ilike', 'ann']])
    expect(textSearchDomain(['name'], '   ')).toEqual([])
  })
})

describe('value conversion', () => {
  it('converts inputs to API values per type', () => {
    expect(toApiValue(f('integer'), '42.9')).toBe(42)
    expect(toApiValue(f('float'), '1.5')).toBe(1.5)
    expect(toApiValue(f('float'), 'abc')).toBeNull()
    expect(toApiValue(f('char'), '')).toBeNull()
    expect(toApiValue(f('boolean'), '')).toBe(false)
    expect(toApiValue(f('many2many'), ['3', 4])).toEqual([3, 4])
    expect(toApiValue(f('date'), '2026-11-23T10:00')).toBe('2026-11-23')
  })
  it('sends only writable changed fields', () => {
    const fields = { a: f('char'), b: f('integer'), c: f('char', { readonly: true }), d: f('one2many'), e: f('float', { relatedOrComputed: true }) }
    expect(changedValues(fields, { a: 'x', b: 1, c: 'r' }, { a: 'x', b: '2', c: 'changed', d: [9], e: 3 })).toEqual({ b: 2 })
    expect(changedValues({ a: f('char') }, {}, { a: '' })).toEqual({})
    expect(emptyValue(f('many2many'))).toEqual([])
  })
})

describe('display', () => {
  it('formats values for lists', () => {
    const names = new Map([[1, 'Main'], [2, 'Branch']])
    expect(displayValue(f('many2one'), 1, names)).toBe('Main')
    expect(displayValue(f('many2one'), 7, names)).toBe('#7')
    expect(displayValue(f('many2many'), [1, 2], names)).toBe('Main, Branch')
    expect(displayValue(f('boolean'), false)).toBe('No')
    expect(displayValue(f('char'), false)).toBe('')
    expect(displayValue(f('selection', { selection: [['d', 'Draft']] }), 'd')).toBe('Draft')
    expect(displayValue(f('float'), 1234.5)).toBe('1,234.5')
  })
  it('collects relational ids per comodel', () => {
    const ids = relationalIds(view.fields, [{ company_id: 1 }, { company_id: 2 }, { company_id: null }])
    expect([...ids.get('res.company')!]).toEqual([1, 2])
  })
})

describe('form validation helpers', () => {
  const fields = {
    name: f('char', { required: true, string: 'Name' }),
    login: f('char', { required: true, string: 'Login' }),
    active: f('boolean', { required: true }),
    total: f('float', { required: true, readonly: true }),
  }
  it('finds empty required writable fields', () => {
    expect(missingRequired(fields, { name: ' x', login: '' })).toEqual(['login'])
  })
  it('maps engine error messages to fields', () => {
    expect(fieldFromError(fields, 'Duplicate value for a unique field (login)')).toBe('login')
    expect(fieldFromError(fields, "Field 'Name' is required")).toBe('name')
    expect(fieldFromError(fields, "Field 'res.users.login' is read-only for you")).toBe('login')
    expect(fieldFromError(fields, 'Something else')).toBeNull()
  })
})
