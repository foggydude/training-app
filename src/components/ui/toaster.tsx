"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { Copy } from "lucide-react"
import React from "react"
import { cn } from "@/lib/utils"

export function Toaster() {
  const { toasts } = useToast()

  const handleCopy = (title?: React.ReactNode, description?: React.ReactNode) => {
    const titleString = (title && typeof title === 'string') ? title : '';
    const descriptionString = (description && typeof description === 'string') ? description : '';
    const textToCopy = [titleString, descriptionString].filter(Boolean).join('\n');
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
    }
  };

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const canCopy = (title && typeof title === 'string') || (description && typeof description === 'string');
        
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            {canCopy && (
                <button
                    onClick={() => handleCopy(title, description)}
                    aria-label="Copy message"
                    className={cn(
                      "absolute right-10 top-2 rounded-md p-1 text-foreground/50 opacity-0 ring-offset-background transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 group-hover:opacity-100",
                      "group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600"
                    )}
                >
                    <Copy className="h-4 w-4" />
                </button>
            )}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
