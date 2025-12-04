import type { IndexOptions, Schema, SchemaOptions, SchemaTypeOptions } from 'mongoose'

import mongoose from 'mongoose'
import {
  type ArrayField,
  type BlocksField,
  type CheckboxField,
  type CodeField,
  type CollapsibleField,
  type DateField,
  type EmailField,
  type Field,
  type FieldAffectingData,
  type GroupField,
  type JSONField,
  type NonPresentationalField,
  type NumberField,
  type Payload,
  type PointField,
  type RadioField,
  type RelationshipField,
  type RichTextField,
  type RowField,
  type SanitizedCompoundIndex,
  type SanitizedLocalizationConfig,
  type SelectField,
  type Tab,
  type TabsField,
  type TextareaField,
  type TextField,
  type UploadField,
} from 'payload'
import {
  fieldAffectsData,
  fieldIsPresentationalOnly,
  fieldIsVirtual,
  fieldShouldBeLocalized,
  tabHasName,
} from 'payload/shared'

export type BuildSchemaOptions = {
  allowIDField?: boolean
  disableUnique?: boolean
  draftsEnabled?: boolean
  indexSortableFields?: boolean
  options?: SchemaOptions
}

type FieldSchemaGenerator<T extends Field = Field> = (
  field: T,
  schema: Schema,
  config: Payload,
  buildSchemaOptions: BuildSchemaOptions,
  parentIsLocalized: boolean,
) => void

/**
 * get a field's defaultValue only if defined and not dynamic so that it can be set on the field schema
 * @param field
 */
const formatDefaultValue = (field: FieldAffectingData) =>
  typeof field.defaultValue !== 'undefined' && typeof field.defaultValue !== 'function'
    ? field.defaultValue
    : undefined

const formatBaseSchema = ({
  buildSchemaOptions,
  field,
  parentIsLocalized,
}: {
  buildSchemaOptions: BuildSchemaOptions
  field: FieldAffectingData
  parentIsLocalized: boolean
}) => {
  const { disableUnique, draftsEnabled, indexSortableFields } = buildSchemaOptions
  const schema: SchemaTypeOptions<unknown> = {
    default: formatDefaultValue(field),
    index: field.index || (!disableUnique && field.unique) || indexSortableFields || false,
    required: false,
    unique: (!disableUnique && field.unique) || false,
  }

  if (
    schema.unique &&
    (fieldShouldBeLocalized({ field, parentIsLocalized }) ||
      draftsEnabled ||
      (fieldAffectsData(field) &&
        field.type !== 'group' &&
        field.type !== 'tab' &&
        field.required !== true))
  ) {
    schema.sparse = true
  }

  if (field.hidden) {
    schema.hidden = true
  }

  return schema
}

const localizeSchema = (
  entity: NonPresentationalField | Tab,
  schema: SchemaTypeOptions<any>,
  localization: false | SanitizedLocalizationConfig,
  parentIsLocalized: boolean,
) => {
  if (
    fieldShouldBeLocalized({ field: entity, parentIsLocalized }) &&
    localization &&
    Array.isArray(localization.locales)
  ) {
    return {
      type: localization.localeCodes.reduce(
        (localeSchema, locale) => ({
          ...localeSchema,
          [locale]: schema,
        }),
        {
          _id: false,
        },
      ),
      localized: true,
    }
  }
  return schema
}

