import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

const css = `
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, "Segoe UI", Roboto, sans-serif; background: #F5F3EE; color: #231E1E; -webkit-font-smoothing: antialiased; }
  button { font-family: inherit; }
  input, select, textarea { font-family: inherit; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #8a8578; padding: 8px 10px; border-bottom: 2px solid #e0ddd3; white-space: nowrap; }
  td { padding: 9px 10px; border-bottom: 1px solid #eeebe4; font-size: 13px; vertical-align: top; white-space: nowrap; }
  td.wrap { white-space: normal; min-width: 140px; }
  tr.row:hover td { background: #FBF8F2; cursor: pointer; }
  .nav button { background: none; border: none; color: #d8d2c6; font-weight: 600; font-size: 14px; padding: 10px 14px; cursor: pointer; border-bottom: 3px solid transparent; }
  .nav button.on { color: #fff; border-bottom-color: #F09128; }
  @media (max-width: 720px) { .hide-sm { display: none; } .tiles { grid-template-columns: 1fr 1fr !important; } }
`;
const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
