import * as React from "react"

const ToastContext = React.createContext<{ toast: (opts: any) => void }>({ toast: () => {} })

export function useToast() {
  const [toasts, setToasts] = React.useState<any[]>([])

  const toast = React.useCallback((opts: any) => {
    alert(opts.title + "\n" + (opts.description || ''));
  }, [])

  return { toast }
}