export const buildSchema = (args: {
  buildSchemaOptions: BuildSchemaOptions
  compoundIndexes?: SanitizedCompoundIndex[]
  configFields: Field[]
  parentIsLocalized?: boolean
  payload: Payload
}): Schema => {
  const { buildSchemaOptions = {}, configFields, parentIsLocalized, payload } = args
  const { allowIDField, options } = buildSchemaOptions
  let fields = {}

  let schemaFields = configFields

  if (!allowIDField) {
    const idField = schemaFields.find((field) => fieldAffectsData(field) && field.name === 'id')
    if (idField) {
      fields = {
        _id:
          idField.type === 'number'
            ? payload.db.useBigIntForNumberIDs
              ? mongoose.Schema.Types.BigInt
              : Number
            : String,
      }
      schemaFields = schemaFields.filter(
        (field) => !(fieldAffectsData(field) && field.name === 'id'),
      )
    }
  }

  const schema = new mongoose.Schema(fields, options as any)

  schemaFields.forEach((field) => {
    if (fieldIsVirtual(field)) {
      return
    }

    if (!fieldIsPresentationalOnly(field)) {
      const addFieldSchema = getSchemaGenerator(field.type)

      if (addFieldSchema) {
        addFieldSchema(field, schema, payload, buildSchemaOptions, parentIsLocalized ?? false)
      }
    }
  })

  if (args.compoundIndexes) {
    for (const index of args.compoundIndexes) {
      const indexDefinition: Record<string, 1> = {}

      for (const field of index.fields) {
        if (field.pathHasLocalized && payload.config.localization) {
          for (const locale of payload.config.localization.locales) {
            indexDefinition[field.localizedPath.replace('<locale>', locale.code)] = 1
          }
        } else {
          indexDefinition[field.path] = 1
        }
      }

      schema.index(indexDefinition, {
        unique: args.buildSchemaOptions.disableUnique ? false : index.unique,
      })
    }
  }

  return schema
}

const array: FieldSchemaGenerator<ArrayField> = (
  field: ArrayField,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
) => {
  const baseSchema: SchemaTypeOptions<any> = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: [
      buildSchema({
        buildSchemaOptions: {
          allowIDField: true,
          disableUnique: buildSchemaOptions.disableUnique,
          draftsEnabled: buildSchemaOptions.draftsEnabled,
          options: {
            _id: false,
            id: false,
            minimize: false,
          },
        },
        configFields: field.fields,
        parentIsLocalized: parentIsLocalized || field.localized,
        payload,
      }),
    ],
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const blocks: FieldSchemaGenerator<BlocksField> = (
  field: BlocksField,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const fieldSchema: SchemaTypeOptions<any> = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: [new mongoose.Schema({}, { _id: false, discriminatorKey: 'blockType' })],
  }

  schema.add({
    [field.name]: localizeSchema(
      field,
      fieldSchema,
      payload.config.localization,
      parentIsLocalized,
    ),
  })

  // Collect all block slugs and their schemas
  // Map to track which blocks we've already added (for precedence handling)
  const processedSlugs = new Set<string>()
  const blocksToAdd: Array<{ isInline: boolean; schema: mongoose.Schema; slug: string }> = []

  // STEP 1: Process inline blocks first (they have precedence)
  field.blocks.forEach((block) => {
    const blockSchema = new mongoose.Schema({}, { _id: false, id: false })

    block.fields.forEach((blockField) => {
      const addFieldSchema = getSchemaGenerator(blockField.type)

      if (addFieldSchema) {
        addFieldSchema(
          blockField,
          blockSchema,
          payload,
          buildSchemaOptions,
          (parentIsLocalized || field.localized) ?? false,
        )
      }
    })

    blocksToAdd.push({ slug: block.slug, isInline: true, schema: blockSchema })
    processedSlugs.add(block.slug)
  })

  // STEP 2: Process referenced blocks from blockReferences
  if (field.blockReferences) {
    // Get the global block schemas from the database adapter
    const globalBlockSchemas = payload.db.globalBlockSchemas

    if (field.blockReferences === 'GlobalBlocks') {
      // Include all global blocks
      if (payload.config.blocks) {
        payload.config.blocks.forEach((block) => {
          // Skip if inline block with same slug exists (precedence)
          if (!processedSlugs.has(block.slug)) {
            const preBuiltSchema = globalBlockSchemas.get(block.slug)
            if (preBuiltSchema) {
              blocksToAdd.push({ slug: block.slug, isInline: false, schema: preBuiltSchema })
              processedSlugs.add(block.slug)
            }
          }
        })
      }
    } else if (Array.isArray(field.blockReferences)) {
      // Include specific blocks by slug
      field.blockReferences.forEach((blockRef) => {
        const slug = typeof blockRef === 'string' ? blockRef : blockRef.slug

        // Skip if inline block with same slug exists (precedence)
        if (!processedSlugs.has(slug)) {
          // First check if it's an inline block definition
          if (typeof blockRef !== 'string') {
            // It's an inline Block object, build its schema
            const blockSchema = new mongoose.Schema({}, { _id: false, id: false })

            blockRef.fields.forEach((blockField) => {
              const addFieldSchema = getSchemaGenerator(blockField.type)

              if (addFieldSchema) {
                addFieldSchema(
                  blockField,
                  blockSchema,
                  payload,
                  buildSchemaOptions,
                  (parentIsLocalized || field.localized) ?? false,
                )
              }
            })

            blocksToAdd.push({ slug, isInline: true, schema: blockSchema })
            processedSlugs.add(slug)
          } else {
            // It's a string slug, reference the pre-built global block schema
            const preBuiltSchema = globalBlockSchemas.get(slug)
            if (preBuiltSchema) {
              blocksToAdd.push({ slug, isInline: false, schema: preBuiltSchema })
              processedSlugs.add(slug)
            }
          }
        }
      })
    }
  }

  // STEP 3: Add all collected blocks as discriminators
  blocksToAdd.forEach(({ slug, schema: blockSchema }) => {
    if (fieldShouldBeLocalized({ field, parentIsLocalized }) && payload.config.localization) {
      payload.config.localization.localeCodes.forEach((localeCode) => {
        // @ts-expect-error Possible incorrect typing in mongoose types, this works
        schema.path(`${field.name}.${localeCode}`).discriminator(slug, blockSchema)
      })
    } else {
      // @ts-expect-error Possible incorrect typing in mongoose types, this works
      schema.path(field.name).discriminator(slug, blockSchema)
    }
  })
}

