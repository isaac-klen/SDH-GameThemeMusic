import { call } from '@decky/api'
import { YouTubeVideo, YouTubeVideoPreview } from '../../types/YouTube'
import { Settings, defaultSettings } from '../hooks/useSettings'

abstract class AudioResolver {
  abstract getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<YouTubeVideoPreview>
  abstract getAudioUrlFromVideo(
    video: YouTubeVideo
  ): Promise<string | undefined>
  abstract downloadAudio(video: YouTubeVideo): Promise<boolean>

  async getAudio(
    appName: string,
    downloadAudio = false
  ): Promise<{ videoId: string; audioUrl: string } | undefined> {
    const videos = this.getYouTubeSearchResults(appName + ' Theme Music')
    for await (const video of videos) {
      const audioUrl = await this.getAudioUrlFromVideo(video)
      if (audioUrl?.length) {
        if (downloadAudio) {
          const downloaded = await this.downloadAudio({
            id: video.id,
            url: audioUrl
          })
          if (downloaded) {
            const localAudioUrl = await this.getAudioUrlFromVideo({
              id: video.id
            })
            return { audioUrl: localAudioUrl ?? audioUrl, videoId: video.id }
          }
        }

        return { audioUrl, videoId: video.id }
      }
    }
    return undefined
  }
}

class InvidiousAudioResolver extends AudioResolver {
  async getEndpoint() {
    const savedSettings = await call<[string, Settings], Settings>(
      'get_setting',
      'settings',
      defaultSettings
    )
    return savedSettings.invidiousInstance
  }

  async *getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<YouTubeVideoPreview> {
    try {
      const endpoint = await this.getEndpoint()
      const results = await call<[string, string], YouTubeVideoPreview[]>(
        'search_invidious',
        endpoint,
        searchTerm
      )
      if (results.length) {
        yield* results.filter((res) => res.id.length)
        return
      }
    } catch (err) {
      console.debug(err)
    }

    yield* new YtDlpAudioResolver().getYouTubeSearchResults(searchTerm)
    return
  }

  async getAudioUrlFromVideo(video: YouTubeVideo): Promise<string | undefined> {
    const localAudioUrl = await call<[string], string | null>(
      'local_audio_url',
      video.id
    )
    if (localAudioUrl) {
      return localAudioUrl
    }

    if (video.url) {
      return video.url
    }

    try {
      const endpoint = await this.getEndpoint()
      const audioUrl = await call<[string, string], string | null>(
        'invidious_audio_url',
        endpoint,
        video.id
      )
      if (audioUrl) {
        return audioUrl
      }
    } catch (err) {
      console.log(err)
    }

    return new YtDlpAudioResolver().getAudioUrlFromVideo(video)
  }

  async downloadAudio(video: YouTubeVideo): Promise<boolean> {
    if (!video.id) return true

    const ytDlpResolver = new YtDlpAudioResolver()
    if (await ytDlpResolver.downloadAudio({ id: video.id })) {
      return true
    }

    if (!video.url) {
      video.url = await this.getAudioUrlFromVideo(video)
      if (!video.url) {
        return false
      }
    }
    try {
      await call<[string, string]>('download_url', video.url, video.id)
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }
}

class YtDlpAudioResolver extends AudioResolver {
  async *getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<YouTubeVideoPreview> {
    try {
      await call<[string]>('search_yt', searchTerm)
      let result = await call<[], YouTubeVideoPreview | null>('next_yt_result')
      while (result) {
        yield result
        result = await call<[], YouTubeVideoPreview | null>('next_yt_result')
      }
      return
    } catch (err) {
      console.error(err)
    }
    return
  }

  async getAudioUrlFromVideo(video: YouTubeVideo): Promise<string | undefined> {
    if (video.url) {
      return video.url
    } else {
      // We need to retrieve the audio URL first.
      // This may return a local filesystem URL if the file has been downloaded before.
      const result = await call<[string], string | null>(
        'single_yt_url',
        video.id
      )
      return result || undefined
    }
  }

  async downloadAudio(video: YouTubeVideo): Promise<boolean> {
    if (!video.id) return true

    try {
      await call<[string]>('download_yt_audio', video.id)
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }
}

export function getResolver(useYtDlp: boolean): AudioResolver {
  if (useYtDlp) {
    return new YtDlpAudioResolver()
  } else {
    return new InvidiousAudioResolver()
  }
}

type InvidiousInstance = {
  flag: string
  region: string
  stats: {
    version: string
    software: {
      name: string
      version: string
      branch: string
    }
    openRegistrations: boolean
    usage: {
      users: {
        total: number
        activeHalfyear: number
        activeMonth: number
      }
    }
    metadata: {
      updatedAt: number
      lastChannelRefreshedAt: number
    }
    playback?: {
      totalRequests?: number
      successfulRequests?: number
      ratio?: number
    }
  } | null
  cors: boolean | null
  api: boolean | null
  type: string
  uri: string
  monitor: {
    token: string
    url: string
    alias: string
    last_status: number
    uptime: number
    down: boolean
    down_since: string | null
    up_since: string | null
    error: string | null
    period: number
    apdex_t: number
    string_match: string
    enabled: boolean
    published: boolean
    disabled_locations: string[]
    recipients: string[]
    last_check_at: string
    next_check_at: string
    created_at: string
    mute_until: string | null
    favicon_url: string
    custom_headers: Record<string, string>
    http_verb: string
    http_body: string
    ssl: {
      tested_at: string
      expires_at: string
      valid: boolean
      error: string | null
    }
  }
}

type InvidiousInstances = InvidiousInstance[]

export async function getInvidiousInstances(): Promise<
  { name: string; url: string }[]
> {
  try {
    const res = await fetch(
      'https://api.invidious.io/instances.json?&sort_by=users,health'
    )
    if (res.status === 200) {
      const instances: InvidiousInstances = (await res.json()).map(
        ([, instance]: [string, InvidiousInstance]) => instance
      )
      if (instances?.length) {
        return instances
          .filter((ins) => ins.type === 'https')
          .map((ins) => ({
            name: `${ins.flag} ${ins.monitor?.alias ?? ins.uri} | ${ins.stats?.usage.users.total} Users${
              ins.monitor?.uptime
                ? ` | Uptime: ${(ins.monitor.uptime / 100).toLocaleString(
                    'en',
                    {
                      style: 'percent'
                    }
                  )}`
                : ''
            }`,
            url: ins.uri
          }))
      }
    }
  } catch (err) {
    console.debug(err)
  }
  return []
}
