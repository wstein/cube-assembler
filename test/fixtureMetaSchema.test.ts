import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'

const schemaUrl =
  'https://wstein.github.io/cube-assembler/schemas/fixture-meta-v1.schema.json'
const fixtureRoot = join(__dirname, 'fixtures')
const schemaFile = join(
  __dirname,
  '../public/schemas/fixture-meta-v1.schema.json',
)

describe('published fixture metadata schema', () => {
  it('validates every saved fixture and matches its published URL', () => {
    const schema = JSON.parse(readFileSync(schemaFile, 'utf8'))
    expect(schema.$id).toBe(schemaUrl)
    const validate = new Ajv2020({ allErrors: true }).compile(schema)
    for (const name of readdirSync(fixtureRoot)) {
      const file = join(fixtureRoot, name, 'meta.json')
      if (!existsSync(file)) continue
      const meta = JSON.parse(readFileSync(file, 'utf8'))
      expect((meta as { $schema?: string }).$schema, name).toBe(schemaUrl)
      expect(
        validate(meta),
        `${name}: ${JSON.stringify(validate.errors)}`,
      ).toBe(true)
    }
  })

  it('rejects broken face references and invalid color letters', () => {
    const schema = JSON.parse(readFileSync(schemaFile, 'utf8'))
    const validate = new Ajv2020().compile(schema)
    const meta = JSON.parse(
      readFileSync(
        join(fixtureRoot, 'synthetic-sanity-check', 'meta.json'),
        'utf8',
      ),
    )
    expect(
      validate({ ...meta, colorsURFDLB: 'XXXX RRRR GGGG YYYY OOOO BBBB' }),
    ).toBe(false)
    expect(
      validate({
        ...meta,
        faces: { ...meta.faces, u: { photo: '../secret.jpg' } },
      }),
    ).toBe(false)
  })

  it('accepts every cube size from 2 to 15 with size-squared facelet blocks', () => {
    const schema = JSON.parse(readFileSync(schemaFile, 'utf8'))
    const validate = new Ajv2020().compile(schema)
    const meta = JSON.parse(
      readFileSync(
        join(fixtureRoot, 'synthetic-sanity-check', 'meta.json'),
        'utf8',
      ),
    )
    const sized = (size: number, count = size * size) => {
      const block = 'W'.repeat(count)
      return {
        ...meta,
        gridSize: size,
        colorsURFDLB: Array(6).fill(block).join(' '),
        detectedURFDLB: Array(6).fill(block).join(' '),
      }
    }
    for (let size = 2; size <= 15; size++) {
      expect(validate(sized(size)), 'size ' + size).toBe(true)
    }
  })

  it('rejects sizes and facelet blocks outside 2 to 15', () => {
    const schema = JSON.parse(readFileSync(schemaFile, 'utf8'))
    const validate = new Ajv2020().compile(schema)
    const meta = JSON.parse(
      readFileSync(
        join(fixtureRoot, 'synthetic-sanity-check', 'meta.json'),
        'utf8',
      ),
    )
    const block = (count: number) => Array(6).fill('W'.repeat(count)).join(' ')
    expect(validate({ ...meta, gridSize: 16 })).toBe(false)
    expect(validate({ ...meta, gridSize: 1 })).toBe(false)
    expect(validate({ ...meta, gridSize: 15.5 })).toBe(false)
    expect(validate({ ...meta, gridSize: 15, colorsURFDLB: block(225) })).toBe(
      true,
    )
    expect(validate({ ...meta, gridSize: 15, colorsURFDLB: block(226) })).toBe(
      false,
    )
    expect(validate({ ...meta, colorsURFDLB: block(3) })).toBe(false)
  })
})