const checkbox: FieldSchemaGenerator<CheckboxField> = (
  field: CheckboxField,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema: SchemaTypeOptions<any> = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: Boolean,
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const code: FieldSchemaGenerator<CodeField> = (
  field: CodeField,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema: SchemaTypeOptions<any> = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: String,
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const collapsible: FieldSchemaGenerator<CollapsibleField> = (
  field: CollapsibleField,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  field.fields.forEach((subField: Field) => {
    if (fieldIsVirtual(subField)) {
      return
    }

    const addFieldSchema = getSchemaGenerator(subField.type)

    if (addFieldSchema) {
      addFieldSchema(subField, schema, payload, buildSchemaOptions, parentIsLocalized)
    }
  })
}

const date: FieldSchemaGenerator<DateField> = (
  field: DateField,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema: SchemaTypeOptions<any> = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: Date,
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const email: FieldSchemaGenerator<EmailField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema: SchemaTypeOptions<any> = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: String,
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const group: FieldSchemaGenerator<GroupField> = (
  field: GroupField,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  if (fieldAffectsData(field)) {
    const formattedBaseSchema = formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized })

    // carry indexSortableFields through to versions if drafts enabled
    const indexSortableFields =
      buildSchemaOptions.indexSortableFields &&
      field.name === 'version' &&
      buildSchemaOptions.draftsEnabled

    const baseSchema: SchemaTypeOptions<any> = {
      ...formattedBaseSchema,
      type: buildSchema({
        buildSchemaOptions: {
          disableUnique: buildSchemaOptions.disableUnique,
          draftsEnabled: buildSchemaOptions.draftsEnabled,
          indexSortableFields,
          options: {
            _id: false,
            id: false,
            minimize: false,
          },
        },
        configFields: field.fields,
        parentIsLocalized: parentIsLocalized || field.localized,
        payload,
      }),
    }

    schema.add({
      [field.name]: localizeSchema(
        field,
        baseSchema,
        payload.config.localization,
        parentIsLocalized,
      ),
    })
  } else {
    field.fields.forEach((subField) => {
      if (fieldIsVirtual(subField)) {
        return
      }

      const addFieldSchema = getSchemaGenerator(subField.type)

      if (addFieldSchema) {
        addFieldSchema(
          subField,
          schema,
          payload,
          buildSchemaOptions,
          (parentIsLocalized || field.localized) ?? false,
        )
      }
    })
  }
}

const json: FieldSchemaGenerator<JSONField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema: SchemaTypeOptions<any> = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: mongoose.Schema.Types.Mixed,
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const number: FieldSchemaGenerator<NumberField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema: SchemaTypeOptions<any> = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: field.hasMany ? [Number] : Number,
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const point: FieldSchemaGenerator<PointField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema: SchemaTypeOptions<unknown> = {
    type: {
      type: String,
      enum: ['Point'],
      ...(typeof field.defaultValue !== 'undefined' && {
        default: 'Point',
      }),
    },
    coordinates: {
      type: [Number],
      default: formatDefaultValue(field),
      required: false,
    },
  }

  if (
    buildSchemaOptions.disableUnique &&
    field.unique &&
    fieldShouldBeLocalized({ field, parentIsLocalized })
  ) {
    baseSchema.coordinates.sparse = true
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })

  if (field.index === true || field.index === undefined) {
    const indexOptions: IndexOptions = {}
    if (!buildSchemaOptions.disableUnique && field.unique) {
      indexOptions.sparse = true
      indexOptions.unique = true
    }
    if (fieldShouldBeLocalized({ field, parentIsLocalized }) && payload.config.localization) {
      payload.config.localization.locales.forEach((locale) => {
        schema.index({ [`${field.name}.${locale.code}`]: '2dsphere' }, indexOptions)
      })
    } else {
      schema.index({ [field.name]: '2dsphere' }, indexOptions)
    }
  }
}

