<script lang="ts">
  export let visible = false
  export let message = ''
  export let type: 'info' | 'success' | 'warning' | 'error' = 'info'

  function onClose() {
    visible = false
  }
</script>

{#if visible}
  <div class={`toast ${type}`} on:click={onClose}>
    <slot>{message}</slot>
  </div>
{/if}

<style>
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
    transition: opacity .18s ease, transform .18s ease;
  }
  .toast.success { border-color: #10b981; box-shadow: 0 8px 24px rgba(16,185,129,0.18); }
  .toast.warning { border-color: #f59e0b; box-shadow: 0 8px 24px rgba(245,158,11,0.18); }
  .toast.error { border-color: #ef4444; box-shadow: 0 8px 24px rgba(239,68,68,0.18); }
</style>

