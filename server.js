const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend online!");
});

app.post("/deposito", async (req, res) => {
  const {
    valor,
    produto,
    sabor,
    quantidade,
    identificador,
    cliente,
    telefone
  } = req.body;

  console.log({
    valor,
    produto,
    sabor,
    quantidade,
    identificador,
    cliente,
    telefone
  });

  res.json({
    status: "ok",
    pix_code: "PIX_AQUI"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});