const radio: FieldSchemaGenerator<RadioField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: String,
    enum: field.options.map((option) => {
      if (typeof option === 'object') {
        return option.value
      }
      return option
    }),
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const relationship: FieldSchemaGenerator<RelationshipField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
) => {
  const hasManyRelations = Array.isArray(field.relationTo)
  let schemaToReturn: { [key: string]: any } = {}

  const valueType = getRelationshipValueType(field, payload)

  if (fieldShouldBeLocalized({ field, parentIsLocalized }) && payload.config.localization) {
    schemaToReturn = {
      _id: false,
      type: payload.config.localization.localeCodes.reduce((locales, locale) => {
        let localeSchema: { [key: string]: any } = {}

        if (hasManyRelations) {
          localeSchema = {
            ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
            _id: false,
            type: mongoose.Schema.Types.Mixed,
            relationTo: { type: String, enum: field.relationTo },
            value: {
              type: valueType,
              refPath: `${field.name}.${locale}.relationTo`,
            },
          }
        } else {
          localeSchema = {
            ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
            type: valueType,
            ref: field.relationTo,
          }
        }

        return {
          ...locales,
          [locale]: field.hasMany
            ? { type: [localeSchema], default: formatDefaultValue(field) }
            : localeSchema,
        }
      }, {}),
      localized: true,
    }
  } else if (hasManyRelations) {
    schemaToReturn = {
      ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
      _id: false,
      type: mongoose.Schema.Types.Mixed,
      relationTo: { type: String, enum: field.relationTo },
      value: {
        type: valueType,
        refPath: `${field.name}.relationTo`,
      },
    }

    if (field.hasMany) {
      schemaToReturn = {
        type: [schemaToReturn],
        default: formatDefaultValue(field),
      }
    }
  } else {
    schemaToReturn = {
      ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
      type: valueType,
      ref: field.relationTo,
    }

    if (field.hasMany) {
      schemaToReturn = {
        type: [schemaToReturn],
        default: formatDefaultValue(field),
      }
    }
  }

  schema.add({
    [field.name]: schemaToReturn,
  })
}

