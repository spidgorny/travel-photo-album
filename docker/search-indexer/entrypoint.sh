#!/bin/sh
set -eu

interval="${SEARCH_INDEX_INTERVAL_SECONDS:-3600}"
typesense_protocol="${TYPESENSE_PROTOCOL:-http}"
typesense_host="${TYPESENSE_HOST:-typesense}"
typesense_port="${TYPESENSE_PORT:-8108}"
typesense_timeout="${TYPESENSE_HEALTH_TIMEOUT_SECONDS:-60}"

case "$interval" in
	''|*[!0-9]*)
		echo "SEARCH_INDEX_INTERVAL_SECONDS must be a positive integer, got: $interval" >&2
		exit 1
		;;
esac

if [ "$interval" -le 0 ]; then
	echo "SEARCH_INDEX_INTERVAL_SECONDS must be greater than 0, got: $interval" >&2
	exit 1
fi

case "$typesense_timeout" in
	''|*[!0-9]*)
		echo "TYPESENSE_HEALTH_TIMEOUT_SECONDS must be a positive integer, got: $typesense_timeout" >&2
		exit 1
		;;
esac

if [ "$typesense_timeout" -le 0 ]; then
	echo "TYPESENSE_HEALTH_TIMEOUT_SECONDS must be greater than 0, got: $typesense_timeout" >&2
	exit 1
fi

echo "Waiting for Typesense at ${typesense_protocol}://${typesense_host}:${typesense_port}/health"
if ! node --input-type=module <<'EOF'
const protocol = process.env.TYPESENSE_PROTOCOL ?? "http";
const host = process.env.TYPESENSE_HOST ?? "typesense";
const port = process.env.TYPESENSE_PORT ?? "8108";
const timeoutSeconds = Number.parseInt(process.env.TYPESENSE_HEALTH_TIMEOUT_SECONDS ?? "60", 10);
const deadline = Date.now() + timeoutSeconds * 1000;
const endpoint = `${protocol}://${host}:${port}/health`;

while (Date.now() < deadline) {
	try {
		const response = await fetch(endpoint);
		if (response.ok) {
			process.exit(0);
		}
	} catch {}
	await new Promise((resolve) => setTimeout(resolve, 1000));
}

console.error(`Timed out waiting for Typesense at ${endpoint}`);
process.exit(1);
EOF
then
	exit 1
fi

while true; do
	date -u +"[%Y-%m-%dT%H:%M:%SZ] Starting search index rebuild"
	npm run index:search
	date -u +"[%Y-%m-%dT%H:%M:%SZ] Search index rebuild finished; sleeping for ${interval}s"
	sleep "$interval"
done
