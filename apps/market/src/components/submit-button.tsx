"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type SubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
};

export function SubmitButton({ children, className }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {pending ? "Подождите..." : children}
    </button>
  );
}
