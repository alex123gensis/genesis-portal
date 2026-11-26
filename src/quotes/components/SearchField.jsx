import { useEffect, useRef, useState } from "react";

// Same searchable-dropdown-with-quick-add pattern as the original app —
// type to filter, pick from the list, or add a new entry if nothing matches.
export default function SearchField({ value, onChange, options, getLabel = (o) => o, placeholder, onAddNew, onPick, disabled, strict = false, addLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const boxRef = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  // strict (Inventory 113): typing only filters the list - the value changes when an entry is picked, and "+ Add" opens the
  // register form instead of saving the typed text. Clicking away puts the picked value back.
  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); if (strict) setQuery(value || ""); } };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [strict, value]);

  const q = query.trim().toLowerCase();
  const clearStrict = () => { if (strict && value && !query.trim()) onChange(""); };
  const matches = !q ? options.slice(0, 8) : options.filter((o) => getLabel(o).toLowerCase().includes(q)).slice(0, 8);
  const exactMatch = !q || options.some((o) => getLabel(o).toLowerCase() === q);
  const canAddNew = onAddNew && q && !exactMatch;

  const pick = (opt) => { setQuery(getLabel(opt)); onChange(getLabel(opt)); setOpen(false); if (onPick) onPick(opt); };
  const addNew = () => { const name = query.trim(); if (!name) return; onAddNew(name); if (!strict) onChange(name); setOpen(false); };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => !disabled && setOpen(true)}
        onBlur={clearStrict}
        onChange={(e) => { setQuery(e.target.value); if (!strict) onChange(e.target.value); setOpen(true); }}
        style={{ width: "100%", padding: "8px 9px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, boxSizing: "border-box", background: disabled ? "#f0f0f0" : "#fff" }}
      />
      {!disabled && open && (matches.length > 0 || canAddNew) && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "#fff", border: "1px solid #ccc", borderRadius: 4, maxHeight: 200, overflowY: "auto", boxShadow: "0 6px 16px rgba(0,0,0,0.15)" }}>
          {matches.map((opt, i) => (
            <div key={i} onMouseDown={() => pick(opt)} style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid #eee" }}>
              {getLabel(opt)}
            </div>
          ))}
          {canAddNew && (
            <div onMouseDown={addNew} style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700, color: "#231E1E", background: "#f5f4ef" }}>
              {strict ? (addLabel || "+ Not in the register - add") : "+ Add"} "{query.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
