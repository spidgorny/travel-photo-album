import type { NextApiHandler } from "next";

interface HelloResponse {
name: string;
}

const handler: NextApiHandler<HelloResponse> = (_req, res) => {
res.status(200).json({ name: "John Doe" });
};

export default handler;
