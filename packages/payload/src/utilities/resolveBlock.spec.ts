import type { Block, BlocksField } from '../fields/config/types.js'
import type { BasePayload } from '../index.js'

import { resolveBlock } from './resolveBlock.js'

describe('resolveBlock', () => {
  const mockBlock1: Block = {
    slug: 'block1',
    fields: [],
  }

  const mockBlock2: Block = {
    slug: 'block2',
    fields: [],
  }

  const mockBlock3: Block = {
    slug: 'block3',
    fields: [],
  }

  const mockPayload = {
    config: {
      blocks: [mockBlock2, mockBlock3],
    },
  } as unknown as BasePayload

  it('should resolve inline block with precedence', () => {
    const field: BlocksField = {
      type: 'blocks',
      blocks: [mockBlock1],
      blockReferences: 'GlobalBlocks',
    }

    const result = resolveBlock({
      blockType: 'block1',
      field,
      payload: mockPayload,
    })

    expect(result).toBe(mockBlock1)
  })

  it('should resolve global block when blockReferences is GlobalBlocks', () => {
    const field: BlocksField = {
      type: 'blocks',
      blocks: [],
      blockReferences: 'GlobalBlocks',
    }

    const result = resolveBlock({
      blockType: 'block2',
      field,
      payload: mockPayload,
    })

    expect(result).toBe(mockBlock2)
  })

  it('should resolve block from slug array', () => {
    const field: BlocksField = {
      type: 'blocks',
      blocks: [],
      blockReferences: ['block2', 'block3'],
    }

    const result = resolveBlock({
      blockType: 'block3',
      field,
      payload: mockPayload,
    })

    expect(result).toBe(mockBlock3)
  })

  it('should return null when block not found', () => {
    const field: BlocksField = {
      type: 'blocks',
      blocks: [],
      blockReferences: ['block2'],
    }

    const result = resolveBlock({
      blockType: 'nonexistent',
      field,
      payload: mockPayload,
    })

    expect(result).toBeNull()
  })

  it('should return null when blockReferences not configured', () => {
    const field: BlocksField = {
      type: 'blocks',
      blocks: [],
    }

    const result = resolveBlock({
      blockType: 'block2',
      field,
      payload: mockPayload,
    })

    expect(result).toBeNull()
  })

  it('should prioritize inline block over global block with same slug', () => {
    const inlineBlock2: Block = {
      slug: 'block2',
      fields: [{ type: 'text', name: 'customField' }],
    }

    const field: BlocksField = {
      type: 'blocks',
      blocks: [inlineBlock2],
      blockReferences: 'GlobalBlocks',
    }

    const result = resolveBlock({
      blockType: 'block2',
      field,
      payload: mockPayload,
    })

    expect(result).toBe(inlineBlock2)
    expect(result).not.toBe(mockBlock2)
  })

  it('should handle Block objects in blockReferences array', () => {
    const field: BlocksField = {
      type: 'blocks',
      blocks: [],
      blockReferences: [mockBlock2],
    }

    const result = resolveBlock({
      blockType: 'block2',
      field,
      payload: mockPayload,
    })

    expect(result).toBe(mockBlock2)
  })

  it('should return null when block not in allowed slug array', () => {
    const field: BlocksField = {
      type: 'blocks',
      blocks: [],
      blockReferences: ['block2'],
    }

    const result = resolveBlock({
      blockType: 'block3',
      field,
      payload: mockPayload,
    })

    expect(result).toBeNull()
  })
})
