type NodeConnectionActionOptions = {
  action: () => Promise<unknown>;
  successMessage: string;
  lock: { current: boolean };
  refetchProfile: () => Promise<{ isError: boolean; error?: unknown }>;
  invalidateMyNodes: () => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
};

function errorText(error: unknown) {
  const data = (error as { data?: { error?: string; message?: string } } | null)?.data;
  const message = data?.error ?? data?.message;
  if (message?.trim()) return message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'This action could not be completed. Please try again.';
}

export async function runNodeConnectionAction({
  action,
  successMessage,
  lock,
  refetchProfile,
  invalidateMyNodes,
  setError,
  setNotice,
}: NodeConnectionActionOptions): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  setError('');
  setNotice('');

  try {
    await action();
    const refreshed = await refetchProfile();
    if (refreshed.isError) {
      throw refreshed.error ?? new Error('The Node profile could not be refreshed.');
    }
    invalidateMyNodes();
    setNotice(successMessage);
    return true;
  } catch (error) {
    setError(errorText(error));
    return false;
  } finally {
    lock.current = false;
  }
}
