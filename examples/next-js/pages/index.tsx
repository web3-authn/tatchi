import React from 'react'
import dynamic from 'next/dynamic'
import { PasskeyAuthMenuSkeleton } from '@tatchi-xyz/sdk/react/passkey-auth-menu'
import { markOnce, measureOnce } from '../lib/perf'

// Render client-only content to safely use React SDK context/hooks
const HomeClient = dynamic(async () => {
  markOnce('w3a:home-client:import:start')
  const mod = await import('../components/HomeClient')
  markOnce('w3a:home-client:import:end')
  measureOnce('w3a:home-client:import', 'w3a:home-client:import:start', 'w3a:home-client:import:end')
  return mod.default
}, { ssr: false, loading: () => <PasskeyAuthMenuSkeleton /> })

export default function Home() { return <HomeClient /> }
