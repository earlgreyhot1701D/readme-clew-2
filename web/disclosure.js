// One button that shows and hides one panel. Used by the HOW? toggle and every bucket header.
// Returns set(open), so callers can open or close it from code.
export function bindDisclosure(button, panel, { open = false, onToggle } = {}) {
  const set = (value) => {
    button.setAttribute('aria-expanded', String(value));
    panel.hidden = !value;
    if (onToggle) onToggle(value);
  };
  button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
  set(open);
  return set;
}
