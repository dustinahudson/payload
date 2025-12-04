import type { I18n } from '@payloadcms/translations'
import type { Field, FieldSchemaMap, SanitizedConfig } from 'payload'

import { MissingEditorProp } from 'payload'
import { fieldAffectsData, getFieldPaths, tabHasName } from 'payload/shared'

type Args = {
  config: SanitizedConfig
  fields: Field[]
  i18n: I18n<any, unknown>
  parentIndexPath: string
  parentSchemaPath: string
  schemaMap: FieldSchemaMap
}

export const traverseFields = ({
  config,
  fields,
  i18n,
  parentIndexPath,
  parentSchemaPath,
  schemaMap,
}: Args) => {
  for (const [index, field] of fields.entries()) {
    const { indexPath, schemaPath } = getFieldPaths({
      field,
      index,
      parentIndexPath: 'name' in field ? '' : parentIndexPath,
      parentPath: '',
      parentSchemaPath,
    })

    schemaMap.set(schemaPath, field)

    switch (field.type) {
      case 'array':
        traverseFields({
          config,
          fields: field.fields,
          i18n,
          parentIndexPath: '',
          parentSchemaPath: schemaPath,
          schemaMap,
        })

        break

      case 'blocks':
        {
          // Only traverse inline blocks, not referenced blocks
          // Referenced blocks (from blockReferences) are built separately to avoid infinite recursion
          field.blocks.map((block) => {
            const blockSchemaPath = `${schemaPath}.${block.slug}`

            schemaMap.set(blockSchemaPath, block)
            traverseFields({
              config,
              fields: block.fields,
              i18n,
              parentIndexPath: '',
              parentSchemaPath: blockSchemaPath,
              schemaMap,
            })
          })

          // For blockReferences, create references to pre-built global block schemas
          if (field.blockReferences === 'GlobalBlocks') {
            // Reference all global blocks
            if (config.blocks) {
              const inlineSlugs = new Set(field.blocks.map((b) => b.slug))
              for (const globalBlock of config.blocks) {
                if (!inlineSlugs.has(globalBlock.slug)) {
                  // Create a reference to the pre-built global block schema
                  const blockSchemaPath = `${schemaPath}.${globalBlock.slug}`
                  const globalBlockSchemaPath = `__global_blocks__.${globalBlock.slug}`

                  // Reference the global block schema instead of rebuilding it
                  const globalBlockSchema = schemaMap.get(globalBlockSchemaPath)
                  if (globalBlockSchema) {
                    schemaMap.set(blockSchemaPath, globalBlockSchema)
                  }
                }
              }
            }
          } else if (Array.isArray(field.blockReferences)) {
            // Reference specific blocks by slug or process inline block objects
            const inlineSlugs = new Set(field.blocks.map((b) => b.slug))
            for (const ref of field.blockReferences) {
              const slug = typeof ref === 'string' ? ref : ref.slug
              if (!inlineSlugs.has(slug)) {
                const blockSchemaPath = `${schemaPath}.${slug}`

                if (typeof ref === 'string') {
                  // String reference - look up in global blocks
                  const globalBlockSchemaPath = `__global_blocks__.${slug}`
                  const globalBlockSchema = schemaMap.get(globalBlockSchemaPath)
                  if (globalBlockSchema) {
                    schemaMap.set(blockSchemaPath, globalBlockSchema)
                  }
                } else {
                  // Inline block object - process it like blocks in field.blocks
                  schemaMap.set(blockSchemaPath, ref)
                  traverseFields({
                    config,
                    fields: ref.fields,
                    i18n,
                    parentIndexPath: '',
                    parentSchemaPath: blockSchemaPath,
                    schemaMap,
                  })
                }
              }
            }
          }
        }

        break

      case 'collapsible':
      case 'row':
        traverseFields({
          config,
          fields: field.fields,
          i18n,
          parentIndexPath: indexPath,
          parentSchemaPath,
          schemaMap,
        })

        break

      case 'group':
        if (fieldAffectsData(field)) {
          traverseFields({
            config,
            fields: field.fields,
            i18n,
            parentIndexPath: '',
            parentSchemaPath: schemaPath,
            schemaMap,
          })
        } else {
          traverseFields({
            config,
            fields: field.fields,
            i18n,
            parentIndexPath: indexPath,
            parentSchemaPath,
            schemaMap,
          })
        }

        break

      case 'richText':
        if (!field?.editor) {
          throw new MissingEditorProp(field) // while we allow disabling editor functionality, you should not have any richText fields defined if you do not have an editor
        }

        if (typeof field.editor === 'function') {
          throw new Error('Attempted to access unsanitized rich text editor.')
        }

        if (typeof field.editor.generateSchemaMap === 'function') {
          field.editor.generateSchemaMap({
            config,
            field,
            i18n,
            schemaMap,
            schemaPath,
          })
        }

        break

      case 'tabs':
        field.tabs.map((tab, tabIndex) => {
          const isNamedTab = tabHasName(tab)

          const { indexPath: tabIndexPath, schemaPath: tabSchemaPath } = getFieldPaths({
            field: {
              ...tab,
              type: 'tab',
            },
            index: tabIndex,
            parentIndexPath: indexPath,
            parentPath: '',
            parentSchemaPath,
          })

          schemaMap.set(tabSchemaPath, tab)

          traverseFields({
            config,
            fields: tab.fields,
            i18n,
            parentIndexPath: isNamedTab ? '' : tabIndexPath,
            parentSchemaPath: isNamedTab ? tabSchemaPath : parentSchemaPath,
            schemaMap,
          })
        })

        break
    }
  }
}
