export async function notifyRuntimeBestEffort(
  sendMessage: (message: unknown) => Promise<unknown>,
  message: unknown,
): Promise<void> {
  try {
    await sendMessage(message);
  } catch {
    // Progress notifications are optional; IndexedDB remains the source of truth.
  }
}

