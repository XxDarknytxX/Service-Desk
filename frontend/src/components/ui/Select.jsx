/**
 * Select Component (standalone module)
 *
 * Re-exports the design-system Select from Input.jsx so that both
 * `import Select from "./ui/Select"` and `import { Select } from "./ui/Input"`
 * resolve to the same fully-styled component (custom chevron, focus ring,
 * label/error/helper support).
 */

export { Select as default, SearchableSelect } from "./Input";
