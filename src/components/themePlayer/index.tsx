import { ReactElement, useEffect } from 'react'

import useThemeMusic from '../../hooks/useThemeMusic'
import { useSettings } from '../../hooks/useSettings'
import { getCache } from '../../cache/musicCache'
import useAudioPlayer from '../../hooks/useAudioPlayer'
import { useParams } from '../../hooks/useParams'

export default function ThemePlayer({
  appId
}: {
  appId?: number
}): ReactElement {
  const { settings, isLoading: settingsIsLoading } = useSettings()
  const { appid } = useParams<{ appid: string }>()
  const resolvedAppId = appId ?? parseInt(appid)
  const { audio } = useThemeMusic(resolvedAppId)
  const audioPlayer = useAudioPlayer(audio.audioUrl)

  useEffect(() => {
    async function getData() {
      const cache = await getCache(resolvedAppId)
      if (typeof cache?.volume === 'number' && isFinite(cache.volume)) {
        audioPlayer.setVolume(cache.volume)
      } else {
        audioPlayer.setVolume(settings.volume)
      }
    }
    if (!settingsIsLoading && Number.isFinite(resolvedAppId)) {
      getData()
    }
  }, [resolvedAppId, settingsIsLoading])

  useEffect(() => {
    if (audio?.audioUrl?.length && audioPlayer.isReady) {
      audioPlayer.play()
    }
  }, [audio?.audioUrl, audioPlayer.isReady])

  return <></>
}
