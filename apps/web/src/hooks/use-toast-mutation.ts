import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { useToast } from './use-toast';

export function useToastMutation<TData, TError extends Error, TVariables>(
  options: UseMutationOptions<TData, TError, TVariables> & { successMessage?: string },
) {
  const { toast } = useToast();
  return useMutation({
    ...options,
    onSuccess: (...args) => {
      if (options.successMessage) toast({ title: options.successMessage });
      options.onSuccess?.(...args);
    },
    onError: (error, ...args) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      options.onError?.(error, ...args);
    },
  });
}
