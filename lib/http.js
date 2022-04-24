// made compatible with useSWR
import { useCallback, useEffect, useState } from "react";

export const fetcher = async (url) => {
  const res = await fetch(url);

  // If the status code is not in the range 200-299,
  // we still try to parse and throw it.
  if (!res.ok) {
    const error = new Error("An error occurred while fetching the data.");
    // Attach extra info to the error object.
    error.info = await res.json();
    error.status = res.status;
    throw error;
  }

  return res.json();
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
  for (let key in params) {
    u.searchParams.set(key, params[key]);
  }
  return u.toString();
}

export function build_query(params) {
  const p = new URLSearchParams();
  for (let key in params) {
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
