// Carregar .env apenas no desenvolvimento
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const ImageKit = require("imagekit");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Debug: Logando as variáveis de ambiente antes de inicializar o ImageKit
console.log("DEBUG IMAGEKIT ENV ====");
console.log("Public Key:", process.env.IMAGEKIT_PUBLIC_KEY);
console.log("Private Key:", process.env.IMAGEKIT_PRIVATE_KEY ? "OK" : "NÃO DEFINIDA");
console.log("URL Endpoint:", process.env.IMAGEKIT_URL_ENDPOINT);
console.log("=========================");

// Validar se as variáveis estão setadas
if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
  throw new Error("As credenciais do ImageKit não estão definidas.");
}

// Inicializar ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Configuração do multer (upload de imagens)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5MB
});

// Conexão com o MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB conectado"))
  .catch(err => console.error("Erro ao conectar no MongoDB:", err));

// Schema do chat
const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  imageUrl: String,
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

// Servir arquivos estáticos (ex: frontend)
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Endpoint para upload de imagem + mensagem
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const { username, text } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem enviada" });
    }

    const result = await imagekit.upload({
      file: req.file.buffer.toString("base64"),
      fileName: req.file.originalname,
      folder: "/chat_images"
    });

    const message = new Message({
      username,
      text,
      imageUrl: result.url
    });

    await message.save();

    io.emit("chat message", message);

    return res.json({ message });
  } catch (err) {
    console.error("Erro no upload:", err);
    return res.status(500).json({ error: "Erro no upload" });
  }
});

// Endpoint para buscar mensagens antigas
app.get("/messages", async (req, res) => {
  const messages = await Message.find().sort({ createdAt: 1 }).limit(100);
  res.json(messages);
});

// WebSocket (Socket.IO)
io.on("connection", (socket) => {
  console.log("Usuário conectado:", socket.id);

  socket.on("chat message", async (msg) => {
    const message = new Message(msg);
    await message.save();
    io.emit("chat message", message);
  });

  socket.on("disconnect", () => {
    console.log("Usuário desconectado:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
