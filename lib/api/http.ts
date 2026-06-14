// @ts-nocheck
// made compatible with useSWR
import { useCallback, useEffect, useState } from "react";

export const fetcher = async (url) => {
  try {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    // If the status code is not in the range 200-299,
    // we still try to parse and throw it.
    if (!res.ok) {
      const responseBody = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");
      const errorMessage =
        typeof responseBody?.error === "string"
          ? responseBody.error
          : typeof responseBody?.message === "string"
            ? responseBody.message
            : typeof responseBody === "string" && responseBody.trim()
              ? responseBody.trim()
              : `Request failed with status ${res.status}`;
      const error = new Error(errorMessage);
      // Attach extra info to the error object.
      error.info = responseBody;
      error.status = res.status;
      error.statusText = res.statusText;
      error.url = url;
      throw error;
    }

    return isJson ? res.json() : res.text();
  } catch (error) {
    if (error instanceof Error) {
      if (!("url" in error) || !error.url) {
        error.url = url;
      }
      throw error;
    }

    const wrappedError = new Error("Request failed");
    wrappedError.info = error;
    wrappedError.url = url;
    throw wrappedError;
  }
};

export function useFetcher(url, fetcher, options) {
  const [data, setData] = useState();
  const [error, setError] = useState();
  const [isLoading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!url) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetcher(url, options);
      setData(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [fetcher, url, options]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, isLoading, mutate: reload, mutateMe: reload };
}

export function buildURL(pathname, params = {}) {
  const u = new URL(pathname, document.location.href);
 	for (const key in params) {
    u.searchParams.set(key, params[key]);
  }
  return u.toString();
}

export function build_query(params) {
  const p = new URLSearchParams();
 	for (const key in params) {
    p.set(key, params[key]);
  }
  return p.toString();
}

export function useWorking() {
  const [state, setState] = useState(false);

  const wrapWorking = (code) => {
    return async (...vars) => {
      setState(true);
      await code(...vars);
      setState(false);
    };
  };

  return { isWorking: state, wrapWorking };
}
