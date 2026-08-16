const express = require("express");
const cors = require("cors");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rota principal
app.get("/", (req, res) => {
  res.send("Backend online!");
});

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Servidor funcionando!"
  });
});

// Rota para gerar PIX
app.post("/deposito", async (req, res) => {
  try {
    const {
      valor,
      produto,
      sabor,
      quantidade,
      identificador,
      cliente,
      telefone
    } = req.body;

    console.log("Nova solicitação de PIX:");
    console.log({
      valor,
      produto,
      sabor,
      quantidade,
      identificador,
      cliente,
      telefone
    });

    // Aqui futuramente entrará a integração com sua plataforma de pagamento.

    return res.status(200).json({
      status: "ok",
      pix_code: "PIX_AQUI"
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      status: "erro",
      message: "Erro interno do servidor."
    });
  }
});

// Inicialização
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});