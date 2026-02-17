import { useToastStore } from '@renderer/hooks/useToast';

export function ToastContainer(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) {
    return <></>;
  }

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`} onClick={() => removeToast(toast.id)}>
          <div className="toast-icon">
            {toast.type === 'success' && 'OK'}
            {toast.type === 'error' && '!'}
            {toast.type === 'warning' && '!'}
            {toast.type === 'info' && 'i'}
          </div>
          <div className="toast-message">{toast.message}</div>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              removeToast(toast.id);
            }}
            aria-label="Close"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
