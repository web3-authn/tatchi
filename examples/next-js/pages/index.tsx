import React from 'react'
import dynamic from 'next/dynamic'

// Render client-only content to safely use React SDK context/hooks
const HomeClient = dynamic(() => import('./HomeClient'), { ssr: false })

export default function Home() { return <HomeClient /> }
