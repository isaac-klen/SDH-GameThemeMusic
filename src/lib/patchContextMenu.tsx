/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
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

// Always add before "Properties..."
const spliceChangeMusic = (children: any[], appid: number) => {
  if (!Array.isArray(children)) return

  const existingIdx = children.findIndex(
    (x: any) => x?.key === 'game-theme-music-change-music'
  )
  if (existingIdx !== -1) children.splice(existingIdx, 1)

  const propertiesMenuItemIdx = children.findIndex((item) =>
    findInReactTree(item, (x) =>
      Boolean(getFunctionSource(x?.onSelected)?.includes('AppProperties'))
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
      const appid: number | undefined =
        component?._owner?.pendingProps?.overview?.appid

      if (!appid) return component

      if (!patches.inner) {
        patches.inner = afterPatch(
          component.type.prototype,
          'shouldComponentUpdate',
          ([nextProps]: any, shouldUpdate: any) => {
            try {
              const gtmIdx = nextProps.children.findIndex(
                (x: any) => x?.key === 'game-theme-music-change-music'
              )
              if (gtmIdx != -1) nextProps.children.splice(gtmIdx, 1)
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
              return component
            }

            if (shouldUpdate === true) {
              let updatedAppid: number = appid
              // find the first menu component that has the correct appid assigned to _owner
              const parentOverview = nextProps.children.find(
                (x: any) =>
                  x?._owner?.pendingProps?.overview?.appid &&
                  x._owner.pendingProps.overview.appid !== appid
              )
              // if found then use that appid
              if (parentOverview) {
                updatedAppid = parentOverview._owner.pendingProps.overview.appid
              }
              spliceChangeMusic(nextProps.children, updatedAppid)
            }

            return shouldUpdate
          }
        )
      } else {
        spliceChangeMusic(component?.props?.children, appid)
      }

      return component
    }
  )
  patches.unpatch = () => {
    patches.outer?.unpatch()
    patches.inner?.unpatch()
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
    ? (Object.values(LibraryContextMenuExports).find((sibling) => {
        const source = getFunctionSource(sibling)
        return (
          source?.includes('createElement') && source.includes('navigator:')
        )
      }) as ComponentFactory | undefined)
    : undefined

export const LibraryContextMenu = LibraryContextMenuModule
  ? fakeRenderComponent(LibraryContextMenuModule)?.type
  : undefined

export default contextMenuPatch
