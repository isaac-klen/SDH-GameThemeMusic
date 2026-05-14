import { ReactRouter } from '@decky/ui'

const getFunctionSource = (value: unknown): string | undefined => {
  if (typeof value !== 'function') return undefined

  try {
    return Function.prototype.toString.call(value)
  } catch {
    return undefined
  }
}

const useParamsFromRouter = Object.values(ReactRouter ?? {}).find((value) =>
  /return (\w)\?\1\.params:{}/.test(getFunctionSource(value) ?? '')
) as (<T>() => T) | undefined

export const useParams = <T,>(): T => {
  return useParamsFromRouter ? useParamsFromRouter<T>() : ({} as T)
}
