/**
 * Centralized error handling utilities for the Passkey SDK
 */

/**
 * Check if an error is related to user cancellation of TouchID/FaceID prompt
 * @param error - The error object or error message string
 * @returns true if the error indicates user cancellation
 */
export function isTouchIdCancellationError(error: any): boolean {
  const errorMessage = typeof error === 'string' ? error : error?.message || '';

  return errorMessage.includes('The operation either timed out or was not allowed') ||
         errorMessage.includes('NotAllowedError') ||
         errorMessage.includes('AbortError') ||
         errorMessage.includes('user cancelled') ||
         errorMessage.includes('user aborted');
}

/**
 * Get a user-friendly error message for TouchID/FaceID cancellation
 * @param context - The context where the cancellation occurred (e.g., 'registration', 'login')
 * @returns A user-friendly error message
 */
export function getTouchIdCancellationMessage(context: 'registration' | 'login'): string {
  switch (context) {
    case 'registration':
      return `Registration was cancelled. Please try again when you're ready to set up your passkey.`;
    case 'login':
      return `Login was cancelled. Please try again when you're ready to authenticate.`;
    default:
      return `Operation was cancelled. Please try again when you're ready.`;
  }
}

/**
 * Transform an error message to be more user-friendly
 * @param error - The original error object or message
 * @param context - The context where the error occurred
 * @param nearAccountId - Optional NEAR account ID for context-specific messages
 * @returns A user-friendly error message
 */
export function getUserFriendlyErrorMessage(
  error: any,
  context: 'registration' | 'login' = 'registration',
  nearAccountId?: string
): string {
  const errorMessage = typeof error === 'string' ? error : error?.message || '';

  // Handle TouchID/FaceID cancellation
  if (isTouchIdCancellationError(error)) {
    return getTouchIdCancellationMessage(context);
  }

  // Handle other common errors
  if (errorMessage.includes('one of the credentials already registered')) {
    return `A passkey for '${nearAccountId || 'this account'}' already exists. Please try logging in instead.`;
  }

  if (errorMessage.includes('Cannot deserialize the contract state')) {
    return `Contract state deserialization failed. This may be due to a contract upgrade. Please try again or contact support.`;
  }

  if (errorMessage.includes('Web3Authn contract registration check failed')) {
    return `Contract registration check failed: ${errorMessage.replace('Web3Authn contract registration check failed: ', '')}`;
  }

  if (errorMessage.includes('Unknown error occurred')) {
    return `${context === 'registration' ? 'Registration' : 'Login'} failed due to an unknown error. Please check your connection and try again.`;
  }

  // Return the original error message if no specific handling is needed
  return errorMessage;
}