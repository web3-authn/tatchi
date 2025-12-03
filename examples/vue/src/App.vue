<script setup lang="ts">
import { ref, reactive, toRefs, onMounted, nextTick } from 'vue'
import { TatchiPasskey, type TatchiPasskeyConfigs } from '@tatchi-xyz/sdk'
import { usePostfixPosition } from './composables/usePostfixPosition'
import AccountDetails from './components/AccountDetails.vue'
import Toast, { notify as notifyToast } from './components/Toast.vue'

const relayerUrl = import.meta.env.VITE_RELAYER_URL || 'https://relay-server.localhost'
const walletOrigin = import.meta.env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost'

const ACCOUNT_DOMAIN = 'w3a-v1.testnet'

const config: TatchiPasskeyConfigs = {
  nearNetwork: 'testnet',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  contractId: ACCOUNT_DOMAIN,
  relayer: { url: relayerUrl },
  iframeWallet: { walletOrigin, sdkBasePath: '/sdk' },
}

const pm = new TatchiPasskey(config)

// Group UI state into a single reactive object to reduce boilerplate
const state = reactive<{
  username: string
  waiting: boolean
  iframeReady: boolean
  isLoggedIn: boolean
  currentAccount: string | null
  loginDetails: any | null
}>({
  username: '',
  waiting: false,
  iframeReady: false,
  isLoggedIn: false,
  currentAccount: null,
  loginDetails: null,
})

const { username, waiting, iframeReady, isLoggedIn, currentAccount, loginDetails } = toRefs(state)

const postfixText = `.${ACCOUNT_DOMAIN}`
// Postfix overlay positioning
const { inputRef, postfixRef, scheduleMeasure } = usePostfixPosition(username)

onMounted(async () => {
  try {
    await pm.initWalletIframe() // establish iframe client when walletOrigin is set
    iframeReady.value = !!pm.getWalletIframeClient()?.isReady()
  } catch (e) { console.warn('[vue] iframe init warn:', e) }
  try {
    const st = await pm.getLoginState()
    isLoggedIn.value = !!st.vrfActive
    currentAccount.value = st.nearAccountId || null
    loginDetails.value = st as any
    // Prefill input with recent account username (without ".${ACCOUNT_DOMAIN}")
    if (!username.value && st.nearAccountId) {
      const suffix = `.${ACCOUNT_DOMAIN}`
      const acct = st.nearAccountId
      const base = acct.endsWith(suffix) ? acct.slice(0, -suffix.length) : acct
      username.value = base
      await nextTick()
      try { scheduleMeasure() } catch {}
    }
  } catch {}
})

async function register() {
  const id = username.value.trim()
  if (!id) return
  const fullId = `${id}.${ACCOUNT_DOMAIN}`
  waiting.value = true
  notifyToast('Starting registration…')
  try {
    const res = await pm.registerPasskey(fullId, {
      onEvent: (ev) => { notifyToast(`${ev.phase ?? ev.step}: ${ev.message}`) },
      onError: (err) => { notifyToast(err.message || String(err), 'error') },
    })
    if (res?.success) {
      notifyToast('Registered successfully', 'success')
      const st = await pm.getLoginState(fullId)
      isLoggedIn.value = !!st.vrfActive
      currentAccount.value = fullId
      loginDetails.value = st as any
    } else {
      notifyToast(res?.error || 'Registration failed', 'error')
    }
  } catch (e: any) {
    notifyToast(e?.message || String(e), 'error')
  } finally {
    waiting.value = false
  }
}

async function login() {
  const id = username.value.trim()
  if (!id) return
  const fullId = `${id}.${ACCOUNT_DOMAIN}`
  waiting.value = true
  notifyToast('Starting login…')
  try {
    const res = await pm.loginPasskey(fullId, {
      onEvent: (ev) => { notifyToast(`${ev.phase ?? ev.step}: ${ev.message}`) },
      onError: (err) => { notifyToast(err.message || String(err), 'error') },
    })
    if (res?.success) {
      notifyToast('Logged in successfully', 'success')
      const st = await pm.getLoginState(fullId)
      isLoggedIn.value = !!st.vrfActive
      currentAccount.value = fullId
      loginDetails.value = st as any
    } else {
      notifyToast(res?.error || 'Login failed', 'error')
    }
  } catch (e: any) {
    notifyToast(e?.message || String(e), 'error')
  } finally {
    waiting.value = false
  }
}
</script>

<template>
  <main class="app-main">
    <h1>Vue Tatchi Passkey Example</h1>
    <p>Wallet iframe runs on <code>{{ walletOrigin }}</code></p>
    <p>Ensure your dev server sets Permissions-Policy and CSP headers in vite.config.ts with the tatchiHeaders() plugin.</p>
    <br/>
    <h2>Tatchi Status</h2>
    <ul>
      <li>iframe ready: <strong>{{ iframeReady }}</strong></li>
      <li>logged in: <strong>{{ isLoggedIn }}</strong></li>
      <li v-if="currentAccount">recent account: <strong>{{ currentAccount }}</strong></li>
    </ul>

    <AccountDetails v-if="isLoggedIn && loginDetails" :details="loginDetails" :fallback-account="currentAccount" />

    <div class="actions">
      <div class="input-wrap">
        <input
          ref="inputRef"
          v-model="username"
          placeholder="alice"
          class="username"
          @input="scheduleMeasure"
        />
        <span ref="postfixRef" class="postfix">
          {{ postfixText }}
        </span>
      </div>
      <button :disabled="waiting || !username" @click="register" class="btn">
        {{ waiting ? 'Registering…' : 'Register' }}
      </button>
      <button :disabled="waiting || !username" @click="login" class="btn">
        {{ waiting ? 'Logging in…' : 'Login' }}
      </button>
    </div>

    <Toast />
  </main>

  <footer class="app-footer">
    <a href="https://tatchi.xyz" target="_blank">tatchi.xyz</a>
  </footer>
</template>

<style scoped>
.app-main {
  padding: 24px;
  font-family: system-ui, Arial, sans-serif;
}

h1 { font-size: 1.5rem; }
h2 { font-size: 1.25rem; }

.actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-wrap {
  position: relative;
  display: inline-block;
}

.username {
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  min-width: 200px;
}

.postfix {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  color: #888;
  white-space: pre;
  visibility: hidden;
  pointer-events: none;
}

.btn {
  padding: 8px 12px;
  border-radius: 6px;
}

.app-footer {
  padding: 16px;
  color: #666;
}
</style>
