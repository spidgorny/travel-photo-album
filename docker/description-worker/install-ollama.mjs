import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

const archMap = {
	x64: "amd64",
	arm64: "arm64",
};

const arch = archMap[process.arch];
if (!arch) {
	throw new Error(`Unsupported architecture: ${process.arch}`);
}

const installRoot = "/usr/local";
const archiveBase = `https://ollama.com/download/ollama-linux-${arch}`;

const hasTarZst = await urlExists(`${archiveBase}.tar.zst`);
if (hasTarZst) {
	const archivePath = "/tmp/ollama.tar.zst";
	const tarPath = "/tmp/ollama.tar";
	await downloadFile(`${archiveBase}.tar.zst`, archivePath);
	const globalNodePath = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
	execFileSync(
		process.execPath,
		[
			"-e",
			"const fs = require('fs'); const { decompress } = require('fzstd'); fs.writeFileSync(process.argv[2], Buffer.from(decompress(fs.readFileSync(process.argv[1]))));",
			archivePath,
			tarPath,
		],
		{
			env: {
				...process.env,
				NODE_PATH: globalNodePath,
			},
			stdio: "inherit",
		},
	);
	execFileSync("tar", ["-C", installRoot, "-xf", tarPath], { stdio: "inherit" });
	await fs.rm(archivePath, { force: true });
	await fs.rm(tarPath, { force: true });
} else {
	const archivePath = "/tmp/ollama.tgz";
	await downloadFile(`${archiveBase}.tgz`, archivePath);
	execFileSync("tar", ["-C", installRoot, "-xzf", archivePath], { stdio: "inherit" });
	await fs.rm(archivePath, { force: true });
}

execFileSync("mkdir", ["-p", `${installRoot}/bin`], { stdio: "inherit" });
execFileSync("ln", ["-sf", `${installRoot}/ollama`, `${installRoot}/bin/ollama`], {
	stdio: "inherit",
});

async function urlExists(url) {
	const response = await fetch(url, {
		method: "HEAD",
		redirect: "follow",
	});
	return response.ok;
}

async function downloadFile(url, destinationPath) {
	const response = await fetch(url, { redirect: "follow" });
	if (!response.ok) {
		throw new Error(`Failed to download ${url}: ${response.status}`);
	}
	await fs.writeFile(destinationPath, Buffer.from(await response.arrayBuffer()));
}
