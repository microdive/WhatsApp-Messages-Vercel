require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const routes = require("./routes");

const app = express();

// Middleware
app.use(bodyParser.json());

// Routes
app.use("/", routes);

module.exports = app;
