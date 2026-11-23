// Renders a small status badge to static HTML with React's server renderer.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.js";

export function badge(label: string): string {
  return renderToStaticMarkup(createElement("span", { className: "badge" }, label));
}
