import type { JSONSchema4 } from 'json-schema'

import type { Config } from '../config/types.js'

import { sanitizeConfig } from '../config/sanitize.js'
import { configToJSONSchema } from './configToJSONSchema.js'
import type { Block, BlocksField, RichTextField } from '../fields/config/types.js'

describe('configToJSONSchema', () => {
  it('should handle optional arrays with required fields', async () => {
    // @ts-expect-error
    const config: Config = {
      collections: [
        {
          slug: 'test',
          fields: [
            {
              name: 'someRequiredField',
              type: 'array',
              fields: [
                {
                  name: 'someRequiredField',
                  type: 'text',
                  required: true,
                },
              ],
            },
          ],
          timestamps: false,
        },
      ],
    }

    const sanitizedConfig = await sanitizeConfig(config)
    const schema = configToJSONSchema(sanitizedConfig, 'text')

    expect(schema?.definitions?.test).toStrictEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        id: {
          type: 'string',
        },
        someRequiredField: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: {
                type: ['string', 'null'],
              },
              someRequiredField: {
                type: 'string',
              },
            },
            required: ['someRequiredField'],
          },
        },
      },
      required: ['id'],
      title: 'Test',
    })
  })

  it('should handle block fields with no blocks', async () => {
    // @ts-expect-error
    const config: Config = {
      collections: [
        {
          slug: 'test',
          fields: [
            {
              name: 'blockField',
              type: 'blocks',
              blocks: [],
            },
            {
              name: 'blockFieldRequired',
              type: 'blocks',
              blocks: [],
              required: true,
            },
            {
              name: 'blockFieldWithFields',
              type: 'blocks',
              blocks: [
                {
                  slug: 'test',
                  fields: [
                    {
                      name: 'field',
                      type: 'text',
                    },
                  ],
                },
              ],
            },
            {
              name: 'blockFieldWithFieldsRequired',
              type: 'blocks',
              blocks: [
                {
                  slug: 'test',
                  fields: [
                    {
                      name: 'field',
                      type: 'text',
                      required: true,
                    },
                  ],
                },
              ],
            },
          ],
          timestamps: false,
        },
      ],
    }

    const sanitizedConfig = await sanitizeConfig(config)
    const schema = configToJSONSchema(sanitizedConfig, 'text')

    expect(schema?.definitions?.test).toStrictEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        id: {
          type: 'string',
        },
        blockField: {
          type: ['array', 'null'],
          items: {},
        },
        blockFieldRequired: {
          type: 'array',
          items: {},
        },
        blockFieldWithFields: {
          type: ['array', 'null'],
          items: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: {
                    type: ['string', 'null'],
                  },
                  blockName: {
                    type: ['string', 'null'],
                  },
                  blockType: {
                    const: 'test',
                  },
                  field: {
                    type: ['string', 'null'],
                  },
                },
                required: ['blockType'],
              },
            ],
          },
        },
        blockFieldWithFieldsRequired: {
          type: ['array', 'null'],
          items: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: {
                    type: ['string', 'null'],
                  },
                  blockName: {
                    type: ['string', 'null'],
                  },
                  blockType: {
                    const: 'test',
                  },
                  field: {
                    type: 'string',
                  },
                },
                required: ['blockType', 'field'],
              },
            ],
          },
        },
      },
      required: ['id', 'blockFieldRequired'],
      title: 'Test',
    })
  })

  it('should handle tabs and named tabs with required fields', async () => {
    // @ts-expect-error
    const config: Config = {
      collections: [
        {
          slug: 'test',
          fields: [
            {
              type: 'tabs',
              tabs: [
                {
                  fields: [
                    {
                      name: 'fieldInUnnamedTab',
                      type: 'text',
                    },
                  ],
                  label: 'unnamedTab',
                },
                {
                  name: 'namedTab',
                  fields: [
                    {
                      name: 'fieldInNamedTab',
                      type: 'text',
                    },
                  ],
                  label: 'namedTab',
                },
                {
                  name: 'namedTabWithRequired',
                  fields: [
                    {
                      name: 'fieldInNamedTab',
                      type: 'text',
                      required: true,
                    },
                  ],
                  label: 'namedTabWithRequired',
                },
              ],
            },
          ],
          timestamps: false,
        },
      ],
    }

    const sanitizedConfig = await sanitizeConfig(config)
    const schema = configToJSONSchema(sanitizedConfig, 'text')

    expect(schema?.definitions?.test).toStrictEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        id: {
          type: 'string',
        },
        fieldInUnnamedTab: {
          type: ['string', 'null'],
        },
        namedTab: {
          type: 'object',
          additionalProperties: false,
          properties: {
            fieldInNamedTab: {
              type: ['string', 'null'],
            },
          },
          required: [],
        },
        namedTabWithRequired: {
          type: 'object',
          additionalProperties: false,
          properties: {
            fieldInNamedTab: {
              type: 'string',
            },
          },
          required: ['fieldInNamedTab'],
        },
      },
      required: ['id', 'namedTabWithRequired'],
      title: 'Test',
    })
  })

  it('should handle custom typescript schema and JSON field schema', async () => {
    const customSchema: JSONSchema4 = {
      type: 'object',
      properties: {
        id: {
          type: 'number',
        },
        required: ['id'],
      },
    }

    const config: Partial<Config> = {
      collections: [
        {
          slug: 'test',
          fields: [
            {
              name: 'withCustom',
              type: 'text',
              typescriptSchema: [() => customSchema],
            },
            {
              name: 'jsonWithSchema',
              type: 'json',
              jsonSchema: {
                fileMatch: ['a://b/foo.json'],
                schema: customSchema,
                uri: 'a://b/foo.json',
              },
            },
          ],
          timestamps: false,
        },
      ],
    }

    const sanitizedConfig = await sanitizeConfig(config as Config)
    const schema = configToJSONSchema(sanitizedConfig, 'text')

    expect(schema?.definitions?.test).toStrictEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        id: {
          type: 'string',
        },
        jsonWithSchema: customSchema,
        withCustom: customSchema,
      },
      required: ['id'],
      title: 'Test',
    })
  })

  it('should handle same block object being referenced in both collection and config.blocks', async () => {
    const sharedBlock: Block = {
      slug: 'sharedBlock',
      interfaceName: 'SharedBlock',
      fields: [
        {
          name: 'richText',
          type: 'richText',
          editor: () => {
            // stub rich text editor
            return {
              CellComponent: '',
              FieldComponent: '',
              validate: () => true,
            }
          },
        },
      ],
    }

    // @ts-expect-error
    const config: Config = {
      blocks: [sharedBlock],
      collections: [
        {
          slug: 'test',
          fields: [
            {
              name: 'someBlockField',
              type: 'blocks',
              blocks: [sharedBlock],
            },
          ],
          timestamps: false,
        },
      ],
    }

    // Ensure both rich text editor are sanitized
    const sanitizedConfig = await sanitizeConfig(config)
    expect(typeof (sanitizedConfig?.blocks?.[0]?.fields?.[0] as RichTextField)?.editor).toBe(
      'object',
    )
    expect(
      typeof (
        (sanitizedConfig.collections[0].fields[0] as BlocksField)?.blocks?.[0]
          ?.fields?.[0] as RichTextField
      )?.editor,
    ).toBe('object')

    const schema = configToJSONSchema(sanitizedConfig, 'text')

    expect(schema?.definitions?.test).toStrictEqual({
      type: 'object',
      additionalProperties: false,
      title: 'Test',
      properties: {
        id: {
          type: 'string',
        },
        someBlockField: {
          type: ['array', 'null'],
          items: {
            oneOf: [
              {
                $ref: '#/definitions/SharedBlock',
              },
            ],
          },
        },
      },
      required: ['id'],
    })

    expect(schema?.definitions?.SharedBlock).toBeDefined()
  })

  it('should allow overriding required to false', async () => {
    // @ts-expect-error
    const config: Config = {
      collections: [
        {
          slug: 'test',
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
              defaultValue: 'test',
              typescriptSchema: [
                () => ({
                  type: 'string',
                  required: false,
                }),
              ],
            },
          ],
          timestamps: false,
        },
      ],
    }

    const sanitizedConfig = await sanitizeConfig(config)
    const schema = configToJSONSchema(sanitizedConfig, 'text')

    // @ts-expect-error
    expect(schema.definitions.test.properties.title.required).toStrictEqual(false)
  })

  it('should generate GlobalBlocks union type when config.blocks is defined', async () => {
    // @ts-expect-error
    const config: Config = {
      blocks: [
        {
          slug: 'hero',
          interfaceName: 'HeroBlock',
          fields: [
            {
              name: 'title',
              type: 'text',
            },
          ],
        },
        {
          slug: 'cta',
          fields: [
            {
              name: 'text',
              type: 'text',
            },
          ],
        },
      ],
      collections: [
        {
          slug: 'test',
          fields: [
            {
              name: 'content',
              type: 'blocks',
              blocks: [], // Must have blocks array even if empty
              blockReferences: 'GlobalBlocks',
            },
          ],
          timestamps: false,
        },
      ],
    }

    const sanitizedConfig = await sanitizeConfig(config)
    const schema = configToJSONSchema(sanitizedConfig, 'text')

    // GlobalBlocks union type should be defined
    expect(schema?.definitions?.GlobalBlocks).toBeDefined()
    expect(schema?.definitions?.GlobalBlocks).toStrictEqual({
      oneOf: [{ $ref: '#/definitions/HeroBlock' }, { $ref: '#/definitions/cta' }],
    })

    // BlocksField with blockReferences: 'GlobalBlocks' should reference GlobalBlocks
    expect(schema?.definitions?.test?.properties?.content).toStrictEqual({
      type: ['array', 'null'],
      items: {
        $ref: '#/definitions/GlobalBlocks',
      },
    })
  })

  it('should handle blockReferences with specific block slugs', async () => {
    // @ts-expect-error
    const config: Config = {
      blocks: [
        {
          slug: 'hero',
          fields: [
            {
              name: 'title',
              type: 'text',
            },
          ],
        },
        {
          slug: 'cta',
          fields: [
            {
              name: 'text',
              type: 'text',
            },
          ],
        },
        {
          slug: 'footer',
          fields: [
            {
              name: 'copyright',
              type: 'text',
            },
          ],
        },
      ],
      collections: [
        {
          slug: 'test',
          fields: [
            {
              name: 'content',
              type: 'blocks',
              blocks: [],
              blockReferences: ['hero', 'cta'],
            },
          ],
          timestamps: false,
        },
      ],
    }

    const sanitizedConfig = await sanitizeConfig(config)
    const schema = configToJSONSchema(sanitizedConfig, 'text')

    // Should only include referenced blocks
    expect(schema?.definitions?.test?.properties?.content).toStrictEqual({
      type: ['array', 'null'],
      items: {
        oneOf: [{ $ref: '#/definitions/hero' }, { $ref: '#/definitions/cta' }],
      },
    })
  })

  it('should handle blockReferences with mixed inline blocks and slugs', async () => {
    // @ts-expect-error
    const config: Config = {
      blocks: [
        {
          slug: 'hero',
          fields: [
            {
              name: 'title',
              type: 'text',
            },
          ],
        },
      ],
      collections: [
        {
          slug: 'test',
          fields: [
            {
              name: 'content',
              type: 'blocks',
              blocks: [],
              blockReferences: [
                'hero', // Reference to global block
                {
                  // Inline block in blockReferences
                  slug: 'custom',
                  fields: [
                    {
                      name: 'data',
                      type: 'text',
                    },
                  ],
                },
              ],
            },
          ],
          timestamps: false,
        },
      ],
    }

    const sanitizedConfig = await sanitizeConfig(config)
    const schema = configToJSONSchema(sanitizedConfig, 'text')

    // Should include both referenced global block and inline block
    const contentField = schema?.definitions?.test?.properties?.content
    expect(contentField?.type).toEqual(['array', 'null'])
    expect(contentField?.items?.oneOf).toHaveLength(2)

    // Check that both hero reference and custom inline block are present
    const refs = contentField?.items?.oneOf?.filter((item: any) => item.$ref)
    const inlineBlocks = contentField?.items?.oneOf?.filter(
      (item: any) => item.properties?.blockType,
    )

    expect(refs).toHaveLength(1)
    expect(refs?.[0]).toEqual({ $ref: '#/definitions/hero' })
    expect(inlineBlocks).toHaveLength(1)
    expect(inlineBlocks?.[0]?.properties?.blockType?.const).toBe('custom')
  })

  it('should handle mixed inline blocks and blockReferences', async () => {
    // @ts-expect-error
    const config: Config = {
      blocks: [
        {
          slug: 'hero',
          fields: [
            {
              name: 'title',
              type: 'text',
            },
          ],
        },
        {
          slug: 'cta',
          fields: [
            {
              name: 'text',
              type: 'text',
            },
          ],
        },
      ],
      collections: [
        {
          slug: 'test',
          fields: [
            {
              name: 'content',
              type: 'blocks',
              blocks: [],
              blockReferences: ['hero'],
            },
          ],
          timestamps: false,
        },
      ],
    }

    const sanitizedConfig = await sanitizeConfig(config)
    const schema = configToJSONSchema(sanitizedConfig, 'text')

    // Should only include referenced blocks
    const contentField = schema?.definitions?.test?.properties?.content
    expect(contentField?.type).toEqual(['array', 'null'])
    expect(contentField?.items?.oneOf).toHaveLength(1)
    expect(contentField?.items?.oneOf?.[0]).toEqual({ $ref: '#/definitions/hero' })
  })
})
