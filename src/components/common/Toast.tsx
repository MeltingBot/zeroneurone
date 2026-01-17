import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStore, type ToastType } from '../../stores/toastStore';

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles: Record<ToastType, string> = {
  success: 'bg-pastel-green border-success text-text-primary',
  error: 'bg-pastel-pink border-error text-text-primary',
  info: 'bg-pastel-blue border-border-strong text-text-primary',
  warning: 'bg-pastel-yellow border-warning text-text-primary',
};

const iconStyles: Record<ToastType, string> = {
  success: 'text-success',
  error: 'text-error',
  info: 'text-text-secondary',
  warning: 'text-warning',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <ToastItem
            key={toast.id}
            id={toast.id}
            type={toast.type}
            message={toast.message}
            Icon={Icon}
            onRemove={removeToast}
          />
        );
      })}
    </div>
  );
}

interface ToastItemProps {
  id: string;
  type: ToastType;
  message: string;
  Icon: typeof CheckCircle;
  onRemove: (id: string) => void;
}

function ToastItem({ id, type, message, Icon, onRemove }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(id), 200);
  };

  useEffect(() => {
    // Allow keyboard dismissal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleRemove();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        flex items-start gap-3 p-3 sketchy-border-soft border node-shadow
        transition-all duration-200
        ${styles[type]}
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
        animate-slide-in
      `}
    >
      <Icon size={18} className={`shrink-0 mt-0.5 ${iconStyles[type]}`} />
      <p className="flex-1 text-sm">{message}</p>
      <button
        onClick={handleRemove}
        className="shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
        aria-label="Fermer"
      >
        <X size={14} />
      </button>
    </div>
  );
}
