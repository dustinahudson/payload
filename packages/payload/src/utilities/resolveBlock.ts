import type { Block, BlocksField } from '../fields/config/types.js'
import type { BasePayload } from '../index.js'

export interface ResolveBlockArgs {
  blockType: string
  field: BlocksField
  payload: BasePayload
}

/**
 * Resolves a block configuration at runtime by checking inline blocks first,
 * then global blocks if the field has blockReferences configured.
 *
 * @param blockType - The slug of the block to resolve
 * @param field - The BlocksField configuration
 * @param payload - The Payload instance
 * @returns The resolved Block configuration, or undefined if not found
 */
export function resolveBlock({ blockType, field, payload }: ResolveBlockArgs): Block | undefined {
  // 1. Check inline blocks first (precedence)
  const inlineBlock = field.blocks.find((b) => b.slug === blockType)
  if (inlineBlock) {
    return inlineBlock
  }

  // 2. Check if blockReferences allows this block
  if (field.blockReferences === 'GlobalBlocks') {
    return payload.config.blocks?.find((b) => b.slug === blockType)
  }

  if (Array.isArray(field.blockReferences)) {
    for (const ref of field.blockReferences) {
      if (typeof ref === 'string') {
        // String reference - look up in global blocks
        if (ref === blockType) {
          return payload.config.blocks?.find((b) => b.slug === blockType)
        }
      } else {
        // Inline block object in blockReferences
        if (ref.slug === blockType) {
          return ref
        }
      }
    }
  }

  return undefined
}

export interface GetBlocksForFieldArgs {
  field: BlocksField
  payload: BasePayload
}

/**
 * Gets all blocks available for a BlocksField, including inline blocks and
 * blocks from blockReferences. Inline blocks take precedence over global blocks
 * with the same slug.
 *
 * @param field - The BlocksField configuration
 * @param payload - The Payload instance
 * @returns Array of all available blocks (Block | string)
 */
export function getBlocksForField({ field, payload }: GetBlocksForFieldArgs): (Block | string)[] {
  if (!field.blockReferences) {
    return field.blocks
  }

  if (field.blockReferences === 'GlobalBlocks') {
    // Include all global blocks plus inline blocks (inline blocks have precedence)
    const inlineSlugs = new Set(field.blocks.map((b) => b.slug))
    const result: (Block | string)[] = [...field.blocks]

    const globalBlocks = payload.config.blocks || []
    for (const globalBlock of globalBlocks) {
      if (!inlineSlugs.has(globalBlock.slug)) {
        result.push(globalBlock)
      }
    }

    return result
  }

  // blockReferences is an array
  const inlineSlugs = new Set(field.blocks.map((b) => b.slug))
  const result: (Block | string)[] = [...field.blocks]

  for (const ref of field.blockReferences) {
    const slug = typeof ref === 'string' ? ref : ref.slug
    if (!inlineSlugs.has(slug)) {
      result.push(ref)
    }
  }

  return result
}
