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

// Config ImageKit
const imagekit = new ImageKit({
  publicKey : "public_b6Ha//fMchI8XfX9r9cRTX/VoN0=",
  privateKey : "private_QxmkHWo2Id+NMjlcGhh+81Uwbys=",
  urlEndpoint : "https://ik.imagekit.io/Acacio"
});

// Config multer para upload
const upload = multer({
  storage: multer.memoryStorage(), // armazena na memória para enviar direto para ImageKit
  limits: { fileSize: 5 * 1024 * 1024 } // limite 5MB
});

// MongoDB conexão
const mongoURI = "mongodb+srv://acaciofariav:ACACIOFARIAVICENTETXOBOY63@cluster0.ju4k6xu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB conectado"))
  .catch(err => console.error(err));

// Schema e Model para mensagem de chat
const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  imageUrl: String,
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

// Middleware para servir frontend simples
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Endpoint para upload de imagem + mensagem
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const { username, text } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem enviada" });
    }

    // Upload para ImageKit
    const result = await imagekit.upload({
      file: req.file.buffer.toString("base64"),
      fileName: req.file.originalname,
      folder: "/chat_images"
    });

    // Salvar mensagem no banco
    const message = new Message({
      username,
      text,
      imageUrl: result.url
    });

    await message.save();

    // Emitir mensagem para todos sockets conectados
    io.emit("chat message", message);

    return res.json({ message });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro no upload" });
  }
});

// Endpoint para pegar mensagens antigas
app.get("/messages", async (req, res) => {
  const messages = await Message.find().sort({ createdAt: 1 }).limit(100);
  res.json(messages);
});

// Socket.io - comunicação em tempo real para mensagens texto simples
io.on("connection", (socket) => {
  console.log("Usuário conectado", socket.id);

  socket.on("chat message", async (msg) => {
    const message = new Message(msg);
    await message.save();
    io.emit("chat message", message);
  });

  socket.on("disconnect", () => {
    console.log("Usuário desconectado", socket.id);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});