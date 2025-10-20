import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * useDomLoginBridge
 * Reactive bridge for login state exposed on <body> by the docs app shell.
 * - Reads attributes: `data-w3a-logged-in`, `data-w3a-near-account-id`
 * - Listens to custom event: `w3a:login-state`
 * - Falls back to a MutationObserver on those attributes
 */
export function useDomLoginBridge(): { loggedIn: Ref<boolean>; nearAccountId: Ref<string | null> } {
  const loggedIn = ref<boolean>(false)
  const nearAccountId = ref<string | null>(null)

  const readFromDom = () => {
    try {
      const body = document.body
      loggedIn.value = body.getAttribute('data-w3a-logged-in') === 'true'
      nearAccountId.value = body.getAttribute('data-w3a-near-account-id')
    } catch {}
  }

  const onLoginState = (e: Event) => {
    const ce = e as CustomEvent<{ loggedIn?: boolean; nearAccountId?: string }>
    if (typeof ce?.detail?.loggedIn === 'boolean') loggedIn.value = !!ce.detail.loggedIn
    if (typeof ce?.detail?.nearAccountId === 'string') nearAccountId.value = ce.detail.nearAccountId
  }

  let mo: MutationObserver | null = null
  onMounted(() => {
    readFromDom()
    window.addEventListener('w3a:login-state', onLoginState)
    try {
      mo = new MutationObserver(readFromDom)
      mo.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-w3a-logged-in', 'data-w3a-near-account-id']
      })
    } catch {}
  })

  onUnmounted(() => {
    window.removeEventListener('w3a:login-state', onLoginState)
    try { mo?.disconnect() } catch {}
    mo = null
  })

  return { loggedIn, nearAccountId }
}

