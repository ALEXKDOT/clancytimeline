import fs from "node:fs";
import path from "node:path";

const root = path.resolve("standalone-build");
const source = fs.readFileSync(path.join(root, "index.html"), "utf8");

let html = source.replace(/<link rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g, (_, href) => {
  const css = fs.readFileSync(path.resolve(root, href.replace(/^\.\//, "")), "utf8");
  return `<style>${css}</style>`;
});

html = html.replace(/<script type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const javascript = fs.readFileSync(path.resolve(root, src.replace(/^\.\//, "")), "utf8");
  return `<script type="module">${javascript}</script>`;
});

const destination = path.resolve("standalone-dist");
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, "Clancy_Interactive_Clinical_Timeline.html"), html);
