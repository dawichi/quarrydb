import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
const R = 28; // inner corner radius for each ring, scaled

const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- background -->
  <rect width="128" height="128" rx="28" fill="#0c1a2e"/>
  <!-- ring 1 (outermost) -->
  <rect x="14" y="14" width="100" height="100" rx="13" fill="none" stroke="#0ea5e9" stroke-width="9"/>
  <!-- ring 2 -->
  <rect x="29" y="29" width="70" height="70" rx="9" fill="none" stroke="#0284c7" stroke-width="8"/>
  <!-- ring 3 -->
  <rect x="43" y="43" width="42" height="42" rx="6" fill="none" stroke="#0369a1" stroke-width="7"/>
  <!-- center pit -->
  <rect x="55" y="55" width="18" height="18" rx="4" fill="#38bdf8"/>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: SIZE },
});
const png = resvg.render().asPng();
writeFileSync("src-tauri/icons/source-1024.png", png);
console.log("Generated src-tauri/icons/source-1024.png");
