"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  X,
  Inbox,
  ChevronRight,
} from "lucide-react";
export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`glass ${className}`}>{children}</section>;
}
export function PageHeader({
  eyebrow,
  title,
  detail,
  action,
  back,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
  back?: () => void;
}) {
  return (
    <header className="page-heading">
      {back && (
        <button className="back" onClick={back}>
          <ArrowLeft size={19} /> Back
        </button>
      )}
      <div className="heading-line">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {detail && <p className="muted">{detail}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
export function DashboardSection({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  action?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <GlassCard className={className}>
      <div className="section-title">
        <h2>
          {icon}
          {title}
        </h2>
        {action && (
          <button className="text-button" onClick={action}>
            See all <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      {children}
    </GlassCard>
  );
}
export function EmptyState({
  title = "A little space for what’s next",
  body = "Add something to keep it close at hand.",
  action,
  label = "Add your first item",
}: {
  title?: string;
  body?: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <button className="primary" onClick={action}>
          <Plus size={18} />
          {label}
        </button>
      )}
    </div>
  );
}
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className="sheet"
          aria-describedby={description ? "sheet-description" : undefined}
        >
          <div className="sheet-handle" />
          <div className="sheet-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description id="sheet-description" className="muted">
              {description}
            </Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Confirm({
  title,
  body,
  onConfirm,
  children,
}: {
  title: string;
  body: string;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="overlay" />
        <AlertDialog.Content className="confirm glass">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{body}</AlertDialog.Description>
          <div className="button-row">
            <AlertDialog.Cancel className="secondary">
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action className="danger-button" onClick={onConfirm}>
              Confirm
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
export function SkeletonCard() {
  return (
    <div className="glass skeleton">
      <div />
      <div />
      <div />
    </div>
  );
}
export function RowLink({
  icon,
  title,
  detail,
  onClick,
  end,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  onClick: () => void;
  end?: ReactNode;
}) {
  return (
    <button className="row-link" onClick={onClick}>
      <span className="icon-tile">{icon}</span>
      <span className="row-main">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {end || <ChevronRight size={18} />}
    </button>
  );
}
