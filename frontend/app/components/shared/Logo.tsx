export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="10" fill="#ccff00" />
      <path
        d="M23 7L12 22H19.5L17 33L28 18H20.5L23 7Z"
        fill="#0a0a0a"
      />
    </svg>
  );
}
