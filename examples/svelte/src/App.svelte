<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { TatchiPasskey, type TatchiPasskeyConfigs } from '@tatchi-xyz/sdk'
  import AccountDetails from './components/AccountDetails.svelte'
  import Toast from './components/Toast.svelte'

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
  let username = ''
  let waiting = false
  let lastEvent = ''
  let iframeReady = false
  let isLoggedIn = false
  let currentAccount: string | null = null
  let loginDetails: any | null = null

  // Toast state
  let toastVisible = false
  let toastMessage = ''
  let toastType: 'info' | 'success' | 'warning' | 'error' = 'info'
  let toastTimer: any = null

  function clearToastTimer() { if (toastTimer) { clearTimeout(toastTimer); toastTimer = null } }
  function notify(msg: string, severity: 'info' | 'success' | 'warning' | 'error' | 'warn' = 'info', life = 3500) {
    lastEvent = msg
    toastMessage = msg
    toastType = (severity === 'warn' ? 'warning' : severity) as any
    toastVisible = true
    clearToastTimer()
    if (life > 0) toastTimer = setTimeout(() => { toastVisible = false }, life)
  }

  // Postfix overlay positioning
  const postfixText = `.${ACCOUNT_DOMAIN}`
  let inputRef: HTMLInputElement | null = null
  let postfixRef: HTMLSpanElement | null = null
  let ctx: CanvasRenderingContext2D | null = null

  function measureAndPosition() {
    const input = inputRef
    const postfix = postfixRef
    if (!input || !postfix) return
    const value = (username || '')
    if (!value) {
      postfix.style.visibility = 'hidden'
      postfix.style.left = '0px'
      return
    }
    if (!ctx) { const c = document.createElement('canvas'); ctx = c.getContext('2d') }
    const cs = window.getComputedStyle(input)
    const font = cs.font && cs.font !== ''
      ? cs.font
      : `${cs.fontStyle || ''} ${cs.fontVariant || ''} ${cs.fontWeight || ''} ${cs.fontSize || '16px'} / ${cs.lineHeight || 'normal'} ${cs.fontFamily || 'sans-serif'}`
    if (ctx) ctx.font = font
    const text = value
    let width = ctx ? ctx.measureText(text).width : (text.length * 8)
    const letterSpacing = parseFloat(cs.letterSpacing || '0') || 0
    if (letterSpacing !== 0 && text.length > 1) width += letterSpacing * (text.length - 1)
    const padLeft = (parseFloat(cs.paddingLeft || '0') || 0) + (parseFloat(cs.borderLeftWidth || '0') || 0)
    postfix.style.left = `${Math.ceil(padLeft + width + 1)}px`
    postfix.style.visibility = 'visible'
  }
  function scheduleMeasure() { requestAnimationFrame(() => requestAnimationFrame(measureAndPosition)) }

  // React when username changes
  $: username, scheduleMeasure()

  onMount(async () => {
    try {
      await pm.initWalletIframe()
      iframeReady = !!pm.getWalletIframeClient()?.isReady()
    } catch (e) { console.warn('[svelte] iframe init warn:', e) }
    try {
      const { login: st } = await pm.getLoginSession()
      isLoggedIn = !!st.vrfActive
      currentAccount = st.nearAccountId || null
      loginDetails = st as any
      // Prefill input with recent account username (strip .ACCOUNT_DOMAIN)
      if (!username && st.nearAccountId) {
        const suffix = `.${ACCOUNT_DOMAIN}`
        const acct = st.nearAccountId
        const base = acct.endsWith(suffix) ? acct.slice(0, -suffix.length) : acct
        username = base
        await tick()
        scheduleMeasure()
      }
    } catch {}
    window.addEventListener('resize', scheduleMeasure)
  })

  async function register() {
    const id = (username || '').trim()
    if (!id) return
    const fullId = `${id}.${ACCOUNT_DOMAIN}`
    waiting = true
    notify('Starting registration…')
    try {
      const res = await pm.registerPasskey(fullId, {
        onEvent: (ev) => { notify(`${ev.phase ?? ev.step}: ${ev.message}`) },
        onError: (err) => { notify(err.message || String(err), 'error') },
      })
      if (res?.success) {
        notify('Registered successfully', 'success')
        const { login: st } = await pm.getLoginSession(fullId)
        isLoggedIn = !!st.vrfActive
        currentAccount = fullId
        loginDetails = st as any
      } else {
        notify(res?.error || 'Registration failed', 'error')
      }
    } catch (e: any) {
      notify(e?.message || String(e), 'error')
    } finally {
      waiting = false
    }
  }

  async function login() {
    const id = (username || '').trim()
    if (!id) return
    const fullId = `${id}.${ACCOUNT_DOMAIN}`
    waiting = true
    notify('Starting login…')
    try {
      const res = await pm.loginAndCreateSession(fullId, {
        onEvent: (ev) => { notify(`${ev.phase ?? ev.step}: ${ev.message}`) },
        onError: (err) => { notify(err.message || String(err), 'error') },
      })
      if (res?.success) {
        notify('Logged in successfully', 'success')
        const { login: st } = await pm.getLoginSession(fullId)
        isLoggedIn = !!st.vrfActive
        currentAccount = fullId
        loginDetails = st as any
      } else {
        notify(res?.error || 'Login failed', 'error')
      }
    } catch (e: any) {
      notify(e?.message || String(e), 'error')
    } finally {
      waiting = false
    }
  }
</script>

<main class="app-main">
  <h1>Svelte Tatchi Passkey Example</h1>
  <p>Wallet iframe runs on <code>{walletOrigin}</code></p>
  <p>Ensure your dev server sets Permissions-Policy and CSP headers in vite.config.ts with the tatchiHeaders() plugin.</p>
  <br/>
  <h2>Tatchi Status</h2>
  <ul>
    <li>iframe ready: <strong>{String(iframeReady)}</strong></li>
    <li>logged in: <strong>{String(isLoggedIn)}</strong></li>
    {#if currentAccount}<li>recent account: <strong>{currentAccount}</strong></li>{/if}
  </ul>

  {#if isLoggedIn && loginDetails}
    <AccountDetails details={loginDetails} fallbackAccount={currentAccount} />
  {/if}

  <div class="actions">
    <div class="input-wrap">
      <input
        bind:this={inputRef}
        bind:value={username}
        placeholder="alice"
        class="username"
        on:input={scheduleMeasure}
      />
      <span bind:this={postfixRef} class="postfix">{postfixText}</span>
    </div>
    <button class="btn" disabled={waiting || !username} on:click={register}>
      {waiting ? 'Registering…' : 'Register'}
    </button>
    <button class="btn" disabled={waiting || !username} on:click={login}>
      {waiting ? 'Logging in…' : 'Login'}
    </button>
  </div>

  <Toast visible={toastVisible} message={toastMessage} type={toastType} />
</main>

<footer class="app-footer">
  <a href="https://tatchi.xyz" target="_blank">tatchi.xyz</a>
</footer>

<style>
  .app-main { padding: 24px; }

  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.25rem; }

  .actions {
    margin-top: 16px;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .input-wrap { position: relative; display: inline-block; }

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

  .btn { padding: 8px 12px; border-radius: 6px; }

  .app-footer { padding: 16px; color: #666; }
</style>
