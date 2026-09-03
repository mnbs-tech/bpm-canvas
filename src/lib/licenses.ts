/**
 * OSS dependencies shown in the ⚙️ menu's ライセンス dialog (SPEC §3.21).
 *
 * Hand-maintained, same reasoning as `changelog.ts`: this only needs to change
 * when a direct dependency in `package.json` is added, removed or re-licensed,
 * which is rare enough that a build-time license scanner would be more
 * machinery than the problem warrants. Update this list in the same commit as
 * a `package.json` dependency change. `devDependencies` are excluded - they
 * don't ship in the running app.
 */
export interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  url: string;
}

/** Alphabetical by package name. */
export const LICENSES: LicenseEntry[] = [
  {
    name: "@aws-sdk/client-s3",
    version: "3.1123.0",
    license: "Apache-2.0",
    url: "https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-s3",
  },
  {
    name: "@xyflow/react",
    version: "12.11.5",
    license: "MIT",
    url: "https://reactflow.dev",
  },
  {
    name: "exceljs",
    version: "4.4.0",
    license: "MIT",
    url: "https://github.com/exceljs/exceljs",
  },
  {
    name: "html-to-image",
    version: "1.11.13",
    license: "MIT",
    url: "https://github.com/bubkoo/html-to-image",
  },
  {
    name: "jose",
    version: "6.2.10",
    license: "MIT",
    url: "https://github.com/panva/jose",
  },
  {
    name: "jspdf",
    version: "4.2.1",
    license: "MIT",
    url: "https://github.com/parallax/jsPDF",
  },
  {
    name: "jszip",
    version: "3.10.1",
    license: "MIT OR GPL-3.0-or-later",
    url: "https://github.com/Stuk/jszip",
  },
  {
    name: "next",
    version: "16.3.4",
    license: "MIT",
    url: "https://nextjs.org",
  },
  {
    name: "react",
    version: "19.2.8",
    license: "MIT",
    url: "https://react.dev",
  },
  {
    name: "react-dom",
    version: "19.2.8",
    license: "MIT",
    url: "https://react.dev",
  },
  {
    name: "uuid",
    version: "14.0.2",
    license: "MIT",
    url: "https://github.com/uuidjs/uuid",
  },
  {
    name: "zod",
    version: "4.5.4",
    license: "MIT",
    url: "https://zod.dev",
  },
];
