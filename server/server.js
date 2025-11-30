import path from "path";
import fs from "fs";

import React from "react";
import ReactDOMServer from "react-dom/server";
import { StaticRouter } from 'react-router-dom/server';
import express from "express";

import App from "../src/App";

const PORT = process.env.PORT || 3000;
const app = express();

app.get("*", (req, res) => {
  fs.readFile(path.resolve("./public/index.html"), "utf8", (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send("An error occurred");
    }

    const context = {};
    const appMarkup = ReactDOMServer.renderToString(
        <StaticRouter location={req.url}><App/></StaticRouter>
    );

    return res.send(
      data.replace(
        '<div id="root"></div>',
        `<div id="root">${appMarkup}</div>`
      )
    );
  });
});

app.use(express.static(path.resolve(__dirname, '../public')));

app.listen(PORT, () => {
  console.log(`SSR server running on http://localhost:${PORT}`);
});
