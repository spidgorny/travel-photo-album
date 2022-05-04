import { runTest } from "./bootstrap.js";
import { initRecache } from "../lib/recache.mjs";

runTest(async () => {
  console.log("RunTest");
  const cache = await initRecache("p:/Photos/2022/Marina-5t/2022-04/");
  console.log(cache.list());
});
