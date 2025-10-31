import { ref } from 'vue'

export type Severity = 'info' | 'success' | 'warning' | 'error' | 'warn'

const visible = ref(false)
const message = ref('')
const type = ref<'info' | 'success' | 'warning' | 'error'>('info')
let timer: any = null

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null }
}

export function useToastState() {
  return { visible, message, type }
}

export function notifyToast(msg: string, severity: Severity = 'info', timeoutMs = 4000) {
  message.value = msg
  type.value = (severity === 'warn' ? 'warning' : severity) as 'info' | 'success' | 'warning' | 'error'
  visible.value = true
  clearTimer()
  if (timeoutMs > 0) timer = setTimeout(() => { visible.value = false }, timeoutMs)
}

