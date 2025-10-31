<script setup lang="ts">
import { useToastState } from '../composables/useToast'
const { visible, message, type } = useToastState()

function onClose() { visible.value = false }
</script>

<script lang="ts">
// Re-export notify so parents can import directly from this component module
export { notifyToast as notify } from '../composables/useToast'
</script>

<template>
  <transition name="toast-fade">
    <div v-if="visible" :class="['toast', type]" @click="onClose">
      <slot>
        {{ message }}
      </slot>
    </div>
  </transition>
</template>

<style scoped>
.toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  max-width: 360px;
  padding: 10px 12px;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
  color: #0b1020;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  z-index: 10000;
}
.toast.success { border-color: #10b981; box-shadow: 0 8px 24px rgba(16,185,129,0.18); }
.toast.warning { border-color: #f59e0b; box-shadow: 0 8px 24px rgba(245,158,11,0.18); }
.toast.error { border-color: #ef4444; box-shadow: 0 8px 24px rgba(239,68,68,0.18); }

.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity .18s ease, transform .18s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateY(8px); }
</style>
