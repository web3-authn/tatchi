<script setup lang="ts">
// Basic account details viewer for LoginState-like objects
// Props intentionally typed loosely to avoid coupling example to SDK types
interface UserDataLike {
  deviceNumber?: number
  registeredAt?: number
  lastLogin?: number
}
interface LoginStateLike {
  nearAccountId?: string | null
  publicKey?: string | null
  vrfActive?: boolean
  vrfSessionDuration?: number
  userData?: UserDataLike | null
}

const props = defineProps<{ details: LoginStateLike, fallbackAccount?: string | null }>()

function fmtDate(ts?: number) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleString() } catch { return String(ts) }
}
</script>

<template>
  <section class="account-details">
    <h3>Account Details</h3>
    <ul>
      <li>
        <span class="label">Account ID:</span>
        <span class="value">{{ props.details?.nearAccountId || props.fallbackAccount || '—' }}</span>
      </li>
      <li>
        <span class="label">Public Key:</span>
        <code class="mono">{{ props.details?.publicKey || '—' }}</code>
      </li>
      <li>
        <span class="label">VRF Active:</span>
        <span class="value">{{ props.details?.vrfActive ? 'yes' : 'no' }}</span>
      </li>
      <li v-if="props.details?.userData?.deviceNumber">
        <span class="label">Device #:</span>
        <span class="value">{{ props.details.userData.deviceNumber }}</span>
      </li>
      <li v-if="props.details?.userData?.registeredAt">
        <span class="label">Registered:</span>
        <span class="value">{{ fmtDate(props.details.userData.registeredAt) }}</span>
      </li>
      <li v-if="props.details?.userData?.lastLogin">
        <span class="label">Last Login:</span>
        <span class="value">{{ fmtDate(props.details.userData.lastLogin) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.account-details {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.account-details h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}
.account-details ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}
.label { color: #6b7280; margin-right: 6px; }
.value { color: #111827; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
</style>

