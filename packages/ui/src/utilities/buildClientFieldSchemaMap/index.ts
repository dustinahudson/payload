import type { I18n } from '@payloadcms/translations'
import type {
  ClientConfig,
  ClientField,
  ClientFieldSchemaMap,
  FieldSchemaMap,
  Payload,
  TextFieldClient,
} from 'payload'

import { traverseFields } from './traverseFields.js'

const baseAuthFields: ClientField[] = [
  {
    name: 'password',
    type: 'text',
    required: true,
  },
  {
    name: 'confirm-password',
    type: 'text',
    required: true,
  },
]

/**
 * Flattens the config fields into a map of field schemas
 */
export const buildClientFieldSchemaMap = (args: {
  collectionSlug?: string
  config: ClientConfig
  globalSlug?: string
  i18n: I18n
  payload: Payload
  schemaMap: FieldSchemaMap
}): { clientFieldSchemaMap: ClientFieldSchemaMap } => {
  const { collectionSlug, config, globalSlug, i18n, payload, schemaMap } = args

  const clientSchemaMap: ClientFieldSchemaMap = new Map()

  // Build global block schemas first to avoid infinite recursion
  // These are built once and referenced by BlocksFields with blockReferences
  if (config.blocks?.length) {
    for (const block of config.blocks) {
      const blockSchemaPath = `__global_blocks__.${block.slug}`
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
    }
  }

  if (collectionSlug) {
    const matchedCollection = config.collections.find(
      (collection) => collection.slug === collectionSlug,
    )

    if (matchedCollection) {
      let fieldsToSet = matchedCollection?.fields || []

      if (matchedCollection.auth && !matchedCollection.auth.disableLocalStrategy) {
        ;(baseAuthFields[0] as TextFieldClient).label = i18n.t('general:password')
        ;(baseAuthFields[1] as TextFieldClient).label = i18n.t('authentication:confirmPassword')
        // Place these fields _last_ to ensure they do not disrupt field paths in the field schema map
        fieldsToSet = fieldsToSet.concat(baseAuthFields)
      }

      clientSchemaMap.set(collectionSlug, {
        fields: fieldsToSet,
      })

      traverseFields({
        clientSchemaMap,
        config,
        fields: fieldsToSet,
        i18n,
        parentIndexPath: '',
        parentSchemaPath: collectionSlug,
        payload,
        schemaMap,
      })
    }
  } else if (globalSlug) {
    const matchedGlobal = config.globals.find((global) => global.slug === globalSlug)

    if (matchedGlobal) {
      clientSchemaMap.set(globalSlug, {
        fields: matchedGlobal.fields,
      })

      traverseFields({
        clientSchemaMap,
        config,
        fields: matchedGlobal.fields,
        i18n,
        parentIndexPath: '',
        parentSchemaPath: globalSlug,
        payload,
        schemaMap,
      })
    }
  }

  return { clientFieldSchemaMap: clientSchemaMap }
}
