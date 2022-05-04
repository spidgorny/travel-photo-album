import slugify from "slugify";
import fs from "fs";
import recache from "recache";

export async function initRecache(cachePath) {
	let cacheFile = "/tmp/" + slugify(cachePath).replace(":", "-") + ".json";

	if (fs.existsSync(cacheFile)) {
		const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
		const cache = recache("not existing");
		cache._container = new Map(data);
		return cache;
	}

	return new Promise((resolve) => {
		const cache = recache(
			cachePath,
			{
				filter: (path, stats) => {
					// console.log("filter", path, stats);
					process.stdout.write(".");
					// Filter cache elements

					// Filter for hidden files
					if (stats.isFile()) {
						return /^(?!\.).+$/.test(path);
					}

					return true;
				},
				persistent: true, // Make persistent cache
				store: false, // Enable file content storage
			},
			(cache) => {
				console.log();
				console.log("Cache ready!", cacheFile);
				let jsonData = JSON.stringify(
					Array.from(cache._container.entries()),
					(key, value) =>
						typeof value === "bigint" ? value.toString() : value, // return everything else unchanged
					2
				);
				fs.writeFileSync(cacheFile, jsonData);
				resolve(cache);
			}
		);
		cache.on("error", (error) => {
			console.log("Something unexpected happened");
			console.log(error.stack);
		});
		cache.on("update", (cache) => {
			console.log("Cache updated!");
		});
	});
}