const richText: FieldSchemaGenerator<RichTextField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: mongoose.Schema.Types.Mixed,
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const row: FieldSchemaGenerator<RowField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  field.fields.forEach((subField: Field) => {
    if (fieldIsVirtual(subField)) {
      return
    }

    const addFieldSchema = getSchemaGenerator(subField.type)

    if (addFieldSchema) {
      addFieldSchema(subField, schema, payload, buildSchemaOptions, parentIsLocalized)
    }
  })
}

const select: FieldSchemaGenerator<SelectField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema: SchemaTypeOptions<unknown> = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: String,
    enum: field.options.map((option) => {
      if (typeof option === 'object') {
        return option.value
      }
      return option
    }),
  }

  if (buildSchemaOptions.draftsEnabled || !field.required) {
    ;(baseSchema.enum as unknown[]).push(null)
  }

  schema.add({
    [field.name]: localizeSchema(
      field,
      field.hasMany ? [baseSchema] : baseSchema,
      payload.config.localization,
      parentIsLocalized,
    ),
  })
}

const tabs: FieldSchemaGenerator<TabsField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  field.tabs.forEach((tab) => {
    if (tabHasName(tab)) {
      if (fieldIsVirtual(tab)) {
        return
      }
      const baseSchema = {
        type: buildSchema({
          buildSchemaOptions: {
            disableUnique: buildSchemaOptions.disableUnique,
            draftsEnabled: buildSchemaOptions.draftsEnabled,
            options: {
              _id: false,
              id: false,
              minimize: false,
            },
          },
          configFields: tab.fields,
          parentIsLocalized: parentIsLocalized || tab.localized,
          payload,
        }),
      }

      schema.add({
        [tab.name]: localizeSchema(tab, baseSchema, payload.config.localization, parentIsLocalized),
      })
    } else {
      tab.fields.forEach((subField: Field) => {
        if (fieldIsVirtual(subField)) {
          return
        }
        const addFieldSchema = getSchemaGenerator(subField.type)

        if (addFieldSchema) {
          addFieldSchema(
            subField,
            schema,
            payload,
            buildSchemaOptions,
            (parentIsLocalized || tab.localized) ?? false,
          )
        }
      })
    }
  })
}

const text: FieldSchemaGenerator<TextField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: field.hasMany ? [String] : String,
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const textarea: FieldSchemaGenerator<TextareaField> = (
  field: TextareaField,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const baseSchema = {
    ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
    type: String,
  }

  schema.add({
    [field.name]: localizeSchema(field, baseSchema, payload.config.localization, parentIsLocalized),
  })
}

const upload: FieldSchemaGenerator<UploadField> = (
  field,
  schema,
  payload,
  buildSchemaOptions,
  parentIsLocalized,
): void => {
  const hasManyRelations = Array.isArray(field.relationTo)
  let schemaToReturn: { [key: string]: unknown } = {}

  const valueType = getRelationshipValueType(field, payload)

  if (fieldShouldBeLocalized({ field, parentIsLocalized }) && payload.config.localization) {
    schemaToReturn = {
      _id: false,
      type: payload.config.localization.localeCodes.reduce((locales, locale) => {
        let localeSchema: { [key: string]: unknown } = {}

        if (hasManyRelations) {
          localeSchema = {
            ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
            _id: false,
            type: mongoose.Schema.Types.Mixed,
            relationTo: { type: String, enum: field.relationTo },
            value: {
              type: valueType,
              refPath: `${field.name}.${locale}.relationTo`,
            },
          }
        } else {
          localeSchema = {
            ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
            type: valueType,
            ref: field.relationTo,
          }
        }

        return {
          ...locales,
          [locale]: field.hasMany
            ? { type: [localeSchema], default: formatDefaultValue(field) }
            : localeSchema,
        }
      }, {}),
      localized: true,
    }
  } else if (hasManyRelations) {
    schemaToReturn = {
      ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
      _id: false,
      type: mongoose.Schema.Types.Mixed,
      relationTo: { type: String, enum: field.relationTo },
      value: {
        type: valueType,
        refPath: `${field.name}.relationTo`,
      },
    }

    if (field.hasMany) {
      schemaToReturn = {
        type: [schemaToReturn],
        default: formatDefaultValue(field),
      }
    }
  } else {
    schemaToReturn = {
      ...formatBaseSchema({ buildSchemaOptions, field, parentIsLocalized }),
      type: valueType,
      ref: field.relationTo,
    }

    if (field.hasMany) {
      schemaToReturn = {
        type: [schemaToReturn],
        default: formatDefaultValue(field),
      }
    }
  }

  schema.add({
    [field.name]: schemaToReturn,
  })
}

