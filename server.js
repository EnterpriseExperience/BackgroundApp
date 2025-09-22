const express = require("express");
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json());

const STATE = {};

app.post("/api/flameshub/set", (req, res) => {
  const { userId, state } = req.body;
  if (!userId || !state) return res.status(400).json({ ok: false, err: "missing" });
  if (state !== "enable" && state !== "disable") return res.status(400).json({ ok: false, err: "bad state" });
  STATE[userId] = state;
  return res.json({ ok: true });
});

app.get("/api/flameshub/list", (req, res) => {
  return res.json(STATE);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("FlamesHub API running on port", PORT));
