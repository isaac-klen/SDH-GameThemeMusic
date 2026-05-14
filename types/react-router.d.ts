declare module 'react-router' {
  import type { ComponentType, ReactNode } from 'react'

  export interface RouteProps {
    path?: string | string[]
    exact?: boolean
    strict?: boolean
    sensitive?: boolean
    component?: ComponentType<Record<string, unknown>>
    render?: (props: Record<string, unknown>) => ReactNode
    children?: ReactNode | ((props: Record<string, unknown>) => ReactNode)
  }
}
