import { readFileSync, writeFileSync } from "fs";

// Read the target version from the npm "version" script (npm_package_version).
const targetVersion = process.env.npm_package_version;

// Update manifest.json with the target version and keep the current minAppVersion.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

// Record the version -> minAppVersion mapping for older-app compatibility.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
