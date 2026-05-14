/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  afterPatch,
  findInReactTree,
  findInTree,
  appDetailsClasses,
  basicAppDetailsSectionStylerClasses,
  createReactTreePatcher
} from '@decky/ui'
import { routerHook } from '@decky/api'
import { ReactElement } from 'react'
import ThemePlayer from '../components/themePlayer'
import {
  AudioLoaderCompatState,
  AudioLoaderCompatStateContextProvider
} from '../state/AudioLoaderCompatState'

const THEME_PLAYER_KEY = 'game-theme-music-theme-player'
const patchedRouteComponents = new WeakSet<object>()

const getOverviewAppId = (node: any): number | undefined => {
  const appId =
    node?.props?.overview?.appid ??
    node?.props?.app?.appid ??
    node?.app?.appid ??
    node?._owner?.pendingProps?.overview?.appid

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

const removeExistingThemePlayer = (children: any[]) => {
  const existingIdx = children.findIndex(
    (child) => child?.key === THEME_PLAYER_KEY
  )
  if (existingIdx !== -1) children.splice(existingIdx, 1)
}

const getThemePlayer = (
  AudioLoaderCompatState: AudioLoaderCompatState,
  appId: number
) => (
  <AudioLoaderCompatStateContextProvider
    key={THEME_PLAYER_KEY}
    AudioLoaderCompatStateClass={AudioLoaderCompatState}
  >
    <ThemePlayer appId={appId} />
  </AudioLoaderCompatStateContextProvider>
)

const injectThemePlayer = (
  ret: ReactElement | undefined,
  AudioLoaderCompatState: AudioLoaderCompatState,
  appId?: number
) => {
  if (!ret || typeof ret !== 'object') return ret

  const resolvedAppId = appId ?? findAppId(ret)
  if (!resolvedAppId) return ret

  const targetClassNames = [
    appDetailsClasses?.InnerContainer,
    basicAppDetailsSectionStylerClasses?.AppDetailsContent,
    basicAppDetailsSectionStylerClasses?.AppDetailsRoot
  ].filter((className): className is string => Boolean(className))

  const container = findInReactTree(
    ret,
    (x: ReactElement) =>
      Array.isArray(x?.props?.children) &&
      typeof x?.props?.className === 'string' &&
      targetClassNames.some((className) =>
        x.props.className.includes(className)
      )
  )

  const target =
    container ??
    findInReactTree(ret, (x: ReactElement) => Array.isArray(x?.props?.children))

  if (target?.props && Array.isArray(target.props.children)) {
    removeExistingThemePlayer(target.props.children)
    target.props.children.push(
      getThemePlayer(AudioLoaderCompatState, resolvedAppId)
    )
  } else if (ret.props) {
    ret.props.children = [
      ret.props.children,
      getThemePlayer(AudioLoaderCompatState, resolvedAppId)
    ]
  }

  return ret
}

const patchRouteChild = (
  routeChild: any,
  AudioLoaderCompatState: AudioLoaderCompatState
) => {
  if (
    !routeChild ||
    typeof routeChild !== 'object' ||
    typeof routeChild.type !== 'function' ||
    patchedRouteComponents.has(routeChild)
  ) {
    return
  }

  patchedRouteComponents.add(routeChild)
  const appId = findAppId(routeChild)

  afterPatch(
    routeChild,
    'type',
    (_: Array<Record<string, unknown>>, ret?: ReactElement) =>
      injectThemePlayer(ret, AudioLoaderCompatState, appId)
  )
}

function patchLibraryApp(AudioLoaderCompatState: AudioLoaderCompatState) {
  return routerHook.addPatch('/library/app/:appid', (tree) => {
    patchRouteChild(tree?.children, AudioLoaderCompatState)

    const routeProps = findInReactTree(tree, (x) => x?.renderFunc)
    if (routeProps) {
      const patchHandler = createReactTreePatcher(
        [
          (tree) =>
            findInReactTree(
              tree,
              (x: any) => x?.props?.children?.props?.overview
            )?.props?.children
        ],
        (_: Array<Record<string, unknown>>, ret?: ReactElement) =>
          injectThemePlayer(ret, AudioLoaderCompatState)
      )

      afterPatch(routeProps, 'renderFunc', patchHandler)
    }

    return tree
  })
}

export default patchLibraryApp
