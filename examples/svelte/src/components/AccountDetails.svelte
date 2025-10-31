<script lang="ts">
  // Basic account details viewer for LoginState-like objects
  export interface UserDataLike {
    deviceNumber?: number
    registeredAt?: number
    lastLogin?: number
  }
  export interface LoginStateLike {
    nearAccountId?: string | null
    publicKey?: string | null
    vrfActive?: boolean
    vrfSessionDuration?: number
    userData?: UserDataLike | null
  }

  export let details: LoginStateLike
  export let fallbackAccount: string | null = null

  function fmtDate(ts?: number): string {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleString() } catch { return String(ts) }
  }
</script>

<section class="account-details">
  <h3>Account Details</h3>
  <ul>
    <li>
      <span class="label">Account ID:</span>
      <span class="value">{details?.nearAccountId || fallbackAccount || '—'}</span>
    </li>
    <li>
      <span class="label">Public Key:</span>
      <code class="mono">{details?.publicKey || '—'}</code>
    </li>
    <li>
      <span class="label">VRF Active:</span>
      <span class="value">{details?.vrfActive ? 'yes' : 'no'}</span>
    </li>
    {#if details?.userData?.deviceNumber}
      <li>
        <span class="label">Device #:</span>
        <span class="value">{details.userData.deviceNumber}</span>
      </li>
    {/if}
    {#if details?.userData?.registeredAt}
      <li>
        <span class="label">Registered:</span>
        <span class="value">{fmtDate(details.userData.registeredAt)}</span>
      </li>
    {/if}
    {#if details?.userData?.lastLogin}
      <li>
        <span class="label">Last Login:</span>
        <span class="value">{fmtDate(details.userData.lastLogin)}</span>
      </li>
    {/if}
  </ul>
  <slot />
  
</section>

<style>
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

