import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({
	path: path.join(process.cwd(), ".env.local"),
	override: true,
});
