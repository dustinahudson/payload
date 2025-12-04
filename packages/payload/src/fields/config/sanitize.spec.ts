import type { Config } from '../../config/types.js'
import type {
  ArrayField,
  Block,
  BlocksField,
  CheckboxField,
  Field,
  NumberField,
  TextField,
} from './types.js'

import {
  DuplicateFieldName,
  InvalidConfiguration,
  InvalidFieldName,
  InvalidFieldRelationship,
  MissingFieldType,
} from '../../errors/index.js'
import { sanitizeFields } from './sanitize.js'
import { CollectionConfig } from '../../index.js'

describe('sanitizeFields', () => {
  const config = {} as Config
  const collectionConfig = {} as CollectionConfig

  it('should throw on missing type field', async () => {
    const fields: Field[] = [
      // @ts-expect-error
      {
        name: 'Some Collection',
        label: 'some-collection',
      },
    ]

    await expect(async () => {
      await sanitizeFields({
        config,
        collectionConfig,
        fields,
        parentIsLocalized: false,
        validRelationships: [],
      })
    }).rejects.toThrow(MissingFieldType)
  })

  it('should throw on invalid field name', async () => {
    const fields: Field[] = [
      {
        name: 'some.collection',
        type: 'text',
        label: 'some.collection',
      },
    ]

    await expect(async () => {
      await sanitizeFields({
        config,
        collectionConfig,
        fields,
        parentIsLocalized: false,
        validRelationships: [],
      })
    }).rejects.toThrow(InvalidFieldName)
  })

  it('should throw on duplicate field name', async () => {
    const fields: Field[] = [
      {
        name: 'someField',
        type: 'text',
        label: 'someField',
      },
      {
        name: 'someField',
        type: 'text',
        label: 'someField',
      },
    ]

    await expect(async () => {
      await sanitizeFields({
        config,
        collectionConfig,
        fields,
        parentIsLocalized: false,
        validRelationships: [],
      })
    }).rejects.toThrow(DuplicateFieldName)
  })

  it('should throw on duplicate block slug', async () => {
    const fields: Field[] = [
      {
        name: 'blocks',
        type: 'blocks',
        blocks: [
          {
            slug: 'block',
            fields: [
              {
                name: 'blockField',
                type: 'text',
              },
            ],
          },
          {
            slug: 'block',
            fields: [
              {
                name: 'blockField',
                type: 'text',
              },
            ],
          },
        ],
      },
    ]

    await expect(async () => {
      await sanitizeFields({
        config,
        collectionConfig,
        fields,
        parentIsLocalized: false,
        validRelationships: [],
      })
    }).rejects.toThrow(DuplicateFieldName)
  })

  describe('auto-labeling', () => {
    it('should populate label if missing', async () => {
      const fields: Field[] = [
        {
          name: 'someField',
          type: 'text',
        },
      ]

      const sanitizedField = (
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        })
      )[0] as TextField

      expect(sanitizedField.name).toStrictEqual('someField')
      expect(sanitizedField.label).toStrictEqual('Some Field')
      expect(sanitizedField.type).toStrictEqual('text')
    })

    it('should allow auto-label override', async () => {
      const fields: Field[] = [
        {
          name: 'someField',
          type: 'text',
          label: 'Do not label',
        },
      ]

      const sanitizedField = (
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        })
      )[0] as TextField

      expect(sanitizedField.name).toStrictEqual('someField')
      expect(sanitizedField.label).toStrictEqual('Do not label')
      expect(sanitizedField.type).toStrictEqual('text')
    })

    describe('opt-out', () => {
      it('should allow label opt-out', async () => {
        const fields: Field[] = [
          {
            name: 'someField',
            type: 'text',
            label: false,
          },
        ]

        const sanitizedField = (
          await sanitizeFields({
            config,
            collectionConfig,
            fields,
            parentIsLocalized: false,
            validRelationships: [],
          })
        )[0] as TextField

        expect(sanitizedField.name).toStrictEqual('someField')
        expect(sanitizedField.label).toStrictEqual(false)
        expect(sanitizedField.type).toStrictEqual('text')
      })

      it('should allow label opt-out for arrays', async () => {
        const arrayField: ArrayField = {
          name: 'items',
          type: 'array',
          fields: [
            {
              name: 'itemName',
              type: 'text',
            },
          ],
          label: false,
        }

        const sanitizedField = (
          await sanitizeFields({
            config,
            collectionConfig,
            fields: [arrayField],
            parentIsLocalized: false,
            validRelationships: [],
          })
        )[0] as ArrayField

        expect(sanitizedField.name).toStrictEqual('items')
        expect(sanitizedField.label).toStrictEqual(false)
        expect(sanitizedField.type).toStrictEqual('array')
        expect(sanitizedField.labels).toBeUndefined()
      })

      it('should allow label opt-out for blocks', async () => {
        const fields: Field[] = [
          {
            name: 'noLabelBlock',
            type: 'blocks',
            blocks: [
              {
                slug: 'number',
                fields: [
                  {
                    name: 'testNumber',
                    type: 'number',
                  },
                ],
              },
            ],
            label: false,
          },
        ]

        const sanitizedField = (
          await sanitizeFields({
            config,
            collectionConfig,
            fields,
            parentIsLocalized: false,
            validRelationships: [],
          })
        )[0] as BlocksField

        expect(sanitizedField.name).toStrictEqual('noLabelBlock')
        expect(sanitizedField.label).toStrictEqual(false)
        expect(sanitizedField.type).toStrictEqual('blocks')
        expect(sanitizedField.labels).toBeUndefined()
      })
    })

    it('should label arrays with plural and singular', async () => {
      const fields: Field[] = [
        {
          name: 'items',
          type: 'array',
          fields: [
            {
              name: 'itemName',
              type: 'text',
            },
          ],
        },
      ]

      const sanitizedField = (
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        })
      )[0] as ArrayField

      expect(sanitizedField.name).toStrictEqual('items')
      expect(sanitizedField.label).toStrictEqual('Items')
      expect(sanitizedField.type).toStrictEqual('array')
      expect(sanitizedField.labels).toMatchObject({ plural: 'Items', singular: 'Item' })
    })

    it('should label blocks with plural and singular', async () => {
      const fields: Field[] = [
        {
          name: 'specialBlock',
          type: 'blocks',
          blocks: [
            {
              slug: 'number',
              fields: [{ name: 'testNumber', type: 'number' }],
            },
          ],
        },
      ]

      const sanitizedField = (
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        })
      )[0] as BlocksField

      expect(sanitizedField.name).toStrictEqual('specialBlock')
      expect(sanitizedField.label).toStrictEqual('Special Block')
      expect(sanitizedField.type).toStrictEqual('blocks')
      expect(sanitizedField.labels).toMatchObject({
        plural: 'Special Blocks',
        singular: 'Special Block',
      })

      expect((sanitizedField.blocks[0].fields[0] as NumberField).label).toStrictEqual('Test Number')
    })
  })

  describe('relationships', () => {
    it('should not throw on valid relationship', async () => {
      const validRelationships = ['some-collection']
      const fields: Field[] = [
        {
          name: 'My Relationship',
          type: 'relationship',
          label: 'my-relationship',
          relationTo: 'some-collection',
        },
      ]

      await expect(async () => {
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships,
        })
      }).not.toThrow()
    })

    it('should not throw on valid relationship - multiple', async () => {
      const validRelationships = ['some-collection', 'another-collection']
      const fields: Field[] = [
        {
          name: 'My Relationship',
          type: 'relationship',
          label: 'my-relationship',
          relationTo: ['some-collection', 'another-collection'],
        },
      ]

      await expect(async () => {
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships,
        })
      }).not.toThrow()
    })

    it('should not throw on valid relationship inside blocks', async () => {
      const validRelationships = ['some-collection']
      const relationshipBlock: Block = {
        slug: 'relationshipBlock',
        fields: [
          {
            name: 'My Relationship',
            type: 'relationship',
            label: 'my-relationship',
            relationTo: 'some-collection',
          },
        ],
      }

      const fields: Field[] = [
        {
          name: 'layout',
          type: 'blocks',
          blocks: [relationshipBlock],
          label: 'Layout Blocks',
        },
      ]

      await expect(async () => {
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships,
        })
      }).not.toThrow()
    })

    it('should throw on invalid relationship', async () => {
      const validRelationships = ['some-collection']
      const fields: Field[] = [
        {
          name: 'My Relationship',
          type: 'relationship',
          label: 'my-relationship',
          relationTo: 'not-valid',
        },
      ]

      await expect(async () => {
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships,
        })
      }).rejects.toThrow(InvalidFieldRelationship)
    })

    it('should throw on invalid relationship - multiple', async () => {
      const validRelationships = ['some-collection', 'another-collection']
      const fields: Field[] = [
        {
          name: 'My Relationship',
          type: 'relationship',
          label: 'my-relationship',
          relationTo: ['some-collection', 'not-valid'],
        },
      ]

      await expect(async () => {
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships,
        })
      }).rejects.toThrow(InvalidFieldRelationship)
    })

    it('should throw on invalid relationship inside blocks', async () => {
      const validRelationships = ['some-collection']
      const relationshipBlock: Block = {
        slug: 'relationshipBlock',
        fields: [
          {
            name: 'My Relationship',
            type: 'relationship',
            label: 'my-relationship',
            relationTo: 'not-valid',
          },
        ],
      }

      const fields: Field[] = [
        {
          name: 'layout',
          type: 'blocks',
          blocks: [relationshipBlock],
          label: 'Layout Blocks',
        },
      ]

      await expect(async () => {
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships,
        })
      }).rejects.toThrow(InvalidFieldRelationship)
    })

    it('should defaultValue of checkbox to false if required and undefined', async () => {
      const fields: Field[] = [
        {
          name: 'My Checkbox',
          type: 'checkbox',
          required: true,
        },
      ]

      const sanitizedField = (
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        })
      )[0] as CheckboxField

      expect(sanitizedField.defaultValue).toStrictEqual(false)
    })

    it('should return empty field array if no fields', async () => {
      const sanitizedFields = await sanitizeFields({
        config,
        collectionConfig,
        fields: [],
        parentIsLocalized: false,
        validRelationships: [],
      })

      expect(sanitizedFields).toStrictEqual([])
    })
  })
  describe('blocks', () => {
    it('should maintain admin.blockName true after sanitization', async () => {
      const fields: Field[] = [
        {
          name: 'noLabelBlock',
          type: 'blocks',
          blocks: [
            {
              slug: 'number',
              admin: {
                disableBlockName: true,
              },
              fields: [
                {
                  name: 'testNumber',
                  type: 'number',
                },
              ],
            },
          ],
          label: false,
        },
      ]

      const sanitizedField = (
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        })
      )[0] as BlocksField

      const sanitizedBlock = sanitizedField.blocks[0]

      expect(sanitizedBlock.admin?.disableBlockName).toStrictEqual(true)
    })
    it('should default admin.disableBlockName to true after sanitization', async () => {
      const fields: Field[] = [
        {
          name: 'noLabelBlock',
          type: 'blocks',
          blocks: [
            {
              slug: 'number',
              fields: [
                {
                  name: 'testNumber',
                  type: 'number',
                },
              ],
            },
          ],
          label: false,
        },
      ]

      const sanitizedField = (
        await sanitizeFields({
          config,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        })
      )[0] as BlocksField

      const sanitizedBlock = sanitizedField.blocks[0]

      expect(sanitizedBlock.admin?.disableBlockName).toStrictEqual(undefined)
    })
  })

  describe('blockReferences validation', () => {
    it('should throw on invalid block slug reference', async () => {
      const configWithBlocks = {
        blocks: [
          {
            slug: 'validBlock',
            fields: [
              {
                name: 'content',
                type: 'text',
              },
            ],
          },
        ],
      } as Config

      const fields: Field[] = [
        {
          name: 'content',
          type: 'blocks',
          blocks: [],
          blockReferences: ['validBlock', 'invalidBlock'],
        },
      ]

      await expect(async () => {
        await sanitizeFields({
          config: configWithBlocks,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        })
      }).rejects.toThrow(InvalidConfiguration)
    })

    it('should not throw when blockReferences contains valid slugs', async () => {
      const configWithBlocks = {
        blocks: [
          {
            slug: 'validBlock1',
            fields: [
              {
                name: 'content',
                type: 'text',
              },
            ],
          },
          {
            slug: 'validBlock2',
            fields: [
              {
                name: 'title',
                type: 'text',
              },
            ],
          },
        ],
      } as Config

      const fields: Field[] = [
        {
          name: 'content',
          type: 'blocks',
          blocks: [],
          blockReferences: ['validBlock1', 'validBlock2'],
        },
      ]

      await expect(
        sanitizeFields({
          config: configWithBlocks,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        }),
      ).resolves.not.toThrow()
    })

    it('should not throw when blockReferences is GlobalBlocks', async () => {
      const configWithBlocks = {
        blocks: [
          {
            slug: 'someBlock',
            fields: [
              {
                name: 'content',
                type: 'text',
              },
            ],
          },
        ],
      } as Config

      const fields: Field[] = [
        {
          name: 'content',
          type: 'blocks',
          blocks: [],
          blockReferences: 'GlobalBlocks',
        },
      ]

      await expect(
        sanitizeFields({
          config: configWithBlocks,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        }),
      ).resolves.not.toThrow()
    })

    it('should not throw when blockReferences contains inline Block objects', async () => {
      const configWithBlocks = {
        blocks: [
          {
            slug: 'globalBlock',
            fields: [
              {
                name: 'content',
                type: 'text',
              },
            ],
          },
        ],
      } as Config

      const fields: Field[] = [
        {
          name: 'content',
          type: 'blocks',
          blocks: [],
          blockReferences: [
            'globalBlock',
            {
              slug: 'inlineBlock',
              fields: [
                {
                  name: 'title',
                  type: 'text',
                },
              ],
            },
          ],
        },
      ]

      await expect(
        sanitizeFields({
          config: configWithBlocks,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        }),
      ).resolves.not.toThrow()
    })

    it('should not throw when config.blocks is undefined', async () => {
      const configWithoutBlocks = {} as Config

      const fields: Field[] = [
        {
          name: 'content',
          type: 'blocks',
          blocks: [
            {
              slug: 'inlineBlock',
              fields: [
                {
                  name: 'content',
                  type: 'text',
                },
              ],
            },
          ],
        },
      ]

      await expect(
        sanitizeFields({
          config: configWithoutBlocks,
          collectionConfig,
          fields,
          parentIsLocalized: false,
          validRelationships: [],
        }),
      ).resolves.not.toThrow()
    })
  })
})
