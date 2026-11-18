"use client";

import { useRef, type ReactNode } from "react";
import { useFocusTrap } from "../../lib/use-focus-trap";

export type ModalDialogProps = {
  onClose?: () => void;
  labelledBy?: string;
  describedBy?: string;
  ariaLabel?: string;
  role?: "dialog" | "alertdialog";
  overlayClassName?: string;
  dialogClassName?: string;
  initialFocus?: string;
  /** 是否允许点击遮罩空白处关闭（要求按下与抬起都在遮罩上，防止拖拽选字误关）。默认 true。 */
  dismissOnBackdrop?: boolean;
  children: ReactNode;
};

export function ModalDialog({
  onClose,
  labelledBy,
  describedBy,
  ariaLabel,
  role = "dialog",
  overlayClassName = "confirm-overlay",
  dialogClassName = "confirm-dialog",
  initialFocus,
  dismissOnBackdrop = true,
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const pressedBackdropRef = useRef(false);

  useFocusTrap(dialogRef, {
    initialFocus,
    onEscape: onClose,
  });

  return (
    <div
      className={overlayClassName}
      role="presentation"
      onPointerDown={(event) => {
        pressedBackdropRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const releasedBackdrop = event.target === event.currentTarget;
        const shouldClose = dismissOnBackdrop && pressedBackdropRef.current && releasedBackdrop;
        pressedBackdropRef.current = false;
        if (shouldClose) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={dialogClassName}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
