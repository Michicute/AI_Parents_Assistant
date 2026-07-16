import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default async function Icon() {
  const logo = await readFile(join(process.cwd(), "images", "logo_small.png"));

  return new Response(logo, {
    headers: {
      "content-type": contentType,
    },
  });
}