const getSchemaGenerator = (fieldType: string): FieldSchemaGenerator | null => {
  if (fieldType in fieldToSchemaMap) {
    return fieldToSchemaMap[fieldType as keyof typeof fieldToSchemaMap] as FieldSchemaGenerator
  }

  return null
}

const fieldToSchemaMap = {
  array,
  blocks,
  checkbox,
  code,
  collapsible,
  date,
  email,
  group,
  json,
  number,
  point,
  radio,
  relationship,
  richText,
  row,
  select,
  tabs,
  text,
  textarea,
  upload,
}

const getRelationshipValueType = (field: RelationshipField | UploadField, payload: Payload) => {
  if (typeof field.relationTo === 'string') {
    const customIDType = payload.collections[field.relationTo]?.customIDType

    if (!customIDType) {
      return mongoose.Schema.Types.ObjectId
    }

    if (customIDType === 'number') {
      if (payload.db.useBigIntForNumberIDs) {
        return mongoose.Schema.Types.BigInt
      } else {
        return mongoose.Schema.Types.Number
      }
    }

    return mongoose.Schema.Types.String
  }

  // has custom id relationTo
  if (
    field.relationTo.some((relationTo) => {
      return !!payload.collections[relationTo]?.customIDType
    })
  ) {
    return mongoose.Schema.Types.Mixed
  }

  return mongoose.Schema.Types.ObjectId
}

/**
 * Build MongoDB schemas for all global blocks defined in config.blocks
 * Uses a two-pass approach to handle blocks that reference other blocks:
 * 1. Create empty schemas for all blocks
 * 2. Populate each schema with its fields
 *
 * This prevents infinite recursion when blocks contain BlocksFields that reference other blocks
 */
export const buildGlobalBlockSchemas = (
  payload: Payload,
  buildSchemaOptions: BuildSchemaOptions,
): Map<string, mongoose.Schema> => {
  const schemas = new Map<string, mongoose.Schema>()

  if (!payload.config.blocks || payload.config.blocks.length === 0) {
    return schemas
  }

  // PASS 1: Create empty schemas for all global blocks
  // This ensures all block schemas exist before we try to reference them
  for (const block of payload.config.blocks) {
    const blockSchema = new mongoose.Schema({}, { _id: false, id: false })
    schemas.set(block.slug, blockSchema)
  }

  // Note: The schemas are returned and will be stored on the adapter instance.
  // They will be available via payload.db.globalBlockSchemas after the adapter is initialized.

  // PASS 2: Populate each schema with its fields
  // Now any block can safely reference any other block's schema
  for (const block of payload.config.blocks) {
    const blockSchema = schemas.get(block.slug)!

    block.fields.forEach((field) => {
      if (fieldIsVirtual(field)) {
        return
      }

      if (!fieldIsPresentationalOnly(field)) {
        const addFieldSchema = getSchemaGenerator(field.type)

        if (addFieldSchema) {
          addFieldSchema(field, blockSchema, payload, buildSchemaOptions, false)
        }
      }
    })
  }

  return schemas
}
