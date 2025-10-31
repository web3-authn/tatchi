import { ref, onMounted, onUnmounted, watch, type Ref } from 'vue'

// Composition util to position a postfix <span> immediately after the
// current input value, mirroring font metrics for accurate placement.
export function usePostfixPosition(username: Ref<string>) {
  const inputRef = ref<HTMLInputElement | null>(null)
  const postfixRef = ref<HTMLSpanElement | null>(null)
  let ctx: CanvasRenderingContext2D | null = null

  function measureAndPosition() {
    const input = inputRef.value
    const postfix = postfixRef.value
    if (!input || !postfix) return
    const value = (username.value || '')
    if (!value) {
      postfix.style.visibility = 'hidden'
      postfix.style.left = '0px'
      return
    }
    if (!ctx) {
      const c = document.createElement('canvas')
      ctx = c.getContext('2d')
    }
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

  function scheduleMeasure() {
    requestAnimationFrame(() => requestAnimationFrame(measureAndPosition))
  }

  watch(username, scheduleMeasure)
  onMounted(() => { window.addEventListener('resize', scheduleMeasure) })
  onUnmounted(() => { window.removeEventListener('resize', scheduleMeasure) })

  return { inputRef, postfixRef, scheduleMeasure }
}

