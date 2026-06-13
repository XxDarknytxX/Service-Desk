/**
 * Textarea Component (standalone module)
 *
 * Re-exports the design-system Textarea from Input.jsx so that both
 * `import Textarea from "./ui/Textarea"` and `import { Textarea } from "./ui/Input"`
 * resolve to the same fully-styled component (focus ring, label/error/helper support).
 */

export { Textarea as default } from "./Input";
