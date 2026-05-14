export type GameThemeMusicAppOverview = {
  appid?: string | number
  display_name?: string
}

type AppStoreCompat = {
  GetAppOverviewByAppID?: (appId: number) => GameThemeMusicAppOverview | null
  GetAppOverviewByGameID?: (appId: number) => GameThemeMusicAppOverview | null
}

const getAppStore = (): AppStoreCompat | undefined => {
  const globals = globalThis as typeof globalThis & {
    appStore?: AppStoreCompat
  }

  return window.appStore ?? globals.appStore
}

export const getAppOverview = (
  appId: number
): GameThemeMusicAppOverview | null => {
  const store = getAppStore()

  return (
    store?.GetAppOverviewByAppID?.(appId) ??
    store?.GetAppOverviewByGameID?.(appId) ??
    null
  )
}
