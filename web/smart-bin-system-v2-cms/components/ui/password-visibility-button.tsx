type PasswordVisibilityButtonProps = {
  open: boolean;
  onToggle: () => void;
};

export function PasswordVisibilityButton({ open, onToggle }: PasswordVisibilityButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Hide password" : "Show password"}
      className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-slate-900"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        {open ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.5 10.5 0 0112 4.5c4.5 0 8.4 2.76 10.02 6.723a11.45 11.45 0 01-2.34 3.56M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-7.5 9.75-7.5S21.75 12 21.75 12s-3.75 7.5-9.75 7.5S2.25 12 2.25 12zM12 15a3 3 0 100-6 3 3 0 000 6z" />
        )}
      </svg>
    </button>
  );
}