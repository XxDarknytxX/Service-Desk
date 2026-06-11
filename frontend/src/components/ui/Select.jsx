function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Select({ className, children, ...props }) {
  return (
    <select className={classNames("select-shell", className)} {...props}>
      {children}
    </select>
  );
}
