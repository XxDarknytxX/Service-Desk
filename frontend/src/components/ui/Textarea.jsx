function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Textarea({ className, ...props }) {
  return <textarea className={classNames("input-shell", className)} {...props} />;
}
