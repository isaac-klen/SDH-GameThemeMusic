/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleDetailsByExport,
  MenuItem,
  Navigation,
  Patch
} from '@decky/ui'
import useTranslations from '../hooks/useTranslations'

type RemovablePatch = Pick<Patch, 'unpatch'>
type ComponentFactory = (...args: never[]) => unknown

const noopPatch: RemovablePatch = {
  unpatch: () => undefined
}

const getFunctionSource = (value: unknown): string | undefined => {
  if (typeof value !== 'function') return undefined

  try {
    return Function.prototype.toString.call(value)
  } catch {
    return undefined
  }
}

function ChangeMusicButton({ appId }: { appId: number }) {
  const t = useTranslations()
  return (
    <MenuItem
      key="game-theme-music-change-music"
      onSelected={() => {
        Navigation.Navigate(`/gamethememusic/${appId}`)
      }}
    >
      {t('changeThemeMusic')}...
    </MenuItem>
  )
}

const getOverviewAppId = (node: any): number | undefined => {
  const appId =
    node?._owner?.pendingProps?.overview?.appid ??
    node?.props?.overview?.appid ??
    node?.props?.app?.appid ??
    node?.app?.appid

  return typeof appId === 'number' && Number.isFinite(appId) ? appId : undefined
}

const findAppId = (tree: any): number | undefined => {
  return (
    getOverviewAppId(tree) ??
    getOverviewAppId(
      findInTree(tree, (x) => Boolean(getOverviewAppId(x)), {
        walkable: ['props', 'children', 'child', 'sibling']
      })
    )
  )
}

// The real app context menu includes the launch action. This avoids adding the
// item to unrelated context menus that reuse the same SteamUI menu components.
const isOpeningAppContextMenu = (items: any[]) => {
  if (!Array.isArray(items) || items.length === 0) return false

  return Boolean(
    findInReactTree(items, (x) =>
      Boolean(
        getFunctionSource(x?.props?.onSelected ?? x?.onSelected)?.includes(
          'launchSource'
        )
      )
    )
  )
}

const removeExistingChangeMusic = (items: any[]) => {
  if (!Array.isArray(items)) return

  const existingIdx = items.findIndex(
    (x: any) => x?.key === 'game-theme-music-change-music'
  )
  if (existingIdx !== -1) items.splice(existingIdx, 1)
}

// Always add before "Properties..."
const spliceChangeMusic = (children: any[], appid: number) => {
  if (!Array.isArray(children)) return

  removeExistingChangeMusic(children)

  const propertiesMenuItemIdx = children.findIndex((item) =>
    findInReactTree(item, (x) =>
      Boolean(
        getFunctionSource(x?.props?.onSelected ?? x?.onSelected)?.includes(
          'AppProperties'
        )
      )
    )
  )
  const insertIdx =
    propertiesMenuItemIdx === -1 ? children.length : propertiesMenuItemIdx

  children.splice(
    insertIdx,
    0,
    <ChangeMusicButton key="game-theme-music-change-music" appId={appid} />
  )
}

const patchMenuItems = (menuItems: any[], appid?: number) => {
  if (!Array.isArray(menuItems)) return

  const updatedAppid = findAppId(menuItems) ?? appid
  if (!updatedAppid) return

  spliceChangeMusic(menuItems, updatedAppid)
}

/**
 * Patches the game context menu.
 * @param LibraryContextMenu The game context menu.
 * @returns A patch to remove when the plugin dismounts.
 */
const contextMenuPatch = (LibraryContextMenu: any): RemovablePatch => {
  if (!LibraryContextMenu?.prototype?.render) return noopPatch

  const patches: {
    outer?: Patch
    inner?: Patch
    render?: Patch
    update?: Patch
    unpatch: () => void
  } = {
    unpatch: () => {
      return null
    }
  }
  patches.outer = afterPatch(
    LibraryContextMenu.prototype,
    'render',
    (_: Record<string, unknown>[], component: any) => {
      const appid = findAppId(component)

      if (!patches.inner) {
        patches.inner = afterPatch(component, 'type', (_: any, ret: any) => {
          const menuType = ret?.type

          if (menuType?.prototype?.render && !patches.render) {
            patches.render = afterPatch(
              menuType.prototype,
              'render',
              (_: any, ret2: any) => {
                const menuItems = ret2?.props?.children?.[0]
                if (!isOpeningAppContextMenu(menuItems)) return ret2

                patchMenuItems(menuItems, appid)
                return ret2
              }
            )
          }

          if (menuType?.prototype?.shouldComponentUpdate && !patches.update) {
            patches.update = afterPatch(
              menuType.prototype,
              'shouldComponentUpdate',
              ([nextProps]: any, shouldUpdate: any) => {
                if (shouldUpdate === true) {
                  const menuItems = nextProps?.children
                  if (isOpeningAppContextMenu(menuItems)) {
                    removeExistingChangeMusic(menuItems)
                    patchMenuItems(menuItems, appid)
                  }
                }

                return shouldUpdate
              }
            )
          }

          return ret
        })
      } else {
        const menuItems = component?.props?.children
        if (isOpeningAppContextMenu(menuItems)) {
          try {
            removeExistingChangeMusic(menuItems)
            patchMenuItems(menuItems, appid)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (e) {
            return component
          }
        }
      }

      return component
    }
  )
  patches.unpatch = () => {
    patches.outer?.unpatch()
    patches.inner?.unpatch()
    patches.render?.unpatch()
    patches.update?.unpatch()
  }
  return patches
}

/**
 * Game context menu component.
 */
const [LibraryContextMenuExports] = findModuleDetailsByExport((value) =>
  Boolean(getFunctionSource(value)?.includes('().LibraryContextMenu'))
)

const LibraryContextMenuModule =
  LibraryContextMenuExports && typeof LibraryContextMenuExports === 'object'
    ? (Object.values(LibraryContextMenuExports).find((sibling) =>
        Boolean(getFunctionSource(sibling)?.includes('navigator:'))
      ) as ComponentFactory | undefined)
    : undefined

export const LibraryContextMenu = LibraryContextMenuModule
  ? fakeRenderComponent(LibraryContextMenuModule)?.type
  : undefined

export default contextMenuPatch
