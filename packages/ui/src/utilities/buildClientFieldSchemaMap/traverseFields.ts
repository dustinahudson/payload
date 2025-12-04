import type { I18n } from '@payloadcms/translations'

import {
  type ClientConfig,
  type ClientField,
  type ClientFieldSchemaMap,
  createClientFields,
  type Field,
  type FieldSchemaMap,
  type Payload,
} from 'payload'
import { fieldAffectsData, getFieldPaths, tabHasName } from 'payload/shared'

type Args = {
  clientSchemaMap: ClientFieldSchemaMap
  config: ClientConfig
  fields: ClientField[]
  i18n: I18n<any, any>
  parentIndexPath: string
  parentSchemaPath: string
  payload: Payload
  schemaMap: FieldSchemaMap
}

export const traverseFields = ({
  clientSchemaMap,
  config,
  fields,
  i18n,
  parentIndexPath,
  parentSchemaPath,
  payload,
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

    clientSchemaMap.set(schemaPath, field)

    switch (field.type) {
      case 'array': {
        traverseFields({
          clientSchemaMap,
          config,
          fields: field.fields,
          i18n,
          parentIndexPath: '',
          parentSchemaPath: schemaPath,
          payload,
          schemaMap,
        })

        break
      }

      case 'blocks':
        {
          // Only traverse inline blocks, not referenced blocks
          // Referenced blocks (from blockReferences) are built separately to avoid infinite recursion
          if (field.blocks) {
            field.blocks.map((block) => {
              const blockSchemaPath = `${schemaPath}.${block.slug}`

              clientSchemaMap.set(blockSchemaPath, block)
              traverseFields({
                clientSchemaMap,
                config,
                fields: block.fields,
                i18n,
                parentIndexPath: '',
                parentSchemaPath: blockSchemaPath,
                payload,
                schemaMap,
              })
            })
          }

          // For blockReferences, create references to pre-built global block schemas
          if (field.blockReferences === 'GlobalBlocks') {
            // Reference all global blocks
            if (config.blocks) {
              const inlineSlugs = new Set((field.blocks || []).map((b) => b.slug))
              for (const globalBlock of config.blocks) {
                if (!inlineSlugs.has(globalBlock.slug)) {
                  // Create a reference to the pre-built global block schema
                  const blockSchemaPath = `${schemaPath}.${globalBlock.slug}`
                  const globalBlockSchemaPath = `__global_blocks__.${globalBlock.slug}`

                  // Reference the global block schema instead of rebuilding it
                  const globalBlockSchema = clientSchemaMap.get(globalBlockSchemaPath)
                  if (globalBlockSchema) {
                    clientSchemaMap.set(blockSchemaPath, globalBlockSchema)
                  }
                }
              }
            }
          } else if (Array.isArray(field.blockReferences)) {
            // Reference specific blocks by slug or process inline block objects
            const inlineSlugs = new Set((field.blocks || []).map((b) => b.slug))
            for (const ref of field.blockReferences) {
              const slug = typeof ref === 'string' ? ref : ref.slug
              if (!inlineSlugs.has(slug)) {
                const blockSchemaPath = `${schemaPath}.${slug}`

                if (typeof ref === 'string') {
                  // String reference - look up in global blocks
                  const globalBlockSchemaPath = `__global_blocks__.${slug}`
                  const globalBlockSchema = clientSchemaMap.get(globalBlockSchemaPath)
                  if (globalBlockSchema) {
                    clientSchemaMap.set(blockSchemaPath, globalBlockSchema)
                  }
                } else {
                  // Inline block object - process it like blocks in field.blocks
                  clientSchemaMap.set(blockSchemaPath, ref)
                  traverseFields({
                    clientSchemaMap,
                    config,
                    fields: ref.fields,
                    i18n,
                    parentIndexPath: '',
                    parentSchemaPath: blockSchemaPath,
                    payload,
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
          clientSchemaMap,
          config,
          fields: field.fields,
          i18n,
          parentIndexPath: indexPath,
          parentSchemaPath,
          payload,
          schemaMap,
        })
        break

      case 'group': {
        if (fieldAffectsData(field)) {
          traverseFields({
            clientSchemaMap,
            config,
            fields: field.fields,
            i18n,
            parentIndexPath: '',
            parentSchemaPath: schemaPath,
            payload,
            schemaMap,
          })
        } else {
          traverseFields({
            clientSchemaMap,
            config,
            fields: field.fields,
            i18n,
            parentIndexPath: indexPath,
            parentSchemaPath,
            payload,
            schemaMap,
          })
        }
        break
      }

      case 'richText': {
        // richText sub-fields are not part of the ClientConfig or the Config.
        // They only exist in the field schema map.
        // Thus, we need to
        // 1. get them from the field schema map
        // 2. convert them to client fields
        // 3. add them to the client schema map

        // So these would basically be all fields that are not part of the client config already
        const richTextFieldSchemaMap: FieldSchemaMap = new Map()
        for (const [path, subField] of schemaMap.entries()) {
          if (path.startsWith(`${schemaPath}.`)) {
            richTextFieldSchemaMap.set(path, subField)
          }
        }

        // Now loop through them, convert each entry to a client field and add it to the client schema map
        for (const [path, subField] of richTextFieldSchemaMap.entries()) {
          // check if fields is the only key in the subField object
          const isFieldsOnly = Object.keys(subField).length === 1 && 'fields' in subField

          const clientFields = createClientFields({
            defaultIDType: payload.config.db.defaultIDType,
            disableAddingID: true,
            fields: isFieldsOnly ? subField.fields : [subField as Field],
            i18n,
            importMap: payload.importMap,
          })

          clientSchemaMap.set(
            path,
            isFieldsOnly
              ? {
                  fields: clientFields,
                }
              : clientFields[0],
          )
        }
        break
      }

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

          clientSchemaMap.set(tabSchemaPath, tab)

          traverseFields({
            clientSchemaMap,
            config,
            fields: tab.fields,
            i18n,
            parentIndexPath: isNamedTab ? '' : tabIndexPath,
            parentSchemaPath: isNamedTab ? tabSchemaPath : parentSchemaPath,
            payload,
            schemaMap,
          })
        })

        break
    }
  }
}
