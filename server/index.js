import http from "node:http";
import { readFile } from "node:fs/promises";

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  if (url === "/favicon.ico") return sendResponse(res, "");
  console.log({ url });
  let data;
  if (method === "POST") {
    data = await parseBody(req);
  }

  let page;
  try {
    const template = await readFile(`./page${url}.html`, { encoding: "utf-8" });
    const { default: endpoint } = await import(`./page${url}.js`);
    page = await endpoint(template, data);
  } catch (e) {
    console.error(e);
    page = "<html><head></head><body>Not Found</body></html>";
  }
  if (!page) return;
  sendResponse(res, page);
});

const parseBody = (req) => {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", function (data) {
      body += data;
    });
    req.on("end", async function () {
      const data = {};
      for (const pair of body.split("&")) {
        const [key, value] = pair.split("=");
        data[key] = decodeURIComponent(value);
      }
      resolve(data);
    });
  });
};

const sendResponse = (res, page) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.end(page);
};

const PORT = 80;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
