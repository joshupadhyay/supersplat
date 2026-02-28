import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    // Serve splat files from pipeline/ or data/splats/marble/
    "/splats/:filename": async (req) => {
      const dirs = ["./data/splats/marble", "./data/splats/marble/plus-test", "./pipeline"];
      for (const dir of dirs) {
        const file = Bun.file(`${dir}/${req.params.filename}`);
        if (await file.exists()) {
          return new Response(file, {
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
      }
      return new Response("Not found", { status: 404 });
    },

    "/api/registry": async () => {
      const file = Bun.file("./data/registry.json");
      if (!(await file.exists())) return Response.json({ worlds: [] });
      return new Response(file, {
        headers: { "Content-Type": "application/json" },
      });
    },

    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
