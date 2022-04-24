import { getAnyCoreLinuxDB } from "./mysql/mysql.js";

export function getRestaurantId() {
  return 1; // @todo get from user session
}

export async function getCategoriesOf(restaurantId) {
  const table = getAnyCoreLinuxDB().getTable("categories");
  return await table.select({ of: restaurantId });
}
