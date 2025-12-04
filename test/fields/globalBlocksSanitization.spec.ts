import type { Payload } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import { initPayloadInt } from '../helpers/initPayloadInt.js'

let payload: Payload

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

describe('Global Blocks Sanitization', () => {
  beforeAll(async () => {
    process.env.SEED_IN_CONFIG_ONINIT = 'false'
    const result = await initPayloadInt(dirname)
    payload = result.payload
  })

  afterAll(async () => {
    await payload.destroy()
  })

  it('should sanitize global blocks with _sanitized flag, labels, and baseBlockFields', () => {
    // Verify that config.blocks are properly sanitized
    const globalBlocks = payload.config.blocks

    expect(globalBlocks).toBeDefined()
    expect(globalBlocks.length).toBeGreaterThan(0)

    // Check each global block for proper sanitization
    globalBlocks.forEach((block) => {
      // Verify _sanitized flag is set
      expect(block._sanitized).toBe(true)

      // Verify labels are generated
      expect(block.labels).toBeDefined()
      expect(block.labels.singular).toBeDefined()
      expect(block.labels.plural).toBeDefined()

      // Verify baseBlockFields are included (blockType and blockName)
      const fieldNames = block.fields.map((field) => field.name)
      expect(fieldNames).toContain('blockType')
      expect(fieldNames).toContain('blockName')
    })
  })

  it('should have sanitized the ConfigBlockTest block', () => {
    const configBlock = payload.config.blocks.find((b) => b.slug === 'ConfigBlockTest')

    expect(configBlock).toBeDefined()
    expect(configBlock._sanitized).toBe(true)
    expect(configBlock.labels).toBeDefined()
    expect(configBlock.labels.singular).toBe('Config Block Test')
    expect(configBlock.labels.plural).toBe('Config Block Tests')

    const fieldNames = configBlock.fields.map((field) => field.name)
    expect(fieldNames).toContain('deduplicatedText')
    expect(fieldNames).toContain('blockType')
    expect(fieldNames).toContain('blockName')
  })

  it('should have sanitized the globalBlockWithValidation block', () => {
    const validationBlock = payload.config.blocks.find(
      (b) => b.slug === 'globalBlockWithValidation',
    )

    expect(validationBlock).toBeDefined()
    expect(validationBlock._sanitized).toBe(true)
    expect(validationBlock.labels).toBeDefined()

    const fieldNames = validationBlock.fields.map((field) => field.name)
    expect(fieldNames).toContain('validatedText')
    expect(fieldNames).toContain('blockType')
    expect(fieldNames).toContain('blockName')

    // Verify the validation function is preserved
    const validatedTextField = validationBlock.fields.find((f) => f.name === 'validatedText')
    expect(validatedTextField).toBeDefined()
    expect(validatedTextField.required).toBe(true)
    expect(validatedTextField.validate).toBeDefined()
  })
})
