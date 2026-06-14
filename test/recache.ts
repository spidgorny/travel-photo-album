// @ts-nocheck
import { runTest } from "./bootstrap.ts";
import { initRecache } from "../lib/utils/recache.ts";

runTest(async () => {
  console.log("RunTest");
  const cache = await initRecache("p:/Photos/2022/Marina-5t/2022-04/");
  console.log(cache.list());
});
