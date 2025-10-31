<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PasskeyManager, type PasskeyManagerConfigs } from '@tatchi-xyz/sdk'
import { usePostfixPosition } from './composables/usePostfixPosition'

const relayerUrl = import.meta.env.VITE_RELAYER_URL || 'https://relay-server.localhost'
const walletOrigin = import.meta.env.VITE_WALLET_ORIGIN || 'https://wallet.tatchi.xyz'

const ACCOUNT_DOMAIN = 'w3a-v1.testnet'

const config: PasskeyManagerConfigs = {
  nearNetwork: 'testnet',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  contractId: ACCOUNT_DOMAIN,
  relayer: { accountId: ACCOUNT_DOMAIN, url: relayerUrl },
  iframeWallet: { walletOrigin, sdkBasePath: '/sdk' },
}

const pm = new PasskeyManager(config)

const username = ref('')
const waiting = ref(false)
const lastEvent = ref('')
const iframeReady = ref(false)
const isLoggedIn = ref(false)
const currentAccount = ref<string | null>(null)

const postfixText = `.${ACCOUNT_DOMAIN}`
// Postfix overlay positioning
const { inputRef, postfixRef, scheduleMeasure } = usePostfixPosition(username)

onMounted(async () => {
  try {
    await pm.initWalletIframe() // establish iframe client when walletOrigin is set
    iframeReady.value = !!pm.getServiceClient()?.isReady()
  } catch (e) { console.warn('[vue] iframe init warn:', e) }
  try { await pm.warmCriticalResources() } catch {}
  try {
    const st = await pm.getLoginState()
    isLoggedIn.value = !!st.vrfActive
    currentAccount.value = st.nearAccountId || null
  } catch {}
})

async function register() {
  const id = username.value.trim()
  if (!id) return
  const fullId = `${id}.${ACCOUNT_DOMAIN}`
  waiting.value = true
  lastEvent.value = 'Starting registration…'
  try {
    const res = await pm.registerPasskey(fullId, {
      onEvent: (ev) => { lastEvent.value = `${ev.phase ?? ev.step}: ${ev.message}` },
      onError: (err) => { lastEvent.value = err.message || String(err) },
    })
    if (res?.success) {
      lastEvent.value = 'Registered successfully'
      const st = await pm.getLoginState(fullId)
      isLoggedIn.value = !!st.vrfActive
      currentAccount.value = fullId
    } else {
      lastEvent.value = res?.error || 'Registration failed'
    }
  } catch (e: any) {
    lastEvent.value = e?.message || String(e)
  } finally {
    waiting.value = false
  }
}
</script>

<template>
  <main style="padding: 24px; font-family: system-ui, Arial, sans-serif;">
    <h1>Vue + PasskeyManager (wallet iframe mode)</h1>
    <p>Wallet iframe runs on <code>{{ walletOrigin }}</code>; this app delegates WebAuthn.</p>
    <ul>
      <li>iframe ready: <strong>{{ iframeReady }}</strong></li>
      <li>logged in: <strong>{{ isLoggedIn }}</strong></li>
      <li v-if="currentAccount">account: <strong>{{ currentAccount }}</strong></li>
    </ul>

    <div style="margin-top: 16px; display: flex; gap: 8px; align-items: center;">
      <div style="position: relative; display: inline-block;">
        <input
          ref="inputRef"
          v-model="username"
          placeholder="alice"
          style="padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px;"
          @input="scheduleMeasure"
        />
        <span ref="postfixRef" style="position: absolute; top: 50%; transform: translateY(-50%); color: #888; white-space: pre; visibility: hidden; pointer-events: none;">
          {{ postfixText }}
        </span>
      </div>
      <button :disabled="waiting || !username" @click="register" style="padding: 8px 12px; border-radius: 6px;">
        {{ waiting ? 'Registering…' : 'Register' }}
      </button>
    </div>

    <p v-if="lastEvent" style="margin-top: 8px; color: #555;">{{ lastEvent }}</p>
  </main>
  
  <footer style="padding: 16px; color: #666;">
    Ensure your dev server sets Permissions-Policy for WebAuthn and CSP frame-src for the wallet origin.
  </footer>
</template>
